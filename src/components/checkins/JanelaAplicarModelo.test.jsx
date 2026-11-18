import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aplicarModelo, modelosParaAplicar } from '@/data/checklists'
import { escolherData, escolherNoSeletor } from '@/test/campos'
import JanelaAplicarModelo from './JanelaAplicarModelo'

vi.mock('@/data/checklists', () => ({ modelosParaAplicar: vi.fn(), aplicarModelo: vi.fn() }))

const CLIENTE = { id: 'k1', nome: 'Provedor Alfa', consultor: { id: 'p1', nome: 'Ana Lima' } }
const FINANCEIRA = {
  id: 'm1', nome: 'Gestão financeira', tipo: 'gestao', da_central: true, etapas: 2, tarefas: 5, obrigatorias: 4, maior_prazo: 20,
  do_tipo_do_consultor: true,
}
const PESSOAS = {
  id: 'm2', nome: 'Gestão de pessoas', tipo: 'pessoas', da_central: false, etapas: 1, tarefas: 1, obrigatorias: 1, maior_prazo: 0,
  do_tipo_do_consultor: false,
}

function abrir({ checklist, aoAplicar = vi.fn(), aoFechar = vi.fn() } = {}) {
  render(<JanelaAplicarModelo cliente={CLIENTE} checklist={checklist} aoFechar={aoFechar} aoAplicar={aoAplicar} />)
  return { aoAplicar, aoFechar }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-17T15:00:00Z') })
  vi.mocked(modelosParaAplicar).mockResolvedValue({ itens: [FINANCEIRA, PESSOAS], total: 2 })
  vi.mocked(aplicarModelo).mockResolvedValue({ id: 'cl9', erro: null })
})
afterEach(() => vi.useRealTimers())

describe('JanelaAplicarModelo', () => {
  it('busca os modelos no banco (os do tipo do consultor vêm marcados), mostra a prévia e aplica com o início escolhido', async () => {
    const { aoAplicar, aoFechar } = abrir()
    const janela = screen.getByRole('dialog', { name: 'Aplicar modelo em Provedor Alfa' })
    expect(janela).toHaveTextContent('Ana Lima vai seguir as tarefas como check-list.')
    expect(within(janela).getByLabelText('Início dos prazos')).toHaveTextContent('17 de nov de 2026')
    expect(janela).toHaveTextContent('Escolha um modelo para ver a prévia.')

    await userEvent.click(within(janela).getByLabelText('Modelo'))
    await waitFor(() => expect(modelosParaAplicar).toHaveBeenCalledWith({ clienteId: 'k1', busca: '' }))
    const opcao = await screen.findByRole('option', { name: /Gestão financeira/ })
    expect(opcao).toHaveTextContent('2 etapas · 5 tarefas · do tipo do consultor')
    await userEvent.click(opcao)
    expect(janela).toHaveTextContent('5 tarefas em 2 etapas · a última vence em 07/12/2026 (dia 20)')

    await escolherData(userEvent, 'Início dos prazos', '2026-11-10')
    expect(janela).toHaveTextContent('5 tarefas em 2 etapas · a última vence em 30/11/2026 (dia 20)')
    await userEvent.click(within(janela).getByRole('button', { name: 'Aplicar modelo' }))
    expect(aplicarModelo).toHaveBeenCalledWith({ clienteId: 'k1', modeloId: 'm1', inicio: '2026-11-10' })
    await waitFor(() => expect(aoAplicar).toHaveBeenCalledWith({ id: 'cl9', modelo: FINANCEIRA, inicio: '2026-11-10' }))
    expect(aoFechar).toHaveBeenCalled()
  })

  it('a busca digitada vai para o banco', async () => {
    abrir()
    await userEvent.click(screen.getByLabelText('Modelo'))
    vi.mocked(modelosParaAplicar).mockResolvedValue({ itens: [PESSOAS], total: 1 })
    await userEvent.type(await screen.findByRole('combobox', { name: 'Buscar' }), 'pessoas')
    await waitFor(() => expect(modelosParaAplicar).toHaveBeenCalledWith({ clienteId: 'k1', busca: 'pessoas' }))
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1))
    await userEvent.click(screen.getByRole('option', { name: /Gestão de pessoas/ }))
    expect(screen.getByRole('dialog')).toHaveTextContent('1 tarefa em 1 etapa · a última vence em 17/11/2026 (dia 0)')
  })

  it('sem modelo escolhido, avisa e não manda', async () => {
    abrir()
    const janela = screen.getByRole('dialog')
    await userEvent.click(within(janela).getByRole('button', { name: 'Aplicar modelo' }))
    expect(within(janela).getByText('Escolha um modelo.')).toBeInTheDocument()
    expect(aplicarModelo).not.toHaveBeenCalled()
  })

  it('trocar: título, o aviso de que começa do zero (com o que já foi feito), o atual marcado e o botão Trocar modelo', async () => {
    abrir({ checklist: { id: 'cl1', modelo_id: 'm1', modelo_nome: 'Gestão financeira', tarefas: 14, feitas: 5 } })
    const janela = screen.getByRole('dialog', { name: 'Trocar o modelo de Provedor Alfa' })
    expect(janela).toHaveTextContent(
      'O check-list atual (5 de 14 feitas) é trocado pelo do modelo novo, começando do zero. O que já foi feito continua nos check-ins e no Histórico.')
    await userEvent.click(within(janela).getByLabelText('Modelo'))
    expect(await screen.findByRole('option', { name: /Gestão financeira/ })).toHaveTextContent('atual')
    expect(within(janela).getByRole('button', { name: 'Trocar modelo' })).toBeInTheDocument()
  })

  it('enquanto aplica, "Aplicando…"; o erro do banco fica na janela', async () => {
    let responder
    vi.mocked(aplicarModelo).mockImplementation(() => new Promise((r) => { responder = r }))
    const { aoAplicar, aoFechar } = abrir()
    await escolherNoSeletor(userEvent, 'Modelo', 'Gestão financeira')
    const janela = screen.getByRole('dialog')
    await userEvent.click(within(janela).getByRole('button', { name: 'Aplicar modelo' }))
    expect(within(janela).getByRole('button', { name: 'Aplicando…' })).toBeDisabled()
    responder({ id: null, erro: 'Esse modelo não está mais disponível para este cliente. Escolha outro.' })
    expect(await within(janela).findByText('Esse modelo não está mais disponível para este cliente. Escolha outro.')).toBeInTheDocument()
    expect(aoAplicar).not.toHaveBeenCalled()
    expect(aoFechar).not.toHaveBeenCalled()
  })
})
