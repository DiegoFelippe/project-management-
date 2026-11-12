import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NovaConsultoria from './NovaConsultoria'

async function preencher() {
  await userEvent.type(screen.getByLabelText('Nome da consultoria'), 'Acme Consultoria')
  await userEvent.type(screen.getByLabelText('Nome'), 'Rita Alves')
  await userEvent.type(screen.getByLabelText('E-mail'), 'rita@acme.com.br')
}

describe('NovaConsultoria', () => {
  it('cria a consultoria com o primeiro administrador por convite', async () => {
    const aoCriar = vi.fn().mockResolvedValue({ consultoriaId: 'c9' })
    render(<NovaConsultoria aberto aoFechar={vi.fn()} aoCriar={aoCriar} />)
    await preencher()
    await userEvent.click(screen.getByRole('button', { name: 'Criar consultoria' }))
    expect(aoCriar).toHaveBeenCalledWith({
      nome: 'Acme Consultoria',
      admin: { forma: 'convite', nome: 'Rita Alves', email: 'rita@acme.com.br' },
    })
  })

  it('mostra o erro e continua aberta', async () => {
    const aoCriar = vi.fn().mockResolvedValue({
      codigo: 'email_indisponivel',
      erro: 'Não foi possível criar esse acesso com esse e-mail. Fale com o suporte.',
    })
    render(<NovaConsultoria aberto aoFechar={vi.fn()} aoCriar={aoCriar} />)
    await preencher()
    await userEvent.click(screen.getByRole('button', { name: 'Criar consultoria' }))
    expect(
      await screen.findByText('Não foi possível criar esse acesso com esse e-mail. Fale com o suporte.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('com senha manda a senha provisória', async () => {
    const aoCriar = vi.fn().mockResolvedValue({ consultoriaId: 'c9' })
    render(<NovaConsultoria aberto aoFechar={vi.fn()} aoCriar={aoCriar} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Criar com senha' }))
    await preencher()
    await userEvent.type(screen.getByLabelText('Senha provisória'), 'provisoria-1')
    await userEvent.click(screen.getByRole('button', { name: 'Criar consultoria' }))
    expect(aoCriar).toHaveBeenCalledWith({
      nome: 'Acme Consultoria',
      admin: { forma: 'senha', nome: 'Rita Alves', email: 'rita@acme.com.br', senha: 'provisoria-1' },
    })
  })
})
