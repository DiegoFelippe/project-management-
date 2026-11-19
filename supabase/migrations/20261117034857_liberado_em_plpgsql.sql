-- private.liberado() em plpgsql, com a mesma regra da migração sessao_no_liberado.
-- Por quê: no Postgres 17, uma função SQL que não é embutida (security definer nunca é) planeja a consulta de novo a
-- cada chamada feita de dentro de outra função, e é assim que liberado() roda nas regras por linha (vejo_perfil chama
-- liberado, sou_central e sou_admin, e as duas também chamam liberado). A conferência da sessão deixou a consulta
-- maior e o planejamento mais caro: select count(*) from perfis com 3.000 pessoas, como administrador com o app
-- (aal2), passou de ~1,17 s para ~1,9 s. Em plpgsql o plano fica guardado na conexão: a mesma contagem cai para
-- ~0,43 s (a chamada solta fica em ~15 µs, contra ~9 µs da versão SQL antiga, e só acontece uma vez por consulta
-- quando a regra usa (select private.liberado())). Medido em transação desfeita no fim (nada ficou no banco).
--
-- A regra: perfil ativo, senha trocada, consultoria não arquivada; se o token traz session_id, a sessão existe e é
-- desta pessoa; com o app autenticador ativo (fator verificado) ou a verificação exigida (exige_2fa), token aal2
-- (sem o campo vale aal1) e a sessão também aal2. O token é lido uma vez só.
create or replace function private.liberado() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_jwt jsonb := auth.jwt();
  v_sessao uuid := nullif(v_jwt ->> 'session_id', '')::uuid;
  v_token_aal2 boolean := coalesce(v_jwt ->> 'aal', 'aal1') = 'aal2';
begin
  return exists (
    select 1
    from public.perfis p
    left join public.consultorias c on c.id = p.consultoria_id
    left join auth.sessions s on s.id = v_sessao and s.user_id = p.id
    where p.id = auth.uid()
      and p.ativo
      and not p.precisa_trocar_senha
      and c.arquivada_em is null
      -- token com session_id: a sessão precisa existir (Zerar, Sair e troca de senha encerram sessões)
      and (v_sessao is null or s.id is not null)
      and (
        -- sem o app autenticador e sem a exigência: qualquer nível serve
        (not p.exige_2fa
          and not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'))
        -- com o app ou a exigência: token aal2 e a sessão também aal2
        or (v_token_aal2 and (v_sessao is null or s.aal = 'aal2'))
      )
  );
end $$;
