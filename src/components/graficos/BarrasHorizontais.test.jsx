import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import BarrasHorizontais from './BarrasHorizontais'

const item = (nome, valor, extra = {}) => ({
  chave: nome, nome, valor, valorTexto: `${Math.round(valor * 100)}%`, aria: `${nome}: ${Math.round(valor * 100)}%`,
  dica: { titulo: nome, linhas: [{ valor: `${Math.round(valor * 100)}%`, rotulo: 'ocupação', cor: 'serie' }] }, ...extra,
})

const desenhar = (props) => render(<MemoryRouter><BarrasHorizontais rotulo="Ocupação por consultor" escalaMax={2} {...props} /></MemoryRouter>)
const linha = (nome) => screen.getByRole('img', { name: new RegExp(`^${nome}:`) }).closest('li')

describe('BarrasHorizontais', () => {
  it('acima do limite: azul até a marca, trecho vermelho depois dela com 2 px de vão, e ícone de alerta', () => {
    desenhar({ marca100: { valor: 1, rotulo: '100%' }, itens: [item('Ana', 1.2), item('Bruno', 0.8)] })
    const ana = linha('Ana')
    const base = ana.querySelector('[data-trecho="base"]')
    const acima = ana.querySelector('[data-trecho="acima"]')
    expect(base).toHaveClass('bg-grafico-serie', 'rounded-none')
    expect(base.style.width).toBe('50%')
    expect(acima).toHaveClass('bg-grafico-acima')
    expect(acima.style.left).toBe('calc(50% + 2px)')
    expect(acima.style.width).toBe('max(2px, 10% - 2px)')
    expect(ana.querySelector('[data-icone="alerta"]')).toHaveClass('text-grafico-acima')
    expect(ana.querySelector('[data-marca-100]').style.left).toBe('50%')
    // Abaixo do limite: uma barra só, sem ícone.
    const bruno = linha('Bruno')
    expect(bruno.querySelector('[data-trecho="acima"]')).toBeNull()
    expect(bruno.querySelector('[data-trecho="base"]').style.width).toBe('40%')
    expect(bruno.querySelector('[data-icone]')).toBeNull()
    // O rótulo da marca em cima das barras.
    expect(screen.getByText('100%', { selector: '[data-rotulo-marca]' })).toBeInTheDocument()
  })

  it('limite e marca de cada item (previsão no período): traço na marca e vermelho depois do limite', () => {
    desenhar({ itens: [item('Conecta', 1.5, { limite: 1, marca: 1 }), item('Fibra', 0.5, { limite: 1, marca: 1 })] })
    expect(linha('Conecta').querySelector('[data-trecho="acima"]')).not.toBeNull()
    expect(linha('Conecta').querySelector('[data-marca]').style.left).toBe('50%')
    expect(linha('Fibra').querySelector('[data-trecho="acima"]')).toBeNull()
  })

  it('folga: âmbar com ícone (seta para baixo)', () => {
    desenhar({ marca100: { valor: 1, rotulo: '100%' }, itens: [item('Carla', 0.5, { tom: 'folga' })] })
    const carla = linha('Carla')
    expect(carla.querySelector('[data-trecho="base"]')).toHaveClass('bg-grafico-folga')
    expect(carla.querySelector('[data-icone="folga"]')).toHaveClass('text-grafico-folga')
  })

  it('separador "… 18 no meio" depois dos 6 primeiros', () => {
    const itens = Array.from({ length: 12 }, (_, i) => item(`P${i}`, 1.4 - i * 0.1))
    desenhar({ itens, separador: { depoisDe: 6, texto: '… 18 no meio' } })
    const linhas = within(screen.getByRole('list', { name: 'Ocupação por consultor' })).getAllByRole('listitem')
    expect(linhas).toHaveLength(13)
    expect(linhas[6]).toHaveTextContent('… 18 no meio')
    expect(linhas[5]).toHaveTextContent('P5')
    expect(linhas[7]).toHaveTextContent('P6')
  })

  it('ação no fim da linha; nome com link e sub embaixo; rodapé', () => {
    desenhar({
      itens: [item('Conecta', 0.9, { href: '/clientes/1', sub: 'Ana Lima', acao: <Button size="icon" aria-label="Fazer check-in em Conecta">+</Button> })],
      rodape: '+ 238 outros clientes · 1.204 h',
    })
    const conecta = linha('Conecta')
    expect(within(conecta).getByRole('link', { name: 'Conecta' })).toHaveAttribute('href', '/clientes/1')
    expect(within(conecta).getByText('Ana Lima')).toHaveClass('text-legenda', 'truncate')
    const acao = within(conecta).getByRole('button', { name: 'Fazer check-in em Conecta' })
    expect(conecta.lastElementChild).toContainElement(acao)
    expect(screen.getByText('+ 238 outros clientes · 1.204 h')).toBeInTheDocument()
  })

  it('nome longo: corta com reticências, inteiro no title e para o leitor de tela', () => {
    const nome = 'Provedor Regional de Internet e Telecomunicações do Vale do Itajaí Ltda.'
    desenhar({ itens: [item(nome, 0.7)] })
    const elemento = screen.getByText(nome, { selector: 'li span' })
    expect(elemento).toHaveClass('truncate')
    expect(elemento).toHaveAttribute('title', nome)
    expect(elemento.textContent).toBe(nome)
  })

  it('variante empilhada: feitas, atrasadas e a fazer, nessa ordem, sem a parte zero', () => {
    desenhar({
      itens: [
        { chave: 'fin', nome: 'Financeiro', valorTexto: '4/12', aria: 'Financeiro: 4 de 12', dica: { titulo: 'Financeiro', linhas: [] },
          partes: [{ valor: 5, tom: 'neutro' }, { valor: 3, tom: 'atrasada' }, { valor: 4, tom: 'feita' }] },
        { chave: 'fis', nome: 'Fiscal', valorTexto: '2/4', aria: 'Fiscal: 2 de 4', dica: { titulo: 'Fiscal', linhas: [] },
          partes: [{ valor: 2, tom: 'feita' }, { valor: 0, tom: 'atrasada' }, { valor: 2, tom: 'neutro' }] },
      ],
    })
    const partes = [...linha('Financeiro').querySelectorAll('[data-parte]')]
    expect(partes.map((p) => p.dataset.parte)).toEqual(['feita', 'atrasada', 'neutro'])
    expect(partes.map((p) => p.style.flexGrow)).toEqual(['4', '3', '5'])
    expect(partes[0]).toHaveClass('bg-grafico-serie')
    expect(partes[1]).toHaveClass('bg-grafico-acima')
    expect(partes[2]).toHaveClass('bg-grafico-neutro')
    expect([...linha('Fiscal').querySelectorAll('[data-parte]')].map((p) => p.dataset.parte)).toEqual(['feita', 'neutro'])
  })

  it('cada barra é focável com aria-label e mostra a dica no foco', async () => {
    desenhar({ marca100: { valor: 1, rotulo: '100%' }, itens: [item('Ana', 1.2), item('Bruno', 0.8)] })
    await userEvent.tab()
    expect(screen.getByRole('img', { name: 'Ana: 120%' })).toHaveFocus()
    expect(within(screen.getByRole('tooltip')).getByText('Ana')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
