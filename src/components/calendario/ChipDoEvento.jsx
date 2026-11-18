import { Folder, Video } from 'lucide-react'
import { horaDoChip, textoDoItem } from '@/lib/calendario'
import { cn } from '@/lib/utils'
import { classeDoChip, corDoChip, faixaDoChip } from './cores'

// Nome acessível do chip do evento: título, hora e o que ele tem (Meet, pasta da reunião).
function nomeDoEvento(evento, hora) {
  return [evento.titulo, hora, (evento.meet_link || evento.com_meet) && 'com Meet', evento.pasta_id && 'com pasta da reunião']
    .filter(Boolean).join(', ')
}

// min-h-6: 24 px, o alvo mínimo do WCAG 2.2 no computador (o axe pedia; auditoria de 17/11).
const TAMANHOS = {
  mini: 'min-h-6 gap-1 rounded-md px-1.5 py-[3px] text-mini',
  rotulo: 'min-h-7 gap-1.5 rounded-lg px-2.5 py-1.5 text-rotulo',
}

const ANIMADO = 'transition-[filter,translate,scale] hover:-translate-y-px hover:brightness-[0.97] dark:hover:brightness-125 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 outline-none'

// Bolinha da cor escolhida (a do evento, ou a do consultor na visão de mais de uma pessoa) no começo do chip, com um
// contorno na cor do cartão para se separar do fundo do tipo.
export function BolinhaDaCor({ cor, className }) {
  return (
    <span data-bolinha="" aria-hidden="true" style={{ backgroundColor: cor }}
      className={cn('size-2 shrink-0 rounded-full ring-[1.5px] ring-card', className)} />
  )
}

// O que vai dentro do chip: a bolinha, vídeo quando tem Meet, pasta quando a pasta da reunião já existe, o título e a hora.
// `encolher`: no celular fica só a bolinha (o texto vai para o leitor de tela), para o chip caber na célula do mês.
function Conteudo({ evento, hora, deVariasPessoas, icone, encolher = false }) {
  const icones = cn(icone, encolher && 'max-sm:hidden')
  const texto = encolher && 'max-sm:sr-only'
  return (
    <>
      <BolinhaDaCor cor={corDoChip(evento, deVariasPessoas)} />
      {(evento.meet_link || evento.com_meet) && <Video className={icones} strokeWidth={2.2} aria-hidden="true" />}
      {evento.pasta_id && <Folder className={icones} strokeWidth={2.2} aria-hidden="true" />}
      <span className={cn('min-w-0 flex-1 truncate', texto)}>{evento.titulo}</span>
      {hora && <span className={cn('shrink-0 font-normal tabular-nums', texto)}>{hora}</span>}
    </>
  )
}

// Chip do calendário. O tipo manda no visual, como na legenda (reunião com cliente, compromisso, ausência listrada,
// feriado); a cor escolhida é a bolinha do começo (auditoria de 17/11, M2). Ausência e feriado não abrem nada (o detalhe
// do dia mostra). `comHora`: a hora de início ao lado do título. Sem `aoAbrir` (a prévia da janela do evento), é só a
// imagem do chip.
// `compacto` (o mês): no computador, um botão de 24 px; no celular, só uma faixa na cor do tipo, para o mês caber em
// 360 px; no toque (celular e tablet) o chip não é um alvo pequeno: o toque cai no dia, que mostra o detalhe dele.
// `alvoNoToque` (o mês sem o detalhe do dia: a agenda do cliente): o chip continua botão no toque, com 44 px, e no
// celular vira um bloco do tipo só com a bolinha — senão não haveria como abrir o evento pela grade.
export default function ChipDoEvento({
  item, dia, deVariasPessoas, comHora = false, compacto = false, alvoNoToque = false, tamanho = 'mini', aoAbrir, className,
}) {
  const base = cn('flex w-full min-w-0 items-center text-left font-medium', TAMANHOS[tamanho], classeDoChip(item), className)
  const faixa = compacto && <span aria-hidden="true" className={cn('hidden h-1.5 w-full rounded-full max-sm:block', faixaDoChip(item))} />

  if (item.tipo !== 'evento') {
    const texto = textoDoItem(item)
    return (
      <>
        {faixa}
        <span title={item.tipo === 'ausencia' ? `${item.ausencia.pessoa?.nome}: ${item.ausencia.motivo}` : texto}
          className={cn(base, compacto && 'max-sm:hidden')}>
          <span className="truncate">{texto}</span>
        </span>
      </>
    )
  }

  const { evento } = item
  const hora = comHora ? horaDoChip(evento, dia) : ''
  const tocavel = compacto && alvoNoToque
  const conteudo = <Conteudo evento={evento} hora={hora} deVariasPessoas={deVariasPessoas} icone="size-3 shrink-0" encolher={tocavel} />
  const titulo = evento.consultor?.nome ? `${evento.titulo} · ${evento.consultor.nome}` : evento.titulo
  if (!aoAbrir) return <span title={titulo} className={base}>{conteudo}</span>

  const alvo = !compacto ? 'pointer-coarse:min-h-11' : tocavel ? 'pointer-coarse:min-h-11 max-sm:justify-center max-sm:px-0.5' : 'max-sm:hidden pointer-coarse:hidden'
  const botao = (
    <button type="button" aria-label={nomeDoEvento(evento, hora)} title={titulo}
      onClick={(e) => { e.stopPropagation(); aoAbrir(evento) }} onDoubleClick={(e) => e.stopPropagation()}
      className={cn(base, 'botao-animado', ANIMADO, alvo)}>
      {conteudo}
    </button>
  )
  if (!compacto || tocavel) return botao
  return (
    <>
      {faixa}
      <span aria-hidden="true" title={titulo} className={cn(base, 'hidden sm:pointer-coarse:flex')}>{conteudo}</span>
      {botao}
    </>
  )
}
