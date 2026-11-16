import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Label } from '@/components/ui/label'
import CampoNumero from './CampoNumero'

function Controlado({ inicial = '', aoMudar = () => {}, ...props }) {
  const [valor, setValor] = useState(inicial)
  return <CampoNumero id="n" valor={valor} aoMudar={(v) => { setValor(v); aoMudar(v) }} {...props} />
}

describe('CampoNumero', () => {
  it('rótulo associado ao campo e unidade ao lado', () => {
    render(<><Label htmlFor="n">Horas</Label><Controlado inicial="8" unidade="h" /></>)
    expect(screen.getByLabelText('Horas')).toHaveValue('8')
    expect(screen.getByText('h')).toBeInTheDocument()
  })

  it('mais e menos andam pelo passo e respeitam min e max', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="2" min={1} max={3} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar' }))
    expect(aoMudar).toHaveBeenLastCalledWith('3')
    expect(screen.getByRole('button', { name: 'Aumentar' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir' }))
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir' }))
    expect(aoMudar).toHaveBeenLastCalledWith('1')
    expect(screen.getByRole('button', { name: 'Diminuir' })).toBeDisabled()
  })

  it('aceita vírgula e devolve o texto em pt-BR', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="7,5" decimal passo={0.5} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar' }))
    expect(aoMudar).toHaveBeenLastCalledWith('8')
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar' }))
    expect(aoMudar).toHaveBeenLastCalledWith('8,5')
    const campo = screen.getByRole('textbox')
    await userEvent.clear(campo)
    await userEvent.type(campo, '1,25')
    expect(campo).toHaveValue('1,25')
  })

  it('sem decimal, descarta o que não é dígito', async () => {
    render(<Controlado />)
    const campo = screen.getByRole('textbox')
    await userEvent.type(campo, '1a2,3')
    expect(campo).toHaveValue('123')
  })

  it('setas do teclado mudam o valor e sair do campo ajusta a min/max', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="5" min={0} max={10} aoMudar={aoMudar} />)
    const campo = screen.getByRole('textbox')
    campo.focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(aoMudar).toHaveBeenLastCalledWith('6')
    await userEvent.clear(campo)
    await userEvent.type(campo, '99')
    await userEvent.tab()
    expect(aoMudar).toHaveBeenLastCalledWith('10')
    expect(campo).toHaveValue('10')
  })

  it('atalhos preenchem o valor', async () => {
    const aoMudar = vi.fn()
    render(<Controlado atalhos={[4, 8]} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: '8' }))
    expect(aoMudar).toHaveBeenCalledWith('8')
    expect(screen.getByRole('button', { name: '8' })).toHaveAttribute('aria-pressed', 'true')
  })
})
