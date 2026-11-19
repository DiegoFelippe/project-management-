import { useRef, useState } from 'react'
import { CalendarDays, Clock, TriangleAlert } from 'lucide-react'
import Flutuante from '@/components/campos/Flutuante'
import { formatarDia } from '@/lib/mes'
import { cn } from '@/lib/utils'
import { dataPorExtenso, prazoEmPalavras } from './situacao'

// As cores do prazo: vermelho se venceu, âmbar em 7 dias (hoje também), cinza na resolvida. Nunca só a cor: o ícone e o
// texto dizem o mesmo.
const BOTAO = {
  atrasada: 'border-destructive/30 bg-destructive/10 text-destructive',
  breve: 'border-notice/30 bg-notice-soft text-notice',
  fechado: 'border-transparent bg-muted text-muted-foreground',
  normal: 'bg-card text-foreground',
}
const TEXTO = { atrasada: 'text-destructive', breve: 'text-notice', fechado: 'text-muted-foreground', normal: 'text-muted-foreground' }
const ICONE = { atrasada: TriangleAlert, breve: Clock, fechado: CalendarDays, normal: CalendarDays }

const minuscula = (texto) => texto.charAt(0).toLowerCase() + texto.slice(1)

// O prazo como botão na linha da tarefa (acréscimo de 18/11 (2)): abre um balão (só para ler) com a data, quanto falta
// (ou há quanto venceu) e o dia do modelo. Não há "Mudar prazo": só o início dos prazos do check-list muda. Esc e o
// clique fora fecham (o foco volta ao botão).
export default function PrazoDaTarefa({ tarefa, situacao, inicio }) {
  const botao = useRef(null)
  const [aberto, setAberto] = useState(false)
  const info = prazoEmPalavras(tarefa, situacao)
  const Icone = ICONE[info.tom]
  return (
    <>
      <button ref={botao} type="button" aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}
        className={cn(
          'botao-animado inline-flex h-[30px] items-center gap-1.5 rounded-full border px-2.5 text-rotulo font-semibold whitespace-nowrap tabular-nums transition-[translate,scale,box-shadow] duration-150 outline-none hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97] sm:min-w-[7.5rem] pointer-coarse:min-h-11',
          BOTAO[info.tom],
        )}>
        <Icone className="size-3.5 shrink-0" aria-hidden="true" />
        {info.texto}
        <span className="sr-only">, {minuscula(info.situacao)}. Prazo de {tarefa.titulo}</span>
      </button>
      {aberto && (
        <Flutuante ancora={botao} aoFechar={() => setAberto(false)} largura={264} altura={124} rotulo={`Prazo de ${tarefa.titulo}`}
          tabIndex={-1} aoAbrir={(balao) => balao.focus()} className="grid gap-0.5 p-3 outline-none">
          <p className="section-label">Prazo</p>
          <p className="text-corpo font-semibold tabular-nums">{dataPorExtenso(tarefa.vence_em)}</p>
          <p className={cn('text-rotulo font-semibold', TEXTO[info.tom])}>{info.situacao}</p>
          <p className="text-muted-foreground text-legenda">Dia {tarefa.prazo_dias} a partir do início ({formatarDia(inicio)})</p>
        </Flutuante>
      )}
    </>
  )
}
