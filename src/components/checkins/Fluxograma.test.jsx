import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Fluxograma, { LegendaDoFluxo } from './Fluxograma'
import { COR } from '@/components/graficos/cores'
import { TAMANHO } from '@/lib/tipografia'

const ETAPAS = [{ id: 'e1', nome: 'Diagnóstico' }, { id: 'e2', nome: 'Plano' }]
const TAREFAS = [
  { id: 't1', etapa_id: 'e1', titulo: 'Reunião de abertura', depende_de: [] },
  { id: 't2', etapa_id: 'e1', titulo: 'Análise do DRE', depende_de: ['t1'] },
  { id: 't3', etapa_id: 'e2', titulo: 'Plano de ação com os sócios e a equipe toda', depende_de: ['t2'] },
  { id: 't4', etapa_id: 'e2', titulo: 'Mapa de custos', depende_de: [] },
]
const INFO = {
  t1: { cor: 'feita', sub: 'Feita em 10/11', rotulo: 'Feita' },
  t2: { cor: 'atrasada', sub: 'Atrasada desde 12/11', rotulo: 'A fazer, atrasada' },
  t3: { cor: 'bloqueada', sub: 'Bloqueada · vence 20/11', rotulo: 'Bloqueada' },
  t4: { cor: 'andamento', sub: 'Em andamento · 22/11', rotulo: 'Em andamento', apagado: true },
}
const infoDaTarefa = (t) => INFO[t.id]

function desenhar(props = {}) {
  return render(
    <Fluxograma etapas={ETAPAS} tarefas={TAREFAS} infoDaTarefa={infoDaTarefa} rotulo="Fluxograma das tarefas de ACME" {...props} />,
  )
}

const posicao = (no) => no.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number)
const seta = (container, de, para) => container.querySelector(`path[data-de="${de}"][data-para="${para}"]`)

describe('Fluxograma', () => {
  it('cada tarefa é um botão "título: situação"; clicar, Enter e espaço chamam aoEscolher com a tarefa', async () => {
    const aoEscolher = vi.fn()
    desenhar({ aoEscolher })
    const grupo = screen.getByRole('group', { name: 'Fluxograma das tarefas de ACME' })
    expect(within(grupo).getAllByRole('button')).toHaveLength(4)

    const dre = screen.getByRole('button', { name: 'Análise do DRE: A fazer, atrasada' })
    await userEvent.click(dre)
    expect(aoEscolher).toHaveBeenLastCalledWith(TAREFAS[1])

    screen.getByRole('button', { name: 'Reunião de abertura: Feita' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(aoEscolher).toHaveBeenLastCalledWith(TAREFAS[0])

    screen.getByRole('button', { name: 'Mapa de custos: Em andamento' }).focus()
    await userEvent.keyboard(' ')
    expect(aoEscolher).toHaveBeenLastCalledWith(TAREFAS[3])
    expect(aoEscolher).toHaveBeenCalledTimes(3)

    // Tab passa pelas tarefas na ordem do check-list.
    document.activeElement.blur()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Reunião de abertura: Feita' })).toHaveFocus()
    await userEvent.tab()
    expect(dre).toHaveFocus()
  })

  it('sem aoEscolher é só desenho (prévia do modelo): nada focável, nenhum botão, um desenho com nome', () => {
    const { container } = desenhar()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0)
    expect(screen.getByRole('img', { name: 'Fluxograma das tarefas de ACME' })).toBeInTheDocument()
  })

  it('uma raia por etapa, numerada, com a contagem (a padrão ou a de quem chama)', () => {
    const { container, rerender } = desenhar()
    const svg = container.querySelector('svg')
    expect(within(svg).getByText('1 · Diagnóstico')).toBeInTheDocument()
    expect(within(svg).getByText('2 · Plano')).toBeInTheDocument()
    expect(within(svg).getAllByText('2 tarefas')).toHaveLength(2)

    const contagemDaEtapa = (etapa, tarefas) => `${etapa.id}: ${tarefas.length}`
    rerender(<Fluxograma etapas={ETAPAS} tarefas={TAREFAS} infoDaTarefa={infoDaTarefa} rotulo="X" contagemDaEtapa={contagemDaEtapa} />)
    expect(within(container.querySelector('svg')).getByText('e1: 2')).toBeInTheDocument()
  })

  it('caixa com o título (em até duas linhas), a situação embaixo e a cor da situação', () => {
    const { container } = desenhar({ aoEscolher: vi.fn() })
    const plano = screen.getByRole('button', { name: /^Plano de ação/ })
    const linhas = plano.querySelectorAll('tspan')
    expect(linhas).toHaveLength(2)
    expect(linhas[1].textContent.endsWith('…')).toBe(true)
    expect(within(plano).getByText('Bloqueada · vence 20/11')).toBeInTheDocument()
    expect(plano).toHaveAttribute('data-situacao', 'bloqueada')
    expect(container.querySelector('[data-tarefa="t1"]')).toHaveAttribute('data-situacao', 'feita')
    // Tarefa fora do filtro (apagado) fica esmaecida, mas continua no desenho.
    expect(container.querySelector('[data-tarefa="t4"]')).toHaveClass('opacity-30')
    expect(container.querySelector('[data-tarefa="t2"]')).not.toHaveClass('opacity-30')
  })

  it('pausada: caixa com o ícone de pausa e outro estilo que o de em andamento', () => {
    const info = (t) => ({ cor: t.id === 't1' ? 'pausada' : 'andamento', sub: t.id === 't1' ? 'Pausada · 20/11' : 'Em andamento', rotulo: '' })
    const { container } = render(<Fluxograma etapas={ETAPAS} tarefas={TAREFAS} infoDaTarefa={info} rotulo="X" />)
    const pausada = container.querySelector('[data-tarefa="t1"]')
    const andamento = container.querySelector('[data-tarefa="t2"]')
    expect(pausada).toHaveAttribute('data-situacao', 'pausada')
    expect(pausada.querySelector('.lucide-pause')).not.toBeNull()
    expect(pausada.querySelector('rect').getAttribute('class')).not.toBe(andamento.querySelector('rect').getAttribute('class'))
    expect(within(pausada).getByText('Pausada · 20/11')).toBeInTheDocument()
  })

  it('setas do "depende de" com a classe do estado: a que sai de tarefa feita é "feita"; as da selecionada, "realce", por cima', () => {
    const { container, rerender } = desenhar()
    expect(seta(container, 't1', 't2')).toHaveClass('feita')
    expect(seta(container, 't2', 't3')).toHaveClass('normal')
    expect(container.querySelectorAll('path[data-de]')).toHaveLength(2)

    rerender(<Fluxograma etapas={ETAPAS} tarefas={TAREFAS} infoDaTarefa={infoDaTarefa} rotulo="X" selecionada="t2" />)
    expect(seta(container, 't1', 't2')).toHaveClass('realce')
    expect(seta(container, 't2', 't3')).toHaveClass('realce')
    expect(container.querySelector('[data-tarefa="t2"]')).toHaveAttribute('data-selecionada')
    // A ponta da seta é um marcador do mesmo estado.
    expect(seta(container, 't2', 't3').getAttribute('marker-end')).toMatch(/^url\(#[\w-]+realce\)$/)
    const id = seta(container, 't2', 't3').getAttribute('marker-end').slice(5, -1)
    expect(container.querySelector(`marker[id="${id}"]`)).toBeInTheDocument()

    // Realce desenhado por último (fica por cima das outras).
    const setas = [...container.querySelectorAll('path[data-de]')]
    const ultima = setas.at(-1)
    expect(ultima).toHaveClass('realce')
  })

  it('dependência para uma tarefa que vem depois (rascunho do editor) aparece como seta inválida', () => {
    const tarefas = [
      { id: 'a', etapa_id: 'e1', titulo: 'A', depende_de: ['b'] },
      { id: 'b', etapa_id: 'e1', titulo: 'B', depende_de: [] },
    ]
    const { container } = render(<Fluxograma etapas={[ETAPAS[0]]} tarefas={tarefas} rotulo="Prévia" />)
    expect(seta(container, 'b', 'a')).toHaveClass('invalida')
  })

  it('"Em pé" desenha de cima para baixo: a dependente fica embaixo, não ao lado', () => {
    const { container, rerender } = desenhar()
    const [x1, y1] = posicao(container.querySelector('[data-tarefa="t1"]'))
    const [x2, y2] = posicao(container.querySelector('[data-tarefa="t2"]'))
    expect(x2).toBeGreaterThan(x1)
    expect(y2).toBe(y1)

    rerender(<Fluxograma etapas={ETAPAS} tarefas={TAREFAS} infoDaTarefa={infoDaTarefa} rotulo="X" vertical />)
    const [vx1, vy1] = posicao(container.querySelector('[data-tarefa="t1"]'))
    const [vx2, vy2] = posicao(container.querySelector('[data-tarefa="t2"]'))
    expect(vy2).toBeGreaterThan(vy1)
    expect(vx2).toBe(vx1)
  })

  it('todo texto do SVG usa um tamanho da escala (TAMANHO) e nenhum fica abaixo de 11 px', () => {
    for (const vertical of [false, true]) {
      const { container, unmount } = desenhar({ vertical, aoEscolher: vi.fn() })
      const textos = container.querySelectorAll('svg text')
      expect(textos.length).toBeGreaterThan(8)
      const escala = Object.values(TAMANHO)
      for (const texto of textos) {
        const tamanho = Number(texto.getAttribute('font-size'))
        expect(escala, texto.textContent).toContain(tamanho)
        expect(tamanho, texto.textContent).toBeGreaterThanOrEqual(11)
      }
      expect(container.querySelectorAll('svg tspan[font-size]')).toHaveLength(0)
      unmount()
    }
  })

  it('cores só pelos tokens do tema, que existem no claro e no escuro (nada de cor escrita à mão)', () => {
    const { container } = render(
      <>
        <Fluxograma etapas={ETAPAS} tarefas={TAREFAS} infoDaTarefa={infoDaTarefa} rotulo="X" selecionada="t2" aoEscolher={vi.fn()} />
        <LegendaDoFluxo dica="Clique numa tarefa." />
      </>,
    )
    const css = readFileSync('src/index.css', 'utf8')
    const bloco = (seletor) => {
      const inicio = css.indexOf(`${seletor} {`)
      return css.slice(inicio, css.indexOf('}', inicio))
    }
    const claro = bloco(':root')
    const escuro = bloco('.dark')
    const temaTem = new Set([...css.matchAll(/--color-([\w-]+):/g)].map((m) => m[1]))
    const paleta = /^(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+$|^(?:white|black)$|^\[(?:#|rgb|hsl|oklch|color)/

    const usadas = new Set()
    for (const el of container.querySelectorAll('*')) {
      for (const atributo of ['fill', 'stroke', 'color', 'stop-color', 'flood-color']) {
        const valor = el.getAttribute(atributo)
        if (valor !== null) expect(valor, `${el.tagName} ${atributo}`).toMatch(/^(?:none|currentColor|var\(--[\w-]+\)|url\(#[\w-]+\))$/)
      }
      expect(el.getAttribute('style') ?? '', el.tagName).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i)
      for (const classe of (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) {
        const m = classe.split(':').at(-1).replace(/\/\d+$/, '').match(/^(?:fill|stroke|text|bg|border|ring|outline)-(.+)$/)
        if (!m) continue
        expect(m[1], classe).not.toMatch(paleta)
        if (temaTem.has(m[1])) usadas.add(m[1])
      }
    }
    // As cores das situações estão lá, e todas trocam no escuro.
    for (const cor of ['card', 'input', 'primary', 'positive', 'positive-soft', 'notice', 'notice-soft', 'destructive', 'destructive-soft',
      'cor-azul-suave', 'muted']) {
      expect(usadas, cor).toContain(cor)
    }
    for (const cor of usadas) {
      expect(claro, `--${cor} no claro`).toContain(`--${cor}:`)
      expect(escuro, `--${cor} no escuro`).toContain(`--${cor}:`)
    }
    // E no código, nenhuma cor crua.
    for (const arquivo of ['Fluxograma.jsx', 'fluxo.js', 'situacao.js']) {
      const codigo = readFileSync(`src/components/checkins/${arquivo}`, 'utf8')
      expect(codigo, arquivo).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/)
    }
  })

  // Cores vivas (19/11): a mesma cor de estado em toda tela. A família da cor (positive, cor-azul…) vem do COR dos gráficos.
  it('as situações nas mesmas cores de estado dos gráficos: feita verde, não se aplica grafite, em andamento azul, pausada mostarda, a fazer violeta, atrasada vermelha', () => {
    // atrasada: a marca dos gráficos é o coral (--grafico-acima), mas a caixa (texto + borda) usa o estado `destructive`, que segura 4,5:1.
    const familia = (chave) => (chave === 'atrasada' ? 'destructive' : /^var\(--((?:cor-)?[a-z]+)-/.exec(COR[chave])[1])
    const situacoes = { feita: 'feita', nao_se_aplica: 'nsa', andamento: 'andamento', pausada: 'pausada', livre: 'afazer', atrasada: 'atrasada' }
    const tarefas = Object.keys(situacoes).map((cor, i) => ({ id: cor, etapa_id: 'e1', titulo: `Tarefa ${i}`, depende_de: [] }))
    const { container } = render(
      <>
        <Fluxograma etapas={ETAPAS.slice(0, 1)} tarefas={tarefas} infoDaTarefa={(t) => ({ cor: t.id })} rotulo="X" />
        <LegendaDoFluxo />
      </>,
    )
    expect(familia('pausada')).toBe('cor-mostarda')
    for (const [cor, chave] of Object.entries(situacoes)) {
      const no = container.querySelector(`[data-tarefa="${cor}"]`)
      expect(no.querySelector('rect').getAttribute('class'), cor).toMatch(new RegExp(`(?:^| )stroke-${familia(chave)}(?:-|\\s|$)`))
      expect(no.getAttribute('class'), cor).toMatch(new RegExp(`(?:^| )text-${familia(chave)}(?:-|\\s|$)`))
    }
    // A legenda nas mesmas cores (a pausada continua com o ícone de pausa, agora no mostarda).
    const legenda = screen.getByRole('list', { name: 'Legenda do fluxograma' })
    expect(within(legenda).getByText('Pausada').querySelector('.lucide-pause')).toHaveClass('text-cor-mostarda-texto')
    expect(within(legenda).getByText('Em andamento').querySelector('span')).toHaveClass('bg-cor-azul-suave', 'border-cor-azul-forte')
    expect(within(legenda).getByText('A fazer').querySelector('span')).toHaveClass('bg-cor-violeta-suave', 'border-cor-violeta-forte')
    expect(within(legenda).getByText('Atrasada').querySelector('span')).toHaveClass('bg-destructive-soft', 'border-destructive')
  })

  it('o quadro rola dentro do cartão (a página não rola para o lado) e arrastar com o mouse rola o quadro', () => {
    const { container } = desenhar({ aoEscolher: vi.fn() })
    const caixa = container.querySelector('[data-caixa-do-fluxo]')
    expect(caixa).toHaveClass('overflow-auto', 'max-w-full')
    caixa.scrollLeft = 200
    caixa.scrollTop = 50

    fireEvent.pointerDown(caixa, { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 300, clientY: 200 })
    expect(caixa).toHaveAttribute('data-arrastando')
    fireEvent.pointerMove(caixa, { pointerType: 'mouse', pointerId: 1, clientX: 250, clientY: 180 })
    expect(caixa.scrollLeft).toBe(250)
    expect(caixa.scrollTop).toBe(70)
    fireEvent.pointerUp(caixa, { pointerType: 'mouse', pointerId: 1, clientX: 250, clientY: 180 })
    expect(caixa).not.toHaveAttribute('data-arrastando')
    fireEvent.pointerMove(caixa, { pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0 })
    expect(caixa.scrollLeft).toBe(250)
  })

  it('não arrasta com o dedo (o navegador já rola), com outro botão do mouse, nem quando começa numa tarefa clicável', () => {
    const { container } = desenhar({ aoEscolher: vi.fn() })
    const caixa = container.querySelector('[data-caixa-do-fluxo]')
    fireEvent.pointerDown(caixa, { pointerType: 'touch', button: 0, pointerId: 2, clientX: 300, clientY: 200 })
    fireEvent.pointerDown(caixa, { pointerType: 'mouse', button: 2, pointerId: 1, clientX: 300, clientY: 200 })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Análise do DRE: A fazer, atrasada' }),
      { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 300, clientY: 200 })
    expect(caixa).not.toHaveAttribute('data-arrastando')
    fireEvent.pointerMove(caixa, { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 100 })
    expect(caixa.scrollLeft).toBe(0)
  })

  it('na prévia (sem aoEscolher) dá para arrastar começando em cima de uma caixa', () => {
    const { container } = desenhar()
    const caixa = container.querySelector('[data-caixa-do-fluxo]')
    fireEvent.pointerDown(container.querySelector('[data-tarefa="t2"]'), { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 300, clientY: 0 })
    fireEvent.pointerMove(caixa, { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 0 })
    expect(caixa.scrollLeft).toBe(100)
  })
})

describe('LegendaDoFluxo', () => {
  it('mostra as oito situações (com "Não se aplica" e "Pausada" e os ícones deles), o "depende de" e a dica', () => {
    render(<LegendaDoFluxo dica="Clique numa tarefa para ver os detalhes." />)
    const legenda = screen.getByRole('list', { name: 'Legenda do fluxograma' })
    const itens = within(legenda).getAllByRole('listitem').map((li) => li.textContent)
    expect(itens).toEqual(['Feita', 'Não se aplica', 'Em andamento', 'Pausada', 'A fazer', 'Bloqueada', 'Vence hoje', 'Atrasada', 'depende de'])
    expect(within(legenda).getByText('Não se aplica').querySelector('.lucide-ban')).not.toBeNull()
    // Pausada: o ícone de pausa (nunca só a cor) e outro estilo que o de em andamento.
    expect(within(legenda).getByText('Pausada').querySelector('.lucide-pause')).not.toBeNull()
    expect(screen.getByText('Clique numa tarefa para ver os detalhes.')).toHaveClass('text-legenda')
  })

  it('sem dica, só a legenda', () => {
    const { container } = render(<LegendaDoFluxo />)
    expect(container.querySelectorAll('p')).toHaveLength(0)
  })
})
