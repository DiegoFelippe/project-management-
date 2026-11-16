import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Label } from '@/components/ui/label'
import CampoHora from './CampoHora'

function Controlado({ inicial = '', aoMudar = () => {}, ...props }) {
  const [valor, setValor] = useState(inicial)
  return <CampoHora id="hora" valor={valor} aoMudar={(v) => { setValor(v); aoMudar(v) }} {...props} />
}

describe('CampoHora', () => {
  it('rótulo associado e valor mostrado', () => {
    render(<><Label htmlFor="hora">Início</Label><Controlado inicial="08:30" /></>)
    const campo = screen.getByLabelText('Início')
    expect(campo).toHaveAttribute('aria-haspopup', 'dialog')
    expect(campo).toHaveTextContent('08:30')
  })

  it('escolher hora e minuto devolve HH:mm', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="08:30" aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: /08:30/ }))
    await userEvent.click(screen.getByRole('button', { name: '14', exact: true }))
    expect(aoMudar).toHaveBeenLastCalledWith('14:30')
    await userEvent.click(screen.getByRole('button', { name: '45', exact: true }))
    expect(aoMudar).toHaveBeenLastCalledWith('14:45')
  })

  it('ao abrir, leva a hora e o minuto escolhidos para a vista', async () => {
    const rolar = vi.fn()
    Element.prototype.scrollIntoView = rolar
    render(<Controlado inicial="14:30" />)
    await userEvent.click(screen.getByRole('button', { name: /14:30/ }))
    expect(rolar).toHaveBeenCalledTimes(2)
    expect(rolar.mock.contexts.map((b) => b.textContent)).toEqual(['14', '30'])
    delete Element.prototype.scrollIntoView
  })

  it('os minutos seguem o passo', async () => {
    render(<Controlado inicial="08:00" passo={15} />)
    await userEvent.click(screen.getByRole('button', { name: /08:00/ }))
    expect(screen.getByRole('button', { name: '45', exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '50', exact: true })).toBeNull()
  })

  it('digitar 1330 e Enter vale 13:30; Esc fecha', async () => {
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: /--:--/ }))
    await userEvent.type(screen.getByLabelText('Digitar horário'), '1330{Enter}')
    expect(aoMudar).toHaveBeenCalledWith('13:30')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Escolher horário' })).toBeNull()
  })

  it('Limpar volta a vazio', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="09:00" aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: /09:00/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(aoMudar).toHaveBeenCalledWith('')
  })
})
