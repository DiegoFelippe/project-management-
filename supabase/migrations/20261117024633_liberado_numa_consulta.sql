-- private.liberado() roda em quase toda regra de acesso, muitas vezes por linha. A versão da migração exige_2fa
-- chamava duas funções security definer aninhadas (sessao_verificada → tem_verificacao): cada chamada troca o
-- search_path e não é embutida, e liberado() ficou ~14x mais lenta (76 µs contra 5,5 µs por chamada, medido).
-- Mesma regra, numa consulta só (~9 µs): perfil ativo, senha trocada, consultoria não arquivada e, se a pessoa
-- tem o app autenticador ativo (fator verificado) ou a verificação exigida (exige_2fa), sessão aal2.
create or replace function private.liberado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis p
    left join public.consultorias c on c.id = p.consultoria_id
    where p.id = (select auth.uid())
      and p.ativo
      and not p.precisa_trocar_senha
      and c.arquivada_em is null
      and (
        -- token sem o campo aal vale como aal1
        coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
        or (
          not p.exige_2fa
          and not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
        )
      )
  )
$$;

-- As auxiliares da versão anterior ficaram sem uso.
drop function private.sessao_verificada();
drop function private.tem_verificacao(uuid);
