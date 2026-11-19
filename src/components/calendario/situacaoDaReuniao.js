import { CaptionsOff, CircleAlert, FolderCheck, Hourglass, VideoOff } from 'lucide-react'

// Situação da reunião depois que ela acaba (rotina reunioes-depois), com o rótulo, o ícone e o tom que o detalhe do
// evento e a tabela "Eventos do cliente" mostram. "agendada" que já terminou também está esperando.
export const SITUACOES = {
  aguardando: { rotulo: 'Aguardando a transcrição', icone: Hourglass, tom: 'bg-notice-soft text-notice', acao: 'Buscar agora' },
  pasta_criada: { rotulo: 'Pasta criada', icone: FolderCheck, tom: 'bg-positive-soft text-positive' },
  sem_artefatos: { rotulo: 'Sem gravação/transcrição', icone: VideoOff, tom: 'bg-muted text-muted-foreground', acao: 'Tentar de novo' },
  erro: { rotulo: 'Erro', icone: CircleAlert, tom: 'bg-destructive/10 text-destructive', acao: 'Tentar de novo' },
}

// { estado, info } da reunião (evento: com_meet, cliente_id, fim, reuniao, gravacao_url) no instante `agora` (ms).
// Reunião sem cliente ou sem Meet não tem situação: a rotina não a processa (não há onde criar a pasta). Gravou, mas a
// transcrição não veio: "Sem transcrição" (a gravação está aí).
export function situacaoDaReuniao(evento, agora) {
  const terminou = Date.parse(evento.fim) <= agora
  const comRotina = Boolean(evento.com_meet && evento.cliente_id)
  const estado = evento.reuniao === 'agendada' ? (terminou ? 'aguardando' : null) : evento.reuniao
  const info = comRotina && estado
    ? (estado === 'sem_artefatos' && evento.gravacao_url
      ? { ...SITUACOES.sem_artefatos, rotulo: 'Sem transcrição', icone: CaptionsOff }
      : SITUACOES[estado] ?? null)
    : null
  return { estado, info }
}
