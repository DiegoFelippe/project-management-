import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NovoAcesso from './NovoAcesso'

const TIMES = [
  { id: 't1', nome: 'Implantação' },
  { id: 't2', nome: 'Suporte N2' },
]

function montar(props = {}) {
  const funcoes = {
    aoCriar: vi.fn().mockResolvedValue({ pessoaId: 'p9' }),
    aoColocarNosTimes: vi.fn().mockResolvedValue({ erro: null }),
    aoFechar: vi.fn(),
    ...props,
  }
  render(<NovoAcesso aberto papelDeQuemCria="gestor" times={TIMES} {...props} {...funcoes} />)
  return funcoes
}

const opcoesDoPapel = () => screen.getAllByRole('option').map((o) => o.textContent)

async function preencher({ senha } = {}) {
  await userEvent.type(screen.getByLabelText('Nome'), 'João Pereira')
  await userEvent.type(screen.getByLabelText('E-mail'), 'joao@empresa.com.br')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Implantação' }))
  if (senha) await userEvent.type(screen.getByLabelText('Senha provisória'), senha)
}

describe('NovoAcesso', () => {
  it('gestor só cria pessoa', () => {
    montar()
    expect(opcoesDoPapel()).toEqual(['Pessoa'])
  })

  it('admin cria pessoa ou gestor', () => {
    montar({ papelDeQuemCria: 'admin' })
    expect(opcoesDoPapel()).toEqual(['Pessoa', 'Gestor'])
  })

  it('dono cria administrador, sem times', async () => {
    const { aoCriar } = montar({ papelDeQuemCria: 'dono', consultoriaId: 'c1', times: [] })
    expect(opcoesDoPapel()).toEqual(['Administrador'])
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nome'), 'Rita Alves')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rita@acme.com.br')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalledWith(
      expect.objectContaining({ papel: 'admin', times: [], consultoria_id: 'c1' }),
    )
  })

  it('criar com senha mostra a senha provisória e muda o botão', async () => {
    montar()
    expect(screen.queryByLabelText('Senha provisória')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Criar com senha' }))
    expect(screen.getByLabelText('Senha provisória')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar acesso' })).toBeInTheDocument()
  })

  it('envia os dados certos', async () => {
    const { aoCriar } = montar()
    await userEvent.click(screen.getByRole('radio', { name: 'Criar com senha' }))
    await preencher({ senha: 'provisoria-1' })
    await userEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    expect(aoCriar).toHaveBeenCalledWith({
      forma: 'senha',
      nome: 'João Pereira',
      email: 'joao@empresa.com.br',
      papel: 'pessoa',
      times: ['t1'],
      senha: 'provisoria-1',
    })
  })

  it('clique duplo não envia duas vezes', async () => {
    const { aoCriar } = montar({ aoCriar: vi.fn(() => new Promise(() => {})) })
    await preencher()
    const botao = screen.getByRole('button', { name: 'Enviar convite' })
    await userEvent.click(botao)
    await userEvent.click(botao)
    expect(botao).toBeDisabled()
    expect(aoCriar).toHaveBeenCalledTimes(1)
  })

  it('pessoa que já tem acesso pode entrar nos times marcados', async () => {
    const { aoColocarNosTimes } = montar({
      aoCriar: vi.fn().mockResolvedValue({
        codigo: 'ja_na_consultoria',
        erro: 'Essa pessoa já tem acesso na sua consultoria.',
        pessoa: { id: 'p1', nome: 'João' },
      }),
    })
    await preencher()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(await screen.findByText('Essa pessoa já tem acesso na sua consultoria.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Colocar nos times marcados' }))
    expect(aoColocarNosTimes).toHaveBeenCalledWith('p1', ['t1'])
  })
})
