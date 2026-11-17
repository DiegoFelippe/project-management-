// Calendário (menu Calendário): dias, períodos das visões e instantes, sempre no fuso de São Paulo, onde a equipe
// está. Dia = texto 'AAAA-MM-DD'; a conta dos dias é feita em UTC, então o fuso do computador não muda nada.
import { FUSO, deslocamentoEmSP, rotuloDoMes } from './mes'
import { primeiroNome } from './nomes'

const DIA_MS = 86_400_000
const HORA_MS = 3_600_000
export const DIAS_DA_AGENDA = 60
const MAXIMO_DE_DIAS = 31

const pad = (n) => String(n).padStart(2, '0')
const paraUtc = (dia) => {
  const [ano, mes, numero] = dia.split('-').map(Number)
  return Date.UTC(ano, mes - 1, numero)
}
const deUtc = (ms) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export const somarDias = (dia, n) => deUtc(paraUtc(dia) + n * DIA_MS)
// 0 = domingo … 6 = sábado.
export const diaDaSemana = (dia) => new Date(paraUtc(dia)).getUTCDay()
const inicioDaSemana = (dia) => somarDias(dia, -diaDaSemana(dia))

// Primeiro dia do mês `n` meses antes (negativo) ou depois do mês de `dia`.
function primeiroDoMes(dia, n = 0) {
  const [ano, mes] = dia.split('-').map(Number)
  return deUtc(Date.UTC(ano, mes - 1 + n, 1))
}

// Dias de [de, ate), em ordem.
export function diasEntre(de, ate) {
  const dias = []
  for (let dia = de; dia < ate; dia = somarDias(dia, 1)) dias.push(dia)
  return dias
}

// Grade do mês de `dia`, como no Hub: semanas inteiras de domingo a sábado. { dias, de, ate } (ate exclusivo).
export function gradeDoMes(dia) {
  const de = inicioDaSemana(primeiroDoMes(dia))
  const ate = somarDias(inicioDaSemana(somarDias(primeiroDoMes(dia, 1), -1)), 7)
  return { dias: diasEntre(de, ate), de, ate }
}

// Os 7 dias, de domingo a sábado, da semana de `dia`.
export const semanaDe = (dia) => diasEntre(inicioDaSemana(dia), somarDias(inicioDaSemana(dia), 7))

// O que cada visão mostra (e o que a tela lê do banco): { dias, de, ate }. Mês: a grade; semana: domingo a sábado;
// agenda: os próximos 60 dias a partir de hoje.
export function periodoDaVisao(visao, dia, hoje) {
  if (visao === 'semana') {
    const dias = semanaDe(dia)
    return { dias, de: dias[0], ate: somarDias(dias[0], 7) }
  }
  if (visao === 'agenda') {
    const ate = somarDias(hoje, DIAS_DA_AGENDA)
    return { dias: diasEntre(hoje, ate), de: hoje, ate }
  }
  return gradeDoMes(dia)
}

// O dia de referência do período anterior (passo -1) ou do seguinte (+1): no mês, o primeiro dia do mês.
export function navegar(visao, dia, passo) {
  if (visao === 'semana') return somarDias(dia, 7 * passo)
  if (visao === 'mes') return primeiroDoMes(dia, passo)
  return dia
}

const NOME_DO_MES = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long' })
const nomeDoMes = (dia) => NOME_DO_MES.format(new Date(paraUtc(dia)))
const numeroDoDia = (dia) => Number(dia.slice(8, 10))

export const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const POR_EXTENSO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

// "20 de novembro de 2026", "20 de novembro", "sexta-feira" e "Sex, 20 de nov.".
export const nomeDoDia = (dia) => `${numeroDoDia(dia)} de ${nomeDoMes(dia)} de ${dia.slice(0, 4)}`
export const diaEMes = (dia) => `${numeroDoDia(dia)} de ${nomeDoMes(dia)}`
export const diaDaSemanaPorExtenso = (dia) => POR_EXTENSO[diaDaSemana(dia)]
export const diaCurtoComSemana = (dia) => `${DIAS_DA_SEMANA[diaDaSemana(dia)]}, ${numeroDoDia(dia)} de ${nomeDoMes(dia).slice(0, 3)}.`

// "Novembro de 2026", "15 a 21 de novembro de 2026", "29 de novembro a 5 de dezembro de 2026", "Próximos 60 dias".
export function rotuloDoPeriodo(visao, dia) {
  if (visao === 'agenda') return `Próximos ${DIAS_DA_AGENDA} dias`
  if (visao === 'mes') return rotuloDoMes(primeiroDoMes(dia))
  const [primeiro, , , , , , ultimo] = semanaDe(dia)
  const anoDe = primeiro.slice(0, 4)
  const anoAte = ultimo.slice(0, 4)
  const fim = `${numeroDoDia(ultimo)} de ${nomeDoMes(ultimo)} de ${anoAte}`
  if (anoDe !== anoAte) return `${numeroDoDia(primeiro)} de ${nomeDoMes(primeiro)} de ${anoDe} a ${fim}`
  if (primeiro.slice(5, 7) !== ultimo.slice(5, 7)) return `${numeroDoDia(primeiro)} de ${nomeDoMes(primeiro)} a ${fim}`
  return `${numeroDoDia(primeiro)} a ${fim}`
}

// ── Instantes ──

const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

function partesEmSP(instante) {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(instante)).map((x) => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}

export const diaEmSP = (instante) => partesEmSP(instante).dia
export const horaEmSP = (instante) => partesEmSP(instante).hora

// "AAAA-MM-DDTHH:mm:00-03:00": `dia` e `hora` ('HH:mm') no relógio de São Paulo, com o deslocamento daquele instante
// (acompanha o horário de verão, como o de 2018/2019).
export function instanteEmSP(dia, hora = '00:00') {
  const local = Date.parse(`${dia}T${hora}:00Z`)
  let deslocamento = deslocamentoEmSP(new Date(local))
  deslocamento = deslocamentoEmSP(new Date(local - deslocamento * 60_000))
  const absoluto = Math.abs(deslocamento)
  const sinal = deslocamento < 0 ? '-' : '+'
  return `${dia}T${hora}:00${sinal}${pad(Math.floor(absoluto / 60))}:${pad(absoluto % 60)}`
}

// O intervalo [de, ate) de dias em instantes de São Paulo, para a leitura do banco.
export const limitesEmSP = (de, ate) => ({ de: instanteEmSP(de), ate: instanteEmSP(ate) })

// ── Eventos, ausências e feriados por dia ──

const ultimoDiaDo = (evento) => diaEmSP(Date.parse(evento.fim) - 1)

// Dias (de São Paulo) que o evento ocupa: do dia do início ao do último instante (o fim é exclusivo; o de dia inteiro
// vai da meia-noite do primeiro dia à do dia seguinte ao último).
export function diasDoEvento(evento) {
  const primeiro = diaEmSP(evento.inicio)
  const ultimo = ultimoDiaDo(evento)
  return ultimo > primeiro ? diasEntre(primeiro, somarDias(ultimo, 1)) : [primeiro]
}

const diaCurto = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

// O horário do evento naquele dia: "14:00 – 15:30", "Dia inteiro", e, no evento de mais de um dia,
// "22:00 – 19/11 02:00" (primeiro dia), "O dia todo" (dias do meio) e "Até 02:00" (último dia).
export function horarioNoDia(evento, dia) {
  if (evento.dia_inteiro) return 'Dia inteiro'
  const primeiro = diaEmSP(evento.inicio)
  const ultimo = ultimoDiaDo(evento)
  const inicio = horaEmSP(evento.inicio)
  const fim = horaEmSP(evento.fim)
  if (ultimo <= primeiro) return `${inicio} – ${fim}`
  if (dia <= primeiro) return `${inicio} – ${diaCurto(diaEmSP(evento.fim))} ${fim}`
  if (dia >= ultimo) return `Até ${fim}`
  return 'O dia todo'
}

// Hora do chip: a do início no primeiro dia; vazio no dia inteiro e nos dias seguintes.
export const horaDoChip = (evento, dia) => (evento.dia_inteiro || diaEmSP(evento.inicio) !== dia ? '' : horaEmSP(evento.inicio))

const FERIADOS_FIXOS = {
  '01-01': 'Confraternização Universal', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '09-07': 'Independência',
  '10-12': 'Nossa Senhora Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra',
  '12-25': 'Natal',
}

// Os feriados do banco são os nacionais: os de data fixa e a Sexta-feira Santa (a única que muda de data).
export const nomeDoFeriado = (dia) => FERIADOS_FIXOS[dia.slice(5)] ?? 'Sexta-feira Santa'

// Texto do item no calendário: o título do evento, "Ana · Ausente" na ausência e o nome do feriado.
export function textoDoItem(item) {
  if (item.tipo === 'feriado') return item.nome
  if (item.tipo === 'ausencia') return `${primeiroNome(item.ausencia.pessoa?.nome ?? '') || 'Alguém'} · Ausente`
  return item.evento.titulo
}

const ORDEM = { feriado: 0, ausencia: 1, evento: 2 }

// Itens de cada dia de `dias` (Map 'AAAA-MM-DD' → itens; só os dias com algo): { tipo, id, evento | ausencia | dia }.
// Em cada dia: feriado, ausências, eventos de dia inteiro e depois os com horário, pela hora de início.
export function agruparPorDia({ dias, eventos = [], ausencias = [], feriados = [] }) {
  const dentro = new Set(dias)
  const porDia = new Map()
  if (!dias.length) return porDia
  const guardar = (dia, item) => {
    if (!dentro.has(dia)) return
    if (!porDia.has(dia)) porDia.set(dia, [])
    porDia.get(dia).push(item)
  }
  for (const dia of feriados) guardar(dia, { tipo: 'feriado', id: dia, dia, nome: nomeDoFeriado(dia) })
  for (const a of ausencias) {
    for (const dia of diasEntre(a.de > dias[0] ? a.de : dias[0], somarDias(a.ate, 1))) guardar(dia, { tipo: 'ausencia', id: a.id, ausencia: a })
  }
  for (const e of eventos) for (const dia of diasDoEvento(e)) guardar(dia, { tipo: 'evento', id: e.id, evento: e })
  // Tipo, depois dia inteiro antes dos com horário, depois a hora de início.
  const chave = (item) => {
    const comHorario = item.evento && !item.evento.dia_inteiro
    return [ORDEM[item.tipo], comHorario ? 1 : 0, comHorario ? Date.parse(item.evento.inicio) : 0]
  }
  const comparar = (a, b) => {
    const [x, y] = [chave(a), chave(b)]
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
  }
  for (const lista of porDia.values()) lista.sort(comparar)
  return porDia
}

// ── Janela do evento ──

// Data e horários da janela → { inicio, fim, dia_inteiro } (instantes de São Paulo) ou { erro }. Sem horário de
// início, o evento é de dia inteiro (até o dia em que termina, inclusive); só com o início, dura uma hora. As
// regras do banco (fim depois do início, até 31 dias) são conferidas antes de enviar.
export function montarHorario({ data, horaInicio = '', horaFim = '', dataFim = '' }) {
  if (!data) return { erro: 'Escolha a data do evento.' }
  const ultimo = dataFim || data
  if (ultimo < data) return { erro: 'O dia em que termina não pode ser antes do início.' }
  let horario
  if (!horaInicio) {
    if (horaFim) return { erro: 'Escolha também o horário de início (sem horário, o evento é de dia inteiro).' }
    horario = { inicio: instanteEmSP(data), fim: instanteEmSP(somarDias(ultimo, 1)), dia_inteiro: true }
  } else {
    const inicio = instanteEmSP(data, horaInicio)
    const fim = horaFim ? instanteEmSP(ultimo, horaFim) : instanteEmSP(...partesUmaHoraDepois(inicio))
    horario = { inicio, fim, dia_inteiro: false }
  }
  const duracao = Date.parse(horario.fim) - Date.parse(horario.inicio)
  if (duracao <= 0) return { erro: 'O fim precisa ser depois do início.' }
  if (duracao > MAXIMO_DE_DIAS * DIA_MS) return { erro: `Um evento dura no máximo ${MAXIMO_DE_DIAS} dias.` }
  return horario
}

function partesUmaHoraDepois(instante) {
  const { dia, hora } = partesEmSP(Date.parse(instante) + HORA_MS)
  return [dia, hora]
}

// Quem edita e apaga o evento (a mesma regra de cuidaDoEvento na Edge Function agenda): a central e o dono em todos;
// a gestão nos da consultoria; o consultor nos da própria agenda. Quem manda é a função; aqui é só para a tela.
export function cuidaDoEvento(perfil, evento) {
  if (perfil?.papel === 'dono' || perfil?.papel === 'central') return true
  if (!evento || evento.consultoria_id !== perfil?.consultoria_id) return false
  return perfil.papel === 'admin' || perfil.papel === 'gestor' || evento.consultor_id === perfil.id
}
