-- Integrações: Slack e WhatsApp entram no catálogo (pedido do Diego, 17/11). Só a conexão: o token fica no Vault como
-- os outros segredos e a Edge Function `integracoes` testa; para onde vão as mensagens fica para depois.
-- Não apaga nada: só troca a regra da coluna tipo (que antes aceitava ia, smtp e google) e a conta dos cartões.

alter table public.integracoes drop constraint integracoes_tipo_check;
alter table public.integracoes add constraint integracoes_tipo_check
  check (tipo in ('ia', 'smtp', 'google', 'slack', 'whatsapp'));

-- Cartões da tela: o catálogo agora tem 5 integrações por consultoria (as da regra acima); o resto não muda.
-- { conectadas, com_erro, nao_configuradas, ultimo_teste }: administrador, a consultoria dele; dono, a de p_consultoria
-- ou (sem ela) todas as consultorias ativas. Não configurada = sem linha.
create or replace function public.indicadores_de_integracoes(p_consultoria uuid default null) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_consultoria uuid;
  v_resultado jsonb;
begin
  if private.sou_dono() then
    v_consultoria := p_consultoria;
  elsif private.sou_admin() then
    v_consultoria := private.consultoria_atual();
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  with cons as (
    select co.id
    from public.consultorias co
    where (v_consultoria is null and co.arquivada_em is null) or co.id = v_consultoria
  )
  select jsonb_build_object(
    'conectadas', count(*) filter (where i.situacao = 'conectada'),
    'com_erro', count(*) filter (where i.situacao = 'com_erro'),
    'nao_configuradas', 5 * (select count(*) from cons) - count(*),
    'ultimo_teste', max(i.ultimo_teste_em))
  into v_resultado
  from public.integracoes i
  join cons c on c.id = i.consultoria_id;
  return v_resultado;
end $$;
