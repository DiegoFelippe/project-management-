import { render, screen, within } from '@testing-library/react'
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

  it('senha provisória fraca não é enviada', async () => {
    const aoCriar = vi.fn()
    render(<NovaConsultoria aberto aoFechar={vi.fn()} aoCriar={aoCriar} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Criar com senha' }))
    await preencher()
    await userEvent.type(screen.getByLabelText('Senha provisória'), 'provisoria-1')
    await userEvent.click(screen.getByRole('button', { name: 'Criar consultoria' }))
    expect(screen.getByText(/precisa ser forte/)).toBeInTheDocument()
    expect(aoCriar).not.toHaveBeenCalled()
  })

  it('com senha manda a senha provisória', async () => {
    const aoCriar = vi.fn().mockResolvedValue({ consultoriaId: 'c9' })
    render(<NovaConsultoria aberto aoFechar={vi.fn()} aoCriar={aoCriar} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Criar com senha' }))
    await preencher()
    await userEvent.type(screen.getByLabelText('Senha provisória'), 'Provisoria-1!')
    await userEvent.click(screen.getByRole('button', { name: 'Criar consultoria' }))
    expect(aoCriar).toHaveBeenCalledWith({
      nome: 'Acme Consultoria',
      admin: { forma: 'senha', nome: 'Rita Alves', email: 'rita@acme.com.br', senha: 'Provisoria-1!' },
    })
  })

  // Usabilidade, U2: todos de uma vez, embaixo de cada campo, e o foco no primeiro.
  it('vazia: os três erros aparecem juntos, cada um no seu campo, com o foco no primeiro', async () => {
    const aoCriar = vi.fn()
    render(<NovaConsultoria aberto aoFechar={vi.fn()} aoCriar={aoCriar} />)
    await userEvent.type(screen.getByLabelText('E-mail'), 'rita@')
    await userEvent.click(screen.getByRole('button', { name: 'Criar consultoria' }))
    expect(screen.getByLabelText('Nome da consultoria')).toHaveAccessibleDescription('Use pelo menos 2 caracteres.')
    expect(screen.getByLabelText('Nome')).toHaveAccessibleDescription('Use pelo menos 2 caracteres.')
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription(/e-mail válido/)
    expect(screen.getByLabelText('Nome da consultoria')).toHaveFocus()
    expect(aoCriar).not.toHaveBeenCalled()
  })

  // Usabilidade, U4: a janela fica montada (só fecha); o que foi digitado pergunta antes de sumir.
  it('Cancelar com algo digitado pergunta; Descartar limpa e fecha, e ao reabrir vem vazia', async () => {
    const aoFechar = vi.fn()
    const { rerender } = render(<NovaConsultoria aberto aoFechar={aoFechar} aoCriar={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Nome da consultoria'), 'Acme')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(aoFechar).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Descartar o que você digitou?' })).getByRole('button', { name: 'Descartar' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
    rerender(<NovaConsultoria aberto={false} aoFechar={aoFechar} aoCriar={vi.fn()} />)
    rerender(<NovaConsultoria aberto aoFechar={aoFechar} aoCriar={vi.fn()} />)
    expect(screen.getByLabelText('Nome da consultoria')).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(aoFechar).toHaveBeenCalledTimes(2)
  })
})
