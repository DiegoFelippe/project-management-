import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AbasSegmentadas from './AbasSegmentadas'

const ABAS = [
  { valor: 'a', rotulo: 'Ativos' },
  { valor: 'b', rotulo: 'Desativados', contador: 3 },
  { valor: 'c', rotulo: 'Pendentes', contador: 2, pendente: true },
]

function Controlada({ inicial = 'a', aoMudar = () => {}, ...props }) {
  const [valor, setValor] = useState(inicial)
  return <AbasSegmentadas rotulo="Mostrar" abas={ABAS} valor={valor} aoMudar={(v) => { setValor(v); aoMudar(v) }} {...props} />
}

describe('AbasSegmentadas (lista)', () => {
  it('é um grupo de botões de alternância, com a aba ativa marcada', () => {
    render(<Controlada inicial="b" />)
    expect(screen.getByRole('group', { name: 'Mostrar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Desativados/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Ativos' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('a ativa fica branca e elevada, com o texto escuro; as outras, em cinza', () => {
    render(<Controlada />)
    expect(screen.getByRole('button', { name: 'Ativos' })).toHaveClass('bg-card', 'shadow-sm', 'text-foreground')
    expect(screen.getByRole('button', { name: /Desativados/ })).not.toHaveClass('bg-card')
    expect(screen.getByRole('button', { name: /Desativados/ })).toHaveClass('text-muted-foreground')
  })

  it('clicar chama aoMudar com o valor da aba', async () => {
    const aoMudar = vi.fn()
    render(<Controlada aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: /Desativados/ }))
    expect(aoMudar).toHaveBeenCalledWith('b')
    expect(screen.getByRole('button', { name: /Desativados/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('mostra o contador só onde ele existe, e âmbar quando há pendência', () => {
    render(<Controlada />)
    expect(screen.getByRole('button', { name: 'Ativos' }).querySelector('[data-contador]')).toBeNull()
    const normal = screen.getByRole('button', { name: /Desativados/ }).querySelector('[data-contador]')
    expect(normal).toHaveTextContent('3')
    expect(normal).not.toHaveClass('text-notice')
    const pendente = screen.getByRole('button', { name: /Pendentes/ }).querySelector('[data-contador]')
    expect(pendente).toHaveTextContent('2')
    expect(pendente).toHaveClass('bg-notice-soft', 'text-notice')
  })

  it('aba desligada (ex.: situação que espera outra tarefa): não clica, fica esmaecida', async () => {
    const aoMudar = vi.fn()
    render(<AbasSegmentadas rotulo="Situação" valor="a" aoMudar={aoMudar}
      abas={[{ valor: 'a', rotulo: 'A fazer' }, { valor: 'b', rotulo: 'Feita', desligada: true }]} />)
    const feita = screen.getByRole('button', { name: 'Feita' })
    expect(feita).toBeDisabled()
    expect(feita).toHaveClass('disabled:opacity-50')
    await userEvent.click(feita)
    expect(aoMudar).not.toHaveBeenCalled()
  })

  it('contador zero aparece (zero não é "sem número")', () => {
    render(<AbasSegmentadas rotulo="Mostrar" abas={[{ valor: 'a', rotulo: 'Ativos', contador: 0 }]} valor="a" aoMudar={() => {}} />)
    expect(screen.getByRole('button', { name: /Ativos/ })).toHaveTextContent('0')
  })
})

describe('AbasSegmentadas (comoAbas)', () => {
  const tela = (props) => render(<Controlada comoAbas idBase="x" {...props} />)

  it('vira tablist com abas, aria-selected, aria-controls e tabindex móvel', () => {
    tela({ inicial: 'b' })
    expect(screen.getByRole('tablist', { name: 'Mostrar' })).toBeInTheDocument()
    const abas = screen.getAllByRole('tab')
    expect(abas.map((a) => a.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(abas.map((a) => a.tabIndex)).toEqual([-1, 0, -1])
    expect(abas[1]).toHaveAttribute('id', 'x-aba-b')
    expect(abas[1]).toHaveAttribute('aria-controls', 'x-painel-b')
    expect(screen.queryByRole('button', { pressed: true })).toBeNull()
  })

  it('setas movem e focam a próxima aba, dando a volta nas pontas', async () => {
    const aoMudar = vi.fn()
    tela({ aoMudar })
    screen.getByRole('tab', { name: 'Ativos' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(aoMudar).toHaveBeenLastCalledWith('b')
    expect(screen.getByRole('tab', { name: /Desativados/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(aoMudar).toHaveBeenLastCalledWith('c')
    expect(screen.getByRole('tab', { name: /Pendentes/ })).toHaveFocus()
  })
})

describe('AbasSegmentadas (ícone e erro)', () => {
  const Icone = (props) => <svg data-testid="icone" {...props} />
  it('mostra o ícone antes do rótulo, sem entrar no nome', () => {
    render(<AbasSegmentadas rotulo="Seções" comoAbas idBase="y" valor="a" aoMudar={() => {}}
      abas={[{ valor: 'a', rotulo: 'Dados', icone: Icone }]} />)
    const aba = screen.getByRole('tab', { name: 'Dados' })
    expect(aba.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('aba com erro ganha o ponto vermelho e o aviso para leitor de tela', () => {
    render(<AbasSegmentadas rotulo="Seções" comoAbas idBase="y" valor="a" aoMudar={() => {}}
      abas={[{ valor: 'a', rotulo: 'Dados', erro: true }, { valor: 'b', rotulo: 'Acesso' }]} />)
    const aba = screen.getByRole('tab', { name: 'Dados, tem erro' })
    expect(aba).toHaveAttribute('data-erro')
    expect(aba.querySelector('[data-ponto-erro]')).toHaveClass('bg-destructive-cheio')
    expect(screen.getByRole('tab', { name: 'Acesso' })).not.toHaveAttribute('data-erro')
  })
})

// Auditoria, R12: no celular as abas que não cabem rolam dentro do trilho. A borda que esconde mais abas esmaece (para
// ver que dá para rolar) e a aba ativa rola para a vista (ao abrir e ao trocar). O jsdom não mede nada: as medidas são
// simuladas — cada aba com 100 px, o trilho com `largura` e as abas somando `total`.
describe('AbasSegmentadas que rolam (auditoria, R12)', () => {
  const originais = []
  function medidas({ largura, total }) {
    const definir = (alvo, nome, get) => {
      originais.push([alvo, nome, Object.getOwnPropertyDescriptor(alvo, nome)])
      Object.defineProperty(alvo, nome, { configurable: true, get })
    }
    const ehTrilho = (el) => ['group', 'tablist'].includes(el.getAttribute('role'))
    definir(Element.prototype, 'clientWidth', function clientWidth() { return ehTrilho(this) ? largura : 0 })
    definir(Element.prototype, 'scrollWidth', function scrollWidth() { return ehTrilho(this) ? total : 0 })
    definir(HTMLElement.prototype, 'offsetLeft', function offsetLeft() { return [...this.parentElement.children].indexOf(this) * 100 })
    definir(HTMLElement.prototype, 'offsetWidth', function offsetWidth() { return 100 })
  }
  afterEach(() => {
    for (const [alvo, nome, descritor] of originais.reverse()) {
      if (descritor) Object.defineProperty(alvo, nome, descritor)
      else delete alvo[nome]
    }
    originais.length = 0
  })
  const QUATRO = [...ABAS, { valor: 'd', rotulo: 'Histórico' }]
  const mascara = (el) => el.style.maskImage

  it('sem nada escondido, sem esmaecido', () => {
    medidas({ largura: 400, total: 400 })
    render(<AbasSegmentadas rotulo="Mostrar" abas={QUATRO} valor="a" aoMudar={() => {}} />)
    expect(mascara(screen.getByRole('group'))).toBe('')
  })

  it('esmaece a borda que esconde abas: a da direita no começo, as duas no meio e a da esquerda no fim', () => {
    medidas({ largura: 200, total: 400 })
    render(<AbasSegmentadas rotulo="Mostrar" abas={QUATRO} valor="a" aoMudar={() => {}} />)
    const trilho = screen.getByRole('group')
    expect(trilho).toHaveClass('relative', 'overflow-x-auto')
    expect(trilho).toHaveAttribute('data-borda', 'fim')
    expect(mascara(trilho)).toMatch(/linear-gradient\(to right, .*transparent\)/)
    trilho.scrollLeft = 100
    fireEvent.scroll(trilho)
    expect(trilho).toHaveAttribute('data-borda', 'ambas')
    trilho.scrollLeft = 200
    fireEvent.scroll(trilho)
    expect(trilho).toHaveAttribute('data-borda', 'inicio')
    expect(mascara(trilho)).toMatch(/linear-gradient\(to left, .*transparent\)/)
  })

  it('a aba ativa rola para a vista ao abrir e ao trocar (página do cliente com ?aba= numa aba do fim)', async () => {
    medidas({ largura: 200, total: 400 })
    const { rerender } = render(<AbasSegmentadas comoAbas idBase="x" rotulo="Seções" abas={QUATRO} valor="d" aoMudar={() => {}} />)
    const trilho = screen.getByRole('tablist')
    // A última (300 a 400 px) inteira à vista, com uma folga para o esmaecido: 400 + 24 - 200.
    expect(trilho.scrollLeft).toBe(224)
    rerender(<AbasSegmentadas comoAbas idBase="x" rotulo="Seções" abas={QUATRO} valor="b" aoMudar={() => {}} />)
    expect(trilho.scrollLeft).toBe(76)
    rerender(<AbasSegmentadas comoAbas idBase="x" rotulo="Seções" abas={QUATRO} valor="a" aoMudar={() => {}} />)
    expect(trilho.scrollLeft).toBe(0)
  })
})
