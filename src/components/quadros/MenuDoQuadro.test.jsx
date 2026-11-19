import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MenuDoQuadro from './MenuDoQuadro'

const ABERTO = { id: 'q1', nome: 'Sprint', tipo: 'time', arquivado_em: null, pode_administrar: true }

function tela(quadro) {
  const acoes = {
    aoNovo: vi.fn(), aoArquivados: vi.fn(), aoRenomear: vi.fn(), aoArquivar: vi.fn(), aoRestaurar: vi.fn(), aoApagar: vi.fn(),
  }
  render(<MenuDoQuadro quadro={quadro} {...acoes} />)
  return acoes
}

const abrir = async () => {
  const botao = screen.getByRole('button', { name: 'Mais ações do quadro' })
  await userEvent.click(botao)
  return within(screen.getByRole('menu', { name: 'Mais ações do quadro' })).getAllByRole('menuitem').map((i) => i.textContent)
}

describe('MenuDoQuadro', () => {
  it('o "⋯" do cabeçalho é outline e abre um menu (role="menu") com itens animados', async () => {
    tela(ABERTO)
    const botao = screen.getByRole('button', { name: 'Mais ações do quadro' })
    expect(botao).toHaveClass('border', 'botao-animado')
    expect(botao).toHaveAttribute('aria-haspopup', 'menu')
    await abrir()
    for (const item of screen.getAllByRole('menuitem')) expect(item).toHaveClass('botao-animado')
  })

  it('quem administra: Novo quadro, Quadros arquivados, Renomear, Arquivar e Apagar', async () => {
    tela(ABERTO)
    expect(await abrir()).toEqual(['Novo quadro', 'Quadros arquivados', 'Renomear', 'Arquivar', 'Apagar'])
    expect(screen.getByRole('menuitem', { name: 'Apagar' })).toHaveClass('text-destructive')
  })

  it('quem não administra: só Novo quadro e Quadros arquivados', async () => {
    tela({ ...ABERTO, pode_administrar: false })
    expect(await abrir()).toEqual(['Novo quadro', 'Quadros arquivados'])
  })

  it('quadro arquivado: Restaurar no lugar de Renomear e Arquivar (arquivado não se renomeia)', async () => {
    tela({ ...ABERTO, arquivado_em: '2026-11-17T10:00:00Z' })
    expect(await abrir()).toEqual(['Novo quadro', 'Quadros arquivados', 'Restaurar', 'Apagar'])
  })

  it('sem quadro aberto: Novo quadro e Quadros arquivados', async () => {
    tela(null)
    expect(await abrir()).toEqual(['Novo quadro', 'Quadros arquivados'])
  })

  it('escolher um item chama a ação dele', async () => {
    const acoes = tela(ABERTO)
    for (const [rotulo, acao] of [['Novo quadro', 'aoNovo'], ['Quadros arquivados', 'aoArquivados'], ['Renomear', 'aoRenomear'],
      ['Arquivar', 'aoArquivar'], ['Apagar', 'aoApagar']]) {
      await abrir()
      await userEvent.click(screen.getByRole('menuitem', { name: rotulo }))
      expect(acoes[acao]).toHaveBeenCalledTimes(1)
    }
  })
})
