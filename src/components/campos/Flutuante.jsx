import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

// Base das listas que abrem sobre um campo (data, hora, seletor). A janela do Radix prende o foco e
// desliga o clique fora dela, então a lista é montada DENTRO da janela quando o campo está numa (senão,
// no body). Dentro da janela, o conteúdo é centralizado com transform, e por isso o "fixed" passa a ser
// relativo a ela (e cortado por ela): a posição é calculada em cima da janela, não da tela.
const JANELA = '[data-slot="dialog-content"], [data-slot="janela-formulario"]'
const FOLGA = 8
const abertas = []

// Pulinho de ícone e levantada do hover do botão (regra do projeto) para botões dentro das listas.
export function BotaoCampo({ className, ...props }) {
  return (
    <button
      type="button"
      className={cn('botao-animado transition-[color,background-color,translate,scale] duration-150 hover:-translate-y-px active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-primary/50', className)}
      {...props}
    />
  )
}

function calcular(ancora, janela, largura, altura, alargar) {
  const r = ancora.getBoundingClientRect()
  const tela = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  const estilo = janela ? getComputedStyle(janela) : null
  const relativo = !!estilo && [estilo.transform, estilo.translate, estilo.scale, estilo.filter].some((v) => v && v !== 'none')
  const base = relativo ? janela.getBoundingClientRect() : tela
  const limite = relativo
    ? { left: Math.max(tela.left, base.left), top: Math.max(tela.top, base.top), right: Math.min(tela.right, base.right), bottom: Math.min(tela.bottom, base.bottom) }
    : tela
  const largo = alargar ? Math.max(r.width, largura) : largura
  const abaixo = limite.bottom - r.bottom - FOLGA
  const acima = r.top - limite.top - FOLGA
  const paraCima = abaixo < altura && acima > abaixo
  const esquerda = Math.min(Math.max(limite.left + FOLGA, r.left), Math.max(limite.left + FOLGA, limite.right - largo - FOLGA))
  return {
    width: largo,
    left: esquerda - base.left,
    maxHeight: Math.max(120, paraCima ? acima : abaixo),
    ...(paraCima ? { bottom: base.bottom - r.top + 4 } : { top: r.bottom - base.top + 4 }),
  }
}

// `ancora`: ref do botão do campo. `aoFechar` roda no clique fora, no Esc (só a lista de cima fecha) e
// quando a janela de baixo some.
export default function Flutuante({ ancora, aoFechar, largura, altura, alargar = false, role = 'dialog', rotulo, className, children, ...resto }) {
  const lista = useRef(null)
  const fechar = useRef(aoFechar)
  useEffect(() => { fechar.current = aoFechar })
  const [lugar, setLugar] = useState(null) // { janela, posicao }: só depois de medir o campo

  useLayoutEffect(() => {
    const janela = ancora.current?.closest(JANELA) ?? null
    const colocar = () => ancora.current && setLugar({ janela, posicao: calcular(ancora.current, janela, largura, altura, alargar) })
    colocar()
    const mover = (e) => { if (!lista.current?.contains(e.target)) colocar() }
    window.addEventListener('resize', mover)
    window.addEventListener('scroll', mover, true)
    return () => { window.removeEventListener('resize', mover); window.removeEventListener('scroll', mover, true) }
  }, [ancora, largura, altura, alargar])

  useEffect(() => {
    const eu = {}
    abertas.push(eu)
    const clique = (e) => {
      if (lista.current?.contains(e.target) || ancora.current?.contains(e.target) || e.target.closest?.('[data-picker-popover]')) return
      fechar.current()
    }
    // Na janela e na captura, para chegar antes do Esc do Radix.
    const tecla = (e) => {
      if (e.key !== 'Escape' || abertas.at(-1) !== eu) return
      e.stopPropagation()
      e.preventDefault()
      fechar.current()
      ancora.current?.focus()
    }
    document.addEventListener('mousedown', clique)
    window.addEventListener('keydown', tecla, true)
    return () => {
      abertas.splice(abertas.indexOf(eu), 1)
      document.removeEventListener('mousedown', clique)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [ancora])

  if (!lugar) return null
  return createPortal(
    <div ref={lista} data-picker-popover role={role} aria-label={rotulo} style={lugar.posicao}
      className={cn('card pop-in shadow-overlay pointer-events-auto fixed z-[110] overflow-y-auto', className)} {...resto}>
      {children}
    </div>,
    lugar.janela ?? document.body,
  )
}
