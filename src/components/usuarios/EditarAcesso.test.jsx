import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import EditarAcesso from './EditarAcesso'

const pessoa = { id: 'p1', nome: 'Ana Lima', email: 'ana@exemplo.test', papel: 'pessoa', times: [{ id: 't1', nome: 'Implantação' }] }
const TIMES = [{ id: 't1', nome: 'Implantação' }, { id: 't2', nome: 'Suporte' }]

describe('EditarAcesso', () => {
  it('admin muda nome, papel e times', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    render(<EditarAcesso aberto pessoa={pessoa} papelDeQuemEdita="admin" times={TIMES} aoSalvar={aoSalvar} aoFechar={vi.fn()} />)
    expect(screen.getByLabelText('E-mail')).toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Nome'))
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana Souza')
    await userEvent.selectOptions(screen.getByLabelText('Papel'), 'gestor')
    await userEvent.click(screen.getByRole('checkbox', { name: /Implantação/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Suporte/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Ana Souza', papel: 'gestor', timesAdicionar: ['t2'], timesRemover: ['t1'] })
  })

  it('gestor muda só o nome e os times dele', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    render(<EditarAcesso aberto pessoa={pessoa} papelDeQuemEdita="gestor" times={TIMES} aoSalvar={aoSalvar} aoFechar={vi.fn()} />)
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Ana Lima', papel: undefined, timesAdicionar: [], timesRemover: [] })
  })

  it('dono edita só o nome do administrador', () => {
    render(<EditarAcesso aberto pessoa={{ ...pessoa, papel: 'admin', times: [] }} papelDeQuemEdita="dono" times={[]} aoSalvar={vi.fn()} aoFechar={vi.fn()} />)
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
