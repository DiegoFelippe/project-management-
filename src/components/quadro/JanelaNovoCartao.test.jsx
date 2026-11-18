import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarCartao, pessoasDoQuadro } from '@/data/quadro'
import { somarDias } from '@/lib/calendario'
import { hoje } from '@/lib/mes'
import { renderizarTela } from '@/test/renderizar'
import JanelaNovoCartao from './JanelaNovoCartao'

vi.mock('@/data/quadro', () => ({ criarCartao: vi.fn(), pessoasDoQuadro: vi.fn() }))

const QUADRO = {
  id: 'q1',
  colunas: [{ id: 'col1', nome: 'A fazer' }, { id: 'col2', nome: 'Em andamento' }, { id: 'col3', nome: 'Concluído' }],
}
const perfil = { id: 'p1', papel: 'pessoa', consultoria_id: 's1' }

function abrir(colunaId) {
  const aoFechar = vi.fn()
  const aoCriado = vi.fn()
  const aoRecusado = vi.fn()
  renderizarTela(<JanelaNovoCartao quadro={QUADRO} colunaId={colunaId} aoFechar={aoFechar} aoCriado={aoCriado} aoRecusado={aoRecusado} />, { perfil })
  return { aoFechar, aoCriado, aoRecusado, janela: screen.getByRole('dialog', { name: 'Novo cartão' }) }
}

async function escolher(user, janela, rotulo, opcao) {
  await user.click(within(janela).getByLabelText(rotulo))
  await waitFor(() => expect(screen.getAllByRole('option').some((o) => o.querySelector('span > span')?.textContent === opcao)).toBe(true))
  await user.click(screen.getAllByRole('option').find((o) => o.querySelector('span > span')?.textContent === opcao))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(criarCartao).mockResolvedValue({ erro: null, cartao: { id: 'novo' } })
  vi.mocked(pessoasDoQuadro).mockResolvedValue({
    itens: [{ id: 'p1', nome: 'Ana Lima', foto: null, cor: null }, { id: 'g1', nome: 'Gabi Souza', foto: null, cor: null }], total: 2,
  })
})

describe('JanelaNovoCartao', () => {
  it('cria o cartão com título, coluna, prioridade, prazo e responsáveis', async () => {
    const user = userEvent.setup()
    const { janela, aoCriado, aoFechar } = abrir()
    expect(within(janela).getByLabelText('Coluna')).toHaveTextContent('A fazer')
    await user.type(within(janela).getByLabelText('Título'), '  Mapear boletos  ')
    await escolher(user, janela, 'Coluna', 'Em andamento')
    await escolher(user, janela, 'Prioridade', 'Alta')
    await user.click(within(janela).getByLabelText('Prazo'))
    await user.click(screen.getByRole('button', { name: 'Amanhã' }))
    await escolher(user, janela, 'Responsáveis', 'Gabi Souza')
    await escolher(user, janela, 'Responsáveis', 'Ana Lima')
    expect(within(janela).getByRole('button', { name: 'Tirar Gabi Souza' })).toBeInTheDocument()
    await user.click(within(janela).getByRole('button', { name: 'Tirar Ana Lima' }))
    await user.click(within(janela).getByRole('button', { name: 'Criar cartão' }))
    expect(criarCartao).toHaveBeenCalledWith({
      colunaId: 'col2', titulo: 'Mapear boletos', prioridade: 'alta', prazo: somarDias(hoje(), 1), responsaveis: ['g1'],
      quadro: QUADRO,
    })
    expect(pessoasDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ quadroId: 'q1' }))
    await waitFor(() => expect(aoCriado).toHaveBeenCalledWith('novo', 'col2'))
    expect(aoFechar).toHaveBeenCalled()
  })

  it('abre na coluna de onde veio ("Adicionar cartão" da coluna)', () => {
    const { janela } = abrir('col3')
    expect(within(janela).getByLabelText('Coluna')).toHaveTextContent('Concluído')
  })

  it('título é obrigatório', async () => {
    const user = userEvent.setup()
    const { janela } = abrir()
    await user.click(within(janela).getByRole('button', { name: 'Criar cartão' }))
    expect(within(janela).getByRole('alert')).toHaveTextContent('Dê um título ao cartão.')
    expect(criarCartao).not.toHaveBeenCalled()
  })

  it('enquanto cria mostra "Criando…"; a recusa do banco aparece, a janela continua aberta e o quadro é relido', async () => {
    let responder
    vi.mocked(criarCartao).mockReturnValue(new Promise((r) => { responder = r }))
    const user = userEvent.setup()
    const { janela, aoFechar, aoRecusado } = abrir()
    await user.type(within(janela).getByLabelText('Título'), 'Mapear boletos')
    await user.click(within(janela).getByRole('button', { name: 'Criar cartão' }))
    expect(within(janela).getByRole('button', { name: 'Criando…' })).toBeDisabled()
    responder({ erro: 'Você não tem permissão para isso.' })
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Você não tem permissão para isso.')
    expect(aoFechar).not.toHaveBeenCalled()
    expect(aoRecusado).toHaveBeenCalled()
  })

  it('o cartão foi criado mas um responsável foi recusado: avisa e segue para o cartão', async () => {
    vi.mocked(criarCartao).mockResolvedValue({ erro: 'Escolha alguém que atende este cliente.', cartao: { id: 'novo' } })
    const user = userEvent.setup()
    const { janela, aoCriado } = abrir()
    await user.type(within(janela).getByLabelText('Título'), 'Mapear boletos')
    await user.click(within(janela).getByRole('button', { name: 'Criar cartão' }))
    await waitFor(() => expect(aoCriado).toHaveBeenCalledWith('novo', 'col1', 'Escolha alguém que atende este cliente.'))
  })
})
