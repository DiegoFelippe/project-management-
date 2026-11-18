import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Palette, Pencil, Trash2 } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import MenuDeAcoes from './MenuDeAcoes'

// Menu "⋯" (auditoria de 17/11, M5): um botão sempre à vista que abre as ações num menu, pelo mouse, pelo toque e pelo
// teclado (padrão de botão de menu do WAI-ARIA).
function tela({ renomear = vi.fn(), pintar = vi.fn(), apagar = vi.fn() } = {}) {
  render(
    <>
      <MenuDeAcoes rotulo="Ações da coluna A fazer" itens={[
        { rotulo: 'Renomear', icone: Pencil, aoEscolher: renomear },
        { rotulo: 'Cor', icone: Palette, aoEscolher: pintar },
        { rotulo: 'Apagar coluna', icone: Trash2, aoEscolher: apagar, perigo: true },
      ]} />
      <button type="button" className="botao-animado">Depois</button>
    </>,
  )
  return { renomear, pintar, apagar, botao: screen.getByRole('button', { name: 'Ações da coluna A fazer' }) }
}

const menu = () => screen.getByRole('menu', { name: 'Ações da coluna A fazer' })
const itens = () => within(menu()).getAllByRole('menuitem')

describe('MenuDeAcoes', () => {
  it('fechado, é só o botão "⋯" (com o nome das ações); o clique abre o menu com os itens e o foco no primeiro', async () => {
    const { botao } = tela()
    expect(botao).toHaveAttribute('aria-haspopup', 'menu')
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    expect(itens().map((i) => i.textContent)).toEqual(['Renomear', 'Cor', 'Apagar coluna'])
    expect(itens()[0]).toHaveFocus()
    expect(botao).toHaveAttribute('aria-controls', menu().id)
  })

  it('escolher um item roda a ação dele e fecha o menu', async () => {
    const { pintar, renomear } = tela()
    await userEvent.click(screen.getByRole('button', { name: 'Ações da coluna A fazer' }))
    await userEvent.click(within(menu()).getByRole('menuitem', { name: 'Cor' }))
    expect(pintar).toHaveBeenCalledTimes(1)
    expect(renomear).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('teclado: seta para baixo abre no primeiro, para cima no último; setas, Home e End andam; Enter escolhe', async () => {
    const { botao, apagar } = tela()
    botao.focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(itens()[2]).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(itens()[0]).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(itens()[2]).toHaveFocus()
    await userEvent.keyboard('{Home}{ArrowUp}')
    expect(itens()[2]).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(apagar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('Esc e Tab fecham e devolvem o foco ao botão; o clique fora também fecha', async () => {
    const { botao } = tela()
    await userEvent.click(botao)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(botao).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(menu()).toBeInTheDocument()
    await userEvent.tab()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(botao).toHaveFocus()
    await userEvent.click(botao)
    await userEvent.click(screen.getByRole('button', { name: 'Depois' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('o item de perigo fica vermelho; os itens animam e têm 44 px no toque', async () => {
    tela()
    await userEvent.click(screen.getByRole('button', { name: 'Ações da coluna A fazer' }))
    expect(within(menu()).getByRole('menuitem', { name: 'Apagar coluna' })).toHaveClass('text-destructive')
    for (const item of itens()) {
      expect(item).toHaveClass('botao-animado')
      expect(item.className).toContain('pointer-coarse:min-h-11')
    }
  })
})
