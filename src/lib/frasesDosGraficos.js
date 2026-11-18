// Frases de leitura dos gráficos (o "insight" embaixo do título; design 2026-11-17-graficos-do-inicio-e-do-cliente,
// "Números e frases"). Cada uma recebe o JSON que o banco mandou e devolve as `partes` de <Leitura>: texto corrido e
// { forte } para o número que importa. Só usam números prontos do banco ou a lista inteira que o gráfico mostra (nunca
// uma amostra): contagens, participações e projeções vêm do banco.
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
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

// Check-ins por semana do Início: "Média de 38 por semana no período · pico na semana de 06/10".
export function fraseDasSemanas(dados, periodo) {
  if (!dados.pico?.checkins) return [`Nenhum check-in ${quando(periodo)}`]
  const media = dados.media >= 10 ? INTEIRO.format(dados.media) : NUMERO.format(dados.media)
  return ['Média de ', { forte: media }, ` por semana ${quando(periodo)} · pico na semana de ${diaMes(dados.pico.semana)}`]
}

// Burn-up do cliente (horas_do_cliente_por_dia). Mês atual: a projeção do banco (nula até o dia 6: só o feito);
// mês passado: com quanto fechou, contra a previsão de hoje.
export function fraseDoMesDoCliente(dados, atual = dados.mes === mesAtual()) {
  const daPrevisao = (horas, sufixo) => (dados.previsao ? ` (${formatarOcupacao(horas / dados.previsao)} ${sufixo})` : '')
  if (atual && dados.projecao == null) return [{ forte: formatarHoras(dados.realizado) }, ' até agora']
  if (atual) return ['No ritmo atual, fecha o mês com ', { forte: `≈ ${formatarHoras(dados.projecao)}` }, daPrevisao(dados.projecao, 'da previsão')]
  return ['Fechou o mês com ', { forte: formatarHoras(dados.realizado) }, daPrevisao(dados.realizado, 'da previsão atual')]
}

// Horas por consultor no mês (a lista inteira do mês, mais horas primeiro; nome nulo = consultor que a pessoa não vê).
export function fraseDosConsultores(lista) {
  if (!lista.length) return ['Sem horas neste mês']
  const [primeiro] = lista
  if (lista.length === 1) return ['Só ', { forte: primeiro.nome ?? 'outro consultor' }, ' neste mês']
  const total = lista.reduce((soma, c) => soma + c.horas, 0)
  return [{ forte: primeiro.nome ?? 'Outro consultor' }, ` fez ${formatarOcupacao(total ? primeiro.horas / total : 0)} das horas`]
}

// Últimos 6 meses do cliente: média e meses acima da previsão atual, só dos meses fechados (o mês em andamento fica de
// fora), a partir dos 6 pontos do gráfico.
export function fraseDosSeisMeses(meses, previsao, atual = mesAtual()) {
  if (meses.every((m) => !m.realizado)) return ['Sem horas nos últimos 6 meses']
  const fechados = meses.filter((m) => m.mes < atual)
  const media = fechados.length ? fechados.reduce((soma, m) => soma + m.realizado, 0) / fechados.length : 0
  const partes = ['Média de ', { forte: formatarHoras(media) }, '/mês']
  if (!previsao) return partes
  const acima = fechados.filter((m) => m.realizado > previsao).length
  return [...partes, ` · ${acima ? `${plural(acima, 'mês', 'meses')} acima da previsão` : 'nenhum mês acima da previsão'}`]
}

// Check-ins por semana do cliente no mês: "9 check-ins no mês · 2,1 h em média".
export function fraseDasSemanasDoCliente(semanas) {
  const quantidade = semanas.reduce((soma, s) => soma + s.quantidade, 0)
  if (!quantidade) return ['Sem check-ins neste mês']
  const horas = semanas.reduce((soma, s) => soma + s.horas, 0)
  return [{ forte: plural(quantidade, 'check-in', 'check-ins') }, ` no mês · ${formatarHoras(horas / quantidade)} em média`]
}

// Etapas do check-list (situação de hoje): a etapa com mais tarefas atrasadas.
export function fraseDasEtapas(etapas) {
  const pior = etapas.reduce((a, b) => (b.atrasadas > (a?.atrasadas ?? 0) ? b : a), null)
  if (!pior) return ['Nenhuma tarefa atrasada · situação de hoje']
  return [{ forte: pior.nome }, ` tem ${plural(pior.atrasadas, 'tarefa atrasada', 'tarefas atrasadas')} · situação de hoje`]
}
