import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AbasSegmentadas from './AbasSegmentadas'
import BarraDeFiltros, { AcaoPrincipal, CampoBusca, NaGaveta } from './BarraDeFiltros'

describe('BarraDeFiltros', () => {
  it('mantém a ordem: abas, busca, filtros e a ação principal no fim', () => {
    render(
      <BarraDeFiltros>
        <AbasSegmentadas rotulo="Mostrar" abas={[{ valor: 'a', rotulo: 'Ativos' }]} valor="a" aoMudar={() => {}} />
        <CampoBusca rotulo="Buscar" placeholder="Buscar" valor="" aoMudar={() => {}} />
        <button type="button">Filtro</button>
        <AcaoPrincipal><button type="button">Novo</button></AcaoPrincipal>
      </BarraDeFiltros>,
    )
    const ordem = [
      screen.getByRole('group', { name: 'Mostrar' }),
      screen.getByRole('searchbox', { name: 'Buscar' }),
      screen.getByRole('button', { name: 'Filtro' }),
      screen.getByRole('button', { name: 'Novo' }),
    ]
    for (let i = 0; i < ordem.length - 1; i++) {
      expect(ordem[i].compareDocumentPosition(ordem[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Novo' }).parentElement).toHaveClass('ml-auto')
  })

  it('começa sempre com o ícone e a palavra Filtros, antes de tudo', () => {
    const { container } = render(<BarraDeFiltros><button type="button">Filtro</button></BarraDeFiltros>)
    const rotulo = screen.getByText('Filtros')
    expect(rotulo.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstChild.firstChild).toBe(rotulo)
  })

  it('o ícone de Filtros fica na cor do texto, sem azul (modelo atual, 19/11)', () => {
    render(<BarraDeFiltros><button type="button">Filtro</button></BarraDeFiltros>)
    expect(screen.getByText('Filtros').querySelector('svg')).not.toHaveClass('text-primary-texto')
  })

  it('é um cartão que quebra linha em telas estreitas', () => {
    const { container } = render(<BarraDeFiltros><span>x</span></BarraDeFiltros>)
    expect(container.firstChild).toHaveClass('card', 'flex', 'flex-wrap')
  })

  it('a busca avisa o texto digitado', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const textos = []
    render(<CampoBusca rotulo="Buscar" valor="" aoMudar={(t) => textos.push(t)} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'ab')
    expect(textos).toEqual(['a', 'b'])
  })
})

// Celular (auditoria, G6; pedido do Diego, 17/11): abaixo de 640 px a barra mostra o ícone com "Filtros (N ativos)", a
// busca e a ação principal; os campos marcados com NaGaveta abrem numa gaveta de baixo, com Limpar e Ver resultados.
describe('BarraDeFiltros no celular', () => {
  const celular = (sim) => vi.stubGlobal('matchMedia', vi.fn((consulta) => ({
    matches: consulta.includes('min-width: 640px') ? !sim : false, media: consulta, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
  afterEach(() => vi.unstubAllGlobals())

  function barra({ ativos = 0, aoLimpar = vi.fn() } = {}) {
    render(
      <BarraDeFiltros ativos={ativos} aoLimpar={aoLimpar}>
        <NaGaveta>
          <AbasSegmentadas rotulo="Mostrar" abas={[{ valor: 'a', rotulo: 'Ativos' }, { valor: 'd', rotulo: 'Desativados' }]} valor="a" aoMudar={() => {}} />
        </NaGaveta>
        <CampoBusca rotulo="Buscar" placeholder="Buscar" valor="" aoMudar={() => {}} />
        <NaGaveta><button type="button" className="botao-animado">Tipo</button></NaGaveta>
        <AcaoPrincipal><button type="button" className="botao-animado">Novo</button></AcaoPrincipal>
      </BarraDeFiltros>,
    )
    return { aoLimpar }
  }

  it('no computador os campos da gaveta ficam na barra, na ordem, como sempre', () => {
    celular(false)
    const { container } = render(
      <BarraDeFiltros ativos={1}>
        <NaGaveta><button type="button" className="botao-animado">Tipo</button></NaGaveta>
        <CampoBusca rotulo="Buscar" valor="" aoMudar={() => {}} />
      </BarraDeFiltros>,
    )
    expect(container.firstChild.firstChild).toBe(screen.getByText('Filtros'))
    expect(screen.queryByRole('button', { name: /Filtros/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tipo' }).compareDocumentPosition(screen.getByRole('searchbox')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('começa com o botão Filtros (ícone + texto); a busca e a ação principal ficam à vista; os outros campos, não', () => {
    celular(true)
    barra()
    const botao = screen.getByRole('button', { name: 'Filtros' })
    expect(botao.closest('.card').firstChild).toBe(botao)
    expect(botao.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(botao.querySelector('svg')).not.toHaveClass('text-primary-texto')
    expect(botao).toHaveAttribute('aria-haspopup', 'dialog')
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Filtros')).toBe(botao.querySelector('span'))
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tipo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Mostrar' })).not.toBeInTheDocument()
  })

  it('diz quantos filtros estão ativos', () => {
    celular(true)
    barra({ ativos: 2 })
    expect(screen.getByRole('button', { name: 'Filtros (2 ativos)' })).toBeInTheDocument()
  })

  it('um só ativo, no singular', () => {
    celular(true)
    barra({ ativos: 1 })
    expect(screen.getByRole('button', { name: 'Filtros (1 ativo)' })).toBeInTheDocument()
  })

  it('a gaveta de baixo tem os campos, Limpar e Ver resultados (que fecha)', async () => {
    celular(true)
    const { aoLimpar } = barra({ ativos: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Filtros (1 ativo)' }))
    const gaveta = screen.getByRole('dialog', { name: 'Filtros' })
    // As listas dos campos (Flutuante) abrem dentro da janela do Radix, que prende o foco e o clique.
    expect(gaveta).toHaveAttribute('data-slot', 'dialog-content')
    expect(gaveta).toHaveClass('bottom-0')
    expect(within(gaveta).getByRole('group', { name: 'Mostrar' })).toBeInTheDocument()
    expect(within(gaveta).getByRole('button', { name: 'Tipo' })).toBeInTheDocument()
    expect(within(gaveta).getByRole('group', { name: 'Mostrar' }).compareDocumentPosition(within(gaveta).getByRole('button', { name: 'Tipo' }))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Limpar' }))
    expect(aoLimpar).toHaveBeenCalledTimes(1)
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Ver resultados' }))
    expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtros (1 ativo)' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('sem filtro ativo, o Limpar fica desligado', async () => {
    celular(true)
    barra({ ativos: 0 })
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    expect(within(screen.getByRole('dialog', { name: 'Filtros' })).getByRole('button', { name: 'Limpar' })).toBeDisabled()
  })

  it('sem campos na gaveta, fica o rótulo Filtros de sempre (não há o que abrir)', () => {
    celular(true)
    const { container } = render(
      <BarraDeFiltros>
        <CampoBusca rotulo="Buscar" valor="" aoMudar={() => {}} />
      </BarraDeFiltros>,
    )
    expect(container.firstChild.firstChild).toBe(screen.getByText('Filtros'))
    expect(screen.queryByRole('button', { name: /Filtros/ })).not.toBeInTheDocument()
  })

  it('a busca encolhe no celular para caber ao lado do botão', () => {
    render(<CampoBusca rotulo="Buscar" valor="" aoMudar={() => {}} />)
    expect(screen.getByRole('searchbox').parentElement).toHaveClass('flex-1', 'max-sm:min-w-32', 'sm:min-w-48')
  })
})
