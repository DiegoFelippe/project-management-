import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import GraficoDeLinha from './GraficoDeLinha'

const ROTULOS = ['06/10', '13/10', '20/10', '27/10', '03/11']
const grafico = () => screen.getByRole('group', { name: 'Check-ins por semana' })
const alvo = () => within(grafico()).getByRole('img', { name: /Use as setas/ })
const cruz = () => grafico().querySelector('[data-cruz]')
// Largura padrão (640, sem ResizeObserver); a margem da esquerda segue o maior rótulo do eixo Y (a linha da grade
// começa nela) e a da direita é 16 px: x(i) = margem + i × (640 − margem − 16) / 4.
const margem = () => Number(grafico().querySelector('line').getAttribute('x1'))
const x = (i) => margem() + (i * (640 - margem() - 16)) / 4
const pontosDe = (el) => el.getAttribute('points').trim().split(/\s+/).map((p) => p.split(',').map(Number))

describe('GraficoDeLinha', () => {
  it('um alvo focável só; → e ← movem a cruz e a dica lista todas as séries do ponto', async () => {
    render(
      <GraficoDeLinha rotulos={ROTULOS} unidade="h" rotuloAria="Check-ins por semana"
        series={[{ nome: 'realizado', pontos: [10, 20, 30, 25, 40], area: true }, { nome: 'previsão', pontos: [15, 15, 15, 15, 15] }]} />,
    )
    expect(within(grafico()).getAllByRole('img')).toHaveLength(1)
    expect(cruz()).toHaveAttribute('visibility', 'hidden')
    await userEvent.tab()
    expect(alvo()).toHaveFocus()
    // Começa no último ponto.
    expect(cruz()).toHaveAttribute('visibility', 'visible')
    expect(Number(cruz().getAttribute('x1'))).toBeCloseTo(x(4))
    expect(within(screen.getByRole('tooltip')).getByText('03/11')).toBeInTheDocument()

    await userEvent.keyboard('{ArrowLeft}')
    expect(Number(cruz().getAttribute('x1'))).toBeCloseTo(x(3))
    const dica = screen.getByRole('tooltip')
    expect(within(dica).getByText('27/10')).toBeInTheDocument()
    expect(within(dica).getByText('25 h')).toBeInTheDocument()
    expect(within(dica).getByText('realizado')).toBeInTheDocument()
    expect(within(dica).getByText('15 h')).toBeInTheDocument()
    expect(within(dica).getByText('previsão')).toBeInTheDocument()
    // O leitor de tela ouve o ponto novo.
    expect(grafico().parentElement.querySelector('[aria-live="polite"]')).toHaveTextContent('27/10: 25 h realizado, 15 h previsão')

    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(Number(cruz().getAttribute('x1'))).toBeCloseTo(x(4))
    await userEvent.keyboard('{Home}')
    expect(Number(cruz().getAttribute('x1'))).toBeCloseTo(x(0))

    // Esc fecha a dica e tira a cruz (o foco fica); a seta traz as duas de volta.
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(cruz()).toHaveAttribute('visibility', 'hidden')
    expect(alvo()).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(cruz()).toHaveAttribute('visibility', 'visible')
    expect(Number(cruz().getAttribute('x1'))).toBeCloseTo(x(1))
    await userEvent.tab()
    expect(cruz()).toHaveAttribute('visibility', 'hidden')
  })

  it('usa a dica de cada ponto quando vem pronta', async () => {
    render(
      <GraficoDeLinha rotulos={ROTULOS} rotuloAria="Check-ins por semana" series={[{ pontos: [3, 4, 5, 6, 7] }]}
        dicas={ROTULOS.map((r, i) => ({ titulo: `Semana de ${r}`, linhas: [{ valor: `${i + 3} check-ins`, cor: 'serie' }, { valor: '9 h', rotulo: 'registradas' }] }))} />,
    )
    await userEvent.tab()
    const dica = screen.getByRole('tooltip')
    expect(within(dica).getByText('Semana de 03/11')).toBeInTheDocument()
    expect(within(dica).getByText('7 check-ins')).toBeInTheDocument()
    expect(within(dica).getByText('registradas')).toBeInTheDocument()
  })

  it('série tracejada começa no último ponto real', () => {
    render(
      <GraficoDeLinha rotulos={ROTULOS} unidade="h" rotuloAria="Check-ins por semana"
        series={[{ pontos: [10, 20, 30, null, null], area: true }, { pontos: [null, null, null, 40, 50], tracejada: true }]} />,
    )
    const real = grafico().querySelector('[data-serie="0"]')
    const projecao = grafico().querySelector('[data-serie="1"]')
    expect(projecao).toHaveAttribute('stroke-dasharray', '5 4')
    expect(real).not.toHaveAttribute('stroke-dasharray')
    const [primeiro] = pontosDe(projecao)
    expect(primeiro).toEqual(pontosDe(real).at(-1))
    expect(primeiro[0]).toBeCloseTo(x(2))
    expect(pontosDe(projecao)).toHaveLength(3)
    // A área clara só na série que pede.
    expect(grafico().querySelectorAll('[data-area]')).toHaveLength(1)
    expect(grafico().querySelector('[data-area]')).toHaveClass('fill-grafico-lavado')
  })

  it('faixa de fundo nas posições dadas (meio passo para cada lado, sem passar das margens)', () => {
    render(<GraficoDeLinha rotulos={ROTULOS} rotuloAria="Check-ins por semana" faixa={[2, 4]} series={[{ pontos: [1, 2, 3, 4, 5] }]} />)
    const meioPasso = (640 - margem() - 16) / 4 / 2
    const faixa = grafico().querySelector('[data-faixa]')
    expect(Number(faixa.getAttribute('x'))).toBeCloseTo(x(2) - meioPasso)
    expect(Number(faixa.getAttribute('x')) + Number(faixa.getAttribute('width'))).toBeCloseTo(640 - 16)
    expect(faixa).toHaveClass('fill-muted')
  })

  it('rótulos de fim e de pico (com ponto), referência horizontal; texto sempre em 11 px', () => {
    render(
      <GraficoDeLinha rotulos={ROTULOS} rotuloAria="Check-ins por semana" referenciaHorizontal={{ valor: 30, rotulo: 'Previsão 30 h' }}
        series={[{ pontos: [10, 48, 30, 25, null] }, { pontos: [null, null, null, 25, 12], tracejada: true }]}
        marcas={[{ serie: 1, i: 4, texto: '12 até hoje', lado: 'abaixo' }, { serie: 0, i: 1, texto: 'pico 48' }, { serie: 0, i: 4, texto: 'nunca' }]} />,
    )
    const svg = grafico()
    expect(within(svg).getByText('12 até hoje')).toHaveClass('fill-foreground', 'font-semibold')
    expect(within(svg).getByText('pico 48')).toHaveClass('fill-foreground', 'font-semibold')
    expect(within(svg).queryByText('nunca')).toBeNull()
    expect(svg.querySelectorAll('[data-marca]')).toHaveLength(2)
    expect(svg.querySelector('[data-referencia-horizontal]')).toHaveClass('stroke-grafico-ref')
    expect(within(svg).getByText('Previsão 30 h')).toBeInTheDocument()
    expect(svg).toHaveAttribute('width', '640')
    expect(svg).not.toHaveAttribute('viewBox')
    for (const t of svg.querySelectorAll('text')) expect(t).toHaveAttribute('font-size', '11')
  })
})
