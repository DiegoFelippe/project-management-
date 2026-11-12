import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ConfirmarAcao from './ConfirmarAcao'

describe('ConfirmarAcao', () => {
  it('confirma uma vez só e fecha', async () => {
    const aoConfirmar = vi.fn().mockResolvedValue({ erro: null })
    const aoFechar = vi.fn()
    render(<ConfirmarAcao aberto titulo="Apagar time?" descricao="As pessoas continuam." rotuloConfirmar="Apagar time"
      aoConfirmar={aoConfirmar} aoFechar={aoFechar} />)
    expect(screen.getByText('As pessoas continuam.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Apagar time' }))
    expect(aoConfirmar).toHaveBeenCalledTimes(1)
    expect(aoFechar).toHaveBeenCalled()
  })

  it('mostra o erro e continua aberta', async () => {
    const aoConfirmar = vi.fn().mockResolvedValue({ erro: 'Essa pessoa ainda é gestora de times. Troque o gestor desses times antes.' })
    render(<ConfirmarAcao aberto titulo="Desativar?" descricao="x" rotuloConfirmar="Desativar" aoConfirmar={aoConfirmar} aoFechar={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Desativar' }))
    expect(await screen.findByText(/ainda é gestora de times/)).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
