import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PainelDaSessao from './PainelDaSessao'

const AGORA = new Date('2026-11-17T15:00:00Z')
const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })
const INICIO = new Date(AGORA.getTime() - 65 * 60_000)
const SESSAO = {
  checkin_id: 'c9', inicio: INICIO.toISOString(), consultor: { nome: 'Ana Lima' },
  tarefas: [{ tarefa_id: 't1', titulo: 'Análise do DRE' }, { tarefa_id: 't2', titulo: 'Mapa de custos' }],
}
const ULTIMO = { inicio: '2026-11-12T13:00:00Z', fim: '2026-11-12T14:30:00Z', consultor: { nome: 'Ana Lima' } }
const painel = () => screen.getByRole('region', { name: 'Check-in' })

beforeEach(() => vi.useFakeTimers({ now: AGORA }))
afterEach(() => vi.useRealTimers())

describe('PainelDaSessao', () => {
  it('com check-in aberto neste cliente: "Em andamento", o relógio (anda a cada 30 s), quem, desde quando e "Nesta sessão"', () => {
    render(<PainelDaSessao sessao={SESSAO} ultimo={ULTIMO} souConsultor comChecklist />)
    expect(within(painel()).getByRole('heading', { name: 'Check-in em andamento' })).toBeInTheDocument()
    expect(within(painel()).getByText('Em andamento')).toBeInTheDocument()
    expect(within(painel()).getByText('1 h 05')).toBeInTheDocument()
    expect(painel()).toHaveTextContent(`Ana Lima · desde ${HORA.format(INICIO)}`)
    const lista = within(painel()).getByRole('list', { name: 'Nesta sessão' })
    expect(within(lista).getAllByRole('listitem').map((i) => i.textContent)).toEqual(['Análise do DRE', 'Mapa de custos'])
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(within(painel()).getByText('1 h 06')).toBeInTheDocument()
    // O botão de check-out continua no topo da página: a caixa não tem botão.
    expect(within(painel()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('sessão sem tarefas marcadas: diz isso (e, para quem marca, onde marcar)', () => {
    const { rerender } = render(<PainelDaSessao sessao={{ ...SESSAO, tarefas: [] }} ultimo={null} souConsultor comChecklist />)
    expect(painel()).toHaveTextContent('Nesta sessão: nenhuma tarefa marcada ainda. Marque no check-list abaixo.')
    rerender(<PainelDaSessao sessao={{ ...SESSAO, tarefas: [] }} ultimo={null} souConsultor={false} comChecklist />)
    expect(painel()).toHaveTextContent('Nesta sessão: nenhuma tarefa marcada ainda.')
    expect(painel()).not.toHaveTextContent('Marque no check-list')
  })

  it('sem check-in aberto: "Sem check-in aberto", o texto para cada um e o último check-in', () => {
    const { rerender } = render(<PainelDaSessao sessao={null} ultimo={ULTIMO} souConsultor comChecklist />)
    expect(within(painel()).getByText('Sem check-in aberto')).toBeInTheDocument()
    expect(painel()).toHaveTextContent('Faça o check-in no botão lá em cima ao começar a trabalhar. O que você marcar no check-list com ele aberto entra no resumo da sessão.')
    expect(painel()).toHaveTextContent('Último: 12/11/2026, 1 h 30 (Ana Lima)')
    rerender(<PainelDaSessao sessao={null} ultimo={ULTIMO} souConsultor comChecklist={false} />)
    expect(painel()).toHaveTextContent('Faça o check-in no botão lá em cima ao começar a trabalhar.')
    expect(painel()).not.toHaveTextContent('check-list')
    rerender(<PainelDaSessao sessao={null} ultimo={{ ...ULTIMO, consultor: { nome: null } }} souConsultor={false} comChecklist />)
    expect(painel()).toHaveTextContent('Nenhum check-in aberto neste cliente agora.')
    expect(painel()).toHaveTextContent('Último: 12/11/2026, 1 h 30 (outro consultor)')
  })

  it('sem nenhum check-in ainda', () => {
    render(<PainelDaSessao sessao={null} ultimo={null} souConsultor={false} comChecklist={false} />)
    expect(painel()).toHaveTextContent('Ainda não há check-ins neste cliente.')
  })
})
