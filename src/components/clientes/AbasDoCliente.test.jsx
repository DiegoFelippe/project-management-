import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import AbasDoCliente from './AbasDoCliente'

const ABAS = [
  { id: 'geral', rotulo: 'Geral', conteudo: <p>Conteúdo geral</p> },
  { id: 'checkins', rotulo: 'Check-ins', conteudo: <p>Conteúdo check-ins</p> },
  { id: 'arquivos', rotulo: 'Arquivos', conteudo: <p>Conteúdo arquivos</p> },
]

function Endereco() {
  const { search } = useLocation()
  return <output aria-label="endereço">{search}</output>
}

const tela = (endereco = '/c/1') =>
  renderizarTela(<><AbasDoCliente abas={ABAS} /><Endereco /></>, { perfil: {}, endereco })

describe('AbasDoCliente', () => {
  it('a grade tem coluna encolhível (grid-cols-1): a barra de abas rola dentro dela, não alarga a página', () => {
    const { container } = tela()
    expect(container.querySelector('[role="tablist"]').closest('.grid')).toHaveClass('grid-cols-1')
  })

  it('mostra as abas na ordem, com Geral aberta por padrão', () => {
    tela()
    const abas = screen.getAllByRole('tab')
    expect(abas.map((a) => a.textContent)).toEqual(['Geral', 'Check-ins', 'Arquivos'])
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo geral')
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id)
  })

  it('o painel aberto entra na ordem do Tab', () => {
    tela()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('tabindex', '0')
  })

  it('?aba=arquivos abre Arquivos', () => {
    tela('/c/1?aba=arquivos')
    expect(screen.getByRole('tab', { name: 'Arquivos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo arquivos')
  })

  it('valor desconhecido volta para Geral', () => {
    tela('/c/1?aba=nada')
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true')
  })

  it('trocar de aba muda o endereço', async () => {
    tela()
    await userEvent.click(screen.getByRole('tab', { name: 'Check-ins' }))
    expect(screen.getByLabelText('endereço')).toHaveTextContent('?aba=checkins')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo check-ins')
    await userEvent.click(screen.getByRole('tab', { name: 'Geral' }))
    expect(screen.getByLabelText('endereço')).not.toHaveTextContent('aba=')
  })

  it('o nome da lista de abas é "Seções do cliente", ou o que a página der (rotulo)', () => {
    const { unmount } = tela()
    expect(screen.getByRole('tablist', { name: 'Seções do cliente' })).toBeInTheDocument()
    unmount()
    renderizarTela(<AbasDoCliente abas={ABAS} rotulo="Seções de Check-ins" />, { perfil: {}, endereco: '/checkins' })
    expect(screen.getByRole('tablist', { name: 'Seções de Check-ins' })).toBeInTheDocument()
  })

  it('sem `barra`, as abas ficam soltas (sem cartão nem região), como em Check-ins', () => {
    tela()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(screen.getByRole('tablist').closest('.card')).toBeNull()
  })

  it('com `barra`, abas e ações ficam numa região no cartão da barra de filtros, as ações no fim', () => {
    const { container } = renderizarTela(
      <AbasDoCliente abas={ABAS} barra="Abas e ações do cliente" acoes={<button type="button">Editar</button>} />,
      { perfil: {}, endereco: '/c/1' },
    )
    const regiao = screen.getByRole('region', { name: 'Abas e ações do cliente' })
    expect(regiao).toHaveClass('card', 'flex', 'flex-wrap', 'items-center', 'gap-3', 'p-3')
    expect(regiao).toContainElement(screen.getByRole('tablist', { name: 'Seções do cliente' }))
    const editar = within(regiao).getByRole('button', { name: 'Editar' })
    expect(editar.parentElement).toHaveClass('ml-auto', 'flex-wrap', 'justify-end')
    expect(screen.getByRole('tablist').compareDocumentPosition(editar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // O painel fica fora da barra, abaixo; a grade continua encolhível para as abas rolarem dentro da barra.
    expect(regiao).not.toContainElement(screen.getByRole('tabpanel'))
    expect(regiao.closest('.grid')).toHaveClass('grid-cols-1')
    expect(container.querySelector('.grid > section')).toBe(regiao)
  })

  it('com `barra` e sem ações, o espaço dos botões some (empty:hidden)', () => {
    renderizarTela(<AbasDoCliente abas={ABAS} barra="Abas e ações do cliente" acoes={<>{false}</>} />, { perfil: {}, endereco: '/c/1' })
    const regiao = screen.getByRole('region', { name: 'Abas e ações do cliente' })
    expect(regiao.querySelector('.ml-auto')).toHaveClass('empty:hidden')
    expect(regiao.querySelector('.ml-auto')).toBeEmptyDOMElement()
  })

  it('setas movem a seleção e o foco, com tabindex móvel', async () => {
    tela()
    screen.getByRole('tab', { name: 'Geral' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Check-ins' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Check-ins' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Check-ins' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByLabelText('endereço')).toHaveTextContent('?aba=checkins')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Arquivos' })).toHaveFocus()
  })
})
