import { Folder, Video } from 'lucide-react'
import { horaDoChip, textoDoItem } from '@/lib/calendario'
import { cn } from '@/lib/utils'
import { ESTILO_DO_CHIP, estiloDoChip } from './cores'

// Nome acessível do chip do evento: título, hora e o que ele tem (Meet, pasta da reunião).
function nomeDoEvento(evento, hora) {
  return [evento.titulo, hora, (evento.meet_link || evento.com_meet) && 'com Meet', evento.pasta_id && 'com pasta da reunião']
    .filter(Boolean).join(', ')
}

const TAMANHOS = {
  mini: 'gap-1 rounded-md px-1.5 py-[3px] text-mini',
  rotulo: 'gap-1.5 rounded-lg px-2.5 py-1.5 text-rotulo',
}

// Chip do calendário, como no Hub: o evento com fundo na cor (do evento, ou do consultor na visão de mais de uma
// pessoa), texto branco (escuro nas cores claras), vídeo quando tem Meet e pasta quando a pasta da reunião já existe; ausência e feriado em
// tons suaves (não abrem nada: o detalhe do dia mostra). `comHora`: a hora de início ao lado do título. `compacto`:
// no celular vira só uma faixa de cor (o texto fica para o leitor de tela), para o mês caber em 360 px.
export default function ChipDoEvento({ item, dia, deVariasPessoas, comHora = false, compacto = false, tamanho = 'mini', aoAbrir, className }) {
  const texto = textoDoItem(item)
  const someNoCelular = compacto ? 'max-sm:sr-only' : ''
  const base = cn('flex w-full min-w-0 items-center text-left font-medium', TAMANHOS[tamanho], compacto && 'max-sm:h-1.5 max-sm:p-0', className)

  if (item.tipo !== 'evento') {
    return (
      <span title={item.tipo === 'ausencia' ? `${item.ausencia.pessoa?.nome}: ${item.ausencia.motivo}` : texto} className={cn(base, ESTILO_DO_CHIP[item.tipo])}>
        <span className={cn('truncate', someNoCelular)}>{texto}</span>
      </span>
    )
  }

  const { evento } = item
  const hora = comHora ? horaDoChip(evento, dia) : ''
  const icone = cn('size-3 shrink-0', compacto && 'max-sm:hidden')
  return (
    <button type="button" aria-label={nomeDoEvento(evento, hora)} title={evento.consultor?.nome ? `${evento.titulo} · ${evento.consultor.nome}` : evento.titulo}
      style={estiloDoChip(evento, deVariasPessoas)}
      onClick={(e) => { e.stopPropagation(); aoAbrir?.(evento) }} onDoubleClick={(e) => e.stopPropagation()}
      className={cn(base, 'botao-animado transition-[filter,translate,scale] hover:-translate-y-px hover:brightness-110 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 outline-none')}>
      {(evento.meet_link || evento.com_meet) && <Video className={icone} strokeWidth={2.2} aria-hidden="true" />}
      {evento.pasta_id && <Folder className={icone} strokeWidth={2.2} aria-hidden="true" />}
      <span className={cn('min-w-0 flex-1 truncate', someNoCelular)}>{evento.titulo}</span>
      {hora && <span className={cn('shrink-0 font-normal tabular-nums opacity-80', someNoCelular)}>{hora}</span>}
    </button>
  )
}
