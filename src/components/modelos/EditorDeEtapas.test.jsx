import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'
import EditorDeEtapas from './EditorDeEtapas'
import { rascunhoDe } from './modelo'

const MODELO = {
  id: 'm1', nome: 'Gestão financeira', descricao: null, tipo: null, da_central: true, consultoria: null,
  etapas: [
    { id: 'e1', nome: 'Diagnóstico', posicao: 1, tarefas: [
      { id: 't1', titulo: 'Reunião de início', descricao: null, obrigatoria: true, prazo_dias: 2, posicao: 1, depende_de: [] },
      { id: 't2', titulo: 'Análise do DRE', descricao: null, obrigatoria: true, prazo_dias: 10, posicao: 2, depende_de: ['t1'] },
    ] },
    { id: 'e2', nome: 'Plano', posicao: 2, tarefas: [
      { id: 't3', titulo: 'Plano de ação', descricao: null, obrigatoria: false, prazo_dias: 20, posicao: 3, depende_de: ['t2'] },
    ] },
  ],
}

let atual
function Harness({ inicial, erros }) {
  const [rascunho, setRascunho] = useState(inicial)
  useEffect(() => { atual = rascunho }, [rascunho])
  return <EditorDeEtapas rascunho={rascunho} mudar={setRascunho} erros={erros} />
}
const montar = ({ inicial = rascunhoDe(MODELO), erros = null } = {}) => render(<Harness inicial={inicial} erros={erros} />)
const etapa = (n) => screen.getByRole('region', { name: `Etapa ${n}` })
const tarefa = (n) => screen.getByRole('listitem', { name: `Tarefa ${n}` })
const titulosDa = (n) => within(etapa(n)).queryAllByRole('listitem').map((li) => within(li).getByLabelText(/^Título da tarefa/).value)

describe('EditorDeEtapas', () => {
  it('as etapas na ordem, numeradas, com as tarefas numeradas na ordem do modelo inteiro', () => {
    montar()
    expect(within(etapa(1)).getByLabelText('Nome da etapa 1')).toHaveValue('Diagnóstico')
    expect(within(etapa(1)).getByText('2 tarefas')).toBeInTheDocument()
    expect(titulosDa(1)).toEqual(['Reunião de início', 'Análise do DRE'])
    expect(within(etapa(2)).getByLabelText('Título da tarefa 3')).toHaveValue('Plano de ação')
    expect(within(tarefa(3)).getByRole('switch', { name: 'Obrigatória (tarefa 3)' })).toHaveAttribute('aria-checked', 'false')
    expect(within(tarefa(3)).getByLabelText('Prazo: dia (tarefa 3)')).toHaveValue('20')
  })

  it('subir e descer atravessam etapas; o foco fica no botão da mesma tarefa; nas pontas, desligados', async () => {
    montar()
    expect(screen.getByRole('button', { name: 'Subir a tarefa 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descer a tarefa 3' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Subir a tarefa 3' }))
    expect(titulosDa(1)).toEqual(['Reunião de início', 'Análise do DRE', 'Plano de ação'])
    expect(titulosDa(2)).toEqual([])
    expect(within(etapa(2)).getByText('Nenhuma tarefa')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir a tarefa 3' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Descer a tarefa 2' }))
    expect(titulosDa(1)).toEqual(['Reunião de início', 'Plano de ação', 'Análise do DRE'])
    expect(screen.getByRole('button', { name: 'Descer a tarefa 3' })).toHaveFocus()
  })

  it('subir uma tarefa para antes da sua dependência marca o erro na tarefa na hora', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Subir a tarefa 2' }))
    const movida = tarefa(1)
    expect(within(movida).getByLabelText('Título da tarefa 1')).toHaveValue('Análise do DRE')
    expect(within(movida).getByRole('alert')).toHaveTextContent('Depende de uma tarefa que agora vem depois dela. Mova uma das duas ou tire a dependência.')
    expect(within(movida).getByText('2 · Reunião de início').closest('[data-chip]')).toHaveAttribute('data-invalida')
    expect(movida).toHaveAttribute('data-erro')
  })

  it('"Depende de" só oferece as tarefas que vêm antes, por etapa', async () => {
    montar()
    await userEvent.click(within(tarefa(3)).getByRole('button', { name: 'Adicionar' }))
    const escolha = screen.getByRole('dialog', { name: 'Depende de' })
    expect(escolha).toHaveTextContent('"Plano de ação" só pode ser marcada depois de:')
    expect(within(escolha).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['1 · Reunião de início', '2 · Análise do DRE'])
    expect(within(escolha).getByRole('checkbox', { name: '2 · Análise do DRE' })).toBeChecked()
    await userEvent.click(within(escolha).getByRole('checkbox', { name: '1 · Reunião de início' }))
    expect(atual.etapas[1].tarefas[0].depende_de).toEqual(['t2', 't1'])
    expect(within(tarefa(3)).getByText('1 · Reunião de início')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(within(tarefa(1)).getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByRole('dialog', { name: 'Depende de' })).toHaveTextContent('Esta é a primeira tarefa: não há nada antes dela.')
  })

  it('o X do chip tira a dependência', async () => {
    montar()
    await userEvent.click(within(tarefa(2)).getByRole('button', { name: 'Tirar a dependência de "Reunião de início"' }))
    expect(atual.etapas[0].tarefas[1].depende_de).toEqual([])
    expect(within(tarefa(2)).queryByText('1 · Reunião de início')).not.toBeInTheDocument()
  })

  it('apagar etapa com tarefas pede confirmação dizendo o que sai; Manter desiste', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a etapa 1' }))
    expect(within(etapa(1)).getByRole('alert')).toHaveTextContent('Apagar a etapa "Diagnóstico" e 2 tarefas dela? As dependências para essas tarefas também saem.')
    expect(within(etapa(1)).getByRole('button', { name: 'Manter' })).toHaveFocus()
    await userEvent.click(within(etapa(1)).getByRole('button', { name: 'Manter' }))
    expect(within(etapa(1)).queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a etapa 1' }))
    await userEvent.click(within(etapa(1)).getByRole('button', { name: 'Apagar etapa' }))
    expect(screen.getAllByRole('region').map((r) => within(r).getByLabelText(/^Nome da etapa/).value)).toEqual(['Plano'])
    expect(atual.etapas[0].tarefas[0].depende_de).toEqual([])
  })

  it('etapa sem tarefas sai sem perguntar', async () => {
    const inicial = rascunhoDe(MODELO)
    inicial.etapas.push({ id: 'e3', nome: 'Vazia', tarefas: [] })
    montar({ inicial })
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a etapa 3' }))
    expect(screen.queryByRole('region', { name: 'Etapa 3' })).not.toBeInTheDocument()
  })

  it('apagar tarefa de que outras dependem pede confirmação dizendo quais perdem a dependência; sem dependentes, sai direto', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a tarefa 2' }))
    expect(within(tarefa(2)).getByRole('alert')).toHaveTextContent('Apagar "Análise do DRE"? "Plano de ação" deixa de depender dela.')
    await userEvent.click(within(tarefa(2)).getByRole('button', { name: 'Apagar tarefa' }))
    expect(titulosDa(1)).toEqual(['Reunião de início'])
    expect(atual.etapas[1].tarefas[0].depende_de).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a tarefa 2' }))
    expect(screen.queryByRole('listitem', { name: 'Tarefa 2' })).not.toBeInTheDocument()
  })

  it('Nova etapa e Tarefa nesta etapa: o foco vai para o campo novo', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Nova etapa' }))
    expect(screen.getByLabelText('Nome da etapa 3')).toHaveFocus()
    expect(within(etapa(3)).getByLabelText('Título da tarefa 4')).toHaveValue('')
    await userEvent.click(within(etapa(1)).getByRole('button', { name: 'Tarefa nesta etapa' }))
    expect(screen.getByLabelText('Título da tarefa 3')).toHaveFocus()
    expect(titulosDa(1)).toEqual(['Reunião de início', 'Análise do DRE', ''])
  })

  it('subir e descer a etapa', async () => {
    montar()
    expect(screen.getByRole('button', { name: 'Subir a etapa 1' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Descer a etapa 1' }))
    expect(atual.etapas.map((e) => e.nome)).toEqual(['Plano', 'Diagnóstico'])
  })

  it('título, descrição, obrigatória e prazo mudam só aquela tarefa', async () => {
    montar()
    const antes = atual.etapas[0].tarefas[0]
    await userEvent.type(screen.getByLabelText('Título da tarefa 3'), ' final')
    await userEvent.type(screen.getByLabelText('Descrição da tarefa 3'), 'Com o cliente')
    await userEvent.click(screen.getByRole('switch', { name: 'Obrigatória (tarefa 3)' }))
    const prazo = screen.getByLabelText('Prazo: dia (tarefa 3)')
    await userEvent.clear(prazo)
    await userEvent.type(prazo, '25')
    expect(atual.etapas[1].tarefas[0]).toMatchObject({ titulo: 'Plano de ação final', descricao: 'Com o cliente', obrigatoria: true, prazo_dias: '25' })
    expect(atual.etapas[0].tarefas[0]).toBe(antes)
    await userEvent.clear(screen.getByLabelText('Nome da etapa 2'))
    await userEvent.type(screen.getByLabelText('Nome da etapa 2'), 'Execução')
    expect(atual.etapas[1].nome).toBe('Execução')
  })

  it('os erros do último Salvar destacam a etapa e a tarefa', () => {
    const inicial = rascunhoDe(MODELO)
    inicial.etapas[0].tarefas[0].titulo = ''
    montar({ inicial, erros: { etapas: new Set(['e2']), tarefas: new Set(['t1']) } })
    expect(screen.getByLabelText('Título da tarefa 1')).toHaveAttribute('aria-invalid', 'true')
    expect(tarefa(1)).toHaveAttribute('data-erro')
    expect(etapa(2)).toHaveAttribute('data-erro')
    expect(tarefa(2)).not.toHaveAttribute('data-erro')
  })
})
