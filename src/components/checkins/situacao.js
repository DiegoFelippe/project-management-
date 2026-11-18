// Situação de uma tarefa do check-list do cliente (a mesma conta na lista, no fluxograma e na janela da tarefa; os números
// do resumo vêm do banco com a mesma regra): Feita · Não se aplica · Em andamento · A fazer · Bloqueada (alguma de que
// depende não está resolvida) · Atrasada (pendente e o dia já passou) · Vence hoje. Resolvida = feita ou não se aplica
// (as duas liberam as que dependem dela); pendente = a fazer ou em andamento. `hoje` é o dia em São Paulo ('aaaa-mm-dd'),
// vindo de quem chama; a conta dos dias é em UTC, então o fuso do computador não muda nada.
import { diaEmSP } from '@/lib/calendario'
import { formatarDia } from '@/lib/mes'
import { plural } from '@/lib/nomes'

const DIA_MS = 86_400_000
const emUtc = (dia) => {
  const [ano, mes, numero] = dia.split('-').map(Number)
  return Date.UTC(ano, mes - 1, numero)
}

// Feita ou não se aplica: a tarefa está fechada.
export const estaResolvida = (tarefa) => tarefa.estado === 'feita' || tarefa.estado === 'nao_se_aplica'

// Se a tarefa entra no filtro "Mostrar" da barra: todas; pendentes (a fazer ou em andamento); feitas; não se aplica.
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
  const espera = resolvida ? [] : (tarefa.depende_de ?? []).map(pegar).filter((d) => d && !estaResolvida(d))
  const faltam = tarefa.vence_em && hoje ? Math.round((emUtc(tarefa.vence_em) - emUtc(hoje)) / DIA_MS) : null
  const bloqueada = espera.length > 0
  const atrasada = !resolvida && faltam !== null && faltam < 0
  const venceHoje = !resolvida && faltam === 0
  const cor = tarefa.estado === 'feita' ? 'feita'
    : tarefa.estado === 'nao_se_aplica' ? 'nao_se_aplica'
      : atrasada ? 'atrasada'
        : venceHoje ? 'hoje'
          : tarefa.estado === 'andamento' ? 'andamento'
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
// em andamento e bloqueada (uma dependência foi reaberta depois de ela começar) é "Em andamento · espera N tarefas".
export function rotuloDaSituacao(tarefa, situacao) {
  if (situacao.cor === 'nao_se_aplica') return 'Não se aplica'
  const estado = situacao.cor === 'feita' ? 'Feita'
    : tarefa.estado === 'andamento'
      ? (situacao.bloqueada ? `Em andamento · espera ${plural(situacao.espera.length, 'tarefa', 'tarefas')}` : 'Em andamento')
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
  if (tarefa.estado === 'andamento') {
    if (situacao.bloqueada) return `Em andamento · espera ${situacao.espera.length}`
    return vence ? `Em andamento · ${vence}` : 'Em andamento'
  }
  const estado = situacao.bloqueada ? 'Bloqueada' : tarefa.obrigatoria === false ? 'Opcional' : 'A fazer'
  return vence ? `${estado} · vence ${vence}` : estado
}
