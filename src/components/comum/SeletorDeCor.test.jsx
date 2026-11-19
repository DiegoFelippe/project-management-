import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SeletorDeCor from './SeletorDeCor'

// Um seletor de cor só (auditoria de 17/11, C6): avatar, evento e coluna do quadro passam a lista de cores.
const PELO_HEX = [
  { valor: 0, nome: 'Azul', fundo: '#2563eb' },
  { valor: 1, nome: 'Verde', fundo: '#047857' },
  { valor: 2, nome: 'Rosa', fundo: '#db2777' },
]
const PELA_CLASSE = [
  { valor: 0, nome: 'Cinza', classe: 'bg-slate-400' },
  { valor: 1, nome: 'Índigo', classe: 'bg-indigo-500' },
]

function Controlado({ inicial = null, aoMudar = () => {}, ...props }) {
  const [valor, setValor] = useState(inicial)
  return <SeletorDeCor valor={valor} aoMudar={(v) => { setValor(v); aoMudar(v) }} {...props} />
}

describe('SeletorDeCor', () => {
  it('as cores da lista num radiogroup com o rótulo; a escolhida marcada e só ela na ordem do Tab', () => {
    render(<SeletorDeCor rotulo="Cor do evento" cores={PELO_HEX} valor={1} aoMudar={() => {}} />)
    const grupo = screen.getByRole('radiogroup', { name: 'Cor do evento' })
    expect(within(grupo).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Azul', 'Verde', 'Rosa'])
    expect(within(grupo).getByRole('radio', { name: 'Verde' })).toBeChecked()
    expect(within(grupo).getByRole('radio', { name: 'Verde' })).toHaveAttribute('tabindex', '0')
    expect(within(grupo).getByRole('radio', { name: 'Azul' })).toHaveAttribute('tabindex', '-1')
    expect(within(grupo).getByRole('radio', { name: 'Azul' })).toHaveStyle({ backgroundColor: '#2563eb' })
    expect(screen.getByText('Cor do evento')).toBeVisible()
  })

  it('a cor pode vir da classe (as do quadro) e o rótulo pode ficar só para o leitor de tela', () => {
    render(<SeletorDeCor rotulo="Cor da coluna" mostrarRotulo={false} cores={PELA_CLASSE} valor={0} aoMudar={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Índigo' })).toHaveClass('bg-indigo-500')
    expect(screen.getByText('Cor da coluna')).toHaveClass('sr-only')
  })

  it('a classe que traz o texto vence o branco do check (o mostarda cheio leva tinta escura)', () => {
    render(<SeletorDeCor rotulo="Cor" cores={[{ valor: 0, nome: 'Amarelo', classe: 'bg-cor-mostarda-cheio text-cor-mostarda-sobre' }]} valor={0} aoMudar={() => {}} />)
    const amostra = screen.getByRole('radio', { name: 'Amarelo' })
    expect(amostra).toHaveClass('text-cor-mostarda-sobre')
    expect(amostra).not.toHaveClass('text-white')
  })

  it('clicar escolhe; com `automatica`, a opção sem cor (null) vem no fim', async () => {
    const aoMudar = vi.fn()
    render(<Controlado rotulo="Cor do avatar" cores={PELO_HEX} automatica={{ rotulo: 'Automática', titulo: 'A que o sistema escolhe' }} aoMudar={aoMudar} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.at(-1)).toHaveAccessibleName('Automática')
    expect(screen.getByRole('radio', { name: 'Automática' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Rosa' }))
    expect(aoMudar).toHaveBeenLastCalledWith(2)
    expect(screen.getByRole('radio', { name: 'Rosa' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Automática' }))
    expect(aoMudar).toHaveBeenLastCalledWith(null)
  })

  it('setas, Home e End escolhem e levam o foco (dando a volta)', async () => {
    const aoMudar = vi.fn()
    render(<Controlado rotulo="Cor" cores={PELO_HEX} inicial={0} aoMudar={aoMudar} />)
    screen.getByRole('radio', { name: 'Azul' }).focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(aoMudar).toHaveBeenLastCalledWith(2)
    expect(screen.getByRole('radio', { name: 'Rosa' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('radio', { name: 'Azul' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('radio', { name: 'Rosa' })).toBeChecked()
  })

  it('marcarAoAndar={false} (grava na hora, como a coluna do quadro): as setas só levam o foco; Enter escolhe', async () => {
    const aoMudar = vi.fn()
    render(<Controlado rotulo="Cor da coluna" cores={PELA_CLASSE} inicial={0} automatica={{ rotulo: 'Automática, pela posição' }}
      marcarAoAndar={false} aoMudar={aoMudar} />)
    screen.getByRole('radio', { name: 'Cinza' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Índigo' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Automática, pela posição' })).toHaveFocus()
    expect(aoMudar).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    expect(aoMudar).toHaveBeenCalledWith(null)
  })

  it('animado como os botões e com 44 px no toque', () => {
    render(<SeletorDeCor rotulo="Cor" cores={PELO_HEX} valor={0} automatica={{ rotulo: 'Automática' }} aoMudar={() => {}} />)
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveClass('botao-animado')
      expect(radio.className).toMatch(/pointer-coarse:(size|min-h)-11/)
    }
  })
})
