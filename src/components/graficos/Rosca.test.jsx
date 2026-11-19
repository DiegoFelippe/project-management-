import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Rosca from './Rosca'

const PARTES = [
  { nome: 'Feitas', valor: 128, cor: 'feita' },
  { nome: 'Não se aplicam', valor: 14, cor: 'nsa' },
  { nome: 'Atrasadas', valor: 0, cor: 'atrasada' },
  { nome: 'A fazer no prazo', valor: 58, cor: 'afazer' },
]
const desenhar = (props = {}) => render(
  <Rosca rotulo="Tarefas dos check-lists" partes={PARTES} centro={{ valor: '71%', rotulo: 'resolvidas' }} {...props} />,
)
const grafico = () => screen.getByRole('group', { name: 'Tarefas dos check-lists' })

describe('Rosca', () => {
  it('um arco focável por parte com valor (aria-label "Nome: valor (N%)"); a parte zero não desenha', () => {
    desenhar()
    const arcos = within(grafico()).getAllByRole('img')
    expect(arcos.map((a) => a.getAttribute('aria-label'))).toEqual(['Feitas: 128 (64%)', 'Não se aplicam: 14 (7%)', 'A fazer no prazo: 58 (29%)'])
    for (const arco of arcos) {
      expect(arco).toHaveAttribute('tabindex', '0')
      const d = arco.querySelector('[data-arco]').getAttribute('d')
      expect(d).not.toMatch(/NaN/)
      expect(d).toMatch(/^M[\d.]+,[\d.]+A58,58 /)
    }
    // A cor de cada parte vem dos tokens (feita = o verde cheio do sucesso).
    expect(arcos[0].querySelector('[data-arco]').style.stroke).toBe('var(--positive-cheio)')
  })

  it('o arco se desenha (pathLength 1, grafico-desenha) em sequência (--i)', () => {
    desenhar()
    const arcos = grafico().querySelectorAll('[data-arco]')
    expect(arcos[0]).toHaveAttribute('pathLength', '1')
    expect(arcos[0]).toHaveClass('grafico-desenha')
    expect(arcos[2].style.getPropertyValue('--i')).toBe('2')
  })

  it('o centro com o valor e o rótulo, texto do SVG nunca abaixo de 11 px', () => {
    const { rerender } = desenhar()
    expect(within(grafico()).getByText('71%')).toHaveClass('font-bold')
    expect(within(grafico()).getByText('71%')).toHaveAttribute('font-size', '20')
    expect(within(grafico()).getByText('resolvidas')).toHaveClass('fill-muted-foreground')
    for (const t of grafico().querySelectorAll('text')) expect(Number(t.getAttribute('font-size'))).toBeGreaterThanOrEqual(11)
    // Valor comprido desce um passo da escala para caber no furo.
    rerender(<Rosca rotulo="Tarefas dos check-lists" partes={PARTES} centro={{ valor: '1.234,5 h', rotulo: 'no mês' }} />)
    expect(within(grafico()).getByText('1.234,5 h')).toHaveAttribute('font-size', '15')
  })

  it('a legenda ao lado tem o valor e o % de cada parte (a zero também)', () => {
    desenhar()
    const linhas = within(screen.getByRole('list', { name: 'Legenda' })).getAllByRole('listitem')
    expect(linhas.map((l) => l.textContent)).toEqual(['Feitas12864%', 'Não se aplicam147%', 'Atrasadas00%', 'A fazer no prazo5829%'])
  })

  it('dica no foco do teclado (nome, valor e %) e no toque; Esc fecha', async () => {
    desenhar()
    await userEvent.tab()
    expect(within(grafico()).getByRole('img', { name: 'Feitas: 128 (64%)' })).toHaveFocus()
    const dica = screen.getByRole('tooltip')
    expect(within(dica).getByText('Feitas')).toBeInTheDocument()
    expect(within(dica).getByText('128')).toBeInTheDocument()
    expect(within(dica).getByText('64%')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.pointerDown(within(grafico()).getByRole('img', { name: /^Não se aplicam/ }), { pointerType: 'touch' })
    expect(within(screen.getByRole('tooltip')).getByText('Não se aplicam')).toBeInTheDocument()
  })

  it('formatar dá a unidade (horas por consultor) e o nome longo vai inteiro no title, na dica e no aria-label', async () => {
    const nome = 'Maria Aparecida dos Santos Oliveira de Albuquerque'
    render(<Rosca rotulo="Horas por consultor" formatar={(h) => `${h} h`} centro={{ valor: '20 h', rotulo: 'no mês' }}
      partes={[{ nome, valor: 12, cor: 'var(--cor-azul-forte)' }, { nome: 'Bruno', valor: 8, cor: 'var(--cor-turquesa-forte)' }]} />)
    const legenda = screen.getByText(nome, { selector: 'li span' })
    expect(legenda).toHaveClass('truncate')
    expect(legenda).toHaveAttribute('title', nome)
    await userEvent.tab()
    expect(screen.getByRole('img', { name: `${nome}: 12 h (60%)` })).toHaveFocus()
    expect(within(screen.getByRole('tooltip')).getByText(nome)).toBeInTheDocument()
  })

  it('uma parte só fecha o círculo (sem NaN)', () => {
    render(<Rosca rotulo="Uma parte" partes={[{ nome: 'Ana', valor: 5, cor: 'var(--cor-azul-forte)' }]} centro={{ valor: '5', rotulo: 'h' }} />)
    const d = screen.getByRole('group', { name: 'Uma parte' }).querySelector('[data-arco]').getAttribute('d')
    expect(d).not.toMatch(/NaN/)
    expect(d.match(/A58,58/g)).toHaveLength(2)
  })

  it('total 0 não desenha nada (o cartão mostra o vazio): nem arco NaN nem 0/0', () => {
    const { container } = render(<Rosca rotulo="Vazia" partes={PARTES.map((p) => ({ ...p, valor: 0 }))} centro={{ valor: '0%', rotulo: '' }} />)
    expect(container).toBeEmptyDOMElement()
    const { container: semPartes } = render(<Rosca rotulo="Sem partes" partes={[]} />)
    expect(semPartes).toBeEmptyDOMElement()
  })
})
