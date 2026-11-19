-- Busca por nome sem acento (e sem diferenciar maiúscula) nos seletores de pessoa e de consultoria: "joao" acha "João".
-- As outras buscas do app já usam private.sem_acento; estas usavam ilike direto em `nome`. Coluna gerada (como
-- clientes.busca) com índice trigram, para o `ilike '%termo%'` continuar rápido com milhares de registros.
-- Só acrescenta colunas e índices: nenhuma linha é alterada ou apagada.
--
-- Permissão: authenticated já lê perfis e consultorias por tabela (grant select), e RLS recorta as linhas como antes.
-- A coluna nova é só o próprio nome normalizado (nada que `nome` já não mostre); o grant por coluna abaixo deixa isso
-- explícito e vale mesmo se o grant da tabela for trocado por colunas. Ninguém grava nela (é gerada).
-- consultor(clientes), consultor_do_checkin(checkins) e autor_do_arquivo montam o perfil só com id, nome, foto e
-- ativo (jsonb_populate_record não calcula colunas geradas): nome_busca sai nula por essas relações.

alter table public.perfis
  add column nome_busca text generated always as (private.sem_acento(nome)) stored;
alter table public.consultorias
  add column nome_busca text generated always as (private.sem_acento(nome)) stored;

create index perfis_nome_busca_idx on public.perfis using gin (nome_busca extensions.gin_trgm_ops);
create index consultorias_nome_busca_idx on public.consultorias using gin (nome_busca extensions.gin_trgm_ops);

grant select (nome_busca) on public.perfis, public.consultorias to authenticated;
