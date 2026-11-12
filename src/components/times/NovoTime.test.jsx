import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NovoTime from './NovoTime'

function montar(props) {
  const aoCriar = props.aoCriar ?? vi.fn().mockResolvedValue({ id: 't1' })
  render(<NovoTime aberto aoFechar={vi.fn()} gestores={[]} {...props} aoCriar={aoCriar} />)
  return aoCriar
}

describe('NovoTime', () => {
  it('gestor não escolhe o gestor do time', () => {
    montar({ papelDeQuemCria: 'gestor' })
    expect(screen.queryByLabelText('Gestor do time')).not.toBeInTheDocument()
  })

  it('admin escolhe o gestor do time', async () => {
    const aoCriar = montar({ papelDeQuemCria: 'admin', gestores: [{ id: 'g2', nome: 'Bruno' }] })
    await userEvent.type(screen.getByLabelText('Nome do time'), 'Implantação')
    await userEvent.selectOptions(screen.getByLabelText('Gestor do time'), 'g2')
    await userEvent.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(aoCriar).toHaveBeenCalledWith({ nome: 'Implantação', descricao: '', gestorId: 'g2' })
  })

  it('mostra o erro e continua aberta', async () => {
    montar({
      papelDeQuemCria: 'gestor',
      aoCriar: vi.fn().mockResolvedValue({ erro: 'Já existe um time com esse nome.' }),
    })
    await userEvent.type(screen.getByLabelText('Nome do time'), 'Implantação')
    await userEvent.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(await screen.findByText('Já existe um time com esse nome.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('nome curto não é enviado', async () => {
    const aoCriar = montar({ papelDeQuemCria: 'gestor' })
    await userEvent.type(screen.getByLabelText('Nome do time'), 'A')
    await userEvent.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(screen.getByText('Use pelo menos 2 caracteres.')).toBeInTheDocument()
    expect(aoCriar).not.toHaveBeenCalled()
  })
})
