import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comentariosDaTarefa, historicoDaTarefa } from '@/data/checklists'
import JanelaDaTarefa, { JanelaNaoSeAplica } from './JanelaDaTarefa'
import { situacaoDaTarefa } from './situacao'

vi.mock('@/data/checklists', () => ({
  comentariosDaTarefa: vi.fn(), comentarTarefa: vi.fn(), editarComentarioDaTarefa: vi.fn(), apagarComentarioDaTarefa: vi.fn(),
  historicoDaTarefa: vi.fn(),
}))

// "Hoje" é 17/11/2026 em São Paulo (12:00).
const AGORA = new Date('2026-11-17T15:00:00Z')
const HOJE = '2026-11-17'
const ETAPAS = [{ id: 'e1', nome: 'Diagnóstico' }, { id: 'e2', nome: 'Plano' }]
const t = (id, etapa, titulo, campos = {}) => ({
  id, etapa_id: etapa, titulo, descricao: null, obrigatoria: true, prazo_dias: 10, vence_em: '2026-11-20', estado: 'a_fazer',
  nota: null, motivo: null, feita_em: null, feita_por: null, depende_de: [], na_sessao: false, tempo_segundos: 0,
  trecho_aberto_desde: null, comentarios: 0, ...campos,
})
const TAREFAS = [
  t('t1', 'e1', 'Reunião de alinhamento', { prazo_dias: 2, vence_em: '2026-11-12', estado: 'feita', feita_em: '2026-11-12T15:00:00Z', feita_por: { nome: 'Ana Lima' } }),
  t('t2', 'e1', 'Análise do DRE', { descricao: 'Últimos 12 meses', depende_de: ['t1'], nota: 'Faltam os extratos' }),
  t('t3', 'e2', 'Mapa de custos', { obrigatoria: false, prazo_dias: 7, vence_em: HOJE, depende_de: ['t2'] }),
  t('t4', 'e2', 'Plano de ação', {
    prazo_dias: 3, vence_em: '2026-11-13', estado: 'andamento', tempo_segundos: 300, trecho_aberto_desde: '2026-11-17T14:55:00Z',
    lido_em: AGORA.getTime(),
  }),
  t('t5', 'e2', 'Revisão', { estado: 'pausada', tempo_segundos: 12 * 60 }),
  t('t6', 'e2', 'Inventário', {
    estado: 'nao_se_aplica', motivo: 'O cliente não tem estoque', feita_em: '2026-11-14T15:00:00Z', feita_por: { nome: 'Ana Lima' },
  }),
]

function abrir(id, { podeMarcar = true, tarefas = TAREFAS, aoSalvar = vi.fn().mockResolvedValue({ erro: null }) } = {}) {
  const porId = new Map(tarefas.map((x) => [x.id, x]))
  const situacoes = new Map(tarefas.map((x) => [x.id, situacaoDaTarefa(x, porId, HOJE)]))
  const aoFechar = vi.fn()
  const aoMexer = vi.fn()
  render(
    <JanelaDaTarefa tarefa={porId.get(id)} etapas={ETAPAS} tarefas={tarefas} situacoes={situacoes} nomeDoCliente="Provedor Alfa"
      inicio="2026-11-10" podeMarcar={podeMarcar} aoSalvar={aoSalvar} aoMexer={aoMexer} aoFechar={aoFechar} />,
  )
  const janela = screen.getByRole('dialog', { name: porId.get(id).titulo })
  const rodape = janela.querySelector('[data-slot="janela-rodape"]')
  const botoes = () => within(rodape).getAllByRole('button').map((b) => b.textContent.trim())
  const situacao = () => within(janela).getByRole('group', { name: 'Situação' })
  const aba = (nome) => within(situacao()).getByRole('button', { name: nome })
  return { janela, rodape, botoes, situacao, aba, aoSalvar, aoFechar, aoMexer }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA })
  vi.mocked(comentariosDaTarefa).mockResolvedValue({ itens: [], haMais: false, podeComentar: true })
  vi.mocked(historicoDaTarefa).mockResolvedValue({ eventos: [], trechos: [], tempo_segundos: 0 })
})
afterEach(() => vi.useRealTimers())

describe('JanelaDaTarefa (Editar tarefa)', () => {
  it('onde a tarefa está, o que vem do modelo (só ler), o prazo (só ler) e a nota', () => {
    const { janela } = abrir('t2')
    expect(janela).toHaveTextContent('Editar tarefa · Provedor Alfa · etapa 1, Diagnóstico · obrigatória')
    expect(janela).toHaveTextContent('Últimos 12 meses')
    expect(janela).toHaveTextContent('Vem do modelo: o título e a descrição mudam no modelo.')
    const prazo = within(janela).getByRole('region', { name: 'Prazo' })
    expect(prazo).toHaveTextContent('Vence 20/11 · faltam 3 dias')
    expect(prazo).toHaveTextContent('sexta-feira, 20/11/2026 · dia 10 a partir de 10/11/2026')
    expect(within(prazo).queryByRole('button')).not.toBeInTheDocument()
    expect(within(janela).getByRole('textbox', { name: 'Nota (opcional)' })).toHaveValue('Faltam os extratos')
  })

  it('situação em abas: A fazer, Em andamento, Pausada, Feita e Não se aplica, com a de agora escolhida', () => {
    const { situacao, aba } = abrir('t2')
    expect(within(situacao()).getAllByRole('button').map((b) => b.textContent)).toEqual(['A fazer', 'Em andamento', 'Pausada', 'Feita', 'Não se aplica'])
    expect(aba('A fazer')).toHaveAttribute('aria-pressed', 'true')
    for (const b of within(situacao()).getAllByRole('button')) expect(b).toBeEnabled()
  })

  it('trocar a situação e salvar manda a situação e a nota (Salvar mostra "Salvando…")', async () => {
    let responder
    const aoSalvar = vi.fn(() => new Promise((r) => { responder = r }))
    const { janela, rodape, aba, botoes, aoFechar } = abrir('t2', { aoSalvar })
    expect(botoes()).toEqual(['Cancelar', 'Salvar'])
    await userEvent.click(aba('Feita'))
    const nota = within(janela).getByRole('textbox', { name: 'Nota (opcional)' })
    await userEvent.clear(nota)
    await userEvent.type(nota, 'Recebi tudo')
    await userEvent.click(within(rodape).getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ estado: 'feita', motivo: null, nota: 'Recebi tudo', comentario: null })
    expect(within(rodape).getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    responder({ erro: null })
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
  })

  it('erro do banco fica na janela', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: 'Esta tarefa depende de outras que ainda não foram feitas.' })
    const { janela, rodape, aba, aoFechar } = abrir('t2', { aoSalvar })
    await userEvent.click(aba('Em andamento'))
    await userEvent.click(within(rodape).getByRole('button', { name: 'Salvar' }))
    expect(await within(janela).findByText('Esta tarefa depende de outras que ainda não foram feitas.')).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
  })

  it('o motivo só aparece em "Não se aplica": obrigatório (erro embaixo do campo), até 500, com o contador', async () => {
    const { janela, rodape, aba, aoSalvar } = abrir('t2')
    expect(within(janela).queryByRole('textbox', { name: 'Motivo' })).not.toBeInTheDocument()
    await userEvent.click(aba('Não se aplica'))
    const motivo = within(janela).getByRole('textbox', { name: 'Motivo' })
    expect(motivo).toHaveAttribute('maxlength', '500')
    expect(motivo).toHaveClass('texto-de-campo')
    expect(janela).toHaveTextContent('0/500')
    expect(janela).toHaveTextContent('A tarefa fecha sem ser feita e libera as que dependem dela.')
    await userEvent.click(within(rodape).getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).not.toHaveBeenCalled()
    expect(motivo).toHaveAttribute('aria-invalid', 'true')
    expect(motivo).toHaveAccessibleDescription(/Conte por que esta tarefa não se aplica\./)
    expect(motivo).toHaveFocus()
    await userEvent.type(motivo, '  Cliente já tem o DRE auditado ')
    expect(motivo).not.toHaveAttribute('aria-invalid')
    await userEvent.click(within(rodape).getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ estado: 'nao_se_aplica', motivo: 'Cliente já tem o DRE auditado', nota: 'Faltam os extratos', comentario: null })
  })

  it('a que não se aplica: o motivo vem preenchido e trocar o motivo é ali (vai no Salvar)', async () => {
    const { janela, rodape, aba, aoSalvar } = abrir('t6')
    expect(aba('Não se aplica')).toHaveAttribute('aria-pressed', 'true')
    expect(janela).toHaveTextContent('Não se aplica por Ana Lima em 14/11/2026')
    const motivo = within(janela).getByRole('textbox', { name: 'Motivo' })
    expect(motivo).toHaveValue('O cliente não tem estoque')
    expect(janela).toHaveTextContent('Trocar o motivo grava "Motivo trocado" no Histórico do cliente.')
    await userEvent.clear(motivo)
    await userEvent.type(motivo, 'O estoque é do fornecedor')
    await userEvent.click(within(rodape).getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ estado: 'nao_se_aplica', motivo: 'O estoque é do fornecedor', nota: '', comentario: null })
  })

  it('bloqueada: Em andamento, Pausada e Feita desligadas com "Espera: …"; A fazer e Não se aplica continuam', () => {
    const { janela, aba } = abrir('t3')
    for (const nome of ['Em andamento', 'Pausada', 'Feita']) expect(aba(nome)).toBeDisabled()
    for (const nome of ['A fazer', 'Não se aplica']) expect(aba(nome)).toBeEnabled()
    expect(janela).toHaveTextContent('Espera: Análise do DRE.')
    expect(janela).toHaveTextContent('Editar tarefa · Provedor Alfa · etapa 2, Plano · opcional')
  })

  it('em andamento e bloqueada (dependência reaberta): Pausada continua ligada', () => {
    const tarefas = TAREFAS.map((x) => (x.id === 't4' ? { ...x, depende_de: ['t2'] } : x))
    const { aba } = abrir('t4', { tarefas })
    expect(aba('Pausada')).toBeEnabled()
    expect(aba('Feita')).toBeDisabled()
  })

  it('o tempo: correndo na em andamento (desde quando) e os minutos feitos na pausada', () => {
    expect(abrir('t4').janela).toHaveTextContent('Tempo feito: 05:00 · em andamento desde 11:55')
    expect(abrir('t5').janela).toHaveTextContent('Tempo feito: 12 min · pausada')
  })

  it('o histórico curto da tarefa: as linhas do Histórico e os trechos de tempo, do mais novo ao mais antigo', async () => {
    vi.mocked(historicoDaTarefa).mockResolvedValue({
      eventos: [
        { id: 'h2', tipo: 'motivo_trocado', em: '2026-11-16T13:00:00Z', autor: 'Ana Lima', motivo: 'Sem estoque próprio' },
        { id: 'h1', tipo: 'tarefa_nao_se_aplica', em: '2026-11-14T15:00:00Z', autor: 'Ana Lima', motivo: 'Sem estoque' },
      ],
      trechos: [{ inicio: '2026-11-13T13:00:00Z', fim: '2026-11-13T13:12:00Z', pessoa: 'Ana Lima' }],
      tempo_segundos: 720,
    })
    const { janela } = abrir('t6')
    expect(historicoDaTarefa).toHaveBeenCalledWith('t6')
    const historico = await within(janela).findByRole('list', { name: 'Histórico da tarefa' })
    await waitFor(() => expect(within(historico).getAllByRole('listitem')).toHaveLength(3))
    expect(within(historico).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      'Motivo trocado por Ana Lima: “Sem estoque próprio”16/11/2026, 10:00',
      'Não se aplica por Ana Lima: “Sem estoque”14/11/2026, 12:00',
      'Trabalhada por Ana Lima: 12 min13/11/2026, 10:00',
    ])
    expect(janela).toHaveTextContent('O histórico completo fica na aba Histórico do cliente.')
  })

  it('os comentários ficam no formulário; o rascunho vai junto no Salvar', async () => {
    const { janela, rodape, aoSalvar } = abrir('t2')
    const campo = await within(janela).findByRole('textbox', { name: 'Novo comentário' })
    await userEvent.type(campo, 'Liguei para o cliente')
    await userEvent.click(within(rodape).getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ estado: 'a_fazer', motivo: null, nota: 'Faltam os extratos', comentario: 'Liguei para o cliente' })
  })

  it('com um comentário em edição, Salvar pede para salvar ou cancelar a edição (erro embaixo do campo)', async () => {
    vi.mocked(comentariosDaTarefa).mockResolvedValue({
      itens: [{ id: 'c1', texto: 'Oi', criado_em: '2026-11-17T12:00:00Z', editado_em: null, autor: { nome: 'Ana Lima' }, pode_editar: true, pode_apagar: true }],
      haMais: false, podeComentar: true,
    })
    const { janela, rodape, aoSalvar } = abrir('t2')
    await userEvent.click(await within(janela).findByRole('button', { name: 'Editar comentário' }))
    await userEvent.click(within(rodape).getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).not.toHaveBeenCalled()
    const campo = within(janela).getByRole('textbox', { name: 'Texto do comentário' })
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('Salve ou cancele o comentário que você está editando.')
  })

  describe('pergunta ao descartar', () => {
    it('sem mudança, Cancelar fecha direto', async () => {
      const { aoFechar } = abrir('t2')
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(aoFechar).toHaveBeenCalledTimes(1)
    })

    it('com a nota mudada, Esc pergunta; Descartar fecha', async () => {
      const { aoFechar } = abrir('t2')
      await userEvent.type(screen.getByRole('textbox', { name: 'Nota (opcional)' }), ' e de outubro')
      await userEvent.keyboard('{Escape}')
      expect(aoFechar).not.toHaveBeenCalled()
      await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Descartar o que você digitou?' })).getByRole('button', { name: 'Descartar' }))
      expect(aoFechar).toHaveBeenCalledTimes(1)
    })

    it('a situação trocada e o comentário escrito também perguntam', async () => {
      const a = abrir('t2')
      await userEvent.click(a.aba('Feita'))
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.getByRole('alertdialog', { name: 'Descartar o que você digitou?' })).toBeInTheDocument()
      expect(a.aoFechar).not.toHaveBeenCalled()
    })
  })

  describe('quem só acompanha', () => {
    it('a gestão: Fechar; situação, nota e motivo só para ler; comenta (com rascunho, Fechar pergunta)', async () => {
      const { janela, botoes, aoFechar } = abrir('t6', { podeMarcar: false })
      expect(botoes()).toEqual(['Fechar'])
      expect(within(janela).queryByRole('group', { name: 'Situação' })).not.toBeInTheDocument()
      expect(within(janela).getByRole('region', { name: 'Motivo' })).toHaveTextContent('O cliente não tem estoque')
      expect(within(janela).getByRole('region', { name: 'Nota' })).toHaveTextContent('Sem nota.')
      expect(within(janela).queryByRole('textbox', { name: /Nota|Motivo/ })).not.toBeInTheDocument()
      await userEvent.type(await within(janela).findByRole('textbox', { name: 'Novo comentário' }), 'Ok')
      await userEvent.click(within(janela.querySelector('[data-slot="janela-rodape"]')).getByRole('button', { name: 'Fechar' }))
      expect(screen.getByRole('alertdialog', { name: 'Descartar o que você digitou?' })).toBeInTheDocument()
      expect(aoFechar).not.toHaveBeenCalled()
    })

    it('a Central: Fechar e nada para mudar', async () => {
      vi.mocked(comentariosDaTarefa).mockResolvedValue({ itens: [], haMais: false, podeComentar: false })
      const { janela, botoes, aoFechar } = abrir('t2', { podeMarcar: false })
      expect(botoes()).toEqual(['Fechar'])
      await within(janela).findByText('Nenhum comentário ainda.')
      expect(within(janela).queryByRole('textbox', { name: /Nota|Motivo|comentário/ })).not.toBeInTheDocument()
      expect(janela).toHaveTextContent('Faltam os extratos')
      await userEvent.click(within(janela.querySelector('[data-slot="janela-rodape"]')).getByRole('button', { name: 'Fechar' }))
      expect(aoFechar).toHaveBeenCalled()
    })
  })
})

describe('JanelaNaoSeAplica (o motivo pedido na hora, da linha)', () => {
  function abrirNsa(id, { aoMarcar = vi.fn().mockResolvedValue({ erro: null }), tarefas = TAREFAS } = {}) {
    const porId = new Map(tarefas.map((x) => [x.id, x]))
    const aoFechar = vi.fn()
    render(<JanelaNaoSeAplica tarefa={porId.get(id)} situacao={situacaoDaTarefa(porId.get(id), porId, HOJE)} aoMarcar={aoMarcar} aoFechar={aoFechar} />)
    return { janela: screen.getByRole('dialog', { name: 'Por que não se aplica?' }), aoMarcar, aoFechar }
  }

  it('motivo obrigatório (erro embaixo do campo); grava sem os espaços das pontas e fecha', async () => {
    const { janela, aoMarcar, aoFechar } = abrirNsa('t2')
    expect(janela).toHaveTextContent('Análise do DRE')
    const motivo = within(janela).getByRole('textbox', { name: 'Motivo' })
    expect(motivo).toHaveFocus()
    const marcar = within(janela).getByRole('button', { name: 'Marcar não se aplica' })
    await userEvent.click(marcar)
    expect(aoMarcar).not.toHaveBeenCalled()
    expect(motivo).toHaveAccessibleDescription(/Conte por que esta tarefa não se aplica\./)
    await userEvent.type(motivo, ' Não precisa ')
    await userEvent.click(marcar)
    expect(aoMarcar).toHaveBeenCalledWith('Não precisa')
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
  })

  it('bloqueada: avisa que as que dependem dela continuam esperando', () => {
    expect(abrirNsa('t3').janela).toHaveTextContent('A tarefa fecha sem ser feita. As que dependem dela continuam esperando Análise do DRE.')
  })

  it('com o motivo escrito, fechar pergunta', async () => {
    const { janela, aoFechar } = abrirNsa('t2')
    await userEvent.type(within(janela).getByRole('textbox', { name: 'Motivo' }), 'x')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog', { name: 'Descartar o que você digitou?' })).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
  })
})
