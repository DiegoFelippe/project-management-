-- Tipo de consultoria da pessoa: Gestão, Sucesso do Cliente, Assessoria Jurídica e Gestão de Pessoas.
-- Pode ter mais de um (lista), ou nenhum (quem já existia fica sem tipo: '{}').
-- Quem grava: as Edge Functions (criar-acesso e gerenciar-acesso, com service_role), igual cargo e telefone.
-- A pessoa não muda os próprios tipos: authenticated não tem UPDATE nessa coluna (só foto e cor).

-- Só os quatro valores, sem repetir e sem item nulo. Função porque CHECK não aceita subconsulta.
create function private.tipos_de_consultoria_validos(p_tipos text[]) returns boolean
language sql immutable set search_path = '' as $$
  select p_tipos <@ array['gestao', 'sucesso_do_cliente', 'assessoria_juridica', 'gestao_de_pessoas']::text[]
    and not (array_position(p_tipos, null) is not null)
    and cardinality(p_tipos) = (select count(distinct t) from unnest(p_tipos) t)
$$;

alter table public.perfis
  add column tipos_de_consultoria text[] not null default '{}'
    constraint perfis_tipos_de_consultoria_validos check (private.tipos_de_consultoria_validos(tipos_de_consultoria));

-- Filtro da lista de Usuários ("pessoas que têm aquele tipo": tipos_de_consultoria @> '{gestao}').
create index perfis_tipos_de_consultoria_idx on public.perfis using gin (tipos_de_consultoria);
