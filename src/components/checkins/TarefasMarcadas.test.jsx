import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TarefasMarcadas from './TarefasMarcadas'

const TAREFAS = [{ tarefa_id: 't1', titulo: 'Análise do DRE' }, { tarefa_id: 't2', titulo: 'Mapa de custos' }]

describe('TarefasMarcadas', () => {
  it('um chip por tarefa, na ordem que veio', () => {
    render(<TarefasMarcadas tarefas={TAREFAS} rotulo="Nesta sessão" />)
    const lista = screen.getByRole('list', { name: 'Nesta sessão' })
    expect(within(lista).getAllByRole('listitem').map((i) => i.textContent)).toEqual(['Análise do DRE', 'Mapa de custos'])
  })

  it('"+N" quando há mais do que as mostradas, com um nome que se lê ("mais N tarefas marcadas")', () => {
    render(<TarefasMarcadas tarefas={TAREFAS} total={5} rotulo="Tarefas marcadas" />)
    const resto = screen.getByRole('listitem', { name: 'mais 3 tarefas marcadas' })
    expect(resto).toHaveTextContent('+3')
    render(<TarefasMarcadas tarefas={TAREFAS.slice(0, 1)} total={2} rotulo="Outra" />)
    expect(screen.getByRole('listitem', { name: 'mais 1 tarefa marcada' })).toHaveTextContent('+1')
  })
})
