-- Situação da reunião quando o evento muda: remarcar uma reunião que já passou para depois de agora volta a
-- "agendada" (e a rotina pega depois do novo fim); a reunião que perde o cliente deixa de esperar a transcrição; e
-- reconectar o Google reabre as reuniões que pararam por causa do Google. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

create schema testes;
create table testes.fx (nome text primary key, id uuid not null);

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@teste.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel);
  return v;
end $$;

create function testes.cliente(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, 10, testes.id('A'), testes.id('ana')) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Reunião com Meet da Ana (p_consultor), com o cliente pedido, que terminou p_fim atrás, na situação pedida e já
-- olhada pela rotina (linha em private.reunioes_na_rotina sem hora de voltar, como reunioes_liberar deixa quem não
-- espera mais).
create function testes.reuniao(p_nome text, p_reuniao text, p_fim interval default interval '3 hours',
  p_cliente text default 'k', p_erro text default null, p_consultor text default 'ana') returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, com_meet,
    meet_codigo, reuniao, reuniao_erro)
  values (testes.id('A'), testes.id(p_consultor), testes.id(p_cliente), 'Reunião ' || p_nome,
    now() - p_fim - interval '1 hour', now() - p_fim, true, 'abc-defg-hij', p_reuniao, p_erro)
  returning id into v;
  insert into private.reunioes_na_rotina (evento_id, buscada_em, proxima_em) values (v, now(), null);
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.situacao(p_nome text) returns text language sql stable as $$
  select e.reuniao || coalesce(' / ' || e.reuniao_erro, '') from public.agenda_eventos e where e.id = testes.id(p_nome)
$$;

create function testes.na_rotina(p_nome text) returns boolean language sql stable as $$
  select exists (select 1 from private.reunioes_na_rotina r where r.evento_id = testes.id(p_nome))
$$;

-- Remarca pela função que a Edge Function agenda usa (o mesmo caminho do app), para daqui a p_daqui.
create function testes.remarcar(p_nome text, p_daqui interval) returns void language plpgsql as $$
declare e public.agenda_eventos;
begin
  select * into e from public.agenda_eventos where id = testes.id(p_nome);
  perform public.gravar_evento_da_agenda(
    to_jsonb(e) || jsonb_build_object('inicio', now() + p_daqui, 'fim', now() + p_daqui + interval '1 hour'),
    '{}', '{}', false, false);
end $$;

select testes.consultoria('A');
select testes.perfil('ana', 'pessoa', 'A');
select testes.perfil('bia', 'pessoa', 'A');
select testes.cliente('k');

-- ── Remarcar para depois de agora: volta a "agendada" ─────────────────────────
select testes.reuniao('aguardando', 'aguardando', p_erro => 'O Google não respondeu agora; tentamos de novo em seguida.');
select testes.reuniao('sem_artefatos', 'sem_artefatos');
select testes.reuniao('erro', 'erro', p_erro => 'O Google não deu permissão para ler a gravação e a transcrição do Meet nesta conta.');

select testes.remarcar('aguardando', interval '1 day');
select is(testes.situacao('aguardando'), 'agendada', 'aguardando remarcada para depois de agora volta a "agendada", sem o motivo');
select ok(not testes.na_rotina('aguardando'), 'e sai da rotina (a rotina pega de novo depois do novo fim)');

select testes.remarcar('sem_artefatos', interval '2 days');
select is(testes.situacao('sem_artefatos'), 'agendada', '"sem gravação/transcrição" remarcada volta a "agendada"');
select ok(not testes.na_rotina('sem_artefatos'), 'e sai da rotina');

-- Mexendo direto na linha (outro caminho que não a Edge Function), a regra é a mesma.
update public.agenda_eventos set inicio = now() + interval '1 hour', fim = now() + interval '2 hours'
where id = testes.id('erro');
select is(testes.situacao('erro'), 'agendada', '"erro" remarcada volta a "agendada", sem o motivo');
select ok(not testes.na_rotina('erro'), 'e sai da rotina');

-- Depois do novo fim, a rotina a pega como uma reunião que ainda não olhou (fila 1).
update public.agenda_eventos set inicio = now() - interval '2 hours', fim = now() - interval '1 hour'
where id = testes.id('erro');
select is(testes.situacao('erro'), 'agendada', 'remarcada de novo para antes de agora, continua "agendada"');
select ok(testes.id('erro') = any (public.reunioes_reservar(gen_random_uuid(), null, 50, 5, array[testes.id('A')])),
  'e, terminado o novo horário, a rotina a pega');

-- Remarcar e continuar no passado, ou mexer em outra coisa: a situação fica.
select testes.reuniao('passado', 'aguardando', p_erro => 'O Google não respondeu agora; tentamos de novo em seguida.');
update public.agenda_eventos set inicio = inicio - interval '1 day', fim = fim - interval '1 day' where id = testes.id('passado');
select is(testes.situacao('passado'), 'aguardando / O Google não respondeu agora; tentamos de novo em seguida.',
  'remarcada para outro horário que também já passou: continua aguardando, com o motivo');
select ok(testes.na_rotina('passado'), 'e continua na rotina');
select testes.reuniao('titulo', 'erro', p_erro => 'Sem permissão');
update public.agenda_eventos set titulo = 'Outro título' where id = testes.id('titulo');
select is(testes.situacao('titulo'), 'erro / Sem permissão', 'mudar só o título não mexe na situação');

-- Reunião com a pasta criada fica com a pasta.
select testes.reuniao('com_pasta', 'pasta_criada');
select testes.remarcar('com_pasta', interval '1 day');
select is(testes.situacao('com_pasta'), 'pasta_criada', 'reunião com a pasta criada continua "pasta_criada"');

-- ── Sem cliente, a reunião não espera a transcrição ──────────────────────────
select testes.cliente('k2');
select testes.cliente('k3');
select testes.cliente('k4');
select testes.reuniao('tirou', 'aguardando', p_cliente => 'k2', p_erro => 'O Google não respondeu agora; tentamos de novo em seguida.');
select testes.reuniao('apagou', 'aguardando', p_cliente => 'k3');
select testes.reuniao('moveu', 'aguardando', p_cliente => 'k4');
select testes.reuniao('erro_sem_cliente', 'erro', p_cliente => 'k2', p_erro => 'Conecte o Google para buscar a gravação');

do $$
declare e public.agenda_eventos;
begin
  select * into e from public.agenda_eventos where id = testes.id('tirou');
  perform public.gravar_evento_da_agenda(to_jsonb(e) || jsonb_build_object('cliente_id', null), '{}', '{}', false, false);
end $$;
select is(testes.situacao('tirou'), 'agendada', 'tirar o cliente na edição: "aguardando" volta a "agendada" (a rotina ignora reunião sem cliente)');
select ok(not testes.na_rotina('tirou'), 'e sai da rotina');

delete from public.clientes where id = testes.id('k3');
select is(testes.situacao('apagou'), 'agendada', 'apagar o cliente: a reunião que aguardava volta a "agendada"');

select testes.consultoria('B');
update public.clientes set consultoria_id = testes.id('B'), consultor_id = null where id = testes.id('k4');
select ok((select cliente_id is null from public.agenda_eventos where id = testes.id('moveu'))
    and testes.situacao('moveu') = 'agendada',
  'mover o cliente para outra consultoria: o evento perde o cliente e a reunião volta a "agendada"');

update public.agenda_eventos set cliente_id = null where id = testes.id('erro_sem_cliente');
select is(testes.situacao('erro_sem_cliente'), 'erro / Conecte o Google para buscar a gravação',
  'só a que aguardava muda: o erro fica com o motivo');

-- ── Reconectar o Google reabre as reuniões que pararam por causa dele ────────
select testes.reuniao('conecte', 'erro', p_erro => 'Conecte o Google para buscar a gravação');
select testes.reuniao('reconecte', 'erro', p_fim => interval '47 hours',
  p_erro => 'O Google não aceita mais esta conexão. Reconecte o Google.');
select testes.reuniao('velha', 'erro', p_fim => interval '49 hours', p_erro => 'Conecte o Google para buscar a gravação');
select testes.reuniao('outro_motivo', 'erro', p_erro => 'O Google não deu permissão para ler a gravação e a transcrição do Meet nesta conta.');
select testes.reuniao('da_bia', 'erro', p_consultor => 'bia', p_erro => 'Conecte o Google para buscar a gravação');
select testes.reuniao('fechada', 'sem_artefatos');
delete from private.reunioes_na_rotina where evento_id = testes.id('reconecte');

select is(public.reabrir_reunioes_do_google(testes.id('ana'),
    array['Conecte o Google para buscar a gravação', 'O Google não aceita mais esta conexão. Reconecte o Google.']),
  2, 'reconectar reabre as duas reuniões da Ana paradas por causa do Google');
select ok(testes.situacao('conecte') = 'aguardando' and testes.situacao('reconecte') = 'aguardando',
  'elas voltam a "aguardando", sem o motivo');
select ok((select bool_and(r.proxima_em <= now() and r.rodada is null) from private.reunioes_na_rotina r
    where r.evento_id in (testes.id('conecte'), testes.id('reconecte')))
    and (select count(*) from private.reunioes_na_rotina r where r.evento_id in (testes.id('conecte'), testes.id('reconecte'))) = 2,
  'e a rotina as olha já (próxima busca agora)');
select is(testes.situacao('velha'), 'erro / Conecte o Google para buscar a gravação', 'a que terminou há mais de 48 h fica como está');
select is(testes.situacao('outro_motivo'),
  'erro / O Google não deu permissão para ler a gravação e a transcrição do Meet nesta conta.',
  'erro por outro motivo fica como está');
select is(testes.situacao('da_bia'), 'erro / Conecte o Google para buscar a gravação', 'a reunião de outro organizador fica como está');
select is(testes.situacao('erro_sem_cliente'), 'erro / Conecte o Google para buscar a gravação',
  'a reunião sem cliente fica como está (a rotina não a olharia, e ela ficaria aguardando para sempre)');
select is(testes.situacao('fechada'), 'sem_artefatos', '"sem gravação/transcrição" fica como está');
select ok(not has_function_privilege('authenticated', 'public.reabrir_reunioes_do_google(uuid, text[])', 'execute')
    and not has_function_privilege('anon', 'public.reabrir_reunioes_do_google(uuid, text[])', 'execute')
    and has_function_privilege('service_role', 'public.reabrir_reunioes_do_google(uuid, text[])', 'execute'),
  'só a Edge Function (service_role) reabre');

select * from finish();
rollback;
