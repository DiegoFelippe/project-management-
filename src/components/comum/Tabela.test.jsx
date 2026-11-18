import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pencil, Trash2 } from 'lucide-react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { AcaoDaLinha, Celula, CelulaAcoes, Linha, ListaVazia, Paginacao, Tabela } from './Tabela'

// O jsdom não mede: scrollWidth e clientWidth de mentira para dizer se a tabela rola para o lado.
function rolagemDe(conteudo, visivel) {
  const antes = ['scrollWidth', 'clientWidth'].map((nome) => [nome, Object.getOwnPropertyDescriptor(HTMLElement.prototype, nome)])
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => conteudo })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => visivel })
  onTestFinished(() => antes.forEach(([nome, d]) => (d ? Object.defineProperty(HTMLElement.prototype, nome, d) : delete HTMLElement.prototype[nome])))
}

describe('Tabela (padrão das listas)', () => {
  it('semAcoes tira a coluna de ações e titulo entra no cartão', () => {
    render(<Tabela rotulo="Fila" titulo="Quem espera" semAcoes colunas={['Nome']}><Linha><Celula>Ana</Celula></Linha></Tabela>)
    const tabela = screen.getByRole('table', { name: 'Fila' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Nome'])
    expect(screen.getByRole('heading', { name: 'Quem espera' })).toBeInTheDocument()
  })

  it('só de leitura (semAcoes) e rolando para o lado: a rolagem recebe o foco do teclado e tem nome (auditoria, R13)', () => {
    rolagemDe(900, 360)
    render(<Tabela rotulo="Histórico" semAcoes colunas={['Quando']}><Linha><Celula>ontem</Celula></Linha></Tabela>)
    const rolagem = screen.getByRole('region', { name: 'Tabela Histórico' })
    expect(rolagem).toHaveAttribute('tabindex', '0')
    expect(rolagem).toContainElement(screen.getByRole('table', { name: 'Histórico' }))
  })

  it('só de leitura mas cabendo na tela (computador): nada de parada a mais no Tab', () => {
    rolagemDe(900, 900)
    render(<Tabela rotulo="Histórico" semAcoes colunas={['Quando']}><Linha><Celula>ontem</Celula></Linha></Tabela>)
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.getByRole('table', { name: 'Histórico' }).parentElement).not.toHaveAttribute('tabindex')
  })

  it('com ações, a rolagem não vira mais uma parada do Tab (as ações já recebem o foco)', () => {
    render(<Tabela rotulo="Pessoas" colunas={['Nome']}><Linha><Celula>Ana</Celula><CelulaAcoes><button type="button" className="botao-animado">Editar</button></CelulaAcoes></Linha></Tabela>)
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('semCartao: a tabela entra no cartão de quem a usa, sem cartão próprio', () => {
    const { container } = render(<Tabela rotulo="Eventos" semCartao colunas={['Título']}><Linha><Celula>Kickoff</Celula></Linha></Tabela>)
    expect(screen.getByRole('table', { name: 'Eventos' })).toBeInTheDocument()
    expect(container.querySelector('.card')).toBeNull()
  })

  it('tem nome, as colunas, a coluna de ações e uma linha por item', () => {
    render(
      <Tabela rotulo="Times" colunas={['Time', 'Gestor']}>
        {['Implantação', 'Suporte'].map((nome) => (
          <Linha key={nome}>
            <Celula>{nome}</Celula>
            <Celula>Gil</Celula>
            <CelulaAcoes><button type="button" className="botao-animado">Editar</button></CelulaAcoes>
          </Linha>
        ))}
      </Tabela>,
    )
    const tabela = screen.getByRole('table', { name: 'Times' })
    const cabecalhos = within(tabela).getAllByRole('columnheader').map((c) => c.textContent)
    expect(cabecalhos).toEqual(['Time', 'Gestor', 'Ações'])
    expect(within(tabela).getAllByRole('row')).toHaveLength(3)
  })

  it('a coluna de ações fica fixa à direita (cabeçalho e células), para as ações não sumirem na rolagem', () => {
    render(
      <Tabela rotulo="Times" colunas={['Time']}>
        <Linha><Celula>Suporte</Celula><CelulaAcoes><button type="button" className="botao-animado">Editar</button></CelulaAcoes></Linha>
      </Tabela>,
    )
    const tabela = screen.getByRole('table', { name: 'Times' })
    const [, cabecalhoAcoes] = within(tabela).getAllByRole('columnheader')
    expect(cabecalhoAcoes).toHaveClass('sticky', 'right-0')
    expect(within(tabela).getByRole('button', { name: 'Editar' }).closest('td')).toHaveClass('sticky', 'right-0')
  })

  // No celular a coluna das ações não é fixa: o "Ações" do leitor de tela (absoluto) ficaria preso à página e a faria rolar
  // para o lado a 360 px. A área que rola é `relative` e o prende (achado na conferência do lote C1).
  it('o texto só para leitor de tela do cabeçalho fica preso à área que rola (a página não rola para o lado)', () => {
    render(
      <Tabela rotulo="Times" colunas={['Time']}>
        <Linha><Celula>Suporte</Celula><CelulaAcoes><button type="button" className="botao-animado">Editar</button></CelulaAcoes></Linha>
      </Tabela>,
    )
    const rolagem = screen.getByRole('table', { name: 'Times' }).parentElement
    expect(rolagem).toHaveClass('relative', 'overflow-x-auto')
    expect(screen.getByText('Ações')).toHaveClass('sr-only')
  })

  it('no celular (abaixo de sm) a coluna de ações não fica fixa: o nome continua à vista em 360 px (revisão do lote A)', () => {
    render(
      <Tabela rotulo="Times" colunas={['Time']}>
        <Linha><Celula>Suporte</Celula><CelulaAcoes><button type="button" className="botao-animado">Editar</button></CelulaAcoes></Linha>
      </Tabela>,
    )
    const tabela = screen.getByRole('table', { name: 'Times' })
    expect(within(tabela).getAllByRole('columnheader')[1]).toHaveClass('max-sm:static')
    expect(within(tabela).getByRole('button', { name: 'Editar' }).closest('td')).toHaveClass('max-sm:static')
  })

  it('no celular a primeira coluna tem largura mínima: o nome não vira "Pr / Te / Na" (auditoria, G1)', () => {
    render(
      <Tabela rotulo="Clientes" colunas={['Cliente', 'CNPJ']}>
        <Linha><Celula>Provedor Teste Nacional</Celula><Celula>—</Celula><CelulaAcoes /></Linha>
      </Tabela>,
    )
    const [primeira, segunda] = within(screen.getByRole('table', { name: 'Clientes' })).getAllByRole('columnheader')
    expect(primeira).toHaveClass('max-sm:min-w-40')
    expect(segunda).not.toHaveClass('max-sm:min-w-40')
  })

  it('AcaoDaLinha: só o ícone, com o nome no aria-label e no title; perigo ganha o realce vermelho (auditoria, G1)', async () => {
    const aoApagar = vi.fn()
    render(
      <>
        <AcaoDaLinha nome="Editar" icone={Pencil} onClick={vi.fn()} />
        <AcaoDaLinha nome="Apagar" icone={Trash2} perigo onClick={aoApagar} />
      </>,
    )
    const editar = screen.getByRole('button', { name: 'Editar' })
    expect(editar).toHaveAttribute('title', 'Editar')
    expect(editar).toHaveTextContent('')
    expect(editar.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    const apagar = screen.getByRole('button', { name: 'Apagar' })
    expect(apagar).toHaveClass('hover:text-destructive')
    await userEvent.click(apagar)
    expect(aoApagar).toHaveBeenCalled()
  })

  it('AcaoDaLinha que não vale para a linha deixa o espaço vazio: as outras não mudam de lugar (auditoria, G1)', () => {
    render(
      <Tabela rotulo="Pessoas" colunas={['Nome']}>
        <Linha><Celula>Ana</Celula><CelulaAcoes>
          <AcaoDaLinha nome="Editar" icone={Pencil} onClick={vi.fn()} />
          <AcaoDaLinha nome="Apagar" icone={Trash2} onClick={vi.fn()} />
        </CelulaAcoes></Linha>
        <Linha><Celula>Bia</Celula><CelulaAcoes>
          <AcaoDaLinha nome="Editar" icone={Pencil} visivel={false} onClick={vi.fn()} />
          <AcaoDaLinha nome="Apagar" icone={Trash2} onClick={vi.fn()} />
        </CelulaAcoes></Linha>
      </Tabela>,
    )
    const bia = screen.getByRole('row', { name: /Bia/ })
    expect(within(bia).queryByRole('button', { name: 'Editar' })).toBeNull()
    const [espaco, apagar] = bia.querySelector('td:last-child').children
    expect(espaco).toHaveAttribute('aria-hidden', 'true')
    // Do tamanho do botão de ícone: 32 px no computador e 44 px no toque.
    expect(espaco).toHaveClass('size-8', 'pointer-coarse:min-w-11', 'pointer-coarse:min-h-11')
    expect(apagar).toHaveAccessibleName('Apagar')
  })

  it('lista vazia mostra o aviso', () => {
    render(<ListaVazia>Nenhum time ainda.</ListaVazia>)
    expect(screen.getByText('Nenhum time ainda.')).toBeInTheDocument()
  })

  it('paginação só aparece acima de 15 registros', () => {
    const { rerender } = render(<Paginacao pagina={1} total={15} aoMudar={vi.fn()} />)
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    rerender(<Paginacao pagina={1} total={16} aoMudar={vi.fn()} />)
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('1–15 de 16')
  })

  it('mostra a faixa da página e anda para os lados', async () => {
    const aoMudar = vi.fn()
    const { rerender } = render(<Paginacao pagina={2} total={40} aoMudar={aoMudar} />)
    expect(screen.getByText('16–30 de 40')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(aoMudar).toHaveBeenLastCalledWith(3)
    await userEvent.click(screen.getByRole('button', { name: /Anterior/ }))
    expect(aoMudar).toHaveBeenLastCalledWith(1)
    rerender(<Paginacao pagina={3} total={40} aoMudar={aoMudar} />)
    expect(screen.getByText('31–40 de 40')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled()
  })

  it('a tabela leva a paginação junto quando recebe paginacao', () => {
    render(
      <Tabela rotulo="Times" colunas={['Time']} paginacao={{ pagina: 1, total: 20, aoMudar: vi.fn() }}>
        <Linha><Celula>Implantação</Celula><CelulaAcoes /></Linha>
      </Tabela>,
    )
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('1–15 de 20')
  })
})
