import { screen } from '@testing-library/react'
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
})
