// Frases de leitura dos gráficos (o "insight" embaixo do título; design 2026-11-17-graficos-do-inicio-e-do-cliente,
// "Números e frases"). Cada uma recebe o JSON que o banco mandou e devolve as `partes` de <Leitura>: texto corrido e
// { forte } para o número que importa. Só usam números prontos do banco ou a lista inteira que o gráfico mostra (nunca
// uma amostra): contagens, participações e projeções vêm do banco.
import { diaDaSemana } from '@/lib/calendario'
import { formatarDuracao, formatarHoras, formatarOcupacao } from '@/lib/horas'
import { mesAtual } from '@/lib/mes'

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const plural = (n, um, varios) => `${INTEIRO.format(n)} ${n === 1 ? um : varios}`
const dias = (n) => `${NUMERO.format(n)} ${n === 1 ? 'dia' : 'dias'}`
const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

// "no mês", "no ano" ou "no período", pelo tipo do período da barra (src/lib/periodo.js).
function quando(periodo) {
  if (periodo?.tipo === 'mes') return 'no mês'
  if (periodo?.tipo === 'ano') return 'no ano'
  return 'no período'
}
const maiuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1)

// Realizado × capacidade: "No mês: 1.020 h de 1.480 h (69%) · 460 h livres" (ou "· 80 h acima da capacidade"). A
// capacidade é a do período efetivo (até hoje). Sem o período, o painel diz se é intervalo.
export function fraseDosMeses(painel, periodo) {
  const { realizado = 0, capacidade_ate_hoje: capacidade } = painel.indicadores
  const inicio = `${maiuscula(quando(periodo ?? { tipo: painel.intervalo ? 'personalizado' : 'mes' }))}: `
  if (!capacidade) return [inicio, { forte: formatarHoras(realizado) }, ' realizadas']
  const partes = [inicio, { forte: formatarHoras(realizado) }, ` de ${formatarHoras(capacidade)} (${formatarOcupacao(realizado / capacidade)}) · `]
  return realizado > capacidade
    ? [...partes, { forte: formatarHoras(realizado - capacidade) }, ' acima da capacidade']
    : [...partes, { forte: formatarHoras(capacidade - realizado) }, ' livres']
}

// Fila: "Até ter consultor: 3,5 dias em média no período" ou "Ninguém recebeu consultor no período".
export function fraseDaFila(fila, periodo) {
  if (!fila.receberam_consultor || fila.espera_media_dias == null) return [`Ninguém recebeu consultor ${quando(periodo)}`]
  return ['Até ter consultor: ', { forte: dias(fila.espera_media_dias) }, ` em média ${quando(periodo)}`]
}

// Ocupação por unidade, pelo ranking_resumo (contado sobre todos, não só as 12 barras). Central: consultorias.
export function fraseDaOcupacao(painel, recorte) {
  const { total = 0, acima = 0, folga = 0 } = painel.ranking_resumo ?? {}
  if (!total) return []
  const comFolga = folga ? [{ forte: INTEIRO.format(folga) }, ' com folga'] : []
  if (acima) {
    const quem = recorte === 'tudo' ? plural(acima, 'consultoria', 'consultorias') : plural(acima, 'consultor', 'consultores')
    return [{ forte: quem }, ' acima de 100%', ...(folga ? [' · ', ...comFolga] : [])]
  }
  return folga ? ['Ninguém acima de 100% · ', ...comFolga] : ['Todos entre 70% e 100%']
}

// Risco (situação de hoje): "4 sem check-in há 30+ dias · 2 acima de 120% da previsão".
export function fraseDoRisco(risco) {
  if (!risco.total && !risco.sem_checkin && !risco.acima_do_ritmo) return ['Nenhum cliente em risco hoje']
  return [{ forte: INTEIRO.format(risco.sem_checkin ?? 0) }, ' sem check-in há 30+ dias · ',
    { forte: INTEIRO.format(risco.acima_do_ritmo ?? 0) }, ' acima de 120% da previsão']
}

// Horas por cliente: mais de 30 clientes, os 10 maiores; de 4 a 30, os 3 maiores; até 3, o total. Participações do
// banco, em fração (0,34 = 34%).
export function fraseDasHorasPorCliente(dados, periodo) {
  if (!dados.total_horas) return [`Nenhuma hora ${quando(periodo)}`]
  if (dados.total_clientes > 30) return ['Os 10 maiores somam ', { forte: formatarOcupacao(dados.participacao_10) }, ` das horas ${quando(periodo)}`]
  if (dados.total_clientes > 3) return ['Os 3 maiores somam ', { forte: formatarOcupacao(dados.participacao_3) }, ` das horas ${quando(periodo)}`]
  return [{ forte: formatarHoras(dados.total_horas) }, ` ${quando(periodo)}`]
}

// Check-ins por semana do Início: "Média de 38 por semana no período · pico na semana de 06/10". A média é só das
// semanas inteiras do período: sem nenhuma ainda (a 1ª semana do Mês atual), o banco manda nula e a frase fica com o
// pico, sem um "Média de 0" que não é verdade.
export function fraseDasSemanas(dados, periodo) {
  if (!dados.pico?.checkins) return [`Nenhum check-in ${quando(periodo)}`]
  if (dados.media == null) {
    return [`Ainda sem semana inteira ${quando(periodo)} · pico de `, { forte: INTEIRO.format(dados.pico.checkins) },
      ` na semana de ${diaMes(dados.pico.semana)}`]
  }
  const media = dados.media >= 10 ? INTEIRO.format(dados.media) : NUMERO.format(dados.media)
  return ['Média de ', { forte: media }, ` por semana ${quando(periodo)} · pico na semana de ${diaMes(dados.pico.semana)}`]
}

// No cliente, o período do filtro da aba Geral: sem ele (ou no Mês), "neste mês" / "no mês"; senão, o de quando().
const nesse = (periodo) => (!periodo || periodo.tipo === 'mes' ? 'neste mês' : quando(periodo))
const noMesOu = (periodo) => (!periodo || periodo.tipo === 'mes' ? 'no mês' : quando(periodo))

// Burn-up do cliente (horas_do_cliente_por_dia). Mês atual: a projeção do banco (nula até o dia 6: só o feito);
// mês passado: com quanto fechou, contra a previsão de hoje.
export function fraseDoMesDoCliente(dados, atual = dados.mes === mesAtual()) {
  const daPrevisao = (horas, sufixo) => (dados.previsao ? ` (${formatarOcupacao(horas / dados.previsao)} ${sufixo})` : '')
  if (atual && dados.projecao == null) return [{ forte: formatarHoras(dados.realizado) }, ' até agora']
  if (atual) return ['No ritmo atual, fecha o mês com ', { forte: `≈ ${formatarHoras(dados.projecao)}` }, daPrevisao(dados.projecao, 'da previsão')]
  return ['Fechou o mês com ', { forte: formatarHoras(dados.realizado) }, daPrevisao(dados.realizado, 'da previsão atual')]
}

// Burn-up do cliente num período que não é um mês (horas_do_cliente_por_dia_no_periodo): o realizado contra a previsão
// proporcional aos dias que o banco mandou. "No período: 52 h de 60 h previstas (87%)".
export function fraseDoPeriodoDoCliente(dados, periodo) {
  const inicio = [`${maiuscula(quando(periodo))}: `, { forte: formatarHoras(dados.realizado) }]
  if (!dados.previsao) return inicio
  return [...inicio, ` de ${formatarHoras(dados.previsao)} previstas (${formatarOcupacao(dados.realizado / dados.previsao)})`]
}

// Horas por consultor no mês ou no período (a lista inteira, mais horas primeiro; nome nulo = consultor que a pessoa
// não vê).
export function fraseDosConsultores(lista, periodo) {
  if (!lista.length) return [`Sem horas ${nesse(periodo)}`]
  const [primeiro] = lista
  if (lista.length === 1) return ['Só ', { forte: primeiro.nome ?? 'outro consultor' }, ` ${nesse(periodo)}`]
  const total = lista.reduce((soma, c) => soma + c.horas, 0)
  const fim = periodo && periodo.tipo !== 'mes' ? ` ${quando(periodo)}` : ''
  return [{ forte: primeiro.nome ?? 'Outro consultor' }, ` fez ${formatarOcupacao(total ? primeiro.horas / total : 0)} das horas${fim}`]
}

// Os meses do cliente (6, ou os que o período cobre): média e meses acima da previsão atual, só dos meses fechados (o mês
// em andamento fica de fora), a partir dos pontos do gráfico.
export function fraseDosSeisMeses(meses, previsao, atual = mesAtual()) {
  if (meses.every((m) => !m.realizado)) return [`Sem horas nos últimos ${meses.length} meses`]
  const fechados = meses.filter((m) => m.mes < atual)
  const media = fechados.length ? fechados.reduce((soma, m) => soma + m.realizado, 0) / fechados.length : 0
  const partes = ['Média de ', { forte: formatarHoras(media) }, '/mês']
  if (!previsao) return partes
  const acima = fechados.filter((m) => m.realizado > previsao).length
  return [...partes, ` · ${acima ? `${plural(acima, 'mês', 'meses')} acima da previsão` : 'nenhum mês acima da previsão'}`]
}

// Check-ins por semana do cliente no mês ou no período: "9 check-ins no mês · 2,1 h em média".
export function fraseDasSemanasDoCliente(semanas, periodo) {
  const quantidade = semanas.reduce((soma, s) => soma + s.quantidade, 0)
  if (!quantidade) return [`Sem check-ins ${nesse(periodo)}`]
  const horas = semanas.reduce((soma, s) => soma + s.horas, 0)
  return [{ forte: plural(quantidade, 'check-in', 'check-ins') }, ` ${noMesOu(periodo)} · ${formatarHoras(horas / quantidade)} em média`]
}

// Etapas do check-list (situação de hoje): "12 de 22 resolvidas" (feitas + não se aplica, de todas as etapas) e a etapa
// com mais tarefas atrasadas.
export function fraseDasEtapas(etapas) {
  const soma = (conta) => etapas.reduce((total, e) => total + conta(e), 0)
  const resolvidas = soma((e) => e.feitas + (e.nao_se_aplica ?? 0))
  const inicio = [{ forte: `${INTEIRO.format(resolvidas)} de ${INTEIRO.format(soma((e) => e.tarefas))}` }, ' resolvidas · ']
  const pior = etapas.reduce((a, b) => (b.atrasadas > (a?.atrasadas ?? 0) ? b : a), null)
  if (!pior) return [...inicio, 'nenhuma atrasada']
  return [...inicio, { forte: pior.nome }, ` tem ${plural(pior.atrasadas, 'tarefa atrasada', 'tarefas atrasadas')}`]
}

// Calendário de calor do cliente (os dias do período, de horas_do_cliente_por_dia): quantos dias tiveram check-in e o
// dia da semana com mais horas. "12 dias com check-in no mês · mais horas na quarta (14 h)".
export function fraseDosDiasComCheckin(dias, periodo) {
  const com = dias.filter((d) => d.horas > 0)
  if (!com.length) return [`Sem horas ${nesse(periodo)}`]
  const porDia = com.reduce((soma, d) => ({ ...soma, [diaDaSemana(d.dia)]: (soma[diaDaSemana(d.dia)] ?? 0) + d.horas }), {})
  const dia = Object.keys(porDia).map(Number).reduce((a, b) => (porDia[b] > porDia[a] ? b : a))
  return [{ forte: plural(com.length, 'dia com check-in', 'dias com check-in') },
    ` ${noMesOu(periodo)} · mais horas ${preposicao(dia)} ${DIAS_POR_EXTENSO[dia]} (${formatarHoras(porDia[dia])})`]
}

// Onde foi o tempo (as tarefas com mais tempo marcado, de hoje_do_cliente: a maior primeiro).
const duracao = (segundos) => (segundos < 60 ? 'menos de 1 min' : formatarDuracao(segundos * 1000))
export function fraseDoTempo([maior]) {
  return [{ forte: maior.titulo }, ` levou mais tempo: ${duracao(maior.segundos)}`]
}

// Quadro do cliente (cartões por coluna, de quadro_por_id; os atrasados, de hoje_do_cliente): "7 de 14 cartões
// concluídos · 2 atrasados" (com a coluna de concluídos) ou "14 cartões".
export function fraseDoQuadro(colunas, atrasados) {
  const total = colunas.reduce((soma, c) => soma + c.cartoes, 0)
  const partes = colunas.some((c) => c.concluidos)
    ? [{ forte: `${INTEIRO.format(colunas.filter((c) => c.concluidos).reduce((soma, c) => soma + c.cartoes, 0))} de ${INTEIRO.format(total)}` }, ' cartões concluídos']
    : [{ forte: plural(total, 'cartão', 'cartões') }]
  if (atrasados == null) return partes
  return [...partes, ' · ', ...(atrasados ? [{ forte: INTEIRO.format(atrasados) }, atrasados === 1 ? ' atrasado' : ' atrasados'] : ['nenhum atrasado'])]
}

// ── Início, gráficos variados (pedido do Diego, 19/11) ──

// "o mês", "o ano" ou "o período" (a projeção do burn-up).
const oPeriodo = (periodo) => (periodo?.tipo === 'mes' ? 'o mês' : periodo?.tipo === 'ano' ? 'o ano' : 'o período')
const centesimos = (n) => Math.round(n * 100) / 100
// Antes do 7º dia o ritmo de poucos dias engana (como a projeção do burn-up do cliente, nula até o dia 6).
const DIAS_PARA_PROJETAR = 7

// Burn-up do Início (horas_do_painel_por_dia: todos os dias do período, a capacidade do período inteiro e hoje): o
// acumulado de cada dia, `ultimo` (o índice de hoje; o último dia num período que já acabou; -1 num futuro), o realizado
// até hoje e a projeção no ritmo de hoje (realizado ÷ dias decorridos × dias do período), só com o período em andamento.
export function burnupDoPainel({ dias, hoje }) {
  let soma = 0
  const acumulado = dias.map((d) => (soma = centesimos(soma + d.horas)))
  const ultimo = dias.findLastIndex((d) => d.dia <= hoje)
  const realizado = ultimo >= 0 ? acumulado[ultimo] : 0
  const emAndamento = ultimo >= 0 && ultimo < dias.length - 1
  const projecao = emAndamento && ultimo + 1 >= DIAS_PARA_PROJETAR && realizado > 0 ? (realizado / (ultimo + 1)) * dias.length : null
  return { acumulado, ultimo, realizado, projecao, emAndamento }
}

// "No ritmo de hoje, o mês fecha com ≈ 1.020 h: 69% da capacidade (1.480 h)"; sem projeção, "No mês: 1.020 h · 69% da
// capacidade (1.480 h)" ("No mês, até agora:" enquanto o período não acabou).
export function fraseDoBurnupDoPainel(dados, periodo) {
  const { realizado, projecao, emAndamento } = burnupDoPainel(dados)
  const { capacidade } = dados
  const daCapacidade = (horas) => `${formatarOcupacao(horas / capacidade)} da capacidade (${formatarHoras(capacidade)})`
  if (projecao != null) {
    return [`No ritmo de hoje, ${oPeriodo(periodo)} fecha com `, { forte: `≈ ${formatarHoras(projecao)}` }, capacidade ? `: ${daCapacidade(projecao)}` : '']
  }
  const inicio = [`${maiuscula(quando(periodo))}${emAndamento ? ', até agora' : ''}: `, { forte: formatarHoras(realizado) }]
  return capacidade ? [...inicio, ` · ${daCapacidade(realizado)}`] : inicio
}

// Colunas empilhadas (horas por consultor ou consultoria por semana; os nomes já resolvidos): a semana com mais horas
// (soma de todas as séries, "Outros" junto) e quem mais fez nela.
export function fraseDasHorasPorUnidade({ semanas, series }, periodo) {
  const totais = semanas.map((_, i) => series.reduce((soma, s) => soma + (s.horas[i] ?? 0), 0))
  const maior = totais.reduce((m, total, i) => (total > totais[m] ? i : m), 0)
  if (!(totais[maior] > 0)) return [`Nenhuma hora ${quando(periodo)}`]
  const quem = series.reduce((a, b) => ((b.horas[maior] ?? 0) > (a.horas[maior] ?? 0) ? b : a))
  return [`Semana mais cheia: ${diaMes(semanas[maior])}, com `, { forte: formatarHoras(totais[maior]) }, ` · ${quem.nome}, ${formatarHoras(quem.horas[maior])}`]
}

// Mapa de calor (checkins_por_dia_e_hora): o pico (dia e hora de início) e o dia com mais check-ins. A hora 7 conta o que
// começou antes e a 20, o que começou depois.
const DIAS_POR_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const preposicao = (d) => (d === 0 || d === 6 ? 'no' : 'na')
export const horaDoCalor = (hora) => `${hora}h${hora <= 7 ? ' ou antes' : hora >= 20 ? ' ou depois' : ''}`
export function fraseDoCalor({ celulas }) {
  const pico = celulas.reduce((a, c) => (c.checkins > (a?.checkins ?? 0) ? c : a), null)
  if (!pico) return ['Nenhum check-in nessas semanas']
  const porDia = celulas.reduce((soma, c) => ({ ...soma, [c.dia_semana]: (soma[c.dia_semana] ?? 0) + c.checkins }), {})
  const dia = Object.keys(porDia).map(Number).reduce((a, b) => (porDia[b] > porDia[a] ? b : a))
  return [`Mais check-ins ${preposicao(pico.dia_semana)} `, { forte: `${DIAS_POR_EXTENSO[pico.dia_semana]} às ${horaDoCalor(pico.hora)}` },
    ` (${INTEIRO.format(pico.checkins)}) · dia mais cheio: ${DIAS_POR_EXTENSO[dia]} (${INTEIRO.format(porDia[dia])})`]
}

// Rosca dos check-lists (tarefas_por_situacao, hoje). `a_fazer` é o resto dos contadores: negativo (contador velho)
// conta 0. Resolvida = feita ou não se aplica; o % nunca diz 100% com tarefa pendente nem 0% com alguma resolvida.
const PARTES_DAS_TAREFAS = ['feitas', 'nao_se_aplica', 'andamento', 'pausadas', 'a_fazer', 'atrasadas']
const totalDasTarefas = (t) => PARTES_DAS_TAREFAS.reduce((soma, k) => soma + Math.max(0, t[k] ?? 0), 0)
export function porcentoResolvido(t) {
  const fracao = (Math.max(0, t.feitas ?? 0) + Math.max(0, t.nao_se_aplica ?? 0)) / totalDasTarefas(t)
  const p = Math.round(fracao * 100)
  return `${fracao > 0 && fracao < 1 ? Math.min(99, Math.max(1, p)) : p}%`
}
export function fraseDasTarefas(t) {
  if (!totalDasTarefas(t)) return ['Nenhuma tarefa nos check-lists ativos']
  const atrasadas = Math.max(0, t.atrasadas ?? 0)
  return [{ forte: porcentoResolvido(t) }, ' resolvidas · ',
    ...(atrasadas ? [{ forte: INTEIRO.format(atrasadas) }, atrasadas === 1 ? ' atrasada' : ' atrasadas'] : ['nenhuma atrasada'])]
}

// Quadradinhos das cidades (clientes_por_cidade): "Chapecó/SC tem 32% dos clientes (22 de 68)". As cidades vêm da maior
// para a menor, com "Sem cidade" (cidade nula) no fim.
export const nomeDaCidade = (c) => (!c.cidade ? 'Sem cidade' : c.uf ? `${c.cidade}/${c.uf}` : c.cidade)
export function fraseDasCidades({ cidades, total }) {
  if (!total) return ['Nenhum cliente ainda']
  const maior = cidades.find((c) => c.cidade)
  if (!maior) return ['Nenhum cliente com cidade']
  return [{ forte: nomeDaCidade(maior) }, ` tem ${formatarOcupacao(maior.clientes / total)} dos clientes (${INTEIRO.format(maior.clientes)} de ${INTEIRO.format(total)})`]
}
