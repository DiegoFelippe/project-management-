import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CartaoDeGrafico from './CartaoDeGrafico'

const TABELA = {
  rotulo: 'Realizado e capacidade por mês',
  colunas: ['Mês', 'Realizado', 'Capacidade'],
  linhas: [['Outubro de 2026', '980 h', '1.480 h'], ['Novembro de 2026 (parcial)', '1.020 h', '1.120 h']],
}
const LEGENDA = [{ forma: 'quadrado', cor: 'serie', texto: 'Realizado' }, { forma: 'linha', cor: 'ref', texto: 'Capacidade' }]

function Cartao(props) {
  return (
    <CartaoDeGrafico titulo="Realizado × capacidade por mês" leitura={['No mês: ', { forte: '1.020 h' }, ' de 1.480 h']}
      legenda={LEGENDA} tabela={TABELA} {...props}>
      <svg role="group" aria-label="Gráfico de teste" />
    </CartaoDeGrafico>
  )
}

describe('CartaoDeGrafico', () => {
  it('título, leitura com o número em negrito e a legenda; uma região com o nome do título', () => {
    render(<Cartao />)
    const cartao = screen.getByRole('region', { name: 'Realizado × capacidade por mês' })
    expect(cartao).toHaveClass('card')
    expect(within(cartao).getByRole('heading', { name: 'Realizado × capacidade por mês' })).toHaveClass('text-subtitulo')
    expect(within(cartao).getByText('1.020 h').tagName).toBe('B')
    expect(within(cartao).getByText(/de 1\.480 h/)).toHaveClass('text-rotulo', 'text-muted-foreground')
    expect(within(cartao).getByText('Realizado')).toBeInTheDocument()
    expect(within(cartao).getByText('Capacidade')).toBeInTheDocument()
  })

  it('Ver em tabela troca pelo TabelaDoGrafico com os mesmos números e o foco fica no botão (aria-pressed)', async () => {
    render(<Cartao />)
    const botao = screen.getByRole('button', { name: 'Ver em tabela' })
    expect(botao).toHaveAttribute('aria-pressed', 'false')
    expect(botao).toHaveAttribute('title', 'Ver em tabela')
    await userEvent.click(botao)
    expect(screen.queryByRole('group', { name: 'Gráfico de teste' })).toBeNull()
    const tabela = screen.getByRole('table', { name: 'Realizado e capacidade por mês' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Mês', 'Realizado', 'Capacidade'])
    expect(within(tabela).getByRole('cell', { name: '1.020 h' })).toHaveClass('tabular-nums')
    // O nome fica fixo (o estado é o aria-pressed); só o ícone e o title trocam.
    const deVolta = screen.getByRole('button', { name: 'Ver em tabela' })
    expect(deVolta).toBe(botao)
    expect(deVolta).toHaveAttribute('aria-pressed', 'true')
    expect(deVolta).toHaveAttribute('title', 'Ver gráfico')
    expect(screen.queryByRole('button', { name: 'Ver gráfico' })).toBeNull()
    expect(deVolta).toHaveFocus()
    // Na tabela a legenda some (os nomes estão nas colunas).
    expect(screen.queryByText('Capacidade', { selector: 'li *, li' })).toBeNull()
    await userEvent.click(deVolta)
    expect(screen.getByRole('group', { name: 'Gráfico de teste' })).toBeInTheDocument()
    expect(botao).toHaveFocus()
  })

  it('carregando: "Carregando…" com a altura do gráfico (não pula), sem leitura, legenda nem botão da tabela', () => {
    render(<Cartao estado="carregando" altura={262} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Carregando…')
    expect(status.parentElement.style.minHeight).toBe('262px')
    expect(screen.queryByText('1.020 h')).toBeNull()
    expect(screen.queryByText('Realizado')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ver em tabela' })).toBeNull()
  })

  it('carregando: a linha da leitura e a da legenda ficam reservadas (com a altura delas), para nada pular quando o gráfico chega', () => {
    const { container, rerender } = render(<Cartao estado="carregando" />)
    const leitura = container.querySelector('[data-reserva="leitura"]')
    const legenda = container.querySelector('[data-reserva="legenda"]')
    expect(leitura).toHaveAttribute('aria-hidden', 'true')
    expect(leitura).toHaveClass('mt-0.5', 'h-[18px]') // a linha do text-rotulo da leitura
    expect(legenda).toHaveAttribute('aria-hidden', 'true')
    expect(legenda).toHaveClass('h-4') // a linha do text-legenda
    // Pronto: a leitura e a legenda de verdade, no lugar das reservas.
    rerender(<Cartao />)
    expect(container.querySelector('[data-reserva]')).toBeNull()
    // Sem legenda (ou com 1 item só) e com leitura={null}: nada reservado.
    rerender(<Cartao estado="carregando" leitura={null} legenda={[{ forma: 'quadrado', cor: 'serie', texto: 'Realizado' }]} />)
    expect(container.querySelector('[data-reserva]')).toBeNull()
  })

  it('erro com "Tentar de novo" chamando aoTentarDeNovo', async () => {
    const aoTentarDeNovo = vi.fn()
    render(<Cartao estado="erro" erro="Não foi possível carregar o gráfico de horas por mês." aoTentarDeNovo={aoTentarDeNovo} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o gráfico de horas por mês.')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentarDeNovo).toHaveBeenCalledOnce()
    expect(screen.queryByRole('group', { name: 'Gráfico de teste' })).toBeNull()
  })

  it('vazio: a frase no lugar do gráfico, sem o botão da tabela', () => {
    render(<Cartao estado="vazio" vazio="Sem horas nos últimos 6 meses." />)
    expect(screen.getByText('Sem horas nos últimos 6 meses.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Gráfico de teste' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ver em tabela' })).toBeNull()
  })

  it('legenda só com 2 ou mais itens', () => {
    render(<Cartao legenda={[{ forma: 'quadrado', cor: 'serie', texto: 'Realizado' }]} />)
    expect(screen.queryByText('Realizado')).toBeNull()
  })

  it('ações extras no topo, ao lado do botão da tabela; sem tabela, sem o botão', () => {
    render(<Cartao tabela={null} acoes={<a href="/clientes">Ver todos</a>} />)
    expect(screen.getByRole('link', { name: 'Ver todos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver em tabela' })).toBeNull()
  })

  it('tabela própria (lista paginada no banco): o elemento passado no lugar da TabelaDoGrafico', async () => {
    render(<Cartao tabela={<table aria-label="Clientes em risco"><tbody><tr><td>Alfa</td></tr></tbody></table>} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver em tabela' }))
    expect(screen.getByRole('table', { name: 'Clientes em risco' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Gráfico de teste' })).toBeNull()
  })

  it('visão controlada de fora (ex.: "Ver todos os 9" abre a tabela): emTabela e aoMudarTabela', async () => {
    const aoMudarTabela = vi.fn()
    const { rerender } = render(<Cartao emTabela={false} aoMudarTabela={aoMudarTabela} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver em tabela' }))
    expect(aoMudarTabela).toHaveBeenCalledWith(true)
    expect(screen.getByRole('group', { name: 'Gráfico de teste' })).toBeInTheDocument()
    rerender(<Cartao emTabela aoMudarTabela={aoMudarTabela} />)
    expect(screen.getByRole('table', { name: 'Realizado e capacidade por mês' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver em tabela' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('subtítulo (o recorte do bloco) embaixo do título, também enquanto carrega', () => {
    const { rerender } = render(<Cartao subtitulo="Situação de hoje · 31 check-lists ativos" />)
    const sub = screen.getByText('Situação de hoje · 31 check-lists ativos')
    expect(sub).toHaveClass('text-legenda', 'text-muted-foreground')
    expect(sub.previousElementSibling.tagName).toBe('H2')
    rerender(<Cartao subtitulo="Situação de hoje" estado="carregando" />)
    expect(screen.getByText('Situação de hoje')).toBeInTheDocument()
  })

  it('legenda: nome longo corta com reticências e vai inteiro no title (séries de consultores e consultorias)', () => {
    const nome = 'Consultoria Regional de Atendimento aos Provedores do Extremo Oeste Catarinense'
    render(<Cartao legenda={[{ forma: 'quadrado', cor: 'serie', texto: nome }, { forma: 'quadrado', cor: 'ref', texto: 'Outros' }]} />)
    const texto = screen.getByText(nome)
    expect(texto).toHaveClass('truncate')
    expect(texto).toHaveAttribute('title', nome)
    expect(texto.closest('li')).toHaveClass('min-w-0', 'max-w-full')
  })

  it('atualizando (trocou o período): o gráfico fica a 60% até chegar o novo', () => {
    render(<Cartao atualizando />)
    expect(screen.getByRole('group', { name: 'Gráfico de teste' }).parentElement).toHaveClass('opacity-60')
  })
})
