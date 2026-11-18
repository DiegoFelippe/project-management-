-- Gráficos do Início e da aba Geral do cliente, parte do banco (design 2026-11-17-graficos-do-inicio-e-do-cliente).
-- 1. História da situação de cada cliente (private.situacoes_dos_clientes): um trecho por período com a mesma
--    consultoria, o mesmo consultor e a mesma previsão, sem estar arquivado. Com ela o Início conta clientes em
--    atendimento, aguardando e reservado num instante passado (o período anterior da comparação). Mantida por gatilho
--    em clientes e preenchida aqui refazendo o histórico de cliente_eventos.
-- 2. Dois resumos novos de check-ins fechados, mantidos pelo mesmo gatilho dos outros dois: por cliente e mês
--    (private.checkins_horas_cliente_mes) e por consultoria e dia (private.checkins_por_dia).
-- 3. Ajudantes do Início, um lugar só para as regras: recorte de quem chama, período, período anterior e a situação
--    dos clientes num instante.
-- Só acrescenta: tabelas novas (em private, que o PostgREST não publica), o preenchimento delas e funções. Nenhuma
-- linha de clientes, checkins, cliente_eventos ou de outra tabela que já existe muda. Preenchimento e gatilhos na
-- mesma transação, com clientes e checkins travadas para escrita (share row exclusive: leituras seguem, escritas
-- esperam), como 20261117014923_painel_resumo_sem_buraco.sql.

-- O CLI não abre transação sozinho, e o travamento só vale dentro de uma: begin ... commit explícitos.
begin;

lock table public.clientes in share row exclusive mode;
lock table public.checkins in share row exclusive mode;

-- ── 1. História da situação dos clientes ─────────────────────────────────────
-- Um registro, como cliente_eventos: sem chave para consultorias e perfis (apagar uma pessoa ou uma consultoria não
-- mexe na história). ate nulo = a situação de agora. espera_desde: quando começou a esperar consultor naquela
-- consultoria. entrou: o trecho é o começo de um atendimento (o cliente ganhou consultor).
create table private.situacoes_dos_clientes (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.clientes on delete cascade,
  consultoria_id uuid,
  consultor_id uuid,
  horas_mes numeric(5, 1) not null,
  de timestamptz not null,
  ate timestamptz,
  espera_desde timestamptz,
  entrou boolean not null default false,
  check (ate is null or ate >= de)
);
create unique index situacoes_dos_clientes_aberto_idx on private.situacoes_dos_clientes (cliente_id) where ate is null;
-- Por cliente: a cascada ao apagar o cliente e o gatilho (o instante mais novo do cliente) leem por aqui.
create index situacoes_dos_clientes_cliente_idx on private.situacoes_dos_clientes (cliente_id, de);
create index situacoes_dos_clientes_consultoria_idx on private.situacoes_dos_clientes (consultoria_id, de);
create index situacoes_dos_clientes_consultor_idx on private.situacoes_dos_clientes (consultor_id, de);
create index situacoes_dos_clientes_de_idx on private.situacoes_dos_clientes (de);
alter table private.situacoes_dos_clientes enable row level security;
revoke all on private.situacoes_dos_clientes from public, anon, authenticated, service_role;

-- As duas regras de um trecho novo, as mesmas no gatilho e no refazer pelos eventos.
-- espera_desde: no trecho sem consultor, o começo da espera naquela consultoria (passa adiante enquanto ele continua
-- esperando nela, numa mudança de previsão); no trecho que ganha consultor, o da espera (e passa adiante enquanto o
-- atendimento continua na mesma consultoria); a distribuir não espera consultor.
create function private.espera_do_trecho(p_tinha boolean, p_consultoria_antes uuid, p_consultor_antes uuid,
  p_espera_antes timestamptz, p_consultoria uuid, p_consultor uuid, p_t timestamptz)
returns timestamptz language sql immutable set search_path = '' as $$
  select case
    when p_consultoria is null then null
    when p_tinha and p_consultoria_antes = p_consultoria and (p_consultor_antes is null or p_consultor is not null)
      then p_espera_antes
    when p_consultor is null then p_t
  end
$$;

-- entrou: só quando o trecho ganha consultor e o anterior não tinha (ou não existia: cadastro, reativação). Troca de
-- consultor e mudança de previsão não são cliente novo.
create function private.trecho_entrou(p_tinha boolean, p_consultor_antes uuid, p_consultor uuid)
returns boolean language sql immutable set search_path = '' as $$
  select p_consultor is not null and (not p_tinha or p_consultor_antes is null)
$$;

-- O gatilho: um passo por evento que private.registrar_historico_do_cliente grava, na mesma ordem (no cadastro:
-- cadastrado, enviado, consultor escolhido, arquivado; na mudança: consultoria ou consultor, previsão, arquivamento).
-- Cada passo fecha o trecho aberto e, se o cliente não ficou arquivado, abre outro. Duas mudanças no mesmo comando ou
-- na mesma transação deixam trechos de duração zero (de = ate), que nenhum instante conta. Assim o gatilho e
-- situacoes_pelos_eventos dão exatamente os mesmos trechos.
create function private.registrar_situacao_do_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_consultorias uuid[] := '{}';
  v_consultores uuid[] := '{}';
  v_horas numeric[] := '{}';
  v_arquivados boolean[] := '{}';
  v_t timestamptz := now();
  v_tinha boolean := false;  -- há trecho aberto antes do passo
  v_novo boolean := false;   -- o trecho aberto é deste gatilho (ainda não gravado)
  v_a_consultoria uuid;      -- o trecho aberto
  v_a_consultor uuid;
  v_a_horas numeric;
  v_a_espera timestamptz;
  v_a_entrou boolean;
  v_espera timestamptz;
  i int;
begin
  if tg_op = 'INSERT' then
    v_consultorias := array[null::uuid];
    v_consultores := array[null::uuid];
    v_horas := array[new.horas_mes];
    v_arquivados := array[false];
    if new.consultoria_id is not null then
      v_consultorias := v_consultorias || new.consultoria_id;
      v_consultores := v_consultores || null::uuid;
      v_horas := v_horas || new.horas_mes;
      v_arquivados := v_arquivados || false;
    end if;
    if new.consultor_id is not null then
      v_consultorias := v_consultorias || new.consultoria_id;
      v_consultores := v_consultores || new.consultor_id;
      v_horas := v_horas || new.horas_mes;
      v_arquivados := v_arquivados || false;
    end if;
    if new.arquivado_em is not null then
      v_consultorias := v_consultorias || new.consultoria_id;
      v_consultores := v_consultores || new.consultor_id;
      v_horas := v_horas || new.horas_mes;
      v_arquivados := v_arquivados || true;
    end if;
  else
    if (new.consultoria_id, new.consultor_id) is distinct from (old.consultoria_id, old.consultor_id) then
      v_consultorias := v_consultorias || new.consultoria_id;
      v_consultores := v_consultores || new.consultor_id;
      v_horas := v_horas || old.horas_mes;
      v_arquivados := v_arquivados || (old.arquivado_em is not null);
    end if;
    if new.horas_mes is distinct from old.horas_mes then
      v_consultorias := v_consultorias || new.consultoria_id;
      v_consultores := v_consultores || new.consultor_id;
      v_horas := v_horas || new.horas_mes;
      v_arquivados := v_arquivados || (old.arquivado_em is not null);
    end if;
    if (new.arquivado_em is null) <> (old.arquivado_em is null) then
      v_consultorias := v_consultorias || new.consultoria_id;
      v_consultores := v_consultores || new.consultor_id;
      v_horas := v_horas || new.horas_mes;
      v_arquivados := v_arquivados || (new.arquivado_em is not null);
    end if;
    -- Nada do que a história guarda mudou (nome, contato, a data de um arquivamento que continua...).
    if cardinality(v_horas) = 0 then
      return null;
    end if;
    -- O tempo da história não volta: uma transação que começou antes de outra, mas grava depois dela, usa o instante
    -- mais novo já gravado.
    select greatest(now(), max(s.de), max(s.ate)) into v_t
    from private.situacoes_dos_clientes s where s.cliente_id = new.id;
    update private.situacoes_dos_clientes s set ate = v_t
    where s.cliente_id = new.id and s.ate is null
    returning s.consultoria_id, s.consultor_id, s.horas_mes, s.espera_desde, s.entrou
    into v_a_consultoria, v_a_consultor, v_a_horas, v_a_espera, v_a_entrou;
    v_tinha := found;
  end if;

  for i in 1 .. cardinality(v_horas) loop
    -- O aberto do passo anterior deste gatilho fecha agora (o que já estava gravado foi fechado acima).
    if v_tinha and v_novo then
      insert into private.situacoes_dos_clientes
        (cliente_id, consultoria_id, consultor_id, horas_mes, de, ate, espera_desde, entrou)
      values (new.id, v_a_consultoria, v_a_consultor, v_a_horas, v_t, v_t, v_a_espera, v_a_entrou);
    end if;
    if v_arquivados[i] then
      v_tinha := false;
      v_novo := false;
    else
      v_espera := private.espera_do_trecho(v_tinha, v_a_consultoria, v_a_consultor, v_a_espera,
        v_consultorias[i], v_consultores[i], v_t);
      v_a_entrou := private.trecho_entrou(v_tinha, v_a_consultor, v_consultores[i]);
      v_a_consultoria := v_consultorias[i];
      v_a_consultor := v_consultores[i];
      v_a_horas := v_horas[i];
      v_a_espera := v_espera;
      v_tinha := true;
      v_novo := true;
    end if;
  end loop;

  if v_tinha and v_novo then
    insert into private.situacoes_dos_clientes
      (cliente_id, consultoria_id, consultor_id, horas_mes, de, ate, espera_desde, entrou)
    values (new.id, v_a_consultoria, v_a_consultor, v_a_horas, v_t, null, v_a_espera, v_a_entrou);
  end if;
  return null;
end $$;

-- Refaz os trechos de um cliente lendo cliente_eventos em ordem, com as regras do gatilho. Os eventos da mesma
-- transação têm o mesmo "em"; entre eles vale a ordem em que foram gravados (cmin, o número do comando dentro da
-- transação) e, se ela se perdeu (cópia restaurada), a ordem em que o gatilho do histórico os grava. Usada no
-- preenchimento e no teste (que confere que dá exatamente o que o gatilho gravou).
create function private.situacoes_pelos_eventos(p_cliente uuid)
returns table (consultoria_id uuid, consultor_id uuid, horas_mes numeric, de timestamptz, ate timestamptz,
  espera_desde timestamptz, entrou boolean)
language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
declare
  e record;
  v_consultoria uuid;
  v_consultor uuid;
  v_horas numeric;
  v_arquivado boolean := false;
  v_tinha boolean := false;  -- há trecho aberto
  v_a_consultoria uuid;      -- o trecho aberto
  v_a_consultor uuid;
  v_a_horas numeric;
  v_a_de timestamptz;
  v_a_espera timestamptz;
  v_a_entrou boolean;
  v_ultimo timestamptz;      -- o instante mais novo já usado (o tempo da história não volta, como no gatilho)
  v_t timestamptz;
  v_espera timestamptz;
begin
  for e in
    select ev.tipo, ev.para_consultoria, ev.para_consultor, ev.para_horas, ev.em
    from public.cliente_eventos ev
    where ev.cliente_id = p_cliente
      and ev.tipo in ('cadastrado', 'enviado', 'movido', 'devolvido', 'consultor_escolhido', 'consultor_trocado',
        'consultor_removido', 'previsao_ajustada', 'arquivado', 'reativado')
    order by ev.em, ev.cmin::text::bigint,
      case ev.tipo when 'cadastrado' then 0 when 'enviado' then 1 when 'movido' then 1 when 'devolvido' then 1
        when 'previsao_ajustada' then 3 when 'arquivado' then 4 when 'reativado' then 4 else 2 end
  loop
    case e.tipo
      when 'cadastrado' then
        v_consultoria := null;
        v_consultor := null;
        v_horas := e.para_horas;
        v_arquivado := false;
      when 'enviado', 'movido', 'devolvido' then
        v_consultoria := e.para_consultoria;
        v_consultor := e.para_consultor;
      when 'consultor_escolhido', 'consultor_trocado', 'consultor_removido' then
        v_consultor := e.para_consultor;
      when 'previsao_ajustada' then
        v_horas := e.para_horas;
      when 'arquivado' then
        v_arquivado := true;
      when 'reativado' then
        v_arquivado := false;
    end case;

    v_t := greatest(e.em, v_ultimo);
    if v_tinha then
      consultoria_id := v_a_consultoria;
      consultor_id := v_a_consultor;
      horas_mes := v_a_horas;
      de := v_a_de;
      ate := v_t;
      espera_desde := v_a_espera;
      entrou := v_a_entrou;
      return next;
      v_ultimo := v_t;
    end if;
    if v_arquivado then
      v_tinha := false;
    else
      v_espera := private.espera_do_trecho(v_tinha, v_a_consultoria, v_a_consultor, v_a_espera,
        v_consultoria, v_consultor, v_t);
      v_a_entrou := private.trecho_entrou(v_tinha, v_a_consultor, v_consultor);
      v_a_consultoria := v_consultoria;
      v_a_consultor := v_consultor;
      v_a_horas := v_horas;
      v_a_de := v_t;
      v_a_espera := v_espera;
      v_tinha := true;
      v_ultimo := v_t;
    end if;
  end loop;

  if v_tinha then
    consultoria_id := v_a_consultoria;
    consultor_id := v_a_consultor;
    horas_mes := v_a_horas;
    de := v_a_de;
    ate := null;
    espera_desde := v_a_espera;
    entrou := v_a_entrou;
    return next;
  end if;
end $$;

-- Preenchimento: a história de cada cliente refeita pelos eventos (clientes travada: nenhum evento novo chega).
insert into private.situacoes_dos_clientes
  (cliente_id, consultoria_id, consultor_id, horas_mes, de, ate, espera_desde, entrou)
select c.id, s.consultoria_id, s.consultor_id, s.horas_mes, s.de, s.ate, s.espera_desde, s.entrou
from public.clientes c
cross join lateral private.situacoes_pelos_eventos(c.id) with ordinality
  as s(consultoria_id, consultor_id, horas_mes, de, ate, espera_desde, entrou, n)
order by c.criado_em, c.id, s.n;

-- Acerto: se a história de algum cliente não terminar na situação dele agora (um evento que faltou, uma cópia
-- restaurada com os gatilhos desligados), ele ganha a situação de agora a partir deste instante. Só mexe na tabela
-- nova; a contagem sai no aviso da migração.
do $$
declare
  c record;
  v_t timestamptz;
  v_consultoria uuid;
  v_consultor uuid;
  v_espera timestamptz;
  v_tinha boolean;
  v_n int := 0;
begin
  for c in
    select k.id, k.consultoria_id, k.consultor_id, k.horas_mes, k.arquivado
    from public.clientes k
    left join private.situacoes_dos_clientes s on s.cliente_id = k.id and s.ate is null
    where (k.arquivado and s.id is not null)
       or (not k.arquivado and (s.id is null
         or s.consultoria_id is distinct from k.consultoria_id
         or s.consultor_id is distinct from k.consultor_id
         or s.horas_mes <> k.horas_mes))
  loop
    v_n := v_n + 1;
    select greatest(now(), max(s.de), max(s.ate)) into v_t
    from private.situacoes_dos_clientes s where s.cliente_id = c.id;
    update private.situacoes_dos_clientes s set ate = v_t
    where s.cliente_id = c.id and s.ate is null
    returning s.consultoria_id, s.consultor_id, s.espera_desde into v_consultoria, v_consultor, v_espera;
    v_tinha := found;
    if not c.arquivado then
      insert into private.situacoes_dos_clientes
        (cliente_id, consultoria_id, consultor_id, horas_mes, de, ate, espera_desde, entrou)
      values (c.id, c.consultoria_id, c.consultor_id, c.horas_mes, v_t, null,
        private.espera_do_trecho(v_tinha, v_consultoria, v_consultor, v_espera, c.consultoria_id, c.consultor_id, v_t),
        private.trecho_entrou(v_tinha, v_consultor, c.consultor_id));
    end if;
  end loop;
  raise notice 'situacoes_dos_clientes: % trecho(s) refeito(s) pelos eventos; % cliente(s) acertado(s) para a situação de agora',
    (select count(*) from private.situacoes_dos_clientes), v_n;
end $$;

create trigger clientes_situacao
  after insert or update of consultoria_id, consultor_id, horas_mes, arquivado_em on public.clientes
  for each row execute function private.registrar_situacao_do_cliente();

-- ── 2. Resumos novos de check-ins ────────────────────────────────────────────
-- Como checkins_horas_mes e checkins_horas_consultor_mes: só check-ins fechados, pelo mês (ou dia) de São Paulo em
-- que começaram; sem acesso direto (só as funções do banco leem).
create table private.checkins_horas_cliente_mes (
  cliente_id uuid not null references public.clientes on delete cascade,
  consultoria_id uuid not null references public.consultorias on delete cascade,
  mes date not null,
  segundos numeric not null default 0,
  primary key (cliente_id, consultoria_id, mes)
);
create index checkins_horas_cliente_mes_consultoria_idx on private.checkins_horas_cliente_mes (consultoria_id, mes);
create index checkins_horas_cliente_mes_mes_idx on private.checkins_horas_cliente_mes (mes);
alter table private.checkins_horas_cliente_mes enable row level security;
revoke all on private.checkins_horas_cliente_mes from public, anon, authenticated, service_role;

create table private.checkins_por_dia (
  consultoria_id uuid not null references public.consultorias on delete cascade,
  dia date not null,
  quantidade int not null default 0,
  segundos numeric not null default 0,
  primary key (consultoria_id, dia)
);
create index checkins_por_dia_dia_idx on private.checkins_por_dia (dia);
alter table private.checkins_por_dia enable row level security;
revoke all on private.checkins_por_dia from public, anon, authenticated, service_role;

-- Preenchimento com checkins travada (nenhum check-in novo chega antes do gatilho novo).
insert into private.checkins_horas_cliente_mes (cliente_id, consultoria_id, mes, segundos)
select k.cliente_id, k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date,
  sum(extract(epoch from k.fim - k.inicio))
from public.checkins k
where k.fim is not null
group by 1, 2, 3;

insert into private.checkins_por_dia (consultoria_id, dia, quantidade, segundos)
select k.consultoria_id, (k.inicio at time zone 'America/Sao_Paulo')::date, count(*),
  sum(extract(epoch from k.fim - k.inicio))
from public.checkins k
where k.fim is not null
group by 1, 2;

-- Como somar_horas_consultor_mes (20261117181830): só ganha ou muda linha de cliente e consultoria que ainda
-- existem, para que nenhuma cascata de exclusão tente recriar a linha de algo apagado (23503).
create function private.somar_horas_cliente_mes(p_cliente uuid, p_consultoria uuid, p_inicio timestamptz, p_segundos numeric)
returns void language sql security definer set search_path = '' as $$
  insert into private.checkins_horas_cliente_mes (cliente_id, consultoria_id, mes, segundos)
  select p_cliente, p_consultoria, date_trunc('month', p_inicio at time zone 'America/Sao_Paulo')::date, p_segundos
  where exists (select 1 from public.clientes c where c.id = p_cliente)
    and exists (select 1 from public.consultorias co where co.id = p_consultoria)
  on conflict (cliente_id, consultoria_id, mes)
    do update set segundos = private.checkins_horas_cliente_mes.segundos + excluded.segundos
$$;

create function private.somar_checkin_do_dia(p_consultoria uuid, p_inicio timestamptz, p_quantidade int, p_segundos numeric)
returns void language sql security definer set search_path = '' as $$
  insert into private.checkins_por_dia (consultoria_id, dia, quantidade, segundos)
  select p_consultoria, (p_inicio at time zone 'America/Sao_Paulo')::date, p_quantidade, p_segundos
  where exists (select 1 from public.consultorias co where co.id = p_consultoria)
  on conflict (consultoria_id, dia)
    do update set quantidade = private.checkins_por_dia.quantidade + excluded.quantidade,
      segundos = private.checkins_por_dia.segundos + excluded.segundos
$$;

-- Mesmo corpo de 20261117173317_painel_periodo_resumo_por_consultor.sql; muda só: mantém também os dois resumos novos.
create or replace function private.checkins_resumir_horas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.fim is not null then
    perform private.somar_horas_mes(old.consultoria_id, old.inicio, -extract(epoch from old.fim - old.inicio));
    perform private.somar_horas_consultor_mes(old.consultor_id, old.consultoria_id, old.inicio,
      -extract(epoch from old.fim - old.inicio));
    perform private.somar_horas_cliente_mes(old.cliente_id, old.consultoria_id, old.inicio,
      -extract(epoch from old.fim - old.inicio));
    perform private.somar_checkin_do_dia(old.consultoria_id, old.inicio, -1, -extract(epoch from old.fim - old.inicio));
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.fim is not null then
    perform private.somar_horas_mes(new.consultoria_id, new.inicio, extract(epoch from new.fim - new.inicio));
    perform private.somar_horas_consultor_mes(new.consultor_id, new.consultoria_id, new.inicio,
      extract(epoch from new.fim - new.inicio));
    perform private.somar_horas_cliente_mes(new.cliente_id, new.consultoria_id, new.inicio,
      extract(epoch from new.fim - new.inicio));
    perform private.somar_checkin_do_dia(new.consultoria_id, new.inicio, 1, extract(epoch from new.fim - new.inicio));
  end if;
  return null;
end $$;

-- Mesmas condições de antes, mais o cliente do check-in: mudar o cliente de um check-in mexe no resumo por cliente.
drop trigger checkins_resumir_horas on public.checkins;
create trigger checkins_resumir_horas
  after insert or delete or update of inicio, fim, consultoria_id, consultor_id, cliente_id on public.checkins
  for each row execute function private.checkins_resumir_horas();

-- Mesmo corpo de 20261117181830_painel_resumo_por_consultor_sem_orfao.sql; muda só: refaz também os dois resumos
-- novos. Não roda aqui (é a ferramenta de conserto).
create or replace function private.recalcular_horas_mes() returns void
language plpgsql security definer set search_path = '' as $$
begin
  lock table public.checkins in share row exclusive mode;
  delete from public.checkins_horas_mes;
  insert into public.checkins_horas_mes (consultoria_id, mes, segundos)
  select k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date,
    sum(extract(epoch from k.fim - k.inicio))
  from public.checkins k
  where k.fim is not null
  group by 1, 2;
  delete from private.checkins_horas_consultor_mes;
  insert into private.checkins_horas_consultor_mes (consultor_id, consultoria_id, mes, segundos)
  select k.consultor_id, k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date,
    sum(extract(epoch from k.fim - k.inicio))
  from public.checkins k
  where k.fim is not null
  group by 1, 2, 3;
  delete from private.checkins_horas_cliente_mes;
  insert into private.checkins_horas_cliente_mes (cliente_id, consultoria_id, mes, segundos)
  select k.cliente_id, k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date,
    sum(extract(epoch from k.fim - k.inicio))
  from public.checkins k
  where k.fim is not null
  group by 1, 2, 3;
  delete from private.checkins_por_dia;
  insert into private.checkins_por_dia (consultoria_id, dia, quantidade, segundos)
  select k.consultoria_id, (k.inicio at time zone 'America/Sao_Paulo')::date, count(*),
    sum(extract(epoch from k.fim - k.inicio))
  from public.checkins k
  where k.fim is not null
  group by 1, 2;
end $$;

-- ── 3. Ajudantes do Início ───────────────────────────────────────────────────
-- Quem chama e o que alcança: a regra de painel_do_inicio (20261117184913), num lugar só, para todas as funções do
-- Início cortarem igual. Central (e dono): tudo; administrador e gestor: a consultoria atual; consultor liberado: o
-- que é dele; o resto: sem_recorte (42501).
create function private.recorte_do_inicio()
returns table (recorte text, consultoria uuid, eu uuid)
language plpgsql stable set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
begin
  if private.sou_central() then
    return query select 'tudo'::text, null::uuid, v_eu;
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    return query select 'consultoria'::text, private.consultoria_atual(), v_eu;
  elsif private.liberado() and private.papel_atual() = 'pessoa' then
    return query select 'pessoa'::text, private.consultoria_atual(), v_eu;
  else
    raise exception 'sem_recorte' using errcode = '42501';
  end if;
end $$;

-- O período pedido ao Início (as recusas e as frases de painel_do_inicio de hoje): Mês (p_mes; nulo = o atual) ou
-- período (p_de e p_ate). mes = o mês do painel (o pedido, ou o do fim do período); passado = sem previsão (mês
-- passado ou qualquer período); ate_efetivo = o fim, mas nunca depois de hoje.
create function private.periodo_do_inicio(p_mes date, p_de date, p_ate date)
returns table (mes date, de date, ate date, ate_efetivo date, intervalo boolean, passado boolean)
language plpgsql stable set search_path = '' as $$
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_intervalo boolean := p_de is not null or p_ate is not null;
  v_mes date;
  v_de date;
  v_ate date;
  v_passado boolean;
begin
  if v_intervalo then
    if p_mes is not null or p_de is null or p_ate is null then
      raise exception 'periodo_invalido' using errcode = '22023', detail = 'Mande o mês ou o período (de e até), não os dois.';
    end if;
    if p_de > p_ate then
      raise exception 'periodo_invalido' using errcode = '22023', detail = 'A data inicial vem depois da final.';
    end if;
    if p_ate > (v_mes_atual + interval '1 month - 1 day')::date then
      raise exception 'periodo_invalido' using errcode = '22023', detail = 'O período vai no máximo até o fim do mês atual.';
    end if;
    if p_ate >= (p_de + interval '2 years')::date then
      raise exception 'periodo_invalido' using errcode = '22023', detail = 'O período pode ter no máximo 2 anos.';
    end if;
    v_mes := date_trunc('month', p_ate::timestamp)::date;
    v_de := p_de;
    v_ate := p_ate;
    v_passado := true;
  else
    v_mes := coalesce(date_trunc('month', p_mes::timestamp)::date, v_mes_atual);
    v_de := v_mes;
    v_ate := (v_mes + interval '1 month - 1 day')::date;
    v_passado := v_mes < v_mes_atual;
  end if;
  return query select v_mes, v_de, v_ate, least(v_ate, v_hoje), v_intervalo, v_passado;
end $$;

-- O período anterior, com os mesmos dias do período efetivo (de p_de a p_ate_efetivo):
-- - Mês: do dia 1º do mês anterior até o mesmo dia, sem passar do fim dele (31/03 → 1º a 28/02); forma 'mes' quando
--   dá o mês anterior inteiro, senão 'mes_parcial'. Janeiro compara com dezembro do ano anterior.
-- - Começa em 1º de janeiro e acaba no mesmo ano: as mesmas datas do ano anterior (29/02 → 28/02), 'ano_anterior'.
-- - Qualquer outro: os N dias logo antes (N = dias do efetivo), 'dias_antes'.
-- Período efetivo vazio (começa depois de hoje): nenhuma linha.
create function private.periodo_anterior(p_de date, p_ate_efetivo date, p_mes boolean)
returns table (de date, ate date, forma text)
language plpgsql immutable set search_path = '' as $$
declare
  v_de date;
  v_fim date;
  v_ate date;
  v_dias int;
begin
  if p_de is null or p_ate_efetivo is null or p_ate_efetivo < p_de then
    return;
  end if;
  if p_mes then
    v_de := (date_trunc('month', p_de::timestamp) - interval '1 month')::date;
    v_fim := (v_de + interval '1 month - 1 day')::date;
    v_ate := least(v_de + (p_ate_efetivo - date_trunc('month', p_de::timestamp)::date), v_fim);
    return query select v_de, v_ate, case when v_ate = v_fim then 'mes' else 'mes_parcial' end;
  elsif extract(month from p_de) = 1 and extract(day from p_de) = 1
    and extract(year from p_ate_efetivo) = extract(year from p_de) then
    return query select (p_de - interval '1 year')::date, (p_ate_efetivo - interval '1 year')::date, 'ano_anterior'::text;
  else
    v_dias := p_ate_efetivo - p_de + 1;
    return query select p_de - v_dias, p_de - 1, 'dias_antes'::text;
  end if;
end $$;

-- Os clientes num instante, no recorte: os trechos abertos naquele instante (de <= instante < ate; os de duração zero
-- nunca contam). tudo: todos, a distribuir = sem consultoria; consultoria: só ela, e o reservado inclui quem espera
-- consultor (como as carteiras do painel); pessoa: os clientes de p_eu na consultoria.
create function private.situacao_no_instante(p_recorte text, p_consultoria uuid, p_eu uuid, p_instante timestamptz)
returns table (em_atendimento int, a_distribuir int, sem_consultor int, reservado numeric)
language plpgsql stable set search_path = '' set plan_cache_mode = force_custom_plan as $$
begin
  if p_recorte = 'tudo' then
    return query
    select (count(*) filter (where s.consultor_id is not null))::int,
      (count(*) filter (where s.consultoria_id is null))::int,
      (count(*) filter (where s.consultoria_id is not null and s.consultor_id is null))::int,
      coalesce(sum(s.horas_mes) filter (where s.consultoria_id is not null), 0)
    from private.situacoes_dos_clientes s
    where s.de <= p_instante and (s.ate is null or s.ate > p_instante);
  elsif p_recorte = 'consultoria' then
    return query
    select (count(*) filter (where s.consultor_id is not null))::int, 0,
      (count(*) filter (where s.consultor_id is null))::int,
      coalesce(sum(s.horas_mes), 0)
    from private.situacoes_dos_clientes s
    where s.consultoria_id = p_consultoria
      and s.de <= p_instante and (s.ate is null or s.ate > p_instante);
  elsif p_recorte = 'pessoa' then
    return query
    select count(*)::int, 0, 0, coalesce(sum(s.horas_mes), 0)
    from private.situacoes_dos_clientes s
    where s.consultor_id = p_eu and s.consultoria_id = p_consultoria
      and s.de <= p_instante and (s.ate is null or s.ate > p_instante);
  else
    raise exception 'sem_recorte' using errcode = '42501';
  end if;
end $$;

-- Tudo interno: só as funções do banco (como owner) chamam.
revoke all on function
  private.espera_do_trecho(boolean, uuid, uuid, timestamptz, uuid, uuid, timestamptz),
  private.trecho_entrou(boolean, uuid, uuid),
  private.registrar_situacao_do_cliente(),
  private.situacoes_pelos_eventos(uuid),
  private.somar_horas_cliente_mes(uuid, uuid, timestamptz, numeric),
  private.somar_checkin_do_dia(uuid, timestamptz, int, numeric),
  private.recorte_do_inicio(),
  private.periodo_do_inicio(date, date, date),
  private.periodo_anterior(date, date, boolean),
  private.situacao_no_instante(text, uuid, uuid, timestamptz)
from public, anon, authenticated, service_role;

commit;
