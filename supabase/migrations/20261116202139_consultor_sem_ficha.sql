-- consultor(clientes) e consultor_do_checkin(checkins) rodam como dono do banco (security definer) para mostrar o
-- consultor a quem não o enxerga em perfis (o gestor sem times). Devolviam a linha inteira de perfis, que agora tem
-- a ficha (telefone, cidade, uf, cargo, data de entrada) e já tinha e-mail, papel e carga: tudo isso vazava por
-- select=...,consultor(...) para quem só deveria ver o nome. No molde de autor_do_arquivo, as duas passam a
-- devolver um perfil só com id, nome, foto e ativo (o que as telas usam: consultor(id, nome, foto, ativo) e
-- consultor_do_checkin(nome)). A regra de quem vê e a releitura da linha guardada não mudam.

create or replace function public.consultor(public.clientes) returns setof public.perfis
language sql stable security definer rows 1 set search_path = '' as $$
  select r.*
  from public.clientes c
  join public.perfis p on p.id = c.consultor_id
  cross join lateral jsonb_populate_record(null::public.perfis,
    jsonb_build_object('id', p.id, 'nome', p.nome, 'foto', p.foto, 'ativo', p.ativo)) r
  where c.id = ($1).id
    and private.vejo_cliente(c.consultoria_id, c.consultor_id)
$$;

revoke all on function public.consultor(public.clientes) from public, anon;
grant execute on function public.consultor(public.clientes) to authenticated;

create or replace function public.consultor_do_checkin(public.checkins) returns setof public.perfis
language sql stable security definer rows 1 set search_path = '' as $$
  select r.*
  from public.checkins k
  join public.perfis p on p.id = k.consultor_id
  cross join lateral jsonb_populate_record(null::public.perfis,
    jsonb_build_object('id', p.id, 'nome', p.nome, 'foto', p.foto, 'ativo', p.ativo)) r
  where k.id = ($1).id
    and (private.sou_central()
      or private.gerencio_consultoria(k.consultoria_id)
      or (k.consultor_id = (select auth.uid()) and private.liberado()))
$$;

revoke all on function public.consultor_do_checkin(public.checkins) from public, anon;
grant execute on function public.consultor_do_checkin(public.checkins) to authenticated;
