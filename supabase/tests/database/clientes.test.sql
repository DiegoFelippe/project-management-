-- Clientes: a central cadastra e manda para uma consultoria; a consultoria escolhe o consultor.
-- Cada passo fica no histórico (cliente_eventos). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

-- Ajudantes só do teste (somem no rollback do fim).
create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.usuario(p_nome text, p_confirmado boolean) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@teste.test', 'hash-inicial', case when p_confirmado then now() end,
    '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text,
  p_trocar boolean default false, p_convite boolean default false, p_ativo boolean default true) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := testes.usuario(p_nome, not p_convite);
  insert into public.perfis (id, consultoria_id, nome, email, papel, precisa_trocar_senha, convite_pendente, ativo)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel, p_trocar, p_convite, p_ativo);
  return v;
end $$;

create function testes.time(p_nome text, p_consultoria text, p_gestor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.times (consultoria_id, nome, gestor_id)
  values (testes.id(p_consultoria), p_nome, testes.id(p_gestor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Cliente gravado direto (sem usuário logado), já na consultoria e com o consultor, se vierem.
-- testes.como deixa o usuário nas configurações até o fim da transação (reset role não limpa): limpa aqui.
create function testes.cliente(p_nome text, p_consultoria text, p_consultor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, 10, testes.id(p_consultoria), testes.id(p_consultor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- Para cada pessoa, compara o que a política de leitura de clientes deixa ver com private.vejo_cliente.
-- Devolve as divergências ('' quando as duas concordam).
create function testes.divergencias_de_vejo_cliente() returns text language plpgsql as $$
declare
  v_pessoa text;
  v_pela_funcao bigint;
  v_pela_politica bigint;
  v_saida text := '';
begin
  for v_pessoa in select unnest(array['dono', 'central', 'admin_a', 'gestor_a1', 'gestor_a2', 'pessoa_a',
    'pessoa_a2', 'admin_b', 'pessoa_b', 'pessoa_inativa']) loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', testes.id(v_pessoa), 'role', 'authenticated')::text, true);
    select count(*) into v_pela_funcao from public.clientes
    where id in (select id from testes.fx) and private.vejo_cliente(consultoria_id, consultor_id);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_pela_politica from public.clientes where id in (select id from testes.fx);
    reset role;
    if v_pela_funcao <> v_pela_politica then
      v_saida := v_saida || v_pessoa || ': função ' || v_pela_funcao || ', política ' || v_pela_politica || '; ';
    end if;
  end loop;
  return v_saida;
end $$;

-- Cenário
select testes.consultoria('A');
select testes.consultoria('B');
select testes.consultoria('C_arquivada');
update public.consultorias set arquivada_em = now() where id = testes.id('C_arquivada');
select testes.perfil('dono', 'dono', null);
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a1', 'gestor', 'A');
select testes.perfil('gestor_a2', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
select testes.perfil('pessoa_b', 'pessoa', 'B');
select testes.perfil('pessoa_inativa', 'pessoa', 'A', p_ativo => false);
select testes.time('time_a1', 'A', 'gestor_a1');
insert into public.time_membros (time_id, pessoa_id) values (testes.id('time_a1'), testes.id('pessoa_a'));
select testes.cliente('cli_livre', null, null);
insert into testes.fx values ('cli_mov', gen_random_uuid());

-- CNPJ: numérico e o alfanumérico novo da Receita
select is(private.cnpj_valido('11222333000181'), true, 'CNPJ numérico válido');
select is(private.cnpj_valido('11222333000182'), false, 'CNPJ com dígito verificador errado');
select is(private.cnpj_valido('12ABC34501DE35'), true, 'CNPJ alfanumérico válido');
select is(private.cnpj_valido('1122233300018'), false, 'CNPJ com 13 caracteres');

-- Só a central cadastra
select testes.como('central');
select lives_ok($$insert into public.clientes (id, nome, horas_mes) values (testes.id('cli_mov'), 'Cliente Móvel', 20)$$,
  'central cadastra cliente sem consultoria');
-- A central escolhe só a consultoria; o consultor é sempre escolhido pela consultoria.
select throws_ok($$insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
    values ('Cliente com consultor', 10, testes.id('A'), testes.id('pessoa_a2'))$$,
  'P0001', 'consultoria_escolhe_consultor', 'central não cadastra cliente já com consultor');
reset role;
select testes.como('dono');
select throws_ok($$insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
    values ('Cliente com consultor', 10, testes.id('A'), testes.id('pessoa_a2'))$$,
  'P0001', 'consultoria_escolhe_consultor', 'dono também não cadastra cliente já com consultor');
reset role;

select testes.como('admin_a');
select throws_ok($$insert into public.clientes (nome, horas_mes) values ('Cliente do admin', 10)$$, '42501', null,
  'administrador da consultoria não cadastra cliente');
reset role;

-- A central manda para a consultoria A
select testes.como('central');
select lives_ok($$update public.clientes set consultoria_id = testes.id('A') where id = testes.id('cli_mov')$$,
  'central manda o cliente para a consultoria A');
reset role;
select is((select count(*) from public.cliente_eventos where cliente_id = testes.id('cli_mov') and tipo = 'enviado'
    and de_consultoria is null and para_consultoria = testes.id('A')), 1::bigint,
  'histórico: enviado para a consultoria A');

-- Gestor sem times escolhe como consultor uma pessoa fora dos times dele
select testes.como('gestor_a2');
select is((select count(*) from public.clientes where id in (select id from testes.fx)), 1::bigint,
  'gestor sem times vê o cliente da consultoria (e não os que estão na central)');
select is((select count(*) from public.perfis where id = testes.id('pessoa_a2')), 0::bigint,
  'gestor sem times não enxerga a pessoa pela tabela de perfis');
select lives_ok($$update public.clientes set consultor_id = testes.id('pessoa_a2') where id = testes.id('cli_mov')$$,
  'gestor escolhe como consultor uma pessoa fora dos times dele');
reset role;
select is((select count(*) from public.cliente_eventos where cliente_id = testes.id('cli_mov') and tipo = 'consultor_escolhido'
    and de_consultor is null and para_consultor = testes.id('pessoa_a2')), 1::bigint,
  'histórico: consultor escolhido');
select ok((select consultor_desde is not null from public.clientes where id = testes.id('cli_mov')),
  'consultor_desde preenchido ao escolher o consultor');

-- A gestão edita os dados do cliente da consultoria (pedido do Diego, 19/11); mandar, mover e arquivar seguem da central.
select testes.como('gestor_a2');
select lives_ok($$update public.clientes set nome = 'Cliente Móvel Ltda', cidade = 'Chapecó' where id = testes.id('cli_mov')$$,
  'gestor edita os dados do cliente da consultoria dele');
select throws_ok($$update public.clientes set consultoria_id = testes.id('B') where id = testes.id('cli_mov')$$,
  'P0001', 'so_central_muda', 'gestor não move o cliente para outra consultoria');
select throws_ok($$update public.clientes set arquivado_em = now() where id = testes.id('cli_mov')$$,
  'P0001', 'so_central_muda', 'gestor não arquiva o cliente');
reset role;
select is((select nome || ' / ' || cidade from public.clientes where id = testes.id('cli_mov')), 'Cliente Móvel Ltda / Chapecó',
  'os dados mudados pela gestão ficam gravados');
select is((select count(*) from public.cliente_eventos where cliente_id = testes.id('cli_mov') and tipo = 'editado'
    and autor = testes.id('gestor_a2')), 1::bigint,
  'histórico: editado pela gestão, com o autor');
select testes.como('gestor_a2');
select lives_ok($$update public.clientes set horas_mes = 30 where id = testes.id('cli_mov')$$,
  'gestor ajusta a previsão de horas');
select throws_ok($$update public.clientes set consultor_id = testes.id('pessoa_b') where id = testes.id('cli_mov')$$,
  'P0001', 'consultor_invalido', 'consultor de outra consultoria é recusado');
select throws_ok($$update public.clientes set consultor_id = testes.id('pessoa_inativa') where id = testes.id('cli_mov')$$,
  'P0001', 'consultor_invalido', 'consultor desativado é recusado');
select is((select (public.consultor(c)).nome from public.clientes c where c.id = testes.id('cli_mov')),
  'Pessoa pessoa_a2', 'gestor vê o nome do consultor pela relação calculada consultor(clientes)');
reset role;
select is((select count(*) from public.cliente_eventos where cliente_id = testes.id('cli_mov') and tipo = 'previsao_ajustada'
    and de_horas = 20 and para_horas = 30), 1::bigint,
  'histórico: previsão ajustada de 20 para 30 horas');

-- Quem vê o cliente
select testes.como('gestor_a1');
select is((select count(*) from public.clientes where id in (select id from testes.fx)), 1::bigint,
  'gestor com times também vê o cliente da consultoria inteira');
reset role;
select testes.como('pessoa_a2');
select is((select count(*) from public.clientes where id in (select id from testes.fx)), 1::bigint,
  'consultor vê só o cliente dele');
update public.clientes set nome = 'Nome do consultor' where id = testes.id('cli_mov');
reset role;
select testes.como('admin_b');
update public.clientes set nome = 'Nome da outra consultoria' where id = testes.id('cli_mov');
reset role;
select is((select nome from public.clientes where id = testes.id('cli_mov')), 'Cliente Móvel Ltda',
  'nem o consultor nem outra consultoria mudam os dados do cliente (a política não alcança a linha)');
select testes.como('pessoa_a');
select is((select count(*) from public.clientes where id in (select id from testes.fx)), 0::bigint,
  'pessoa da consultoria que não é a consultora não vê o cliente');
reset role;
select testes.como('admin_b');
select is((select count(*) from public.clientes where id in (select id from testes.fx)), 0::bigint,
  'outra consultoria não vê o cliente');
reset role;
select testes.como('central');
select is((select count(*) from public.clientes where id in (select id from testes.fx)), 2::bigint,
  'central vê todos os clientes');
reset role;
select testes.como('dono');
select is((select count(*) from public.clientes where id in (select id from testes.fx)), 2::bigint,
  'dono vê todos os clientes');
reset role;
select is(testes.divergencias_de_vejo_cliente(), '',
  'a política de leitura de clientes dá o mesmo resultado que vejo_cliente em todos os papéis');

-- Mover para B. No app cada passo é uma requisição (uma transação, com o seu now()); aqui tudo roda
-- numa transação só. Recua o histórico de antes para ele ficar antes da mudança, como no app.
update public.cliente_eventos set em = em - interval '1 hour' where cliente_id = testes.id('cli_mov');
select testes.como('central');
select lives_ok($$update public.clientes set consultoria_id = testes.id('B') where id = testes.id('cli_mov')$$,
  'central move o cliente para a consultoria B');
reset role;
select ok((select consultor_id is null and consultor_desde is null and enviado_em = now()
    from public.clientes where id = testes.id('cli_mov')),
  'ao mover, o consultor sai e o cliente volta a aguardar consultor');
select is((select count(*) from public.cliente_eventos where cliente_id = testes.id('cli_mov') and tipo = 'movido'
    and de_consultoria = testes.id('A') and para_consultoria = testes.id('B')
    and de_consultor = testes.id('pessoa_a2') and para_consultor is null), 1::bigint,
  'histórico: movido de A para B, com o consultor que saiu');
select testes.como('admin_a');
select is((select count(*) from public.clientes where id in (select id from testes.fx)), 0::bigint,
  'a consultoria antiga deixa de ver o cliente');
reset role;
select testes.como('admin_b');
select is((select array_agg(tipo) from public.cliente_eventos where cliente_id = testes.id('cli_mov')),
  array['movido'], 'a consultoria nova vê o histórico só a partir da chegada');
reset role;
select testes.como('central');
select is((select count(*) from public.cliente_eventos where cliente_id = testes.id('cli_mov')), 6::bigint,
  'central vê o histórico inteiro');

-- Consultoria arquivada não recebe cliente
select throws_ok($$update public.clientes set consultoria_id = testes.id('C_arquivada') where id = testes.id('cli_livre')$$,
  'P0001', 'consultoria_arquivada', 'não manda cliente para consultoria arquivada');

-- CNPJ colado com pontuação e minúsculas; único no sistema todo, contando os arquivados
select lives_ok($$update public.clientes set cnpj = ' 12.abc.345/01de-35 ', arquivado_em = now() where id = testes.id('cli_livre')$$,
  'central cola o CNPJ com pontuação e minúsculas e arquiva o cliente');
select is((select cnpj from public.clientes where id = testes.id('cli_livre')), '12ABC34501DE35',
  'CNPJ guardado só com letras maiúsculas e dígitos');
select throws_ok($$insert into public.clientes (nome, horas_mes, cnpj) values ('Cliente repetido', 10, '12ABC34501DE35')$$,
  '23505', null, 'CNPJ não se repete, mesmo com o outro cliente arquivado');
select throws_ok($$insert into public.clientes (nome, horas_mes, cnpj) values ('Cliente inválido', 10, '11222333000182')$$,
  '23514', null, 'CNPJ inválido é recusado');
update public.clientes set arquivado_em = null where id = testes.id('cli_livre');
reset role;
select bag_eq($$select tipo from public.cliente_eventos where cliente_id = testes.id('cli_livre')$$,
  $$values ('cadastrado'), ('editado'), ('arquivado'), ('reativado')$$,
  'histórico: cadastrado, editado, arquivado e reativado');

-- Linha forjada: a função olha o cliente guardado no banco, não os dados que vieram na chamada.
select testes.cliente('cli_b', 'B', 'pessoa_b');
create temp table forjada (c public.clientes);
insert into forjada select c from public.clientes c where c.id = testes.id('cli_b');
update forjada set c.consultoria_id = testes.id('A'), c.consultor_id = testes.id('pessoa_a2');
grant select on forjada to authenticated;
select testes.como('gestor_a2');
select is((select count(*) from forjada f, public.consultor(f.c)), 0::bigint,
  'linha forjada (cliente de B com dados de A) não revela o consultor');
reset role;

-- Trocar e tirar o consultor: a consultoria troca; a central não escolhe, mas pode tirar.
select testes.como('admin_b');
update public.clientes set consultor_id = testes.id('admin_b') where id = testes.id('cli_b');
reset role;
select testes.como('central');
select throws_ok($$update public.clientes set consultor_id = testes.id('pessoa_b') where id = testes.id('cli_b')$$,
  'P0001', 'consultoria_escolhe_consultor', 'central não escolhe o consultor de um cliente');
select lives_ok($$update public.clientes set consultor_id = null where id = testes.id('cli_b')$$,
  'central tira o consultor (o cliente volta a aguardar a consultoria)');
reset role;
select bag_eq($$select tipo from public.cliente_eventos where cliente_id = testes.id('cli_b')$$,
  $$values ('cadastrado'), ('enviado'), ('consultor_escolhido'), ('consultor_trocado'), ('consultor_removido')$$,
  'histórico: consultor escolhido, trocado e removido');

-- Cliente arquivado: a gestão vê, mas não mexe nem nos dados. (Arquivar e reativar como a central.)
select testes.como('central');
update public.clientes set arquivado_em = now() where id = testes.id('cli_b');
reset role;
select testes.como('admin_b');
select throws_ok($$update public.clientes set nome = 'Arquivado editado' where id = testes.id('cli_b')$$,
  'P0001', 'so_central_muda', 'gestão não edita os dados de cliente arquivado');
reset role;
select testes.como('central');
update public.clientes set arquivado_em = null where id = testes.id('cli_b');
reset role;

-- Devolver para a central
select testes.como('central');
update public.clientes set consultoria_id = null where id = testes.id('cli_mov');
reset role;
select is((select count(*) from public.cliente_eventos where cliente_id = testes.id('cli_mov') and tipo = 'devolvido'
    and de_consultoria = testes.id('B') and para_consultoria is null), 1::bigint,
  'histórico: devolvido para a central');

-- Índices das listas, da busca e do histórico
select has_index('public', 'clientes', 'clientes_cnpj_unico', 'CNPJ único entre os clientes');
select has_index('public', 'clientes', 'clientes_central_idx', 'Clientes da central: arquivado + a distribuir, em ordem de nome');
select has_index('public', 'clientes', 'clientes_consultoria_idx', 'Clientes da consultoria: arquivado, em ordem de nome');
select has_index('public', 'clientes', 'clientes_consultor_idx', 'Clientes do consultor: arquivado, em ordem de nome');
select has_index('public', 'clientes', 'clientes_busca_idx', 'Busca sem acento por trigramas');
select has_index('public', 'clientes', 'clientes_criado_por_idx', 'Quem cadastrou');
select has_index('public', 'cliente_eventos', 'cliente_eventos_cliente_idx', 'Histórico do cliente por data');
select has_index('public', 'cliente_eventos', 'cliente_eventos_autor_idx', 'Autor do evento');

select * from finish();
rollback;
