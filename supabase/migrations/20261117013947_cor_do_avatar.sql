-- Cor do avatar: a cor de fundo das iniciais (quando a pessoa não tem foto), escolhida na ficha ou em "Meu perfil".
-- Nula = cor automática (a que o app já calcula pelo id). Só acrescenta uma coluna: nenhuma linha é alterada.
-- Quem muda: o mesmo de quem muda a foto (private.posso_mudar_foto), pela política "mudar a foto" de perfis, que
-- cobre qualquer coluna liberada pelo grant de update. A leitura já vale (authenticated tem select na tabela).

alter table public.perfis
  add column cor text check (cor is null or cor in
    ('#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#475569', '#ca8a04'));

grant update (cor) on public.perfis to authenticated;

-- consultor(clientes) e consultor_do_checkin(checkins) devolvem só id, nome, foto e ativo; ganham a cor para o
-- avatar do consultor ficar igual ao da ficha. A regra de quem vê não muda.
create or replace function public.consultor(public.clientes) returns setof public.perfis
language sql stable security definer rows 1 set search_path = '' as $$
  select r.*
  from public.clientes c
  join public.perfis p on p.id = c.consultor_id
  cross join lateral jsonb_populate_record(null::public.perfis,
    jsonb_build_object('id', p.id, 'nome', p.nome, 'foto', p.foto, 'cor', p.cor, 'ativo', p.ativo)) r
  where c.id = ($1).id
    and private.vejo_cliente(c.consultoria_id, c.consultor_id)
$$;

create or replace function public.consultor_do_checkin(public.checkins) returns setof public.perfis
language sql stable security definer rows 1 set search_path = '' as $$
  select r.*
  from public.checkins k
  join public.perfis p on p.id = k.consultor_id
  cross join lateral jsonb_populate_record(null::public.perfis,
    jsonb_build_object('id', p.id, 'nome', p.nome, 'foto', p.foto, 'cor', p.cor, 'ativo', p.ativo)) r
  where k.id = ($1).id
    and (private.sou_central()
      or private.gerencio_consultoria(k.consultoria_id)
      or (k.consultor_id = (select auth.uid()) and private.liberado()))
$$;
