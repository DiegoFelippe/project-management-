-- Escala (regra no CLAUDE.md): as listas paginam no banco, filtradas e em ordem de nome.
-- Índices para o filtro + ordenação de cada lista, para continuarem rápidas com milhares de registros.

-- Usuários de uma consultoria: ativos ou desativados, em ordem de nome.
create index perfis_lista_idx on public.perfis (consultoria_id, ativo, nome, id);

-- Usuários vistos pelo dono (todas as consultorias): ativos ou desativados, em ordem de nome.
create index perfis_lista_dono_idx on public.perfis (ativo, nome, id);

-- Consultorias: ativas ou arquivadas, em ordem de nome.
create index consultorias_lista_idx on public.consultorias ((arquivada_em is null), nome, id);
