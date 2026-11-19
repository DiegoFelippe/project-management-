-- Escala: as listas paginam no banco por nome, com filtro; os índices precisam existir. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_index('public', 'perfis', 'perfis_lista_idx', 'Usuários: consultoria + ativo, em ordem de nome');
select has_index('public', 'perfis', 'perfis_lista_dono_idx', 'Usuários do dono (todas as consultorias): ativo, em ordem de nome');
select has_index('public', 'consultorias', 'consultorias_lista_idx', 'Consultorias: arquivada ou não, em ordem de nome');

-- Clientes (Tarefa 4)
select has_index('public', 'clientes', 'clientes_cnpj_unico', 'Clientes: CNPJ único');
select has_index('public', 'clientes', 'clientes_central_idx', 'Clientes da central: arquivado + sem consultoria, em ordem de nome');
select has_index('public', 'clientes', 'clientes_consultoria_idx', 'Clientes da consultoria: arquivado, em ordem de nome');
select has_index('public', 'clientes', 'clientes_consultor_idx', 'Clientes do consultor: arquivado, em ordem de nome');
select has_index('public', 'clientes', 'clientes_busca_idx', 'Clientes: busca por trigramas');
select has_index('public', 'clientes', 'clientes_criado_por_idx', 'Clientes: quem cadastrou');
select has_index('public', 'cliente_eventos', 'cliente_eventos_cliente_idx', 'Histórico do cliente por data');
select has_index('public', 'cliente_eventos', 'cliente_eventos_autor_idx', 'Histórico: autor');

-- Capacidade (Tarefa 5)
select has_index('public', 'ausencias', 'ausencias_perfil_idx', 'Ausências do consultor por período');
select has_index('public', 'ausencias', 'ausencias_criado_por_idx', 'Ausências: quem criou');

-- Check-ins (Tarefa 6)
select has_index('public', 'checkins', 'checkins_cliente_idx', 'Check-ins do cliente por início');
select has_index('public', 'checkins', 'checkins_consultor_idx', 'Check-ins do consultor por início');
select has_index('public', 'checkins', 'checkins_consultoria_idx', 'Check-ins da consultoria por início (realizado do mês)');

-- Ocupação (Tarefa 7)
select has_index('public', 'checkins', 'checkins_inicio_idx', 'Check-ins do mês de todas as consultorias (ocupação da central)');

select * from finish();
rollback;
