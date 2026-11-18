import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarQuadro, timesParaNovoQuadro } from '@/data/quadros'
import { escolherNoSeletor } from '@/test/campos'
import JanelaNovoQuadro from './JanelaNovoQuadro'

vi.mock('@/data/quadros', () => ({ criarQuadro: vi.fn(), timesParaNovoQuadro: vi.fn() }))

const ANA = { id: 'p1', nome: 'Ana Lima', papel: 'pessoa', consultoria_id: 's1' }
const CENTRAL = { id: 'p9', nome: 'Carla', papel: 'central', consultoria_id: null }
const TIMES = [{ id: 't1', nome: 'Comercial' }, { id: 't2', nome: 'Implantação' }]

function tela(perfil = ANA) {
  const aoFechar = vi.fn()
  const aoCriado = vi.fn()
  render(<JanelaNovoQuadro perfil={perfil} aoFechar={aoFechar} aoCriado={aoCriado} />)
  return { aoFechar, aoCriado, janela: screen.getByRole('dialog', { name: 'Novo quadro' }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(timesParaNovoQuadro).mockResolvedValue({ itens: TIMES, total: 2 })
  vi.mocked(criarQuadro).mockResolvedValue({ id: 'q-novo', erro: null })
})

describe('JanelaNovoQuadro', () => {
  it('quadro pessoal: nome e "Só eu"; Criar quadro cria sem time e abre o novo', async () => {
    const user = userEvent.setup()
    const { aoCriado, janela } = tela()
    expect(within(janela).getByRole('radiogroup', { name: 'De quem é o quadro' })).toBeInTheDocument()
    expect(within(janela).getByRole('radio', { name: 'Só eu' })).toBeChecked()
    await user.type(within(janela).getByLabelText('Nome'), '  Minhas tarefas ')
    await user.click(screen.getByRole('button', { name: 'Criar quadro' }))
    expect(criarQuadro).toHaveBeenCalledWith({ nome: 'Minhas tarefas', timeId: null })
    await waitFor(() => expect(aoCriado).toHaveBeenCalledWith('q-novo', 'Minhas tarefas'))
  })

  it('o nome vai até 80 letras e não pode ficar vazio', async () => {
    const user = userEvent.setup()
    const { janela } = tela()
    expect(within(janela).getByLabelText('Nome')).toHaveAttribute('maxLength', '80')
    await user.click(screen.getByRole('button', { name: 'Criar quadro' }))
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Dê um nome ao quadro.')
    expect(criarQuadro).not.toHaveBeenCalled()
  })

  it('"Um time" pede o time num Seletor que busca no banco (times_para_novo_quadro) e cria o quadro do time', async () => {
    const user = userEvent.setup()
    const { aoCriado, janela } = tela()
    await user.type(within(janela).getByLabelText('Nome'), 'Sprint')
    await user.click(within(janela).getByText('Um time'))
    // Sem escolher o time, não envia.
    await user.click(screen.getByRole('button', { name: 'Criar quadro' }))
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Escolha o time.')
    expect(criarQuadro).not.toHaveBeenCalled()
    // A lista vem do banco: sem busca, o primeiro; "impl" traz a Implantação.
    vi.mocked(timesParaNovoQuadro).mockImplementation(async ({ termo }) => (termo
      ? { itens: TIMES.filter((t) => t.nome.toLowerCase().startsWith(termo)), total: 1 }
      : { itens: [TIMES[0]], total: 2 }))
    await escolherNoSeletor(user, 'Time', 'Implantação', { busca: 'impl' })
    expect(timesParaNovoQuadro).toHaveBeenCalledWith(expect.objectContaining({ termo: 'impl' }))
    await user.click(screen.getByRole('button', { name: 'Criar quadro' }))
    expect(criarQuadro).toHaveBeenCalledWith({ nome: 'Sprint', timeId: 't2' })
    await waitFor(() => expect(aoCriado).toHaveBeenCalledWith('q-novo', 'Sprint'))
  })

  it('central (e dono): só quadro pessoal, sem a escolha', async () => {
    const user = userEvent.setup()
    const { janela } = tela(CENTRAL)
    expect(within(janela).queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(within(janela).getByText('Quadro pessoal: só você vê.')).toBeInTheDocument()
    expect(timesParaNovoQuadro).not.toHaveBeenCalled()
    await user.type(within(janela).getByLabelText('Nome'), 'Pendências')
    await user.click(screen.getByRole('button', { name: 'Criar quadro' }))
    expect(criarQuadro).toHaveBeenCalledWith({ nome: 'Pendências', timeId: null })
  })

  it('quem não está em nenhum time vê "Um time" desligado, com a explicação', async () => {
    vi.mocked(timesParaNovoQuadro).mockResolvedValue({ itens: [], total: 0 })
    const { janela } = tela()
    await waitFor(() => expect(within(janela).getByRole('radio', { name: 'Um time' })).toBeDisabled())
    expect(within(janela).getByText('Você não está em nenhum time: por enquanto, só quadros pessoais.')).toBeInTheDocument()
  })

  it('nome repetido (ou outra recusa do banco): mostra o erro e a janela fica aberta', async () => {
    vi.mocked(criarQuadro).mockResolvedValue({ id: null, erro: 'Já existe um quadro aberto com esse nome.' })
    const user = userEvent.setup()
    const { aoCriado, janela } = tela()
    await user.type(within(janela).getByLabelText('Nome'), 'Sprint')
    await user.click(screen.getByRole('button', { name: 'Criar quadro' }))
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Já existe um quadro aberto com esse nome.')
    expect(aoCriado).not.toHaveBeenCalled()
  })

  it('enquanto cria, o botão diz "Criando…" e fica desligado', async () => {
    let terminar
    vi.mocked(criarQuadro).mockImplementation(() => new Promise((r) => { terminar = r }))
    const user = userEvent.setup()
    const { janela } = tela()
    await user.type(within(janela).getByLabelText('Nome'), 'Sprint')
    await user.click(screen.getByRole('button', { name: 'Criar quadro' }))
    expect(screen.getByRole('button', { name: 'Criando…' })).toBeDisabled()
    terminar({ id: 'q-novo', erro: null })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Criando…' })).not.toBeInTheDocument())
  })

  it('Cancelar fecha sem criar', async () => {
    const user = userEvent.setup()
    const { aoFechar } = tela()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(aoFechar).toHaveBeenCalled()
    expect(criarQuadro).not.toHaveBeenCalled()
  })
})
