import { readFileSync } from 'node:fs'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Gauge, Users } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(ativos.querySelector('svg').parentElement).toHaveClass('bg-primary/10', 'text-primary-texto')
    expect(ocupacao.querySelector('svg').parentElement).toHaveClass('text-destructive')
    expect(aguardando.querySelector('svg')).toBeNull()
  })

  it('aceita classes de fora (ex.: sem a margem de baixo dentro de uma grade)', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} className="mb-0" />)
    expect(screen.getByRole('region')).toHaveClass('mb-0')
    expect(screen.getByRole('region')).not.toHaveClass('mb-4')
  })

  it('anima ao passar o mouse: o cartão sobe 1px com sombra e o ícone dá o pulinho dos botões (não é focável: nada de foco)', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} />)
    for (const cartao of screen.getByRole('region').querySelectorAll('[data-cartao]')) {
      expect(cartao).toHaveClass('cartao-animado', 'transition-[translate,box-shadow]', 'duration-200', 'hover:-translate-y-px',
        'hover:shadow-md')
      expect(cartao.className).not.toMatch(/focus-visible:/)
      expect(cartao).not.toHaveAttribute('tabindex')
    }
    const [ativos] = screen.getByRole('region').querySelectorAll('[data-cartao]')
    expect(ativos.querySelector('svg')).toHaveClass('icone-do-cartao')
  })

  it('a animação do ícone está em src/index.css, com keyframes que já existem, e "reduzir movimento" a para', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const regra = /\.cartao-animado:hover \.icone-do-cartao\s*\{\s*animation:\s*([\w-]+)/.exec(css)
    expect(regra, 'regra .cartao-animado:hover .icone-do-cartao em src/index.css').not.toBeNull()
    expect(css).not.toContain('.cartao-animado:focus-visible')
    expect(css).toContain(`@keyframes ${regra[1]} {`)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation-duration: 0\.01ms !important; transition-duration: 0\.01ms !important; \}/)
  })

  // Auditoria, G6: no celular os cartões ficam mais baixos. O ícone (menor) vai ao lado do rótulo, na linha de cima, e o
  // número embaixo fica com a largura toda (ao lado do ícone, "1.234,5 h" não caberia a 360 px).
  it('no celular, cartão mais baixo: o ícone menor ao lado do rótulo, e o número embaixo, na largura toda', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} />)
    for (const cartao of screen.getByRole('region').querySelectorAll('[data-cartao]')) {
      expect(cartao).toHaveClass('grid', 'max-sm:py-2.5', 'max-sm:gap-y-1.5')
      // A linha do rótulo tem sempre a altura de dois: o número fica na mesma altura nos vizinhos (R6).
      expect(cartao).toHaveClass('max-sm:grid-rows-[2.25rem]')
      expect(cartao).toHaveClass(cartao.querySelector('svg') ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1')
      expect(cartao.querySelector('[data-numero]')).toHaveClass('max-sm:col-span-full', 'max-sm:row-start-2')
      expect(cartao.querySelector('[data-numero]').parentElement).toHaveClass('max-sm:contents')
    }
    const ocupacao = within(screen.getByRole('region')).getByText('Ocupação')
    expect(ocupacao).toHaveClass('max-sm:col-start-2', 'max-sm:row-start-1')
    expect(ocupacao.closest('[data-cartao]').querySelector('svg').parentElement).toHaveClass('size-9', 'max-sm:size-7')
  })

  // R6 da auditoria: cartão sem detalhe (ou sem variação) não deixa o número mais baixo que o dos vizinhos.
  it('conteúdo alinhado pelo topo (os números ficam na mesma altura com e sem a linha de baixo)', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={CARTOES} />)
    for (const cartao of screen.getByRole('region').querySelectorAll('[data-cartao]')) {
      expect(cartao).toHaveClass('items-start')
      expect(cartao).not.toHaveClass('items-center')
    }
  })

  const COM_VARIACAO = [
    { chave: 'realizado', rotulo: 'Realizado', valor: '1.020 h', variacao: { texto: '▲ 12%', tom: 'bom', paraLeitor: 'subiu 12%', comparado: 'vs out/26' } },
    { chave: 'aguardando', rotulo: 'Aguardando', valor: 4, variacao: { texto: '▲ 2', tom: 'ruim', paraLeitor: 'subiu 2', comparado: 'vs out/26' } },
    { chave: 'clientes', rotulo: 'Clientes', valor: 30, variacao: { texto: '= igual', tom: 'neutro', paraLeitor: 'igual', comparado: 'vs out/26' } },
    { chave: 'ocupacao', rotulo: 'Ocupação', valor: '72%', variacao: null },
    { chave: 'sem', rotulo: 'Sem comparação', valor: 1 },
  ]
  const variacaoDe = (rotulo) => within(screen.getByRole('region')).getByText(rotulo).closest('[data-cartao]').querySelector('[data-variacao]')

  it('linha de variação com a seta e o tom (só para os olhos) e o texto para o leitor de tela', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_VARIACAO} />)
    const realizado = variacaoDe('Realizado')
    expect(realizado).toHaveClass('text-legenda')
    const seta = within(realizado).getByText('▲ 12%')
    expect(seta).toHaveClass('text-positive', 'font-semibold', 'tabular-nums')
    expect(seta).toHaveAttribute('aria-hidden', 'true')
    expect(within(realizado).getByText('vs out/26', { selector: '[aria-hidden]' })).toHaveClass('text-muted-foreground')
    expect(within(realizado).getByText('subiu 12% vs out/26')).toHaveClass('sr-only')
    expect(within(variacaoDe('Aguardando')).getByText('▲ 2')).toHaveClass('text-destructive')
    expect(within(variacaoDe('Clientes')).getByText('= igual')).toHaveClass('text-muted-foreground')
  })

  it('variação nula mostra "—" (a comparação ainda carrega); sem a chave ou undefined, sem a linha', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={[...COM_VARIACAO, { chave: 'sem-numero', rotulo: 'Sem número', valor: '—', variacao: undefined }]} />)
    expect(variacaoDe('Ocupação')).toHaveTextContent('—')
    expect(variacaoDe('Sem comparação')).toBeNull()
    expect(variacaoDe('Sem número')).toBeNull()
  })
})

// Usabilidade, U5 (pedido do Diego, 18/11): o cartão cujo número a lista da tela sabe filtrar leva a esse filtro.
describe('CartoesDeNumeros com destino', () => {
  const COM_DESTINO = (destino, extra = {}) => [
    { chave: 'aguardando', rotulo: 'Aguardando consultor', valor: 16, icone: Users, destino, ...extra },
    { chave: 'parados', rotulo: 'Sem check-in há 30 dias', valor: 2, icone: Gauge },
  ]

  it('vira um botão com nome (o número e o que ele faz), que aplica o filtro', async () => {
    const destino = vi.fn()
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_DESTINO(destino)} />)
    const botao = screen.getByRole('button', { name: 'Aguardando consultor: 16. Mostrar na lista' })
    expect(botao).toHaveAttribute('data-cartao', 'aguardando')
    expect(botao).toHaveAttribute('type', 'button')
    await userEvent.click(botao)
    expect(destino).toHaveBeenCalledTimes(1)
  })

  it('os sem destino continuam só número (nem botão nem foco)', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_DESTINO(() => {})} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    const parados = screen.getByRole('region').querySelector('[data-cartao="parados"]')
    expect(parados.tagName).toBe('DIV')
    expect(parados).not.toHaveAttribute('tabindex')
  })

  it('mantém a animação do cartão, anima ao apertar como os botões e tem foco à vista', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_DESTINO(() => {})} />)
    const botao = screen.getByRole('button')
    expect(botao).toHaveClass('card', 'cartao-animado', 'botao-animado', 'hover:-translate-y-px', 'hover:shadow-md',
      'active:scale-[0.97]', 'focus-visible:ring-2', 'focus-visible:ring-ring', 'text-left')
    expect(botao.querySelector('svg')).toHaveClass('icone-do-cartao')
  })

  it('o cartão do filtro que está valendo fica marcado (aria-current)', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_DESTINO(() => {}, { ativo: true })} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button')).toHaveClass('ring-2')
  })

  it('o número ainda carregando diz "—" no nome', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={[{ chave: 'a', rotulo: 'Ativas', valor: null, destino: () => {} }]} />)
    expect(screen.getByRole('button', { name: 'Ativas: —. Mostrar na lista' })).toBeInTheDocument()
  })
})

// Pedido do Diego (19/11): os números correm até o valor (useContagem), vizinhos com 120 ms de diferença; a variação
// aparece quando a contagem termina; o leitor de tela recebe só o valor final.
describe('CartoesDeNumeros com contagem', () => {
  const HORAS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
  const COM_CONTAGEM = (extra = {}) => [
    { chave: 'horas', rotulo: 'Horas no mês', icone: Gauge, contagem: { numero: 1020.5, formatar: (n) => `${HORAS.format(n)} h`, chave: '2026-11' },
      variacao: { texto: '▲ 12%', tom: 'bom', paraLeitor: 'subiu 12%', comparado: 'vs out/26' }, ...extra },
    { chave: 'clientes', rotulo: 'Clientes', icone: Users, contagem: { numero: 42, chave: '2026-11' } },
  ]
  const avancar = (ms) => act(() => vi.advanceTimersByTime(ms))
  const regiao = () => screen.getByRole('region', { name: 'Indicadores de teste' })

  beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('o número corre de 0 até o valor; o leitor de tela recebe só o valor final; a variação aparece no fim', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_CONTAGEM()} />)
    expect(numeroDoCartao(regiao(), 'Horas no mês')).toBe('0 h')
    const cartao = within(regiao()).getByText('Horas no mês').closest('[data-cartao]')
    expect(cartao.querySelector('[data-numero]')).toHaveAttribute('aria-hidden', 'true')
    expect(within(cartao).getByText('1.020,5 h')).toHaveClass('sr-only')
    expect(cartao.querySelector('[data-variacao]')).toHaveClass('opacity-0')
    avancar(450)
    expect(numeroDoCartao(regiao(), 'Horas no mês')).not.toBe('0 h')
    expect(cartao.querySelector('[data-variacao]')).toHaveClass('opacity-0')
    avancar(600)
    expect(numeroDoCartao(regiao(), 'Horas no mês')).toBe('1.020,5 h')
    expect(cartao.querySelector('[data-variacao]')).not.toHaveClass('opacity-0')
    // Sem formatar, inteiro em pt-BR.
    avancar(200)
    expect(numeroDoCartao(regiao(), 'Clientes')).toBe('42')
  })

  it('o vizinho começa 120 ms depois', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_CONTAGEM()} />)
    avancar(100)
    expect(numeroDoCartao(regiao(), 'Horas no mês')).not.toBe('0 h')
    expect(numeroDoCartao(regiao(), 'Clientes')).toBe('0')
  })

  it('releitura com a mesma chave mostra o número novo direto; carregando, "—"', () => {
    const { rerender } = render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_CONTAGEM({ contagem: { numero: null, chave: '2026-11' } })} />)
    expect(numeroDoCartao(regiao(), 'Horas no mês')).toBe('—')
    rerender(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_CONTAGEM()} />)
    avancar(1200)
    rerender(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_CONTAGEM({ contagem: { numero: 1022, formatar: (n) => `${HORAS.format(n)} h`, chave: '2026-11' } })} />)
    expect(numeroDoCartao(regiao(), 'Horas no mês')).toBe('1.022 h')
  })

  it('"reduzir movimento": o valor final direto e a variação à vista', () => {
    vi.stubGlobal('matchMedia', vi.fn((consulta) => ({ matches: consulta.includes('reduce'), media: consulta, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_CONTAGEM()} />)
    expect(numeroDoCartao(regiao(), 'Horas no mês')).toBe('1.020,5 h')
    expect(within(regiao()).getByText('Horas no mês').closest('[data-cartao]').querySelector('[data-variacao]')).not.toHaveClass('opacity-0')
  })

  it('com destino, o nome do botão diz o valor final (não o que está correndo)', () => {
    render(<CartoesDeNumeros rotulo="Indicadores de teste" cartoes={COM_CONTAGEM({ destino: () => {} })} />)
    expect(screen.getByRole('button', { name: 'Horas no mês: 1.020,5 h. Mostrar na lista' })).toBeInTheDocument()
  })
})
