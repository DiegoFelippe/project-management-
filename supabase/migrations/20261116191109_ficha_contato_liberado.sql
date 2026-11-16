-- atualizar_meu_contato só para quem está liberado (ativo, senha trocada, consultoria não arquivada).
create or replace function public.atualizar_meu_contato(p_telefone text, p_cidade text, p_uf text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  update public.perfis
  set telefone = nullif(btrim(p_telefone), ''),
      cidade = nullif(btrim(p_cidade), ''),
      uf = upper(nullif(btrim(p_uf), ''))
  where id = (select auth.uid());
end $$;
