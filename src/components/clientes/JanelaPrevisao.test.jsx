import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import JanelaPrevisao from './JanelaPrevisao'

// O "Ajustar previsão" ficou só na barra da página do cliente (na linha de Clientes, a gestão usa o Editar).
describe('JanelaPrevisao', () => {
  it('confere as horas no campo: zero e acima do mês são recusados; 40,5 vai como 40.5', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    renderizarTela(<JanelaPrevisao aberto cliente={{ id: 'k1', nome: 'Provedor Alfa', horas_mes: 40 }} aoFechar={() => {}} aoSalvar={aoSalvar} />, { perfil: {} })
    const janela = screen.getByRole('dialog', { name: /previsão/i })
    const campo = within(janela).getByLabelText('Previsão de horas por mês')
    expect(campo).toHaveValue('40')
    await userEvent.clear(campo)
    await userEvent.type(campo, '0')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).not.toHaveBeenCalled()
    expect(within(janela).getByText(/maior que zero/)).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, '800')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).not.toHaveBeenCalled()
    await userEvent.clear(campo)
    await userEvent.type(campo, '40,5')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith(40.5)
  })
})
