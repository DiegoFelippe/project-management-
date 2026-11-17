// Situação de uma tarefa do check-list do cliente (a mesma conta na lista, no fluxograma e na janela da tarefa; os números
// do resumo vêm do banco com a mesma regra): Feita · Em andamento · A fazer · Bloqueada (alguma de que depende não está
// feita) · Atrasada (não feita e o dia já passou) · Vence hoje. `hoje` é o dia em São Paulo ('aaaa-mm-dd'), vindo de quem
// chama; a conta dos dias é em UTC, então o fuso do computador não muda nada.

const DIA_MS = 86_400_000
const emUtc = (dia) => {
  const [ano, mes, numero] = dia.split('-').map(Number)
  return Date.UTC(ano, mes - 1, numero)
}

// `porId`: as tarefas do check-list por id (objeto ou Map). Dependência que não está lá é ignorada.
// → { cor, bloqueada, atrasada, venceHoje, faltam (dias até vence_em; negativo = atrasada; nulo sem data), espera }
export function situacaoDaTarefa(tarefa, porId, hoje) {
  const feita = tarefa.estado === 'feita'
  const pegar = porId instanceof Map ? (id) => porId.get(id) : (id) => porId?.[id]
  const espera = feita ? [] : (tarefa.depende_de ?? []).map(pegar).filter((d) => d && d.estado !== 'feita')
  const faltam = tarefa.vence_em && hoje ? Math.round((emUtc(tarefa.vence_em) - emUtc(hoje)) / DIA_MS) : null
  const bloqueada = espera.length > 0
  const atrasada = !feita && faltam !== null && faltam < 0
  const venceHoje = !feita && faltam === 0
  const cor = feita ? 'feita'
    : atrasada ? 'atrasada'
      : venceHoje ? 'hoje'
        : tarefa.estado === 'andamento' ? 'andamento'
          : bloqueada ? 'bloqueada'
            : 'livre'
  return { cor, bloqueada, atrasada, venceHoje, faltam, espera }
}

// A situação em palavras (nome do nó no fluxograma: "título: situação"), com o aviso do prazo junto.
export function rotuloDaSituacao(tarefa, situacao) {
  const estado = situacao.cor === 'feita' ? 'Feita'
    : situacao.bloqueada ? 'Bloqueada'
      : tarefa.estado === 'andamento' ? 'Em andamento'
        : 'A fazer'
  return `${estado}${situacao.atrasada ? ', atrasada' : situacao.venceHoje ? ', vence hoje' : ''}`
}
