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

// O gatilho vem antes da lista no DOM; com a lista aberta há dois comboboxes (gatilho e busca).
const gatilho = () => screen.getAllByRole('combobox')[0]

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

  it('o gatilho é um combobox: o nome é o rótulo e o valor escolhido é o texto que o leitor de tela anuncia', async () => {
    render(<><Label htmlFor="sel">Responsável</Label><Controlado inicial="b" /></>)
    const campo = screen.getByRole('combobox', { name: 'Responsável' })
    expect(campo).toHaveTextContent('Bruno Lima')
    expect(campo).not.toHaveAttribute('aria-controls')
    await userEvent.click(campo)
    expect(campo).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
  })

  it('clicar numa opção escolhe e fecha', async () => {
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} placeholder="Escolha" />)
    await userEvent.click(gatilho())
    await userEvent.click(screen.getByRole('option', { name: /Carla Dias/ }))
    expect(aoMudar).toHaveBeenCalledWith('c')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('teclado: setas, Home/End, Enter e Esc', async () => {
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} />)
    await userEvent.click(gatilho())
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(aoMudar).toHaveBeenLastCalledWith('b')
    await userEvent.click(gatilho())
    await userEvent.keyboard('{End}{Enter}')
    expect(aoMudar).toHaveBeenLastCalledWith('c')
    await userEvent.click(gatilho())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('ao abrir, a opção escolhida já é a ativa e entra na vista', async () => {
    const rolar = vi.fn()
    Element.prototype.scrollIntoView = rolar
    render(<Controlado inicial="b" />)
    await userEvent.click(gatilho())
    expect(rolar.mock.contexts.at(-1).textContent).toMatch(/Bruno Lima/)
    await userEvent.keyboard('{ArrowDown}{Enter}')
    delete Element.prototype.scrollIntoView
    expect(gatilho()).toHaveTextContent('Carla Dias')
  })

  it('rotuloTodos oferece a opção vazia', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="a" aoMudar={aoMudar} rotuloTodos="Todos os consultores" tamanho="sm" />)
    await userEvent.click(gatilho())
    await userEvent.click(screen.getByRole('option', { name: 'Todos os consultores' }))
    expect(aoMudar).toHaveBeenCalledWith('')
    expect(gatilho()).toHaveTextContent('Todos os consultores')
  })

  it('com buscar: chama o banco com o termo (depois de esperar) e mostra o total', async () => {
    const buscar = vi.fn(async (termo) => ({
      itens: [{ valor: 'x', rotulo: `Resultado ${termo || 'inicial'}` }],
      total: 230,
    }))
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} opcoes={[]} buscar={buscar} />)
    await userEvent.click(gatilho())
    expect(await screen.findByRole('option', { name: 'Resultado inicial' })).toBeInTheDocument()
    expect(buscar).toHaveBeenCalledWith('')
    expect(screen.getByText(/1 de 230/)).toBeInTheDocument()
    expect(screen.getByText(/refine a busca/i)).toBeInTheDocument()

    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar' }), 'mar')
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith('mar'))
    expect(buscar.mock.calls.length).toBeLessThanOrEqual(2)
    await userEvent.click(await screen.findByRole('option', { name: 'Resultado mar' }))
    expect(aoMudar).toHaveBeenCalledWith('x')
    expect(gatilho()).toHaveTextContent('Resultado mar')
  })

  it('com buscar e resultado completo, não pede para refinar', async () => {
    const buscar = async () => ({ itens: [{ valor: 'x', rotulo: 'Só um' }], total: 1 })
    render(<Seletor id="s" valor="" aoMudar={() => {}} opcoes={[]} buscar={buscar} />)
    await userEvent.click(gatilho())
    await screen.findByRole('option', { name: 'Só um' })
    expect(screen.queryByText(/refine a busca/i)).toBeNull()
  })

  it('com buscar que falha: avisa o erro em vez de "Nada encontrado"', async () => {
    const buscar = async () => { throw new Error('rede') }
    render(<Seletor id="s" valor="" aoMudar={() => {}} opcoes={[]} buscar={buscar} />)
    await userEvent.click(gatilho())
    expect(await screen.findByText('Não foi possível carregar as opções.')).toBeInTheDocument()
    expect(screen.queryByText('Nada encontrado')).toBeNull()
  })

  it('dentro de uma janela: clique funciona e Esc fecha só a lista', async () => {
    const aoFechar = vi.fn()
    const aoMudar = vi.fn()
    render(
      <JanelaFormulario aberto aoFechar={aoFechar} titulo="Novo time">
        <Controlado aoMudar={aoMudar} />
      </JanelaFormulario>,
    )
    await userEvent.click(gatilho())
    const dialogo = screen.getByRole('dialog', { name: 'Novo time' })
    expect(dialogo).toContainElement(screen.getByRole('listbox'))
    await userEvent.click(screen.getByRole('option', { name: /Ana Souza/ }))
    expect(aoMudar).toHaveBeenCalledWith('a')
    await userEvent.click(gatilho())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Novo time' })).toBeInTheDocument()
  })

  describe('com buscar: resposta velha e item ativo', () => {
    const pessoas = [{ valor: 'a', rotulo: 'Ana' }, { valor: 'b', rotulo: 'Beto' }, { valor: 'm', rotulo: 'Maria' }]
    const buscaDe = (esperar = {}) => vi.fn((termo) => new Promise((resolve) => {
      const itens = termo ? pessoas.filter((p) => p.rotulo.toLowerCase().includes(termo.toLowerCase())) : pessoas
      if (esperar[termo]) esperar[termo].resolver = () => resolve({ itens, total: itens.length })
      else resolve({ itens, total: itens.length })
    }))

    it('Enter antes da resposta nova não escolhe item do termo velho', async () => {
      const esperar = { mar: {} }
      const buscar = buscaDe(esperar)
      const aoMudar = vi.fn()
      render(<Controlado aoMudar={aoMudar} opcoes={[]} buscar={buscar} />)
      await userEvent.click(gatilho())
      await screen.findByRole('option', { name: 'Ana' })
      await userEvent.type(screen.getByRole('combobox', { name: 'Buscar' }), 'mar{ArrowDown}{Enter}')
      expect(aoMudar).not.toHaveBeenCalled()
      await waitFor(() => expect(buscar).toHaveBeenLastCalledWith('mar'))
      esperar.mar.resolver()
      await screen.findByRole('option', { name: 'Maria' })
      expect(screen.queryByRole('option', { name: 'Ana' })).toBeNull()
      await userEvent.keyboard('{Enter}')
      expect(aoMudar).toHaveBeenCalledWith('m')
    })

    it('reabrir com valor escolhido: Enter mantém o valor, antes e depois da resposta', async () => {
      const esperar = { '': {} }
      const buscar = buscaDe(esperar)
      const aoMudar = vi.fn()
      render(<Controlado inicial="b" aoMudar={aoMudar} opcoes={[{ valor: 'b', rotulo: 'Beto' }]} buscar={buscar} rotuloTodos="Sem filtro" />)
      await userEvent.click(gatilho())
      await userEvent.keyboard('{Enter}')
      expect(aoMudar).not.toHaveBeenCalledWith('')
      expect(screen.queryByRole('listbox')).not.toBeNull()
      esperar[''].resolver()
      await screen.findByRole('option', { name: 'Ana' })
      await userEvent.keyboard('{Enter}')
      expect(gatilho()).toHaveTextContent('Beto')
      expect(aoMudar).not.toHaveBeenCalledWith('')
      expect(aoMudar).not.toHaveBeenCalledWith('a')
    })

    it('reabrir depois de uma busca pede o termo vazio na hora, não o antigo', async () => {
      const buscar = buscaDe()
      render(<Controlado opcoes={[]} buscar={buscar} />)
      await userEvent.click(gatilho())
      await userEvent.type(screen.getByRole('combobox', { name: 'Buscar' }), 'mar')
      await waitFor(() => expect(buscar).toHaveBeenLastCalledWith('mar'))
      await userEvent.keyboard('{Escape}')
      buscar.mockClear()
      await userEvent.click(gatilho())
      await new Promise((r) => setTimeout(r, 400))
      expect(buscar.mock.calls.map((c) => c[0])).toEqual([''])
    })

    it('busca local: depois de digitar, o primeiro resultado já está ativo', async () => {
      const muitas = Array.from({ length: 10 }, (_, i) => ({ valor: `v${i}`, rotulo: `Pessoa ${i}` }))
      const aoMudar = vi.fn()
      render(<Seletor id="s" valor="" aoMudar={aoMudar} opcoes={muitas} />)
      await userEvent.click(gatilho())
      await userEvent.type(screen.getByRole('combobox', { name: 'Buscar' }), 'pessoa 7{Enter}')
      expect(aoMudar).toHaveBeenCalledWith('v7', expect.anything())
    })
  })
})

describe('Seletor: contraste da opção escolhida', () => {
  it('a opção escolhida fica no azul de realce (text-primary-texto, 4,5:1 sobre o azul-claro), não no text-primary', async () => {
    render(<Seletor id="s" valor="b" aoMudar={() => {}} opcoes={OPCOES} />)
    await userEvent.click(screen.getByRole('combobox'))
    const escolhida = screen.getByRole('option', { name: 'Bruno Lima' })
    expect(escolhida.className).toMatch(/bg-primary\/10|bg-accent/) // escolhida (e, ao abrir, também a ativa)
    expect(screen.getAllByText('Bruno Lima').find((el) => escolhida.contains(el))).toHaveClass('text-primary-texto')
    expect(escolhida.innerHTML).not.toMatch(/text-primary(?![-\w])/)
  })

  describe('multiplo (várias de uma vez: usabilidade, U7)', () => {
    function Varias({ aoMudar = () => {}, ...props }) {
      const [valores, setValores] = useState([])
      return <Seletor id="sel" multiplo valor={valores} aoMudar={(v, opcao) => { setValores(v); aoMudar(v, opcao) }} opcoes={OPCOES} placeholder="Escolha as pessoas" {...props} />
    }

    it('a lista continua aberta: cada clique marca ou desmarca, e o aoMudar recebe a lista e a opção', async () => {
      const aoMudar = vi.fn()
      render(<><Label htmlFor="sel">Pessoas</Label><Varias aoMudar={aoMudar} /></>)
      await userEvent.click(screen.getByLabelText('Pessoas'))
      expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true')
      await userEvent.click(screen.getByRole('option', { name: /Ana Souza/ }))
      await userEvent.click(screen.getByRole('option', { name: /Carla Dias/ }))
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(aoMudar).toHaveBeenLastCalledWith(['a', 'c'], expect.objectContaining({ valor: 'c' }))
      expect(screen.getByRole('option', { name: /Ana Souza/ })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('option', { name: /Bruno Lima/ })).toHaveAttribute('aria-selected', 'false')
      await userEvent.click(screen.getByRole('option', { name: /Ana Souza/ }))
      expect(aoMudar).toHaveBeenLastCalledWith(['c'], expect.objectContaining({ valor: 'a' }))
    })

    it('o gatilho diz quantas foram escolhidas; nenhuma, o placeholder', async () => {
      render(<><Label htmlFor="sel">Pessoas</Label><Varias /></>)
      const campo = screen.getByLabelText('Pessoas')
      expect(campo).toHaveTextContent('Escolha as pessoas')
      await userEvent.click(campo)
      await userEvent.click(screen.getByRole('option', { name: /Ana Souza/ }))
      await userEvent.click(screen.getByRole('option', { name: /Bruno Lima/ }))
      await userEvent.keyboard('{Escape}')
      expect(campo).toHaveTextContent('2 escolhidas')
    })

    it('com busca no banco: Enter marca a opção ativa e a lista continua aberta', async () => {
      const buscar = vi.fn().mockResolvedValue({ itens: OPCOES, total: 3 })
      const aoMudar = vi.fn()
      render(<><Label htmlFor="sel">Pessoas</Label><Varias buscar={buscar} opcoes={[]} aoMudar={aoMudar} /></>)
      await userEvent.click(screen.getByLabelText('Pessoas'))
      await screen.findByRole('option', { name: /Ana Souza/ })
      await userEvent.keyboard('{ArrowDown}{Enter}')
      expect(aoMudar).toHaveBeenLastCalledWith(['a'], expect.objectContaining({ valor: 'a' }))
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })
  })
})
