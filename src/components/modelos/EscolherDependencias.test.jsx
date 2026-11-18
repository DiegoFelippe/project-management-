import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import EscolherDependencias from './EscolherDependencias'

const GRUPOS = [
  { etapa: { id: 'e1', nome: 'Diagnóstico', numero: 1 }, tarefas: [
    { id: 't1', ordem: 1, titulo: 'Reunião de início' }, { id: 't2', ordem: 2, titulo: 'Análise do DRE' }] },
  { etapa: { id: 'e2', nome: '', numero: 2 }, tarefas: [{ id: 't3', ordem: 3, titulo: '' }] },
]

function montar(props = {}) {
  const aoAlternar = vi.fn()
  const aoTirar = vi.fn()
  render(
    <EscolherDependencias id="dep" titulo="Plano de ação" marcadas={['t2']} anteriores={() => GRUPOS}
      chips={[{ id: 't2', ordem: 2, titulo: 'Análise do DRE', invalida: false }]} aoAlternar={aoAlternar} aoTirar={aoTirar} {...props} />,
  )
  return { aoAlternar, aoTirar }
}

describe('EscolherDependencias', () => {
  it('chips das dependências com o X para tirar; a que vem depois fica marcada', async () => {
    const { aoTirar } = montar({ chips: [
      { id: 't2', ordem: 2, titulo: 'Análise do DRE', invalida: false }, { id: 't9', ordem: 9, titulo: '', invalida: true }] })
    expect(screen.getByText('2 · Análise do DRE').closest('[data-chip]')).not.toHaveAttribute('data-invalida')
    const invalida = screen.getByText('9 · Sem título').closest('[data-chip]')
    expect(invalida).toHaveAttribute('data-invalida')
    expect(invalida).toHaveAttribute('title', 'Esta tarefa vem depois: mova uma das duas ou tire a dependência.')
    await userEvent.click(screen.getByRole('button', { name: 'Tirar a dependência de "Análise do DRE"' }))
    expect(aoTirar).toHaveBeenCalledWith('t2')
  })

  it('Adicionar abre as tarefas de antes, agrupadas por etapa, com as marcadas ligadas', async () => {
    const { aoAlternar } = montar()
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    const escolha = screen.getByRole('dialog', { name: 'Depende de' })
    expect(within(escolha).getByText('1 · Diagnóstico')).toBeInTheDocument()
    expect(within(escolha).getByText('2 · Etapa sem nome')).toBeInTheDocument()
    expect(within(escolha).getByRole('checkbox', { name: '2 · Análise do DRE' })).toBeChecked()
    expect(within(escolha).getByRole('checkbox', { name: '1 · Reunião de início' })).not.toBeChecked()
    expect(within(escolha).getByRole('checkbox', { name: '3 · Sem título' })).toBeInTheDocument()
    await userEvent.click(within(escolha).getByRole('checkbox', { name: '1 · Reunião de início' }))
    expect(aoAlternar).toHaveBeenCalledWith('t1')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Depende de' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar' })).toHaveFocus()
  })

  it('a primeira tarefa não tem nada antes', async () => {
    montar({ anteriores: () => [], marcadas: [], chips: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByRole('dialog', { name: 'Depende de' })).toHaveTextContent(
      'Esta é a primeira tarefa: não há nada antes dela. Só tarefas que vêm antes na lista podem ser dependências.')
  })

  it('com muitas tarefas antes, a busca filtra pelo título (sem acento)', async () => {
    const muitas = [{ etapa: { id: 'e1', nome: 'E', numero: 1 }, tarefas: Array.from({ length: 12 }, (_, i) => (
      { id: `t${i}`, ordem: i + 1, titulo: i === 7 ? 'Análise do balanço' : `Tarefa ${i + 1}` })) }]
    montar({ anteriores: () => muitas, marcadas: [], chips: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    const escolha = screen.getByRole('dialog', { name: 'Depende de' })
    expect(within(escolha).getAllByRole('checkbox')).toHaveLength(12)
    await userEvent.type(within(escolha).getByRole('searchbox', { name: 'Buscar tarefa' }), 'analise')
    expect(within(escolha).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['8 · Análise do balanço'])
  })

  it('no limite de 30 dependências, as outras ficam desligadas', async () => {
    const muitas = [{ etapa: { id: 'e1', nome: 'E', numero: 1 }, tarefas: Array.from({ length: 31 }, (_, i) => (
      { id: `t${i}`, ordem: i + 1, titulo: `Tarefa ${i + 1}` })) }]
    montar({ anteriores: () => muitas, marcadas: muitas[0].tarefas.slice(0, 30).map((t) => t.id), chips: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    const escolha = screen.getByRole('dialog', { name: 'Depende de' })
    expect(within(escolha).getByRole('checkbox', { name: '31 · Tarefa 31' })).toBeDisabled()
    expect(within(escolha).getByRole('checkbox', { name: '1 · Tarefa 1' })).toBeEnabled()
    expect(escolha).toHaveTextContent('Até 30 dependências por tarefa.')
  })
})
