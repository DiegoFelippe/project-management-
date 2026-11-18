import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { escolherNoSeletor } from '@/test/campos'
import FormularioDeTime from './FormularioDeTime'

const time = { id: 't1', nome: 'Implantação', descricao: '', gestor_id: 'g1', gestor: { id: 'g1', nome: 'Gabriel' } }
const PESSOAS = [
  { id: 'p1', nome: 'Ana', email: 'ana@x.test' },
  { id: 'p2', nome: 'Bruno', email: 'bruno@x.test' },
  { id: 'p3', nome: 'Carla', email: 'carla@x.test' },
]
const gestores = () => vi.fn().mockResolvedValue({ itens: [{ id: 'g1', nome: 'Gabriel' }, { id: 'g2', nome: 'Bruna' }], total: 2 })
const pessoas = () => vi.fn().mockResolvedValue({ itens: PESSOAS, total: 3 })

function montar(props) {
  const aoSalvar = props.aoSalvar ?? vi.fn().mockResolvedValue({ erro: null })
  const aoFechar = vi.fn()
  render(<FormularioDeTime aoFechar={aoFechar} buscarGestores={gestores()} buscarPessoas={pessoas()} {...props} aoSalvar={aoSalvar} />)
  return { aoSalvar, aoFechar }
}

describe('FormularioDeTime: Novo time', () => {
  it('o gestor não escolhe o gestor do time (é ele)', () => {
    montar({ papel: 'gestor' })
    expect(screen.getByRole('dialog', { name: 'Novo time' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Gestor do time')).not.toBeInTheDocument()
  })

  it('o administrador escolhe o gestor do time', async () => {
    const { aoSalvar } = montar({ papel: 'admin' })
    await userEvent.type(screen.getByLabelText('Nome do time'), 'Implantação')
    await escolherNoSeletor(userEvent, 'Gestor do time', 'Bruna')
    await userEvent.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Implantação', descricao: '', gestorId: 'g2', pessoas: [] })
  })

  it('Pessoas: várias de uma vez na mesma busca, que aparecem embaixo com "Tirar" (usabilidade, U7)', async () => {
    const buscarPessoas = pessoas()
    const { aoSalvar } = montar({ papel: 'gestor', buscarPessoas })
    await userEvent.type(screen.getByLabelText('Nome do time'), 'Suporte')
    await userEvent.click(screen.getByLabelText('Pessoas (opcional)'))
    expect(buscarPessoas).toHaveBeenCalledWith('', [])
    await userEvent.click(await screen.findByRole('option', { name: /Ana/ }))
    await userEvent.click(screen.getByRole('option', { name: /Carla/ }))
    await userEvent.keyboard('{Escape}')
    const escolhidas = screen.getByRole('list', { name: 'Pessoas escolhidas' })
    expect(within(escolhidas).getAllByRole('listitem')).toHaveLength(2)
    expect(within(escolhidas).getByText('Ana')).toBeInTheDocument()
    expect(within(escolhidas).getByText('Carla')).toBeInTheDocument()
    expect(screen.getByLabelText('Pessoas (opcional)')).toHaveTextContent('2 pessoas escolhidas')
    await userEvent.click(within(escolhidas).getByRole('button', { name: 'Tirar Ana' }))
    await userEvent.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Suporte', descricao: '', pessoas: [expect.objectContaining({ id: 'p3', nome: 'Carla' })] })
  })

  it('a busca de pessoas deixa de fora o gestor escolhido', async () => {
    const buscarPessoas = pessoas()
    const { aoSalvar } = montar({ papel: 'admin', buscarPessoas })
    await userEvent.type(screen.getByLabelText('Nome do time'), 'Projetos')
    await escolherNoSeletor(userEvent, 'Pessoas (opcional)', 'Bruno')
    await userEvent.keyboard('{Escape}')
    await escolherNoSeletor(userEvent, 'Gestor do time', 'Bruna')
    await userEvent.click(screen.getByLabelText('Pessoas (opcional)'))
    expect(buscarPessoas).toHaveBeenLastCalledWith('', ['g2'])
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({ gestorId: 'g2', pessoas: [expect.objectContaining({ id: 'p2' })] }))
  })

  it('mostra o erro do banco e continua aberta', async () => {
    montar({ papel: 'gestor', aoSalvar: vi.fn().mockResolvedValue({ erro: 'Já existe um time com esse nome.' }) })
    await userEvent.type(screen.getByLabelText('Nome do time'), 'Implantação')
    await userEvent.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(await screen.findByText('Já existe um time com esse nome.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('nome curto não é enviado: o erro fica embaixo do campo', async () => {
    const { aoSalvar } = montar({ papel: 'gestor' })
    await userEvent.type(screen.getByLabelText('Nome do time'), 'A')
    await userEvent.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(screen.getByText('Use pelo menos 2 caracteres.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome do time')).toHaveAttribute('aria-invalid', 'true')
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('o administrador sem gestor escolhido não envia', async () => {
    const { aoSalvar } = montar({ papel: 'admin' })
    await userEvent.type(screen.getByLabelText('Nome do time'), 'Projetos')
    await userEvent.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(screen.getByText('Escolha o gestor do time.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })
})

describe('FormularioDeTime: Editar time', () => {
  it('vem preenchido; o administrador troca o gestor (o de agora já aparece)', async () => {
    const { aoSalvar, aoFechar } = montar({ papel: 'admin', time })
    expect(screen.getByRole('dialog', { name: 'Editar time' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome do time')).toHaveValue('Implantação')
    expect(screen.getByLabelText('Gestor do time')).toHaveTextContent('Gabriel')
    expect(screen.queryByLabelText('Pessoas (opcional)')).not.toBeInTheDocument()
    await escolherNoSeletor(userEvent, 'Gestor do time', 'Bruna')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Implantação', descricao: '', gestorId: 'g2' })
    expect(aoFechar).toHaveBeenCalled()
  })

  it('o gestor muda nome e descrição, não o gestor', async () => {
    const { aoSalvar } = montar({ papel: 'gestor', time })
    expect(screen.queryByLabelText('Gestor do time')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Nome do time'))
    await userEvent.type(screen.getByLabelText('Nome do time'), 'Implantação 2')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Implantação 2', descricao: '' })
  })
})
