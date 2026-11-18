import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { lembrarQuadro, lerMemoria } from '@/lib/quadrosRecentes'
import SeletorDeQuadro from './SeletorDeQuadro'

// Aqui o banco é falso no nível do supabase (a camada de dados de verdade roda): o teste vê as funções e os parâmetros.
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }))

const ANA = { id: '0a000000-0000-4000-8000-00000000000a', nome: 'Ana Lima', papel: 'pessoa', consultoria_id: 's1' }
const CENTRAL = { ...ANA, id: '0c000000-0000-4000-8000-00000000000c', papel: 'central', consultoria_id: null }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const item = (n, nome, extras = {}) => ({ id: id(n), nome, tipo: 'pessoa', time: null, cartoes: 3, favorito: false, ...extras })

const FAVORITO = item(1, 'Prioridades', { favorito: true, cartoes: 1 })
const MEU = item(2, 'Minhas tarefas')
const DO_TIME = item(3, 'Sprint', { tipo: 'time', time: { id: 't1', nome: 'Comercial' }, cartoes: 12 })
const RECENTE = item(4, 'Leituras')
const SUMIDO = id(9)

const grupos = (extras = {}) => ({
  favoritos: { itens: [FAVORITO], total: 1 },
  meus: { itens: [MEU, RECENTE], total: 2 },
  dos_times: { itens: [DO_TIME], total: 1 },
  ...extras,
})

function responder({ escolher = grupos(), porIds } = {}) {
  vi.mocked(supabase.rpc).mockImplementation(async (funcao, parametros) => {
    if (funcao === 'quadros_para_escolher') return { data: typeof escolher === 'function' ? escolher(parametros) : escolher, error: null }
    if (funcao === 'quadros_por_ids') return { data: porIds ?? [RECENTE], error: null }
    return { data: null, error: { message: `inesperado: ${funcao}` } }
  })
}

function tela({ perfil = ANA, quadro = MEU } = {}) {
  const aoEscolher = vi.fn()
  render(<SeletorDeQuadro perfil={perfil} quadro={quadro} aoEscolher={aoEscolher} />)
  return { aoEscolher, gatilho: screen.getByRole('button', { name: /trocar de quadro/ }) }
}

const lista = () => screen.findByRole('listbox', { name: 'Quadros' })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  responder()
})

describe('SeletorDeQuadro', () => {
  it('o botão mostra o quadro aberto; abre os grupos na ordem Favoritos, Recentes, Meus e Dos times, com quantos cartões', async () => {
    lembrarQuadro(ANA.id, RECENTE.id)
    const { gatilho } = tela()
    expect(gatilho).toHaveTextContent('Minhas tarefas')
    expect(gatilho).toHaveAttribute('aria-haspopup', 'listbox')
    await userEvent.click(gatilho)
    const listbox = await lista()
    await within(listbox).findByRole('group', { name: 'Recentes' })
    const nomes = within(listbox).getAllByRole('group').map((g) => document.getElementById(g.getAttribute('aria-labelledby')).textContent)
    expect(nomes).toEqual(['Favoritos', 'Recentes', 'Meus', 'Dos times'])
    const favoritos = within(listbox).getByRole('group', { name: 'Favoritos' })
    expect(within(favoritos).getByRole('option', { name: /Prioridades/ })).toHaveTextContent('1 cartão')
    const dosTimes = within(listbox).getByRole('group', { name: 'Dos times' })
    const sprint = within(dosTimes).getByRole('option', { name: /Sprint/ })
    expect(sprint).toHaveTextContent('Comercial')
    expect(sprint).toHaveTextContent('12 cartões')
    expect(within(sprint).getByText('12 cartões')).toHaveClass('tabular-nums')
    // O quadro aberto aparece marcado.
    const meus = within(listbox).getByRole('group', { name: 'Meus' })
    expect(within(meus).getByRole('option', { name: /Minhas tarefas/ })).toHaveAttribute('aria-selected', 'true')
    expect(supabase.rpc).toHaveBeenCalledWith('quadros_para_escolher', { p_busca: null, p_limite: 20 })
  })

  it('busca no banco (quadros_para_escolher com p_busca) só depois de parar de digitar; Recentes filtra o que já tem', async () => {
    lembrarQuadro(ANA.id, RECENTE.id)
    responder({
      escolher: (p) => (p.p_busca ? grupos({ favoritos: { itens: [], total: 0 }, meus: { itens: [MEU], total: 1 }, dos_times: { itens: [], total: 0 } }) : grupos()),
    })
    const { gatilho } = tela()
    await userEvent.click(gatilho)
    const listbox = await lista()
    await within(listbox).findByRole('group', { name: 'Recentes' })
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar quadro' }), 'tarefas')
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('quadros_para_escolher', { p_busca: 'tarefas', p_limite: 20 }))
    expect(supabase.rpc).not.toHaveBeenCalledWith('quadros_para_escolher', { p_busca: 't', p_limite: 20 })
    expect(supabase.rpc).not.toHaveBeenCalledWith('quadros_para_escolher', { p_busca: 'tar', p_limite: 20 })
    await waitFor(() => expect(within(listbox).queryByRole('group', { name: 'Favoritos' })).not.toBeInTheDocument())
    // "Leituras" (recente) não casa com "tarefas": o grupo some sem ir ao banco de novo.
    expect(within(listbox).queryByRole('group', { name: 'Recentes' })).not.toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: /Minhas tarefas/ })).toBeInTheDocument()
    expect(supabase.rpc.mock.calls.filter(([f]) => f === 'quadros_por_ids')).toHaveLength(1)
  })

  it('o rodapé do grupo diz quantos há quando passa do limite: "20 de 230 — busque pelo nome"', async () => {
    const vinte = Array.from({ length: 20 }, (_, i) => item(100 + i, `Quadro ${i + 1}`, { tipo: 'time', time: { id: 't1', nome: 'Comercial' } }))
    responder({ escolher: grupos({ dos_times: { itens: vinte, total: 230 } }) })
    const { gatilho } = tela()
    await userEvent.click(gatilho)
    const dosTimes = await within(await lista()).findByRole('group', { name: 'Dos times' })
    expect(within(dosTimes).getByText('20 de 230 — busque pelo nome')).toBeInTheDocument()
    expect(within(await lista()).getByRole('group', { name: 'Meus' })).not.toHaveTextContent('busque pelo nome')
  })

  it('Recentes vêm de quadros_por_ids com os ids guardados; o que o banco não devolveu sai da memória', async () => {
    lembrarQuadro(ANA.id, SUMIDO)
    lembrarQuadro(ANA.id, RECENTE.id)
    const { gatilho } = tela()
    await userEvent.click(gatilho)
    const recentes = await within(await lista()).findByRole('group', { name: 'Recentes' })
    expect(supabase.rpc).toHaveBeenCalledWith('quadros_por_ids', { p_ids: [RECENTE.id, SUMIDO] })
    expect(within(recentes).getAllByRole('option')).toHaveLength(1)
    expect(within(recentes).getByRole('option', { name: /Leituras/ })).toBeInTheDocument()
    await waitFor(() => expect(lerMemoria(ANA.id).recentes).toEqual([RECENTE.id]))
  })

  it('sem nada guardado, Recentes nem vai ao banco e não aparece', async () => {
    const { gatilho } = tela()
    await userEvent.click(gatilho)
    await within(await lista()).findByRole('group', { name: 'Meus' })
    expect(supabase.rpc.mock.calls.filter(([f]) => f === 'quadros_por_ids')).toHaveLength(0)
    expect(screen.queryByRole('group', { name: 'Recentes' })).not.toBeInTheDocument()
  })

  it('central (e dono): sem o grupo Dos times', async () => {
    responder({ escolher: grupos({ dos_times: { itens: [], total: 0 } }) })
    const { gatilho } = tela({ perfil: CENTRAL })
    await userEvent.click(gatilho)
    const listbox = await lista()
    await within(listbox).findByRole('group', { name: 'Meus' })
    expect(within(listbox).queryByRole('group', { name: 'Dos times' })).not.toBeInTheDocument()
  })

  it('escolher pelo teclado: setas andam pelos itens de todos os grupos e Enter escolhe; Esc fecha e devolve o foco', async () => {
    const { gatilho, aoEscolher } = tela()
    await userEvent.click(gatilho)
    const listbox = await lista()
    await within(listbox).findByRole('group', { name: 'Dos times' })
    const busca = screen.getByRole('combobox', { name: 'Buscar quadro' })
    expect(busca).toHaveFocus()
    // Favoritos (1) → Meus (2) → Dos times (1); a lista abre no primeiro: duas setas para baixo chegam à "Leituras", a 3ª.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    const ativa = document.getElementById(busca.getAttribute('aria-activedescendant'))
    expect(ativa).toHaveTextContent('Leituras')
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    expect(aoEscolher).toHaveBeenCalledWith(RECENTE.id)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await userEvent.click(gatilho)
    await within(await lista()).findByRole('group', { name: 'Meus' })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(gatilho).toHaveFocus()
  })

  it('clicar num item escolhe aquele quadro', async () => {
    const { gatilho, aoEscolher } = tela()
    await userEvent.click(gatilho)
    const dosTimes = await within(await lista()).findByRole('group', { name: 'Dos times' })
    await userEvent.click(within(dosTimes).getByRole('option', { name: /Sprint/ }))
    expect(aoEscolher).toHaveBeenCalledWith(DO_TIME.id)
  })

  it('o banco não respondeu: a lista diz e não quebra', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'XX000', message: 'falhou' } })
    const { gatilho } = tela()
    await userEvent.click(gatilho)
    expect(await screen.findByText('Não foi possível carregar os quadros.')).toBeInTheDocument()
  })
})
