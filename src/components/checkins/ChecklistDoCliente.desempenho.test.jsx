import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comentariosDaTarefa, historicoDaTarefa, lerChecklist, marcarTarefa } from '@/data/checklists'
import { renderizarTela } from '@/test/renderizar'
import ChecklistDoCliente from './ChecklistDoCliente'

// Conta quantas vezes uma caixa de tarefa é desenhada: marcar uma tarefa num check-list de 500 não pode redesenhar as
// 500 (cada item é memorizado e recebe sempre as mesmas props quando não mudou).
const contagem = vi.hoisted(() => ({ caixas: 0, layouts: 0 }))
vi.mock('@/components/campos/Caixa', async (importOriginal) => {
  const real = await importOriginal()
  return { default: (props) => { contagem.caixas += 1; return real.default(props) } }
})
vi.mock('./fluxo', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, layoutDoFluxo: (...args) => { contagem.layouts += 1; return real.layoutDoFluxo(...args) } }
})
vi.mock('@/data/checklists', () => ({
  lerChecklist: vi.fn(), modelosParaAplicar: vi.fn(), aplicarModelo: vi.fn(), mudarInicio: vi.fn(), tirarModelo: vi.fn(),
  marcarTarefa: vi.fn(), anotarTarefa: vi.fn(), trocarMotivo: vi.fn(), comentariosDaTarefa: vi.fn(), comentarTarefa: vi.fn(),
  editarComentarioDaTarefa: vi.fn(), apagarComentarioDaTarefa: vi.fn(), historicoDaTarefa: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const ETAPAS = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, nome: `Etapa ${i + 1}`, posicao: i + 1, tarefas: 50, feitas: 0 }))
// 500 tarefas, 50 por etapa; cada uma depende da anterior na etapa (a primeira de cada etapa está livre).
const TAREFAS = Array.from({ length: 500 }, (_, i) => {
  const etapa = Math.floor(i / 50)
  return {
    id: `t${i}`, etapa_id: `e${etapa}`, posicao: i + 1, titulo: `Tarefa ${i + 1}`, descricao: null, obrigatoria: true,
    prazo_dias: 30, vence_em: '2026-12-17', estado: 'a_fazer', nota: null, feita_em: null, feita_por: null,
    depende_de: i % 50 === 0 ? [] : [`t${i - 1}`], na_sessao: false,
  }
})
const RESUMO = { tarefas: 500, feitas: 0, obrigatorias: 500, obrigatorias_feitas: 0, vencem_7_dias: 0, atrasadas: 0, proxima: null }
const DADOS = {
  pode_aplicar: false, pode_marcar: true, consultor: { id: 'p1', nome: 'Ana Lima' },
  checklist: { id: 'cl1', modelo_id: 'm1', modelo_nome: 'Grande', inicio: '2026-11-17', aplicado_em: '2026-11-17T13:00:00Z', aplicado_por: { nome: 'Gil' } },
  etapas: ETAPAS, tarefas: TAREFAS, resumo: RESUMO, sessao: null, ultimo_checkin: null,
}
// O que o banco devolve depois de marcar a primeira: ela feita (o resto, igual).
const DEPOIS = {
  ...DADOS,
  tarefas: TAREFAS.map((t) => (t.id === 't0' ? { ...t, estado: 'feita', feita_em: '2026-11-17T15:00:00Z', feita_por: { nome: 'Ana Lima' } } : { ...t })),
  resumo: { ...RESUMO, feitas: 1, obrigatorias_feitas: 1 },
}
const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 's1' }
const CLIENTE = { id: 'k1', nome: 'Provedor Alfa', arquivado: false, consultoria_id: 's1', consultor_id: 'p1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-17T15:00:00Z') })
  contagem.caixas = 0
  contagem.layouts = 0
  vi.mocked(comentariosDaTarefa).mockResolvedValue({ itens: [], haMais: false, podeComentar: true })
  vi.mocked(historicoDaTarefa).mockResolvedValue({ eventos: [], trechos: [], tempo_segundos: 0 })
})
afterEach(() => vi.useRealTimers())

describe('ChecklistDoCliente com 500 tarefas', () => {
  it('marcar uma tarefa atualiza o item sem redesenhar as outras caixas', async () => {
    vi.mocked(lerChecklist).mockResolvedValueOnce(DADOS).mockResolvedValue(DEPOIS)
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'feita', liberadas: [{ id: 't1', titulo: 'Tarefa 2' }], na_sessao: false, erro: null })
    renderizarTela(<ChecklistDoCliente cliente={CLIENTE} perfil={consultor} versao={0} aoMudar={vi.fn()} />, { perfil: consultor })
    const caixa = await screen.findByRole('checkbox', { name: 'Tarefa 1' })
    expect(screen.getAllByRole('checkbox')).toHaveLength(500)
    expect(screen.getByRole('checkbox', { name: 'Tarefa 2' })).toBeDisabled()
    const primeiroDesenho = contagem.caixas
    expect(primeiroDesenho).toBeGreaterThanOrEqual(500)

    contagem.caixas = 0
    await userEvent.click(caixa)
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Tarefa 2' })).toBeEnabled())
    expect(caixa).toBeChecked()
    // A seguinte ficou livre.
    expect(screen.getByRole('checkbox', { name: 'Tarefa 2' })).toBeEnabled()
    // Só a marcada e a que ela liberou se redesenham (algumas vezes cada: otimista, ocupada, resposta e releitura).
    expect(contagem.caixas).toBeLessThan(20)
  })

  it('no fluxograma, marcar uma tarefa não recalcula o desenho (só a estrutura recalcula)', async () => {
    vi.mocked(lerChecklist).mockResolvedValueOnce(DADOS).mockResolvedValue(DEPOIS)
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'feita', liberadas: [], na_sessao: false, erro: null })
    renderizarTela(<ChecklistDoCliente cliente={CLIENTE} perfil={consultor} versao={0} aoMudar={vi.fn()} />, { perfil: consultor })
    await userEvent.click(await screen.findByRole('button', { name: 'Fluxograma' }))
    expect(contagem.layouts).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: 'Tarefa 1: A fazer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Feita' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tarefa 1: Feita' })).toBeInTheDocument())
    expect(contagem.layouts).toBe(1)
    // Mudar a orientação muda o desenho.
    await userEvent.click(screen.getByRole('button', { name: 'Em pé' }))
    expect(contagem.layouts).toBe(2)
  })
})
