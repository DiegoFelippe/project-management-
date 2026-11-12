-- Escala: as listas paginam no banco por nome, com filtro; os índices precisam existir. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select has_index('public', 'perfis', 'perfis_lista_idx', 'Usuários: consultoria + ativo, em ordem de nome');
select has_index('public', 'perfis', 'perfis_lista_dono_idx', 'Usuários do dono (todas as consultorias): ativo, em ordem de nome');
select has_index('public', 'consultorias', 'consultorias_lista_idx', 'Consultorias: arquivada ou não, em ordem de nome');

select * from finish();
rollback;
