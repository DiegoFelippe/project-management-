import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

  it('a ativa fica branca e elevada; as outras, em cinza', () => {
    render(<Controlada />)
    expect(screen.getByRole('button', { name: 'Ativos' })).toHaveClass('bg-card', 'shadow-sm')
    expect(screen.getByRole('button', { name: /Desativados/ })).not.toHaveClass('bg-card')
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
    expect(aba.querySelector('[data-ponto-erro]')).toHaveClass('bg-destructive')
    expect(screen.getByRole('tab', { name: 'Acesso' })).not.toHaveAttribute('data-erro')
  })
})
