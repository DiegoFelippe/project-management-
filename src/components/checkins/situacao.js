// Situação de uma tarefa do check-list do cliente (a mesma conta na lista, no fluxograma e na janela da tarefa; os números
// do resumo vêm do banco com a mesma regra): Feita · Não se aplica · Em andamento · Pausada · A fazer · Bloqueada (espera
// alguma pendente) · Atrasada (pendente e o dia já passou) · Vence hoje. Resolvida = feita ou não se aplica; pendente = a
// fazer, em andamento ou pausada. Pela cadeia (pedido do Diego, 18/11: a bloqueada pode ser "não se aplica"; as que dependem dela esperam
// as dependências dela): a dependência feita libera; a que não se aplica só libera quando as dependências dela também
// estão resolvidas, e a tarefa espera as pendentes que ficam atrás dela. `hoje` é o dia em São Paulo ('aaaa-mm-dd'),
// vindo de quem chama; a conta dos dias é em UTC, então o fuso do computador não muda nada.
import { diaDaSemanaPorExtenso, diaEmSP } from '@/lib/calendario'
import { formatarDia } from '@/lib/mes'
import { juntar, plural } from '@/lib/nomes'

const DIA_MS = 86_400_000
const emUtc = (dia) => {
  const [ano, mes, numero] = dia.split('-').map(Number)
  return Date.UTC(ano, mes - 1, numero)
}

// Feita ou não se aplica: a tarefa está fechada.
export const estaResolvida = (tarefa) => tarefa.estado === 'feita' || tarefa.estado === 'nao_se_aplica'

const numero = (n) => n.toLocaleString('pt-BR')

// "1 não se aplica" ou "2 não se aplicam" (a mesma concordância em todo lugar).
export const naoSeAplicaEmPalavras = (n) => `${numero(n)} ${n === 1 ? 'não se aplica' : 'não se aplicam'}`

// O progresso em palavras (caixa do modelo, Tirar e Trocar modelo): "3 de 5 feitas" ou, com alguma que não se aplica,
// "4 de 5 resolvidas: 3 feitas, 1 não se aplica" (resolvida = feita ou não se aplica; as duas contam no %).
export function progressoEmPalavras({ tarefas, feitas, nao_se_aplica: naoSeAplica = 0 }) {
  if (!naoSeAplica) return `${numero(feitas)} de ${numero(tarefas)} feitas`
  const partes = `${plural(feitas, 'feita', 'feitas')}, ${naoSeAplicaEmPalavras(naoSeAplica)}`
  return `${numero(feitas + naoSeAplica)} de ${numero(tarefas)} resolvidas: ${partes}`
}

// A conta de uma etapa (cabeçalho na lista e no fluxograma): "1 de 3 feitas" ou, com alguma que não se aplica, "2 de 3
// resolvidas".
export function contagemDaEtapa(tarefasDaEtapa) {
  const resolvidas = tarefasDaEtapa.filter(estaResolvida).length
  const palavra = tarefasDaEtapa.some((t) => t.estado === 'nao_se_aplica') ? 'resolvidas' : 'feitas'
  return `${numero(resolvidas)} de ${numero(tarefasDaEtapa.length)} ${palavra}`
}

// As pendentes que a tarefa espera, pela cadeia: as dependências pendentes e, atrás das que não se aplicam, as pendentes
// delas (cada uma uma vez, na ordem em que aparecem). A feita interrompe a cadeia.
function pendentesPelaCadeia(tarefa, pegar) {
  const vistas = new Set()
  const espera = []
  const fila = [...(tarefa.depende_de ?? [])]
  while (fila.length) {
    const id = fila.shift()
    if (vistas.has(id)) continue
    vistas.add(id)
    const d = pegar(id)
    if (!d || d.estado === 'feita') continue
    if (d.estado === 'nao_se_aplica') fila.push(...(d.depende_de ?? []))
    else espera.push(d)
  }
  return espera
}

// Se a tarefa entra no filtro "Mostrar" da barra: todas; pendentes (a fazer, em andamento ou pausada); feitas; não se aplica.
export function entraNoFiltro(tarefa, filtro) {
  if (filtro === 'pendentes') return !estaResolvida(tarefa)
  if (filtro === 'feitas') return tarefa.estado === 'feita'
  if (filtro === 'nao_se_aplica') return tarefa.estado === 'nao_se_aplica'
  return true
}

// `porId`: as tarefas do check-list por id (objeto ou Map). Dependência que não está lá é ignorada.
// → { cor, bloqueada, atrasada, venceHoje, faltam (dias até vence_em; negativo = atrasada; nulo sem data), espera }
export function situacaoDaTarefa(tarefa, porId, hoje) {
  const resolvida = estaResolvida(tarefa)
  const pegar = porId instanceof Map ? (id) => porId.get(id) : (id) => porId?.[id]
  const espera = resolvida ? [] : pendentesPelaCadeia(tarefa, pegar)
  const faltam = tarefa.vence_em && hoje ? Math.round((emUtc(tarefa.vence_em) - emUtc(hoje)) / DIA_MS) : null
  const bloqueada = espera.length > 0
  const atrasada = !resolvida && faltam !== null && faltam < 0
  const venceHoje = !resolvida && faltam === 0
  const cor = tarefa.estado === 'feita' ? 'feita'
    : tarefa.estado === 'nao_se_aplica' ? 'nao_se_aplica'
      : atrasada ? 'atrasada'
        : venceHoje ? 'hoje'
          : tarefa.estado === 'andamento' ? 'andamento'
            : tarefa.estado === 'pausada' ? 'pausada'
              : bloqueada ? 'bloqueada'
                : 'livre'
  return { cor, bloqueada, atrasada, venceHoje, faltam, espera }
}

// Duas situações iguais em tudo o que a tela mostra (a mesma cor, os mesmos avisos, os mesmos dias e as mesmas tarefas
// esperadas): a lista não precisa redesenhar a tarefa.
export function mesmaSituacao(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const esperadas = (s) => s.espera.map((d) => `${d.id}:${d.titulo}`).join('|')
  return a.cor === b.cor && a.bloqueada === b.bloqueada && a.atrasada === b.atrasada && a.venceHoje === b.venceHoje
    && a.faltam === b.faltam && esperadas(a) === esperadas(b)
}

// A situação em palavras (nome do nó no fluxograma: "título: situação"), com o aviso do prazo junto. Combina com a cor:
// em andamento (ou pausada) e bloqueada (uma dependência foi reaberta depois de ela começar) é "Em andamento · espera N
// tarefas".
const COMECADA = { andamento: 'Em andamento', pausada: 'Pausada' }
export function rotuloDaSituacao(tarefa, situacao) {
  if (situacao.cor === 'nao_se_aplica') return 'Não se aplica'
  const comecada = COMECADA[tarefa.estado]
  const estado = situacao.cor === 'feita' ? 'Feita'
    : comecada
      ? (situacao.bloqueada ? `${comecada} · espera ${plural(situacao.espera.length, 'tarefa', 'tarefas')}` : comecada)
      : situacao.bloqueada ? 'Bloqueada'
        : 'A fazer'
  return `${estado}${situacao.atrasada ? ', atrasada' : situacao.venceHoje ? ', vence hoje' : ''}`
}

// "20/11" (dia e mês de 'aaaa-mm-dd').
export const diaCurto = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

// Quem fechou e quando (feita ou não se aplica): "por Ana em 12/11/2026" (o dia em São Paulo; sem o nome quando o banco o
// esconde: "feita em …" ou "marcada em …").
export function feitaPorEm(tarefa) {
  const dia = tarefa.feita_em ? ` em ${formatarDia(diaEmSP(tarefa.feita_em))}` : ''
  const semNome = tarefa.estado === 'nao_se_aplica' ? 'marcada' : 'feita'
  return `${tarefa.feita_por?.nome ? `por ${tarefa.feita_por.nome}` : semNome}${dia}`
}

// Quando a tarefa vence, em palavras: "vence 20/11", "vence hoje" ou "venceu 12/11".
export function quandoVence(dia, hoje) {
  if (dia === hoje) return 'vence hoje'
  return `${dia < hoje ? 'venceu' : 'vence'} ${diaCurto(dia)}`
}

// A linha de baixo da caixa no fluxograma: a situação curta com a data, que combina com a cor (a mesma ordem da cor).
export function resumoDaSituacao(tarefa, situacao) {
  const vence = tarefa.vence_em ? diaCurto(tarefa.vence_em) : null
  if (tarefa.estado === 'feita') return tarefa.feita_em ? `Feita em ${diaCurto(diaEmSP(tarefa.feita_em))}` : 'Feita'
  if (tarefa.estado === 'nao_se_aplica') return 'Não se aplica'
  if (situacao.atrasada) return `Atrasada desde ${vence}`
  if (situacao.venceHoje) return 'Vence hoje'
  const comecada = COMECADA[tarefa.estado]
  if (comecada) {
    if (situacao.bloqueada) return `${comecada} · espera ${situacao.espera.length}`
    return vence ? `${comecada} · ${vence}` : comecada
  }
  const estado = situacao.bloqueada ? 'Bloqueada' : tarefa.obrigatoria === false ? 'Opcional' : 'A fazer'
  return vence ? `${estado} · vence ${vence}` : estado
}

// "Espera: Tarefa A e Tarefa B" (as pendentes de verdade, pela cadeia; a linha e o Editar).
export const textoDaEspera = (situacao) => `Espera: ${juntar(situacao.espera.map((d) => d.titulo))}`

// "sexta-feira, 20/11/2026".
export const dataPorExtenso = (dia) => `${diaDaSemanaPorExtenso(dia)}, ${formatarDia(dia)}`

// O prazo em palavras (o botão da linha, o balão e o Editar), com o tom: vermelho se venceu ('atrasada'), âmbar em 7
// dias, hoje também ('breve'), cinza na resolvida ('fechado'). `situacao` é a de situacaoDaTarefa (os dias que faltam).
// → { tom, texto ("Venceu 15/11", "Vence hoje", "Vence 20/11", "Prazo 12/11"), situacao ("Atrasada há 2 dias"…) }
export function prazoEmPalavras(tarefa, situacao) {
  const dia = diaCurto(tarefa.vence_em)
  if (estaResolvida(tarefa)) return { tom: 'fechado', texto: `Prazo ${dia}`, situacao: tarefa.estado === 'feita' ? 'Feita' : 'Não se aplica' }
  const faltam = situacao.faltam
  if (faltam < 0) return { tom: 'atrasada', texto: `Venceu ${dia}`, situacao: `Atrasada há ${plural(-faltam, 'dia', 'dias')}` }
  if (faltam === 0) return { tom: 'breve', texto: 'Vence hoje', situacao: 'Vence hoje' }
  return { tom: faltam <= 7 ? 'breve' : 'normal', texto: `Vence ${dia}`, situacao: `Faltam ${plural(faltam, 'dia', 'dias')}` }
}
