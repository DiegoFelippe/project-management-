import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import TarefasDosChecklists from './TarefasDosChecklists'

const T = { feitas: 128, nao_se_aplica: 14, andamento: 9, pausadas: 4, a_fazer: 61, atrasadas: 17, checklists: 31 }
const ver = (props) => renderizarTela(<TarefasDosChecklists recorte="consultoria" {...props} />, { perfil: {} })
const cartao = (nome = 'Check-lists dos clientes') => screen.getByRole('region', { name: nome })

describe('TarefasDosChecklists', () => {
  it('rosca das seis situações (as partes somam o total), o % resolvido no meio e a situação de hoje no subtítulo', () => {
    ver({ dados: T })
    expect(within(cartao()).getByText('Situação de hoje · 31 check-lists ativos')).toBeInTheDocument()
    const rosca = within(cartao()).getByRole('group', { name: 'Tarefas dos check-lists por situação' })
    expect(within(rosca).getAllByRole('img').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Feitas: 128 (55%)', 'Não se aplicam: 14 (6%)', 'Em andamento: 9 (4%)', 'Pausadas: 4 (2%)', 'A fazer no prazo: 61 (26%)', 'Atrasadas: 17 (7%)',
    ])
    expect(within(rosca).getByText('61%')).toBeInTheDocument()
    expect(within(rosca).getByText('resolvidas')).toBeInTheDocument()
    expect(rosca.querySelector('[data-arco]').style.stroke).toBe('var(--positive-cheio)')
    expect(within(cartao()).getByText(/resolvidas ·/).textContent).toBe('61% resolvidas · 17 atrasadas')
  })

  it('estado com ícone e palavra na legenda (não se aplica com o Ban, atrasada com o alerta)', () => {
    ver({ dados: T })
    const linhas = within(within(cartao()).getByRole('list', { name: 'Legenda' })).getAllByRole('listitem')
    expect(linhas[1]).toHaveTextContent('Não se aplicam')
    expect(linhas[1].querySelector('svg.lucide-ban')).not.toBeNull()
    expect(linhas[5].querySelector('svg.lucide-triangle-alert')).not.toBeNull()
    expect(linhas[0].querySelector('svg.lucide-check')).not.toBeNull()
  })

  it('"a fazer" negativo (resto de contadores velhos) conta 0: sem arco e 0 na legenda', () => {
    ver({ dados: { ...T, a_fazer: -3 } })
    expect(within(cartao()).queryByRole('img', { name: /^A fazer no prazo/ })).toBeNull()
    const linhas = within(within(cartao()).getByRole('list', { name: 'Legenda' })).getAllByRole('listitem')
    expect(linhas[4]).toHaveTextContent('A fazer no prazo00%')
  })

  it('Ver em tabela: cada situação com as tarefas e o %', async () => {
    ver({ dados: T })
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Ver em tabela' }))
    const tabela = within(cartao()).getByRole('table', { name: 'Tarefas dos check-lists por situação' })
    const linhas = [...tabela.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))
    expect(linhas[0]).toEqual(['Feitas', '128', '55%'])
    expect(linhas[5]).toEqual(['Atrasadas', '17', '7%'])
  })

  it('consultor: "Check-lists dos meus clientes"; sem check-list, sem tarefa e erro', async () => {
    const { unmount } = ver({ recorte: 'pessoa', dados: { ...T, feitas: 0, nao_se_aplica: 0, andamento: 0, pausadas: 0, a_fazer: 0, atrasadas: 0, checklists: 0 } })
    expect(within(cartao('Check-lists dos meus clientes')).getByText('Nenhum cliente seu com check-list ativo.')).toBeInTheDocument()
    expect(within(cartao('Check-lists dos meus clientes')).queryByRole('group')).toBeNull()
    unmount()
    const { unmount: fechar } = ver({ dados: { ...T, feitas: 0, nao_se_aplica: 0, andamento: 0, pausadas: 0, a_fazer: 0, atrasadas: 0, checklists: 2 } })
    expect(within(cartao()).getByText('Os check-lists ativos ainda não têm tarefas.')).toBeInTheDocument()
    fechar()
    const aoTentarDeNovo = vi.fn()
    ver({ dados: null, erro: true, aoTentarDeNovo })
    expect(within(cartao()).getByRole('alert')).toHaveTextContent('Não foi possível carregar as tarefas dos check-lists.')
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentarDeNovo).toHaveBeenCalled()
  })
})
