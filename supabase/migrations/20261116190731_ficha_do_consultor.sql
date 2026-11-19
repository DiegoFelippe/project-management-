-- Ficha do consultor: telefone, cidade/UF, cargo e data de entrada no perfil.
-- Quem administra grava pelas Edge Functions (service_role); cada pessoa grava o próprio contato por atualizar_meu_contato.
alter table public.perfis
  add column telefone text check (telefone is null or char_length(telefone) <= 30),
  add column cidade text check (cidade is null or char_length(cidade) <= 120),
  add column uf text check (uf is null or uf in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  add column cargo text check (cargo is null or char_length(cargo) <= 80),
  add column data_entrada date;

-- Data de entrada não pode ser futura ("hoje" em São Paulo). Gatilho porque CHECK não aceita now().
create function private.conferir_data_entrada() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.data_entrada is not null and new.data_entrada > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'data_entrada_no_futuro' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger perfis_data_entrada
before insert or update of data_entrada on public.perfis
for each row execute function private.conferir_data_entrada();

-- Meu perfil: a pessoa atualiza o próprio telefone e cidade/UF. Texto vazio vira nulo; UF em maiúsculas.
create function public.atualizar_meu_contato(p_telefone text, p_cidade text, p_uf text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.perfis
  set telefone = nullif(btrim(p_telefone), ''),
      cidade = nullif(btrim(p_cidade), ''),
      uf = upper(nullif(btrim(p_uf), ''))
  where id = (select auth.uid());
end $$;

revoke all on function public.atualizar_meu_contato(text, text, text) from public, anon;
grant execute on function public.atualizar_meu_contato(text, text, text) to authenticated;
