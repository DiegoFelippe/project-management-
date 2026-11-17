import { readFileSync } from 'node:fs'
import { render, screen, within } from '@testing-library/react'
import { Gauge, Users } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import CartoesDeNumeros from './CartoesDeNumeros'
import { numeroDoCartao } from '@/test/cartoes'

const CARTOES = [
  { chave: 'ativos', rotulo: 'Clientes ativos', valor: 1234, icone: Users },
  { chave: 'ocupacao', rotulo: 'Ocupação', valor: '112%', icone: Gauge, tom: 'perigo', destaque: 'perigo', detalhe: 'Capacidade 200 h' },
  { chave: 'aguardando', rotulo: 'Aguardando', valor: 3, destaque: 'atencao' },
  { chave: 'carregando', rotulo: 'Sem número ainda', valor: null },
]

describe('CartoesDeNumeros', () => {
  it('uma região com nome e um cartão (.card) por número, em 2 colunas no celular e 4 no largo', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} />)
    const regiao = screen.getByRole('region', { name: 'Indicadores de teste' })
    expect(regiao).toHaveClass('grid', 'grid-cols-2', 'lg:grid-cols-4')
    const cartoes = regiao.querySelectorAll('[data-cartao]')
    expect(cartoes).toHaveLength(4)
    for (const cartao of cartoes) expect(cartao).toHaveClass('card')
  })

  it('número grande da escala (text-destaque, tabular-nums), em pt-BR, com o rótulo embaixo', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} />)
    const regiao = screen.getByRole('region', { name: 'Indicadores de teste' })
    expect(numeroDoCartao(regiao, 'Clientes ativos')).toBe('1.234')
    expect(numeroDoCartao(regiao, 'Ocupação')).toBe('112%')
    const numero = within(regiao).getByText('1.234')
    expect(numero).toHaveClass('text-destaque', 'font-bold', 'tabular-nums')
    expect(within(regiao).getByText('Clientes ativos')).toHaveClass('text-rotulo')
  })

  it('sem valor (carregando ou sem resposta) mostra "—"', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} />)
    expect(numeroDoCartao(screen.getByRole('region'), 'Sem número ainda')).toBe('—')
  })

  it('cor de destaque opcional no número e detalhe embaixo do rótulo', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} />)
    const regiao = screen.getByRole('region')
    expect(within(regiao).getByText('112%')).toHaveClass('text-destructive')
    expect(within(regiao).getByText('3')).toHaveClass('text-notice')
    expect(within(regiao).getByText('1.234')).not.toHaveClass('text-notice', 'text-destructive')
    expect(within(regiao).getByText('Capacidade 200 h')).toBeInTheDocument()
  })

  it('o ícone vai num quadradinho colorido pelo tom (azul quando não diz)', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} />)
    const [ativos, ocupacao, aguardando] = screen.getByRole('region').querySelectorAll('[data-cartao]')
    expect(ativos.querySelector('svg').parentElement).toHaveClass('bg-primary/10', 'text-primary')
    expect(ocupacao.querySelector('svg').parentElement).toHaveClass('text-destructive')
    expect(aguardando.querySelector('svg')).toBeNull()
  })

  it('aceita classes de fora (ex.: sem a margem de baixo dentro de uma grade)', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} className="mb-0" />)
    expect(screen.getByRole('region')).toHaveClass('mb-0')
    expect(screen.getByRole('region')).not.toHaveClass('mb-4')
  })

  it('anima ao passar o mouse (e ao focar): o cartão sobe 1px com sombra e o ícone dá o pulinho dos botões', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} />)
    for (const cartao of screen.getByRole('region').querySelectorAll('[data-cartao]')) {
      expect(cartao).toHaveClass('cartao-animado', 'transition-[translate,box-shadow]', 'duration-200', 'hover:-translate-y-px',
        'hover:shadow-md', 'focus-visible:-translate-y-px', 'focus-visible:shadow-md')
    }
    const [ativos] = screen.getByRole('region').querySelectorAll('[data-cartao]')
    expect(ativos.querySelector('svg')).toHaveClass('icone-do-cartao')
  })

  it('a animação do ícone está em src/index.css, com keyframes que já existem, e "reduzir movimento" a para', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const regra = /\.cartao-animado:hover \.icone-do-cartao,\s*\.cartao-animado:focus-visible \.icone-do-cartao\s*\{\s*animation:\s*([\w-]+)/.exec(css)
    expect(regra, 'regra .cartao-animado:hover .icone-do-cartao em src/index.css').not.toBeNull()
    expect(css).toContain(`@keyframes ${regra[1]} {`)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation-duration: 0\.01ms !important; transition-duration: 0\.01ms !important; \}/)
  })
})
