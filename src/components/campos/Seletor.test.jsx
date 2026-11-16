import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Label } from '@/components/ui/label'
import Seletor from './Seletor'

const OPCOES = [
  { valor: 'a', rotulo: 'Ana Souza', detalhe: 'ana@x.com' },
  { valor: 'b', rotulo: 'Bruno Lima' },
  { valor: 'c', rotulo: 'Carla Dias' },
]

function Controlado({ inicial = '', aoMudar = () => {}, ...props }) {
  const [valor, setValor] = useState(inicial)
  return <Seletor id="sel" valor={valor} aoMudar={(v) => { setValor(v); aoMudar(v) }} opcoes={OPCOES} {...props} />
}

describe('Seletor', () => {
  it('rótulo associado, trigger com aria e lista com options', async () => {
    render(<><Label htmlFor="sel">Responsável</Label><Controlado inicial="b" /></>)
    const campo = screen.getByLabelText('Responsável')
    expect(campo).toHaveAttribute('aria-haspopup', 'listbox')
    expect(campo).toHaveAttribute('aria-expanded', 'false')
    expect(campo).toHaveTextContent('Bruno Lima')
    await userEvent.click(campo)
    expect(campo).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Bruno Lima/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Ana Souza/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('clicar numa opção escolhe e fecha', async () => {
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} placeholder="Escolha" />)
    await userEvent.click(screen.getByRole('button', { name: /Escolha/ }))
    await userEvent.click(screen.getByRole('option', { name: /Carla Dias/ }))
    expect(aoMudar).toHaveBeenCalledWith('c')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('teclado: setas, Home/End, Enter e Esc', async () => {
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(aoMudar).toHaveBeenLastCalledWith('b')
    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{End}{Enter}')
    expect(aoMudar).toHaveBeenLastCalledWith('c')
    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('rotuloTodos oferece a opção vazia', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="a" aoMudar={aoMudar} rotuloTodos="Todos os consultores" tamanho="sm" />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.click(screen.getByRole('option', { name: 'Todos os consultores' }))
    expect(aoMudar).toHaveBeenCalledWith('')
    expect(screen.getByRole('button')).toHaveTextContent('Todos os consultores')
  })

  it('com buscar: chama o banco com o termo (depois de esperar) e mostra o total', async () => {
    const buscar = vi.fn(async (termo) => ({
      itens: [{ valor: 'x', rotulo: `Resultado ${termo || 'inicial'}` }],
      total: 230,
    }))
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} opcoes={[]} buscar={buscar} />)
    await userEvent.click(screen.getByRole('button'))
    expect(await screen.findByRole('option', { name: 'Resultado inicial' })).toBeInTheDocument()
    expect(buscar).toHaveBeenCalledWith('')
    expect(screen.getByText(/1 de 230/)).toBeInTheDocument()
    expect(screen.getByText(/refine a busca/i)).toBeInTheDocument()

    await userEvent.type(screen.getByRole('combobox'), 'mar')
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith('mar'))
    expect(buscar.mock.calls.length).toBeLessThanOrEqual(2)
    await userEvent.click(await screen.findByRole('option', { name: 'Resultado mar' }))
    expect(aoMudar).toHaveBeenCalledWith('x')
    expect(screen.getByRole('button')).toHaveTextContent('Resultado mar')
  })

  it('com buscar e resultado completo, não pede para refinar', async () => {
    const buscar = async () => ({ itens: [{ valor: 'x', rotulo: 'Só um' }], total: 1 })
    render(<Seletor id="s" valor="" aoMudar={() => {}} opcoes={[]} buscar={buscar} />)
    await userEvent.click(screen.getByRole('button'))
    await screen.findByRole('option', { name: 'Só um' })
    expect(screen.queryByText(/refine a busca/i)).toBeNull()
  })

  it('dentro de uma janela: clique funciona e Esc fecha só a lista', async () => {
    const aoFechar = vi.fn()
    const aoMudar = vi.fn()
    render(
      <JanelaFormulario aberto aoFechar={aoFechar} titulo="Novo time">
        <Controlado aoMudar={aoMudar} />
      </JanelaFormulario>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Selecione|Escolher/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Novo time' })
    expect(dialogo).toContainElement(screen.getByRole('listbox'))
    await userEvent.click(screen.getByRole('option', { name: /Ana Souza/ }))
    expect(aoMudar).toHaveBeenCalledWith('a')
    await userEvent.click(screen.getByRole('button', { name: /Ana Souza/ }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Novo time' })).toBeInTheDocument()
  })
})
