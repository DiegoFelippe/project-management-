import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Quadradinhos from './Quadradinhos'
import { COR_OUTROS, corDaSerie } from './cores'

const GRUPOS = [
  { nome: 'Chapecó/SC', n: 22, cor: corDaSerie(0) },
  { nome: 'Xanxerê/SC', n: 12, cor: corDaSerie(1) },
  { nome: 'Outras', n: 7, cor: COR_OUTROS },
]

describe('Quadradinhos', () => {
  it('um quadradinho por item, na cor do grupo, numa imagem com o resumo', () => {
    render(<Quadradinhos rotulo="Clientes por cidade" grupos={GRUPOS} />)
    const imagem = screen.getByRole('img', { name: 'Clientes por cidade: Chapecó/SC 22 (54%), Xanxerê/SC 12 (29%), Outras 7 (17%). Use as setas para percorrer os grupos.' })
    const quadradinhos = [...imagem.querySelectorAll('[data-quadradinho]')]
    expect(quadradinhos).toHaveLength(41)
    expect(quadradinhos[0].style.background).toBe('var(--cor-azul-forte)')
    expect(quadradinhos[21].style.background).toBe('var(--cor-azul-forte)')
    expect(quadradinhos[22].style.background).toBe('var(--cor-turquesa-forte)')
    expect(quadradinhos[40].style.background).toBe('var(--cor-grafite-forte)')
    // Entram em cascata.
    expect(quadradinhos[5]).toHaveClass('grafico-cascata')
    expect(quadradinhos[5].style.getPropertyValue('--i')).toBe('5')
  })

  it('a legenda tem o número e o % de cada grupo; nome longo corta e vai inteiro no title', () => {
    const nome = 'São Miguel do Oeste e região do Extremo Oeste/SC'
    render(<Quadradinhos rotulo="Clientes por cidade" grupos={[{ ...GRUPOS[0], nome }, ...GRUPOS.slice(1)]} />)
    const linhas = within(screen.getByRole('list', { name: 'Legenda' })).getAllByRole('listitem')
    expect(linhas.map((l) => l.textContent)).toEqual([`${nome}2254%`, 'Xanxerê/SC1229%', 'Outras717%'])
    const nomeNaLegenda = screen.getByText(nome)
    expect(nomeNaLegenda).toHaveClass('truncate')
    expect(nomeNaLegenda).toHaveAttribute('title', nome)
  })

  it('mais de 100 itens: 100 quadradinhos, cada um 1% (somando 100), e a legenda com os números de verdade', () => {
    render(<Quadradinhos rotulo="Clientes por cidade" grupos={[
      { nome: 'A', n: 1001, cor: corDaSerie(0) }, { nome: 'B', n: 999, cor: corDaSerie(1) }, { nome: 'C', n: 3, cor: COR_OUTROS },
    ]} />)
    const imagem = screen.getByRole('img')
    const quadradinhos = [...imagem.querySelectorAll('[data-quadradinho]')]
    expect(quadradinhos).toHaveLength(100)
    const contar = (cor) => quadradinhos.filter((q) => q.style.background === cor).length
    expect(contar('var(--cor-azul-forte)') + contar('var(--cor-turquesa-forte)') + contar('var(--cor-grafite-forte)')).toBe(100)
    expect(contar('var(--cor-azul-forte)')).toBe(50)
    expect(screen.getByText('Cada quadradinho é 1% do total (2.003).')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Legenda' })).getAllByRole('listitem')[0]).toHaveTextContent('A1.00150%')
  })

  it('dica no mouse: o grupo do quadradinho embaixo do ponteiro (nome, número e %), com os outros grupos apagados', () => {
    render(<Quadradinhos rotulo="Clientes por cidade" grupos={GRUPOS} />)
    const quadradinhos = screen.getByRole('img').querySelectorAll('[data-quadradinho]')
    fireEvent.pointerMove(quadradinhos[25], { clientX: 10, clientY: 10 })
    const dica = screen.getByRole('tooltip')
    expect(within(dica).getByText('Xanxerê/SC')).toBeInTheDocument()
    expect(within(dica).getByText('12 (29%)')).toBeInTheDocument()
    expect(quadradinhos[0]).toHaveClass('opacity-35')
    expect(quadradinhos[25]).not.toHaveClass('opacity-35')
    fireEvent.pointerLeave(screen.getByRole('img'), { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(quadradinhos[0]).not.toHaveClass('opacity-35')
  })

  it('dica no toque; tocar fora fecha', () => {
    render(<Quadradinhos rotulo="Clientes por cidade" grupos={GRUPOS} />)
    fireEvent.pointerDown(screen.getByRole('img').querySelectorAll('[data-quadradinho]')[40], { pointerType: 'touch' })
    expect(within(screen.getByRole('tooltip')).getByText('Outras')).toBeInTheDocument()
    fireEvent.pointerDown(document.body, { pointerType: 'touch' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('teclado: um alvo focável; as setas andam de grupo (o grupo zero fica de fora), Home e End; Esc fecha', async () => {
    render(<Quadradinhos rotulo="Clientes por cidade" grupos={[GRUPOS[0], { nome: 'Vazia', n: 0, cor: corDaSerie(2) }, ...GRUPOS.slice(1)]} />)
    await userEvent.tab()
    expect(screen.getByRole('img')).toHaveFocus()
    expect(within(screen.getByRole('tooltip')).getByText('Chapecó/SC')).toBeInTheDocument()
    const anuncio = () => screen.getByRole('img').parentElement.querySelector('[aria-live="polite"]')
    await userEvent.keyboard('{ArrowRight}')
    expect(within(screen.getByRole('tooltip')).getByText('Xanxerê/SC')).toBeInTheDocument()
    expect(anuncio()).toHaveTextContent('Xanxerê/SC: 12 (29%)')
    await userEvent.keyboard('{End}{ArrowRight}')
    expect(anuncio()).toHaveTextContent('Outras: 7 (17%)')
    await userEvent.keyboard('{Home}')
    expect(anuncio()).toHaveTextContent('Chapecó/SC: 22 (54%)')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(screen.getByRole('img')).toHaveFocus()
  })

  it('total 0 não desenha nada (o cartão mostra o vazio)', () => {
    const { container } = render(<Quadradinhos rotulo="Clientes por cidade" grupos={GRUPOS.map((g) => ({ ...g, n: 0 }))} />)
    expect(container).toBeEmptyDOMElement()
  })
})
