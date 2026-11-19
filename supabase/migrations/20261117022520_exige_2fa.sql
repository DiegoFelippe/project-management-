-- Verificação em duas etapas (app autenticador, TOTP do Auth do Supabase).
-- Quem tem a verificação ativa (fator verificado no Auth) ou exigida (perfis.exige_2fa) só usa o banco com a
-- sessão confirmada pelo código (aal2 no token). Sem o código, private.liberado() é falso: nada é lido nem
-- gravado além do próprio perfil (que a tela lê para saber que falta o código ou a configuração).
-- Quem não tem a verificação nem a exigência não percebe nada. O segredo do app fica no Auth; aqui só se
-- olha se o fator existe.

-- Ligada por quem pode editar o acesso da pessoa, pela Edge Function gerenciar-acesso (ou criar-acesso).
-- Sem GRANT de update: o navegador não muda.
alter table public.perfis add column exige_2fa boolean not null default false;

-- A pessoa tem o app autenticador ativo? (Cadastro começado e não confirmado não conta.)
create function private.tem_verificacao(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = p_id and f.status = 'verified')
$$;

-- A sessão de quem chama vale por inteiro? Com a verificação ativa ou exigida, só com aal2.
-- Token sem o campo aal vale como aal1.
create function private.sessao_verificada() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
    or not (
      coalesce((select p.exige_2fa from public.perfis p where p.id = (select auth.uid())), false)
      or private.tem_verificacao((select auth.uid()))
    )
$$;

revoke all on function private.tem_verificacao(uuid), private.sessao_verificada() from public;
grant execute on function private.tem_verificacao(uuid), private.sessao_verificada() to authenticated;

-- Mesma regra de antes (perfil ativo, senha já trocada, consultoria não arquivada) + a sessão verificada.
create or replace function private.liberado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis p
    left join public.consultorias c on c.id = p.consultoria_id
    where p.id = (select auth.uid())
      and p.ativo
      and not p.precisa_trocar_senha
      and c.arquivada_em is null
  ) and private.sessao_verificada()
$$;

-- Desde quando a pessoa tem o app autenticador ativo (null = não tem). Coluna calculada da API:
-- select('..., verificacao_desde') em perfis. Só para quem vê a pessoa (a própria pessoa sempre, mesmo com
-- aal1: é assim que a tela sabe que precisa pedir o código).
create function public.verificacao_desde(p public.perfis) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select min(f.created_at) from auth.mfa_factors f
  where f.user_id = p.id and f.status = 'verified' and private.vejo_perfil(p.id)
$$;

revoke all on function public.verificacao_desde(public.perfis) from public, anon;
grant execute on function public.verificacao_desde(public.perfis) to authenticated;
