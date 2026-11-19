import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LinhaDaTarefa from './LinhaDaTarefa'
import { situacaoDaTarefa } from './situacao'
import { COR } from '@/components/graficos/cores'

// "Hoje" é 17/11/2026 em São Paulo (12:00).
const AGORA = new Date('2026-11-17T15:00:00Z')
const HOJE = '2026-11-17'
const t = (id, titulo, campos = {}) => ({
  id, etapa_id: 'e1', titulo, descricao: null, obrigatoria: true, prazo_dias: 10, vence_em: '2026-11-25', estado: 'a_fazer',
  nota: null, motivo: null, feita_em: null, feita_por: null, depende_de: [], na_sessao: false, tempo_segundos: 0,
  trecho_aberto_desde: null, comentarios: 0, ...campos,
})
const ANTES = t('t0', 'Reunião de alinhamento')
const TAREFAS = [ANTES]

function linha(tarefa, { podeMarcar = true, podeComentar = true, ocupada = false, tarefas = [...TAREFAS, tarefa] } = {}) {
  const porId = new Map(tarefas.map((x) => [x.id, x]))
  const aoMarcar = vi.fn()
  const aoNaoSeAplica = vi.fn()
  const aoEditar = vi.fn()
  render(
    <ul>
      <LinhaDaTarefa tarefa={tarefa} situacao={situacaoDaTarefa(tarefa, porId, HOJE)} inicio="2026-11-15" podeMarcar={podeMarcar}
        podeComentar={podeComentar} ocupada={ocupada} aoMarcar={aoMarcar} aoNaoSeAplica={aoNaoSeAplica} aoEditar={aoEditar} />
    </ul>,
  )
  return { item: screen.getByRole('listitem'), aoMarcar, aoNaoSeAplica, aoEditar }
}

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: AGORA }))
afterEach(() => vi.useRealTimers())

describe('LinhaDaTarefa', () => {
  it('só o check no começo; o título é texto (clicar não abre nada); a descrição embaixo', async () => {
    const { item, aoEditar } = linha(t('t1', 'Análise do DRE', { descricao: 'Últimos 12 meses' }))
    expect(within(item).getAllByRole('checkbox')).toHaveLength(1)
    expect(within(item).getByRole('checkbox', { name: 'Análise do DRE' })).not.toBeChecked()
    expect(within(item).queryByRole('button', { name: 'Análise do DRE' })).not.toBeInTheDocument()
    await userEvent.click(within(item).getByText('Análise do DRE'))
    expect(aoEditar).not.toHaveBeenCalled()
    expect(item).toHaveTextContent('Últimos 12 meses')
  })

  it('saem da linha: o motivo, a nota e o "feita por"; a feita é o check verde, sem selo', () => {
    const feita = linha(t('t1', 'Análise do DRE', {
      estado: 'feita', feita_em: '2026-11-16T15:00:00Z', feita_por: { nome: 'Ana Lima' }, nota: 'Ata no Drive',
    }))
    const caixa = within(feita.item).getByRole('checkbox', { name: 'Análise do DRE' })
    expect(caixa).toBeChecked()
    expect(caixa.closest('label')).toHaveClass('[&_input:checked+span]:bg-positive')
    expect(feita.item).not.toHaveTextContent('Feita')
    expect(feita.item).not.toHaveTextContent('Ana Lima')
    expect(feita.item).not.toHaveTextContent('Ata no Drive')
  })

  it('não se aplica: o quadrado cinza com o ícone próprio (nunca o check) e o selo; o motivo não aparece', () => {
    const { item } = linha(t('t1', 'Inventário', { estado: 'nao_se_aplica', motivo: 'Sem estoque', feita_por: { nome: 'Ana Lima' } }))
    expect(within(item).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(item.querySelector('[data-selo="nao_se_aplica"] .lucide-ban')).not.toBeNull()
    expect(item.querySelector('.lucide-check')).toBeNull()
    expect(item).not.toHaveTextContent('Sem estoque')
    expect(item).not.toHaveTextContent('Ana Lima')
  })

  it('em andamento: o selo com o relógio correndo desde a leitura', () => {
    const { item } = linha(t('t1', 'Plano de ação', {
      estado: 'andamento', tempo_segundos: 300, trecho_aberto_desde: '2026-11-17T14:55:00Z', lido_em: AGORA.getTime() - 12_000,
    }))
    const selo = item.querySelector('[data-selo="andamento"]')
    expect(selo).toHaveTextContent('Em andamento · 05:12')
    expect(selo.querySelector('.lucide-play')).not.toBeNull()
  })

  it('em andamento sem trecho aberto (de antes do relógio): o selo sem relógio', () => {
    const { item } = linha(t('t1', 'Plano de ação', { estado: 'andamento' }))
    expect(item.querySelector('[data-selo="andamento"]').textContent.trim()).toBe('Em andamento')
  })

  it('pausada: o selo com os minutos feitos e o ícone de pausa (outro estilo que o de em andamento)', () => {
    const { item } = linha(t('t1', 'Mapa de custos', { estado: 'pausada', tempo_segundos: 12 * 60 + 5 }))
    const selo = item.querySelector('[data-selo="pausada"]')
    expect(selo).toHaveTextContent('Pausada · 12 min')
    expect(selo.querySelector('.lucide-pause')).not.toBeNull()
    expect(selo).toHaveClass('bg-cor-mostarda-cheio', 'text-cor-mostarda-sobre')
  })

  // Cores vivas (19/11): o selo na cor do estado dos gráficos (COR): em andamento azul e pausada mostarda, sólidos (cheio +
  // sobre); não se aplica no grafite suave (fechada, discreta); sempre com o ícone e a palavra.
  it('os selos nas cores de estado dos gráficos: em andamento azul, pausada mostarda (cheios) e não se aplica grafite', () => {
    const familia = (chave) => /^var\(--((?:cor-)?[a-z]+)-/.exec(COR[chave])[1]
    const selo = (campos) => {
      const { item } = linha(t('t1', 'Coleta', campos))
      const achado = item.querySelector('[data-selo]')
      cleanup()
      return achado
    }
    const andamento = selo({ estado: 'andamento' })
    expect(andamento).toHaveClass(`bg-${familia('andamento')}-cheio`, `text-${familia('andamento')}-sobre`)
    const pausada = selo({ estado: 'pausada' })
    expect(pausada).toHaveClass(`bg-${familia('pausada')}-cheio`, `text-${familia('pausada')}-sobre`)
    const nsa = selo({ estado: 'nao_se_aplica', motivo: 'Sem estoque' })
    expect(nsa).toHaveClass(`bg-${familia('nsa')}-suave`, `text-${familia('nsa')}-texto`)
    for (const s of [andamento, pausada, nsa]) {
      expect(s.querySelector('svg')).not.toBeNull()
      expect(s.className).not.toMatch(/text-primary-texto/)
    }
  })

  it('Opcional e "Nesta sessão" continuam na linha', () => {
    const { item } = linha(t('t1', 'Coleta', { obrigatoria: false, na_sessao: true }))
    expect(item).toHaveTextContent('Opcional')
    expect(item).toHaveTextContent('Nesta sessão')
  })

  describe('o prazo como botão', () => {
    it('vermelho quando venceu; o balão tem a data, há quantos dias e o dia do modelo; sem "Mudar prazo"; Esc fecha', async () => {
      const { item } = linha(t('t1', 'Coleta', { vence_em: '2026-11-15', prazo_dias: 0 }))
      const prazo = within(item).getByRole('button', { name: 'Venceu 15/11, atrasada há 2 dias. Prazo de Coleta' })
      expect(prazo).toHaveClass('text-destructive')
      expect(prazo).toHaveAttribute('aria-expanded', 'false')
      await userEvent.click(prazo)
      expect(prazo).toHaveAttribute('aria-expanded', 'true')
      const balao = screen.getByRole('dialog', { name: 'Prazo de Coleta' })
      expect(balao).toHaveTextContent('domingo, 15/11/2026')
      expect(balao).toHaveTextContent('Atrasada há 2 dias')
      expect(balao).toHaveTextContent('Dia 0 a partir do início (15/11/2026)')
      expect(balao).not.toHaveTextContent('Mudar prazo')
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(prazo).toHaveFocus()
    })

    it('âmbar em 7 dias (e hoje); normal depois; cinza na resolvida', () => {
      expect(within(linha(t('a', 'A', { vence_em: '2026-11-20' })).item).getByRole('button', { name: /^Vence 20\/11, faltam 3 dias/ }))
        .toHaveClass('text-notice')
      cleanup()
      expect(within(linha(t('b', 'B', { vence_em: HOJE })).item).getByRole('button', { name: /^Vence hoje/ })).toHaveClass('text-notice')
      cleanup()
      const normal = within(linha(t('c', 'C', { vence_em: '2026-11-30' })).item).getByRole('button', { name: /^Vence 30\/11, faltam 13 dias/ })
      expect(normal).not.toHaveClass('text-notice')
      expect(normal).not.toHaveClass('text-destructive')
      cleanup()
      expect(within(linha(t('d', 'D', { vence_em: '2026-11-10', estado: 'feita' })).item).getByRole('button', { name: /^Prazo 10\/11, feita/ }))
        .toHaveClass('text-muted-foreground')
    })

    it('sem data, sem botão de prazo', () => {
      const { item } = linha(t('t1', 'Sem data', { vence_em: null }))
      expect(within(item).queryByRole('button', { name: /Prazo de/ })).not.toBeInTheDocument()
    })
  })

  describe('as ações', () => {
    it('a fazer: Iniciar manda "em andamento"; Não se aplica pede o motivo; Editar abre o formulário', async () => {
      const tarefa = t('t1', 'Análise do DRE')
      const { item, aoMarcar, aoNaoSeAplica, aoEditar } = linha(tarefa)
      await userEvent.click(within(item).getByRole('button', { name: 'Iniciar Análise do DRE' }))
      expect(aoMarcar).toHaveBeenCalledWith(tarefa, 'andamento')
      await userEvent.click(within(item).getByRole('button', { name: 'Não se aplica: Análise do DRE' }))
      expect(aoNaoSeAplica).toHaveBeenCalledWith(tarefa)
      await userEvent.click(within(item).getByRole('button', { name: 'Editar Análise do DRE' }))
      expect(aoEditar).toHaveBeenCalledWith(tarefa)
    })

    it('em andamento: Pausar; pausada: Retomar', async () => {
      const andamento = t('t1', 'Plano', { estado: 'andamento' })
      const a = linha(andamento)
      await userEvent.click(within(a.item).getByRole('button', { name: 'Pausar Plano' }))
      expect(a.aoMarcar).toHaveBeenCalledWith(andamento, 'pausada')
      cleanup()
      const pausada = t('t2', 'Mapa', { estado: 'pausada', tempo_segundos: 600 })
      const p = linha(pausada)
      await userEvent.click(within(p.item).getByRole('button', { name: 'Retomar Mapa' }))
      expect(p.aoMarcar).toHaveBeenCalledWith(pausada, 'andamento')
    })

    it('o check marca feita e desmarca para a fazer', async () => {
      const tarefa = t('t1', 'Análise do DRE')
      const { item, aoMarcar } = linha(tarefa)
      await userEvent.click(within(item).getByRole('checkbox'))
      expect(aoMarcar).toHaveBeenCalledWith(tarefa, 'feita')
    })

    it('resolvida: sem Iniciar nem Não se aplica, mas os lugares ficam (o lápis não muda de lugar)', () => {
      const { item } = linha(t('t1', 'Feita', { estado: 'feita' }))
      expect(within(item).queryByRole('button', { name: /^Iniciar/ })).not.toBeInTheDocument()
      expect(within(item).queryByRole('button', { name: /^Não se aplica/ })).not.toBeInTheDocument()
      expect(item.querySelectorAll('[data-acoes] > [aria-hidden="true"]')).toHaveLength(2)
      expect(within(item).getByRole('button', { name: 'Editar Feita' })).toBeInTheDocument()
    })

    it('bloqueada: o check e Iniciar desligados, com "Espera: …" à vista e ligado a eles; Não se aplica continua', () => {
      const presa = t('t1', 'Mapa de custos', { depende_de: ['t0'] })
      const { item } = linha(presa)
      expect(item.querySelector('[data-selo="bloqueada"]')).toHaveTextContent('Bloqueada')
      expect(item).toHaveTextContent('Espera: Reunião de alinhamento')
      const caixa = within(item).getByRole('checkbox')
      expect(caixa).toBeDisabled()
      expect(caixa).toHaveAccessibleDescription('Espera: Reunião de alinhamento')
      const iniciar = within(item).getByRole('button', { name: 'Iniciar Mapa de custos' })
      expect(iniciar).toBeDisabled()
      expect(iniciar).toHaveAccessibleDescription('Espera: Reunião de alinhamento')
      expect(within(item).getByRole('button', { name: 'Não se aplica: Mapa de custos' })).toBeEnabled()
    })

    it('em andamento e bloqueada (dependência reaberta): Pausar continua ligado', () => {
      const { item } = linha(t('t1', 'Plano', { estado: 'andamento', depende_de: ['t0'] }))
      expect(within(item).getByRole('button', { name: 'Pausar Plano' })).toBeEnabled()
      expect(item).toHaveTextContent('Espera: Reunião de alinhamento')
    })

    // Pedido do Diego (19/11): sem comentários, nada de espaço vazio entre os botões; o 💬 fica antes do prazo.
    it('sem comentários não sobra espaço entre Não se aplica e o lápis; o 💬 fica antes do prazo, fora das ações', () => {
      const { item } = linha(t('a', 'Sem conversa'))
      expect(item.querySelectorAll('[data-acoes] > [aria-hidden="true"]')).toHaveLength(0)
      cleanup()
      const { item: comConversa } = linha(t('t1', 'Análise do DRE', { comentarios: 2 }))
      const botao = within(comConversa).getByRole('button', { name: '2 comentários em Análise do DRE' })
      expect(comConversa.querySelector('[data-acoes]').contains(botao)).toBe(false)
      expect(botao.closest('[data-prazo]')).not.toBeNull()
    })

    it('💬 N só quando há comentários; abre o Editar', async () => {
      expect(within(linha(t('a', 'Sem conversa')).item).queryByRole('button', { name: /comentário/ })).not.toBeInTheDocument()
      cleanup()
      const tarefa = t('t1', 'Análise do DRE', { comentarios: 2 })
      const { item, aoEditar } = linha(tarefa)
      const botao = within(item).getByRole('button', { name: '2 comentários em Análise do DRE' })
      expect(botao).toHaveTextContent('2')
      await userEvent.click(botao)
      expect(aoEditar).toHaveBeenCalledWith(tarefa)
    })

    it('no celular, as ações vão para o "⋯" (o Editar junto); bloqueada fica sem Iniciar no menu', async () => {
      const tarefa = t('t1', 'Análise do DRE', { comentarios: 1 })
      const { item, aoMarcar, aoEditar } = linha(tarefa)
      expect(item.querySelector('[data-acoes]')).toHaveClass('max-sm:hidden')
      const mais = within(item).getByRole('button', { name: 'Ações de Análise do DRE' })
      expect(mais).toHaveClass('sm:hidden')
      await userEvent.click(mais)
      const menu = screen.getByRole('menu', { name: 'Ações de Análise do DRE' })
      expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Iniciar', 'Não se aplica…', 'Comentários (1)', 'Editar'])
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Iniciar' }))
      expect(aoMarcar).toHaveBeenCalledWith(tarefa, 'andamento')
      await userEvent.click(mais)
      await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }))
      expect(aoEditar).toHaveBeenCalledWith(tarefa)

      cleanup()
      const presa = linha(t('t2', 'Mapa', { depende_de: ['t0'] }))
      await userEvent.click(within(presa.item).getByRole('button', { name: 'Ações de Mapa' }))
      expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Não se aplica…', 'Editar'])
    })

    it('a gestão (comenta, não marca): check desligado, sem Iniciar nem Não se aplica, com Editar', () => {
      const { item } = linha(t('t1', 'Análise do DRE'), { podeMarcar: false, podeComentar: true })
      expect(within(item).getByRole('checkbox')).toBeDisabled()
      expect(within(item).queryByRole('button', { name: /^Iniciar/ })).not.toBeInTheDocument()
      expect(within(item).queryByRole('button', { name: /^Não se aplica/ })).not.toBeInTheDocument()
      expect(within(item).getByRole('button', { name: 'Editar Análise do DRE' })).toBeInTheDocument()
    })

    it('a Central (só lê): o lápis vira "Ver"', () => {
      const { item } = linha(t('t1', 'Análise do DRE'), { podeMarcar: false, podeComentar: false })
      expect(within(item).getByRole('button', { name: 'Ver Análise do DRE' })).toBeInTheDocument()
      expect(within(item).queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument()
    })

    it('ocupada (indo para o banco): a linha diz aria-busy', () => {
      expect(linha(t('t1', 'A'), { ocupada: true }).item).toHaveAttribute('aria-busy', 'true')
    })
  })
})
