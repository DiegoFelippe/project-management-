-- O token (JWT) vale até expirar, mesmo depois que a sessão dele é encerrada no Auth. Para o "Zerar" da verificação
-- em duas etapas (celular perdido ou roubado) derrubar a sessão aberta no aparelho na hora:
-- 1. private.encerrar_sessoes(pessoa) apaga as sessões da pessoa no Auth (os refresh tokens e os registros do código
--    saem junto, em cascata): o token não renova mais. Só a chave secreta (Edge Function gerenciar-acesso) chama, pelo
--    invólucro public.encerrar_sessoes_de (o schema private não está na API).
-- 2. private.liberado() passa a conferir a sessão do token: se o token traz session_id, a sessão precisa existir
--    (para todos: depois do Zerar, do Sair de todos os aparelhos ou da troca de senha, o token antigo não lê nem
--    grava mais nada) e, para quem tem o app autenticador ativo ou a verificação exigida, ser aal2 também na tabela
--    de sessões, além do token. Sem session_id no token (os testes do banco), a sessão não é conferida.

create function private.encerrar_sessoes(p_pessoa uuid) returns integer
language sql security definer set search_path = '' as $$
  with apagadas as (delete from auth.sessions where user_id = p_pessoa returning 1)
  select count(*)::integer from apagadas
$$;

create function public.encerrar_sessoes_de(p_pessoa uuid) returns integer
language sql security definer set search_path = '' as $$
  select private.encerrar_sessoes(p_pessoa)
$$;

revoke all on function private.encerrar_sessoes(uuid), public.encerrar_sessoes_de(uuid) from public, anon, authenticated;
grant execute on function private.encerrar_sessoes(uuid), public.encerrar_sessoes_de(uuid) to service_role;

-- Mesma regra da migração liberado_numa_consulta (perfil ativo, senha trocada, consultoria não arquivada e, com o app
-- ativo ou a verificação exigida, token aal2) + a sessão do token. Uma consulta só, o token lido uma vez.
create or replace function private.liberado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from (select (select auth.jwt()) as jwt) t
    cross join lateral (select nullif(t.jwt ->> 'session_id', '')::uuid as sessao_id) x
    join public.perfis p on p.id = (select auth.uid())
    left join public.consultorias c on c.id = p.consultoria_id
    left join auth.sessions s on s.id = x.sessao_id and s.user_id = p.id
    where p.ativo
      and not p.precisa_trocar_senha
      and c.arquivada_em is null
      -- token com session_id: a sessão precisa existir (e ser desta pessoa)
      and (x.sessao_id is null or s.id is not null)
      and (
        -- sem o app autenticador e sem a exigência: qualquer nível serve
        (not p.exige_2fa
          and not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'))
        -- com o app ou a exigência: token aal2 (sem o campo vale aal1) e a sessão também aal2
        or (coalesce(t.jwt ->> 'aal', 'aal1') = 'aal2' and (x.sessao_id is null or s.aal = 'aal2'))
      )
  )
$$;
