import { useId, useImperativeHandle, useRef, useState } from 'react'
import { Ellipsis } from 'lucide-react'
import Flutuante, { BotaoCampo } from '@/components/campos/Flutuante'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Altura de cada item (para o menu virar para cima quando não cabe embaixo): 36 px no computador, 44 px no toque.
const noToque = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
const alturaDoMenu = (itens) => itens.length * (noToque() ? 44 : 36) + 12

// Menu "⋯" (auditoria de 17/11, M5): um botão sempre à vista (também no toque) que abre as ações num menu, no lugar de
// vários ícones fixos. Padrão de botão de menu do WAI-ARIA: Enter, espaço ou seta para baixo abrem no primeiro item,
// seta para cima no último; setas, Home e End andam (dando a volta); Enter escolhe; Esc e Tab fecham e devolvem o foco ao
// botão; o clique fora fecha (o Flutuante). Escolher fecha o menu e o foco volta ao botão antes da ação (a janela que
// a ação abrir devolve o foco a ele ao fechar).
// - rotulo: o nome do botão e do menu ("Ações da coluna A fazer").
// - itens: [{ rotulo, icone, aoEscolher, perigo? }] (só os que a pessoa pode fazer; o banco continua mandando).
// - ref: o botão "⋯" (âncora de um painel que a ação abra, como o da cor da coluna).
// - variante: o estilo do botão (ghost nas linhas e listas; outline no cabeçalho da página, como os outros botões de lá).
export default function MenuDeAcoes({ rotulo, itens, ref, className, variante = 'ghost' }) {
  const id = useId()
  const botao = useRef(null)
  const [aberto, setAberto] = useState(null) // null | 'primeiro' | 'ultimo'
  useImperativeHandle(ref, () => botao.current, [])

  const fechar = () => setAberto(null)
  const focarItem = (lista, indice) => {
    const todos = [...lista.querySelectorAll('[role="menuitem"]')]
    todos[(indice + todos.length) % todos.length]?.focus()
  }

  function teclarNoBotao(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setAberto(e.key === 'ArrowDown' ? 'primeiro' : 'ultimo')
    }
  }

  function teclarNoMenu(e) {
    const todos = [...e.currentTarget.querySelectorAll('[role="menuitem"]')]
    const atual = todos.indexOf(document.activeElement)
    const destino = { ArrowDown: atual + 1, ArrowUp: atual - 1, Home: 0, End: todos.length - 1 }[e.key]
    if (destino !== undefined) {
      e.preventDefault()
      focarItem(e.currentTarget, destino)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      fechar()
      botao.current?.focus()
    }
  }

  function escolher(item) {
    fechar()
    botao.current?.focus()
    item.aoEscolher()
  }

  return (
    <>
      <Button ref={botao} type="button" variant={variante} size="icon" aria-label={rotulo} title={rotulo}
        aria-haspopup="menu" aria-expanded={Boolean(aberto)} aria-controls={aberto ? `${id}-menu` : undefined}
        onClick={() => setAberto((a) => (a ? null : 'primeiro'))} onKeyDown={teclarNoBotao} className={className}>
        <Ellipsis />
      </Button>
      {aberto && (
        <Flutuante ancora={botao} aoFechar={fechar} largura={208} altura={alturaDoMenu(itens)} role="menu"
          rotulo={rotulo} id={`${id}-menu`} aria-orientation="vertical" onKeyDown={teclarNoMenu} className="p-1.5"
          aoAbrir={(lista) => focarItem(lista, aberto === 'ultimo' ? -1 : 0)}>
          {itens.map((item) => {
            const Icone = item.icone
            return (
              <BotaoCampo key={item.rotulo} role="menuitem" tabIndex={-1} onClick={() => escolher(item)}
                className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-corpo font-medium pointer-coarse:min-h-11',
                  item.perigo ? 'text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10' : 'text-foreground hover:bg-accent focus-visible:bg-accent')}>
                {Icone && <Icone className="size-4 shrink-0" aria-hidden="true" />}
                {item.rotulo}
              </BotaoCampo>
            )
          })}
        </Flutuante>
      )}
    </>
  )
}
