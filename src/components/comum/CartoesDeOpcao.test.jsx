import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Building2, Globe, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import CartoesDeOpcao from './CartoesDeOpcao'

const OPCOES = [
  { valor: 'todas', titulo: 'Todas as consultorias', dica: 'Inclusive as que entrarem depois.', icone: Globe },
  { valor: 'uma', titulo: 'Uma consultoria', dica: 'Só ela vê.', icone: Building2 },
  { valor: 'senha', titulo: 'Com senha', dica: 'Você passa a senha.', icone: KeyRound },
]

// Como as telas usam: o valor fica em quem chama.
function Controlado({ inicial = 'todas', aoMudar = () => {}, ...props }) {
  const [valor, setValor] = useState(inicial)
  return <CartoesDeOpcao rotulo="Para quem" opcoes={OPCOES} valor={valor} aoMudar={(v) => { setValor(v); aoMudar(v) }} {...props} />
}

describe('CartoesDeOpcao', () => {
  it('é um radiogroup com nome; cada cartão é um radio com o título e a dica, e só o escolhido está marcado', () => {
    render(<Controlado />)
    const grupo = screen.getByRole('radiogroup', { name: 'Para quem' })
    expect(grupo).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /Todas as consultorias/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Inclusive as que entrarem depois/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Uma consultoria/ })).not.toBeChecked()
    expect(grupo.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3)
  })

  it('clicar escolhe', async () => {
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('radio', { name: /Uma consultoria/ }))
    expect(aoMudar).toHaveBeenCalledWith('uma')
    expect(screen.getByRole('radio', { name: /Uma consultoria/ })).toBeChecked()
  })

  it('setas escolhem e levam o foco, dando a volta nas pontas', async () => {
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} />)
    const [todas, uma, senha] = screen.getAllByRole('radio')
    todas.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(aoMudar).toHaveBeenLastCalledWith('uma')
    expect(uma).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(senha).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(todas).toHaveFocus()
    expect(todas).toBeChecked()
    await userEvent.keyboard('{ArrowLeft}')
    expect(senha).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(uma).toHaveFocus()
    expect(uma).toBeChecked()
  })

  it('o Tab para só no escolhido (os outros saem da ordem); sem escolhido, no primeiro', () => {
    const { unmount } = render(<Controlado inicial="uma" />)
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([-1, 0, -1])
    unmount()
    render(<CartoesDeOpcao rotulo="Para quem" opcoes={OPCOES} valor={null} aoMudar={() => {}} />)
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([0, -1, -1])
  })

  it('outras teclas não fazem nada', async () => {
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} />)
    screen.getAllByRole('radio')[0].focus()
    await userEvent.keyboard('a')
    expect(aoMudar).not.toHaveBeenCalled()
  })

  it('os cartões são botões animados e a grade aceita classes (ex.: duas colunas)', () => {
    render(<Controlado className="sm:grid-cols-2" />)
    expect(screen.getByRole('radiogroup')).toHaveClass('grid', 'gap-2', 'sm:grid-cols-2')
    for (const cartao of screen.getAllByRole('radio')) {
      expect(cartao).toHaveAttribute('type', 'button')
      expect(cartao).toHaveClass('botao-animado', 'hover:-translate-y-px', 'active:scale-[0.97]')
    }
  })
})
