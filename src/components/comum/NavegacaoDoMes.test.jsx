import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NavegacaoDoMes from './NavegacaoDoMes'

describe('NavegacaoDoMes', () => {
  it('os botões têm nome acessível próprio e mudam o mês', async () => {
    const aoMudar = vi.fn()
    render(<NavegacaoDoMes mes="2026-11-01" aoMudar={aoMudar} />)
    expect(screen.getByText('Novembro de 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(aoMudar).toHaveBeenLastCalledWith('2026-10-01')
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(aoMudar).toHaveBeenLastCalledWith('2026-12-01')
  })

  it('no celular os textos Anterior e Próximo somem (só o ícone) e o rótulo do mês encolhe', () => {
    render(<NavegacaoDoMes mes="2026-11-01" aoMudar={() => {}} />)
    expect(screen.getByText('Anterior')).toHaveClass('hidden', 'sm:inline')
    expect(screen.getByText('Próximo')).toHaveClass('hidden', 'sm:inline')
    expect(screen.getByText('Novembro de 2026')).toHaveClass('min-w-28', 'sm:min-w-36')
  })
})
