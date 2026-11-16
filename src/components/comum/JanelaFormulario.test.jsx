import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Users } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import JanelaFormulario, { SecaoFormulario } from './JanelaFormulario'

function montar(props = {}) {
  const aoFechar = vi.fn()
  render(
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Novo time" descricao="O time aparece na lista ao salvar."
      icone={Users} rodape={<button type="button">Salvar time</button>} {...props}>
      <SecaoFormulario titulo="Identificação"><label>Nome<input /></label></SecaoFormulario>
      <SecaoFormulario titulo="Gestão"><p>Quem gere</p></SecaoFormulario>
    </JanelaFormulario>,
  )
  return { aoFechar }
}

describe('JanelaFormulario', () => {
  it('mostra título, descrição, ícone, seções e rodapé', () => {
    montar()
    expect(screen.getByRole('dialog', { name: 'Novo time' })).toBeInTheDocument()
    expect(screen.getByText('O time aparece na lista ao salvar.')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="janela-icone"] svg')).not.toBeNull()
    expect(screen.getByText('Identificação')).toBeInTheDocument()
    expect(screen.getByText('Gestão')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar time' })).toBeInTheDocument()
  })

  it('o X fecha', async () => {
    const { aoFechar } = montar()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('Esc fecha', async () => {
    const { aoFechar } = montar()
    await userEvent.keyboard('{Escape}')
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('clique fora não fecha', async () => {
    const { aoFechar } = montar()
    await userEvent.click(document.querySelector('[data-slot="dialog-overlay"]'))
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('não renderiza fechada', () => {
    montar({ aberto: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
