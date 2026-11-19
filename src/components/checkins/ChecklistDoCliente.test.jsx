import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  anotarTarefa, aplicarModelo, comentariosDaTarefa, comentarTarefa, historicoDaTarefa, lerChecklist, marcarTarefa, modelosParaAplicar,
  mudarInicio, tirarModelo, trocarMotivo,
} from '@/data/checklists'
import { escolherData, escolherNoSeletor } from '@/test/campos'
import { renderizarTela } from '@/test/renderizar'
import ChecklistDoCliente from './ChecklistDoCliente'

vi.mock('@/data/checklists', () => ({
  lerChecklist: vi.fn(), modelosParaAplicar: vi.fn(), aplicarModelo: vi.fn(), mudarInicio: vi.fn(), tirarModelo: vi.fn(),
  marcarTarefa: vi.fn(), anotarTarefa: vi.fn(), trocarMotivo: vi.fn(), comentariosDaTarefa: vi.fn(), comentarTarefa: vi.fn(),
  editarComentarioDaTarefa: vi.fn(), apagarComentarioDaTarefa: vi.fn(), historicoDaTarefa: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

// "Hoje" é 17/11/2026 em São Paulo.
const AGORA = new Date('2026-11-17T15:00:00Z')

const CLIENTE = {
  id: 'k1', nome: 'Provedor Alfa', arquivado: false, consultoria_id: 's1', consultor_id: 'p1',
  consultor: { id: 'p1', nome: 'Ana Lima' },
}
const tarefa = (id, etapa, posicao, titulo, campos = {}) => ({
  id, etapa_id: etapa, posicao, titulo, descricao: null, obrigatoria: true, prazo_dias: 0, vence_em: '2026-11-25',
  estado: 'a_fazer', nota: null, feita_em: null, feita_por: null, depende_de: [], na_sessao: false, ...campos,
})
// Uma feita, uma livre (depende da feita), uma atrasada (opcional), uma bloqueada que vence hoje e uma em andamento.
const TAREFAS = [
  tarefa('t1', 'e1', 1, 'Reunião de alinhamento', {
    descricao: 'Objetivos e escopo', prazo_dias: 2, vence_em: '2026-11-12', estado: 'feita',
    feita_em: '2026-11-12T15:00:00Z', feita_por: { nome: 'Ana Lima' },
  }),
  tarefa('t2', 'e1', 2, 'Análise do DRE', { prazo_dias: 10, vence_em: '2026-11-20', depende_de: ['t1'], nota: 'Faltam os extratos de setembro' }),
  tarefa('t3', 'e1', 3, 'Coleta de documentos', { obrigatoria: false, prazo_dias: 5, vence_em: '2026-11-15' }),
  tarefa('t4', 'e2', 4, 'Mapa de custos', { prazo_dias: 7, vence_em: '2026-11-17', depende_de: ['t2'] }),
  tarefa('t5', 'e2', 5, 'Plano de ação', { prazo_dias: 20, vence_em: '2026-11-30', estado: 'andamento' }),
]
const DADOS = {
  pode_aplicar: false,
  pode_marcar: true,
  consultor: { id: 'p1', nome: 'Ana Lima' },
  checklist: {
    id: 'cl1', modelo_id: 'm1', modelo_nome: 'Gestão financeira', inicio: '2026-11-10', aplicado_em: '2026-11-10T13:00:00Z',
    aplicado_por: { nome: 'Gil Gestor' },
  },
  etapas: [
    { id: 'e1', nome: 'Diagnóstico', posicao: 1, tarefas: 3, feitas: 1 },
    { id: 'e2', nome: 'Plano', posicao: 2, tarefas: 2, feitas: 0 },
  ],
  tarefas: TAREFAS,
  resumo: {
    tarefas: 5, feitas: 1, obrigatorias: 4, obrigatorias_feitas: 1, vencem_7_dias: 2, atrasadas: 1,
    proxima: { id: 't3', titulo: 'Coleta de documentos', vence_em: '2026-11-15' },
  },
  sessao: null,
  ultimo_checkin: { inicio: '2026-11-12T13:00:00Z', fim: '2026-11-12T14:30:00Z', consultor: { nome: 'Ana Lima' } },
}
const SEM_MODELO = {
  ...DADOS, checklist: null, etapas: [], tarefas: [], ultimo_checkin: null,
  resumo: { tarefas: 0, feitas: 0, obrigatorias: 0, obrigatorias_feitas: 0, vencem_7_dias: 0, atrasadas: 0, proxima: null },
}
const GERENCIA = { ...DADOS, pode_aplicar: true, pode_marcar: false }

const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 's1' }
const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 's1' }
const central = { id: 'c0', papel: 'central', consultoria_id: null }

function tela(perfil, { cliente = CLIENTE, aoMudar = vi.fn(), checkins } = {}) {
  const r = renderizarTela(
    <ChecklistDoCliente cliente={cliente} perfil={perfil} versao={0} aoMudar={aoMudar} checkins={checkins} />, { perfil })
  return { ...r, aoMudar }
}
// A tabela de check-ins que a página manda (CheckinsDoCliente): aqui, um marcador.
const TABELA_DE_CHECKINS = <section aria-label="Tabela de check-ins (teste)">tabela</section>
const nomesDasCaixas = () => screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))
// A linha da tarefa pelo título (o título é texto, não abre nada).
const linhaDe = (titulo) => screen.getByText(titulo, { selector: '[data-titulo]' }).closest('li')
const titulosNaLista = () => [...document.querySelectorAll('[data-titulo]')].map((el) => el.textContent)
// O Editar: o lápis da linha, a aba da situação e o Salvar.
async function editar(titulo) {
  await userEvent.click(await screen.findByRole('button', { name: `Editar ${titulo}` }))
  return screen.getByRole('dialog', { name: titulo })
}
const situacaoNoEditar = (janela, nome) => within(within(janela).getByRole('group', { name: 'Situação' })).getByRole('button', { name: nome })
const salvar = (janela) => userEvent.click(within(janela.querySelector('[data-slot="janela-rodape"]')).getByRole('button', { name: 'Salvar' }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA })
  vi.mocked(lerChecklist).mockResolvedValue(DADOS)
  vi.mocked(comentariosDaTarefa).mockResolvedValue({ itens: [], haMais: false, podeComentar: true })
  vi.mocked(historicoDaTarefa).mockResolvedValue({ eventos: [], trechos: [], tempo_segundos: 0 })
})
afterEach(() => vi.useRealTimers())

describe('ChecklistDoCliente: com modelo', () => {
  it('barra (Filtros, Lista/Fluxograma, Todas/Pendentes/Feitas com os números, Próxima) e sem cartões de números', async () => {
    tela(consultor)
    await screen.findByRole('region', { name: 'Modelo aplicado' })
    expect(lerChecklist).toHaveBeenCalledWith('k1')
    // A aba Check-ins do cliente não tem cartões de números (pedido do Diego, 18/11), como o Quadro e a Agenda.
    expect(screen.queryByRole('region', { name: 'Andamento do check-list' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-cartao]')).toBeNull()

    const barra = screen.getByText('Filtros').closest('.card')
    const visao = within(barra).getByRole('group', { name: 'Visualização' })
    expect(within(visao).getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(visao).getByRole('button', { name: 'Fluxograma' })).toHaveAttribute('aria-pressed', 'false')
    const mostrar = within(barra).getByRole('group', { name: 'Mostrar' })
    expect(within(mostrar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todas5', 'Pendentes4', 'Feitas1'])
    expect(within(barra).queryByRole('group', { name: 'Orientação do fluxograma' })).not.toBeInTheDocument()
    expect(barra).toHaveTextContent('Próxima: Coleta de documentos · venceu 15/11')
  })

  it('caixa Modelo aplicado: nome, quem aplicou e quando, de quando contam os prazos, % e barra', async () => {
    tela(consultor)
    const modelo = await screen.findByRole('region', { name: 'Modelo aplicado' })
    expect(within(modelo).getByRole('heading', { name: 'Gestão financeira' })).toBeInTheDocument()
    expect(modelo).toHaveTextContent('Aplicado por Gil Gestor em 10/11/2026 · prazos contam de 10/11/2026')
    expect(within(modelo).getByText('20%')).toBeInTheDocument()
    expect(within(modelo).getByRole('progressbar', { name: 'Progresso do check-list' })).toHaveAttribute('aria-valuenow', '20')
    // O consultor segue o modelo: não troca, não muda o início nem tira.
    expect(within(modelo).queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByText(/Você acompanha/)).not.toBeInTheDocument()
  })

  it('a lista: um cartão por etapa ("1 de 3" e barra) e, em cada tarefa, o check, o título, o selo, a descrição e o prazo', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({ ...DADOS, tarefas: TAREFAS.map((t) => (t.id === 't1' ? { ...t, na_sessao: true } : t)) })
    tela(consultor)
    const diagnostico = await screen.findByRole('region', { name: '1 · Diagnóstico' })
    expect(diagnostico).toHaveTextContent('1 de 3')
    // O número da etapa no azul suave, com o texto escuro (modelo atual, 19/11).
    const numero = within(diagnostico).getByText('1', { selector: 'header > span' })
    expect(numero).toHaveClass('bg-primary/10', 'text-primary-texto')
    expect(numero.className).not.toMatch(/-cheio/)
    expect(within(diagnostico).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    expect(screen.getByRole('region', { name: '2 · Plano' })).toHaveTextContent('0 de 2')
    expect(nomesDasCaixas()).toEqual(['Reunião de alinhamento', 'Análise do DRE', 'Coleta de documentos', 'Mapa de custos', 'Plano de ação'])

    const item = (titulo) => screen.getByRole('checkbox', { name: titulo }).closest('li')
    // A feita é o check verde: sem selo, sem "feita por" e sem a nota na linha (ficam no Editar).
    expect(screen.getByRole('checkbox', { name: 'Reunião de alinhamento' })).toBeChecked()
    expect(item('Reunião de alinhamento')).not.toHaveTextContent('Ana Lima')
    expect(item('Reunião de alinhamento')).toHaveTextContent('Nesta sessão')
    expect(item('Reunião de alinhamento')).toHaveTextContent('Objetivos e escopo')
    expect(within(item('Análise do DRE')).getByRole('button', { name: /^Vence 20\/11/ })).toBeInTheDocument()
    expect(item('Análise do DRE')).not.toHaveTextContent('Faltam os extratos de setembro')
    expect(item('Coleta de documentos')).toHaveTextContent('Opcional')
    expect(within(item('Coleta de documentos')).getByRole('button', { name: /^Venceu 15\/11, atrasada há 2 dias/ })).toBeInTheDocument()
    expect(within(item('Mapa de custos')).getByRole('button', { name: /^Vence hoje/ })).toBeInTheDocument()
    expect(item('Mapa de custos')).toHaveTextContent('Bloqueada')
    expect(item('Plano de ação')).toHaveTextContent('Em andamento')
    expect(item('Análise do DRE')).not.toHaveTextContent('Nesta sessão')
    // "Nesta sessão" tem a cor dele (não a de "Em andamento").
    const nestaSessao = within(item('Reunião de alinhamento')).getByText('Nesta sessão')
    const emAndamento = within(item('Plano de ação')).getByText('Em andamento')
    expect(nestaSessao.className).not.toBe(emAndamento.className)
  })

  it('títulos em ordem: um h2 do check-list antes dos h3 das caixas e das etapas', async () => {
    tela(consultor)
    await screen.findByRole('region', { name: '1 · Diagnóstico' })
    const titulos = screen.getAllByRole('heading').map((h) => [Number(h.tagName[1]), h.textContent])
    expect(titulos[0]).toEqual([2, 'Check-list do cliente'])
    expect(titulos.slice(1).every(([nivel]) => nivel === 3)).toBe(true)
  })

  it('o consultor marca pela caixa na hora (antes do banco responder); o aviso diz o que liberou e que entrou no check-in', async () => {
    let responder
    vi.mocked(marcarTarefa).mockImplementation(() => new Promise((r) => { responder = r }))
    const { aoMudar } = tela(consultor)
    const caixa = await screen.findByRole('checkbox', { name: 'Análise do DRE' })
    expect(caixa).not.toBeChecked()
    await userEvent.click(caixa)
    expect(caixa).toBeChecked()
    expect(marcarTarefa).toHaveBeenCalledWith('t2', 'feita')
    expect(toast.success).not.toHaveBeenCalled()
    responder({ estado: 'feita', liberadas: [{ id: 't4', titulo: 'Mapa de custos' }], na_sessao: true, erro: null })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      'Análise do DRE feita. Agora dá para fazer: Mapa de custos. Entrou no resumo deste check-in.'))
    // Relê o check-list (a sessão e os números) e avisa a página (o botão de check-in e a tabela).
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })

  it('a tarefa marcada brilha uma vez (ao carregar, nenhuma)', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'feita', liberadas: [], na_sessao: false, erro: null })
    tela(consultor)
    const caixa = await screen.findByRole('checkbox', { name: 'Coleta de documentos' })
    expect(document.querySelector('.mudou')).toBeNull()
    await userEvent.click(caixa)
    await waitFor(() => expect(caixa.closest('li')).toHaveClass('mudou'))
    expect(document.querySelectorAll('.mudou')).toHaveLength(1)
  })

  it('marcar sem check-in aberto aqui: o aviso diz que fica feita, fora de uma sessão', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'feita', liberadas: [], na_sessao: false, erro: null })
    tela(consultor)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Coleta de documentos' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      'Coleta de documentos feita. Sem check-in aberto neste cliente: fica feita, fora de uma sessão.'))
  })

  it('desmarcar volta para a fazer (na hora); enquanto o banco não responde, a caixa fica parada', async () => {
    let responder
    vi.mocked(marcarTarefa).mockImplementation(() => new Promise((r) => { responder = r }))
    tela(consultor)
    const caixa = await screen.findByRole('checkbox', { name: 'Reunião de alinhamento' })
    expect(caixa).toBeChecked()
    await userEvent.click(caixa)
    expect(caixa).not.toBeChecked()
    expect(marcarTarefa).toHaveBeenCalledWith('t1', 'a_fazer')
    // Ocupada sem desligar: o foco do teclado fica na caixa; outro clique não manda de novo.
    expect(caixa).toBeEnabled()
    expect(caixa).toHaveFocus()
    expect(caixa.closest('li')).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(caixa)
    expect(marcarTarefa).toHaveBeenCalledTimes(1)
    responder({ estado: 'a_fazer', liberadas: [], na_sessao: false, erro: null })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Reunião de alinhamento voltou para a fazer.'))
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(caixa.closest('li')).not.toHaveAttribute('aria-busy'))
    expect(screen.getByRole('checkbox', { name: 'Reunião de alinhamento' })).toBe(caixa)
    expect(caixa).toHaveFocus()
  })

  it('recusa de tela velha (check-list trocado ou tirado, outro consultor…): a caixa volta, avisa e relê a aba e a página', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({
      erro: 'Este check-list foi trocado ou tirado. Atualize a página para ver o atual.', desatualizado: true,
    })
    const { aoMudar } = tela(consultor)
    const caixa = await screen.findByRole('checkbox', { name: 'Reunião de alinhamento' })
    await userEvent.click(caixa)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Este check-list foi trocado ou tirado. Atualize a página para ver o atual.'))
    expect(caixa).toBeChecked()
    // Relê: a aba mostra o check-list de agora (sem caixas vivas num check-list encerrado ou para quem saiu).
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })

  it('outra falha (rede): a caixa volta e avisa, sem reler nem avisar a página', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({ erro: 'Não foi possível concluir agora. Tente de novo.' })
    const { aoMudar } = tela(consultor)
    const caixa = await screen.findByRole('checkbox', { name: 'Reunião de alinhamento' })
    await userEvent.click(caixa)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível concluir agora. Tente de novo.'))
    expect(caixa).toBeChecked()
    expect(lerChecklist).toHaveBeenCalledTimes(1)
    expect(aoMudar).not.toHaveBeenCalled()
  })

  it('no Editar, recusa de tela velha fecha a janela, avisa e relê', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({ erro: 'Só o consultor do cliente marca as tarefas.', desatualizado: true })
    const { aoMudar } = tela(consultor)
    const janela = await editar('Análise do DRE')
    await userEvent.click(situacaoNoEditar(janela, 'Feita'))
    await salvar(janela)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast.error).toHaveBeenCalledWith('Só o consultor do cliente marca as tarefas.')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalled()
  })

  it('se a releitura depois de marcar falha, o check-list continua na tela (com o que foi marcado) e um aviso pede atualizar', async () => {
    vi.mocked(lerChecklist).mockResolvedValueOnce(DADOS).mockRejectedValueOnce(new Error('rede'))
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'feita', liberadas: [], na_sessao: false, erro: null })
    tela(consultor)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Coleta de documentos' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Não foi possível atualizar o check-list. Atualize a página para ver o de agora.'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Coleta de documentos' })).toBeChecked()
    expect(screen.getByRole('region', { name: 'Modelo aplicado' })).toBeInTheDocument()
  })

  it('em andamento e bloqueada (uma dependência foi reaberta): o selo "Em andamento" e o que ela espera; Pausar continua', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({
      ...DADOS, tarefas: TAREFAS.map((t) => (t.id === 't5' ? { ...t, depende_de: ['t2', 't3'] } : t)),
    })
    tela(consultor)
    const caixa = await screen.findByRole('checkbox', { name: 'Plano de ação' })
    const item = caixa.closest('li')
    expect(within(item).getAllByText(/Em andamento/)).toHaveLength(1)
    expect(item).not.toHaveTextContent('Bloqueada')
    expect(caixa).toBeDisabled()
    expect(caixa).toHaveAccessibleDescription('Espera: Análise do DRE e Coleta de documentos')
    expect(within(item).getByRole('button', { name: 'Pausar Plano de ação' })).toBeEnabled()
  })

  it('a bloqueada fica desligada, com o que ela espera à vista e ligado à caixa e ao Iniciar', async () => {
    tela(consultor)
    const caixa = await screen.findByRole('checkbox', { name: 'Mapa de custos' })
    expect(caixa).toBeDisabled()
    expect(caixa).toHaveAccessibleDescription('Espera: Análise do DRE')
    expect(screen.getByRole('button', { name: 'Iniciar Mapa de custos' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Análise do DRE' })).toBeEnabled()
  })

  it('a gestão acompanha: "Você acompanha…", caixas desligadas, e troca, muda o início e tira o modelo', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(GERENCIA)
    tela(gestor)
    expect(await screen.findByText('Você acompanha o andamento. Quem marca as tarefas é Ana Lima, o consultor do cliente.'))
      .toBeInTheDocument()
    for (const caixa of screen.getAllByRole('checkbox')) expect(caixa).toBeDisabled()
    const modelo = screen.getByRole('region', { name: 'Modelo aplicado' })
    expect(within(modelo).getAllByRole('button').map((b) => b.textContent.trim())).toEqual(['Trocar modelo', 'Início dos prazos', 'Tirar modelo'])
  })

  it('a Central só lê as tarefas (o lápis vira "Ver"; a janela da tarefa só tem Fechar) e aplica', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({ ...GERENCIA, pode_comentar: false })
    vi.mocked(comentariosDaTarefa).mockResolvedValue({ itens: [], haMais: false, podeComentar: false })
    tela(central)
    expect(screen.queryByRole('button', { name: /^Iniciar/ })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Ver Análise do DRE' }))
    const janela = screen.getByRole('dialog', { name: 'Análise do DRE' })
    const rodape = janela.querySelector('[data-slot="janela-rodape"]')
    expect(within(rodape).getAllByRole('button').map((b) => b.textContent.trim())).toEqual(['Fechar'])
    expect(await within(janela).findByText('Nenhum comentário ainda.')).toBeInTheDocument()
    expect(within(janela).queryByRole('textbox')).not.toBeInTheDocument()
    expect(janela).toHaveTextContent('Faltam os extratos de setembro')
    await userEvent.click(within(rodape).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trocar modelo' })).toBeInTheDocument()
  })

  it('Trocar modelo abre a janela de aplicar com o aviso de que o check-list começa do zero', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(GERENCIA)
    vi.mocked(modelosParaAplicar).mockResolvedValue({ itens: [], total: 0 })
    tela(gestor)
    await userEvent.click(await screen.findByRole('button', { name: 'Trocar modelo' }))
    const janela = screen.getByRole('dialog', { name: 'Trocar o modelo de Provedor Alfa' })
    expect(janela).toHaveTextContent(
      'O check-list atual (1 de 5 feitas) é trocado pelo do modelo novo, começando do zero. O que já foi feito continua nos check-ins e no Histórico.')
    expect(within(janela).getByRole('button', { name: 'Trocar modelo' })).toBeInTheDocument()
  })

  it('Início dos prazos abre com a data atual e salva com mudarInicio; depois relê e avisa a página', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(GERENCIA)
    vi.mocked(mudarInicio).mockResolvedValue({ erro: null })
    const { aoMudar } = tela(gestor)
    await userEvent.click(await screen.findByRole('button', { name: 'Início dos prazos' }))
    const janela = screen.getByRole('dialog', { name: 'Mudar o início dos prazos' })
    expect(within(janela).getByLabelText('Início dos prazos')).toHaveTextContent('10 de nov de 2026')
    await escolherData(userEvent, 'Início dos prazos', '2026-11-12')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(mudarInicio).toHaveBeenCalledWith('cl1', '2026-11-12')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Os prazos agora contam de 12/11/2026.')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalled()
  })

  it('Tirar modelo pede confirmação dizendo o que fica no histórico; confirmado, tira, relê e avisa a página', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(GERENCIA)
    vi.mocked(tirarModelo).mockResolvedValue({ erro: null, apagado: false })
    const { aoMudar } = tela(gestor)
    await userEvent.click(await screen.findByRole('button', { name: 'Tirar modelo' }))
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent('Tirar "Gestão financeira" de Provedor Alfa?')
    // Tocado (uma feita, uma nota): encerra e vira histórico, e o cliente fica sem poder ser apagado (usabilidade, U6).
    expect(confirmar).toHaveTextContent('O check-list sai da aba (1 de 5 feitas). O que foi feito continua nos check-ins e no '
      + 'Histórico, e o check-list fica guardado: o cliente não poderá mais ser apagado, só arquivado.')
    expect(tirarModelo).not.toHaveBeenCalled()
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Tirar modelo' }))
    expect(tirarModelo).toHaveBeenCalledWith('cl1')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('"Gestão financeira" saiu de Provedor Alfa. O que foi feito continua nos check-ins e no Histórico.')
  })

  // Usabilidade, U6: ninguém mexeu no check-list, então tirar o apaga de vez (o cliente volta a poder ser apagado).
  it('Tirar modelo de um check-list intocado diz que ele é apagado; o aviso segue o que o banco fez', async () => {
    const intocado = { ...GERENCIA, checklist: { ...GERENCIA.checklist, intocado: true } }
    vi.mocked(lerChecklist).mockResolvedValue(intocado)
    vi.mocked(tirarModelo).mockResolvedValue({ erro: null, apagado: true })
    vi.mocked(modelosParaAplicar).mockResolvedValue({ itens: [], total: 0 })
    tela(gestor)
    await userEvent.click(await screen.findByRole('button', { name: 'Tirar modelo' }))
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent('Ninguém mexeu neste check-list ainda: ele é apagado de vez, e o Histórico guarda só '
      + 'que o modelo foi aplicado e tirado.')
    expect(confirmar).not.toHaveTextContent('só arquivado')
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Tirar modelo' }))
    expect(tirarModelo).toHaveBeenCalledWith('cl1')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('"Gestão financeira" saiu de Provedor Alfa e o check-list foi apagado.'))
  })

  it('Trocar modelo de um check-list intocado avisa que ele é apagado', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({ ...GERENCIA, checklist: { ...GERENCIA.checklist, intocado: true } })
    vi.mocked(modelosParaAplicar).mockResolvedValue({ itens: [], total: 0 })
    tela(gestor)
    await userEvent.click(await screen.findByRole('button', { name: 'Trocar modelo' }))
    expect(screen.getByRole('dialog', { name: 'Trocar o modelo de Provedor Alfa' }))
      .toHaveTextContent('Ninguém mexeu no check-list atual ainda: ele é apagado e o do modelo novo começa do zero.')
  })

  it('Lista ↔ Fluxograma; Deitado/Em pé só no fluxograma; clicar num nó abre a tarefa', async () => {
    const { container } = tela(consultor)
    await screen.findByRole('region', { name: '1 · Diagnóstico' })
    await userEvent.click(screen.getByRole('button', { name: 'Fluxograma' }))
    expect(screen.queryByRole('region', { name: '1 · Diagnóstico' })).not.toBeInTheDocument()
    const fluxo = screen.getByRole('group', { name: 'Fluxograma das tarefas de Provedor Alfa' })
    expect(within(fluxo).getByText('1 de 3 feitas')).toBeInTheDocument()
    const orientacao = screen.getByRole('group', { name: 'Orientação do fluxograma' })
    expect(within(orientacao).getByRole('button', { name: 'Deitado' })).toHaveAttribute('aria-pressed', 'true')
    // Cada caixa diz a situação, com a mesma conta da lista (a em andamento não vira "Bloqueada").
    expect(within(fluxo).getByRole('button', { name: 'Mapa de custos: Bloqueada, vence hoje' })).toBeInTheDocument()
    expect(within(fluxo).getByRole('button', { name: 'Plano de ação: Em andamento' })).toBeInTheDocument()
    expect(container.querySelector('[data-tarefa="t3"]')).toHaveAttribute('data-situacao', 'atrasada')
    expect(screen.getByText(/Clique numa tarefa para ver os detalhes e marcar/)).toBeInTheDocument()

    await userEvent.click(within(orientacao).getByRole('button', { name: 'Em pé' }))
    expect(within(orientacao).getByRole('button', { name: 'Em pé' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(fluxo).getByRole('button', { name: 'Análise do DRE: A fazer' }))
    expect(screen.getByRole('dialog', { name: 'Análise do DRE' })).toBeInTheDocument()
    expect(container.querySelector('[data-tarefa="t2"]')).toHaveAttribute('data-selecionada')

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Lista' }))
    expect(screen.getByRole('region', { name: '1 · Diagnóstico' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Orientação do fluxograma' })).not.toBeInTheDocument()
  })

  it('Todas / Pendentes / Feitas filtram na tela (o check-list já veio inteiro); no fluxograma, as de fora ficam apagadas', async () => {
    const { container } = tela(consultor)
    await screen.findByRole('checkbox', { name: 'Análise do DRE' })
    await userEvent.click(screen.getByRole('button', { name: /^Feitas/ }))
    expect(nomesDasCaixas()).toEqual(['Reunião de alinhamento'])
    expect(screen.queryByRole('region', { name: '2 · Plano' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Pendentes/ }))
    expect(nomesDasCaixas()).toEqual(['Análise do DRE', 'Coleta de documentos', 'Mapa de custos', 'Plano de ação'])
    await userEvent.click(screen.getByRole('button', { name: 'Fluxograma' }))
    expect(container.querySelector('[data-tarefa="t1"]')).toHaveClass('opacity-30')
    expect(container.querySelector('[data-tarefa="t2"]')).not.toHaveClass('opacity-30')
    await userEvent.click(screen.getByRole('button', { name: /^Todas/ }))
    expect(container.querySelector('[data-tarefa="t1"]')).not.toHaveClass('opacity-30')
    expect(lerChecklist).toHaveBeenCalledTimes(1)
  })

  it('filtro sem nenhuma tarefa diz por quê', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({ ...DADOS, tarefas: TAREFAS.map((t) => ({ ...t, estado: 'a_fazer' })) })
    tela(consultor)
    await userEvent.click(await screen.findByRole('button', { name: /^Feitas/ }))
    expect(screen.getByText('Nenhuma tarefa feita ainda.')).toBeInTheDocument()
  })

  it('o lápis abre o Editar (o título não abre nada); Feita + Salvar marca, fecha, relê e avisa', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'feita', liberadas: [], na_sessao: false, erro: null })
    const { aoMudar } = tela(consultor)
    await userEvent.click(await screen.findByText('Análise do DRE', { selector: '[data-titulo]' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const janela = await editar('Análise do DRE')
    expect(janela).toHaveTextContent('Provedor Alfa · etapa 1, Diagnóstico · obrigatória')
    await userEvent.click(situacaoNoEditar(janela, 'Feita'))
    await salvar(janela)
    expect(marcarTarefa).toHaveBeenCalledWith('t2', 'feita')
    // A nota não mudou: não grava a nota.
    expect(anotarTarefa).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Análise do DRE feita. Sem check-in aberto neste cliente: fica feita, fora de uma sessão.')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalled()
  })

  it('no Editar, a nota mudada é gravada antes de mudar a situação; só a nota: "Nota salva."', async () => {
    vi.mocked(anotarTarefa).mockResolvedValue({ erro: null })
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'andamento', liberadas: [], na_sessao: false, erro: null })
    tela(consultor)
    let janela = await editar('Coleta de documentos')
    await userEvent.type(within(janela).getByLabelText('Nota (opcional)'), 'Pedi ao financeiro')
    await userEvent.click(situacaoNoEditar(janela, 'Em andamento'))
    await salvar(janela)
    expect(anotarTarefa).toHaveBeenCalledWith('t3', 'Pedi ao financeiro')
    expect(marcarTarefa).toHaveBeenCalledWith('t3', 'andamento')
    expect(anotarTarefa.mock.invocationCallOrder[0]).toBeLessThan(marcarTarefa.mock.invocationCallOrder[0])
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Coleta de documentos em andamento.'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    janela = await editar('Reunião de alinhamento')
    await userEvent.type(within(janela).getByLabelText('Nota (opcional)'), 'Ata no Drive')
    await salvar(janela)
    expect(anotarTarefa).toHaveBeenLastCalledWith('t1', 'Ata no Drive')
    expect(marcarTarefa).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Nota salva.'))
  })

  it('caixa Check-in com check-in aberto aqui: o relógio, quem e "Nesta sessão" com as tarefas marcadas nele', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({
      ...DADOS,
      sessao: {
        checkin_id: 'c9', inicio: new Date(AGORA.getTime() - 65 * 60_000).toISOString(), consultor: { nome: 'Ana Lima' },
        tarefas: [{ tarefa_id: 't1', titulo: 'Reunião de alinhamento' }],
      },
    })
    tela(consultor)
    const caixa = await screen.findByRole('region', { name: 'Check-in' })
    expect(within(caixa).getByText('Em andamento')).toBeInTheDocument()
    expect(within(caixa).getByText('1 h 05')).toBeInTheDocument()
    expect(within(within(caixa).getByRole('list', { name: 'Nesta sessão' })).getAllByRole('listitem').map((i) => i.textContent))
      .toEqual(['Reunião de alinhamento'])
  })

  it('consultor com check-in aberto em outro cliente: a caixa diz onde está, não manda fazer check-in aqui', async () => {
    const inicio = new Date(AGORA.getTime() - 30 * 60_000).toISOString()
    renderizarTela(
      <ChecklistDoCliente cliente={CLIENTE} perfil={consultor} versao={0} aoMudar={vi.fn()}
        checkinAberto={{ id: 'c7', cliente_id: 'k2', inicio, cliente: { nome: 'Provedor Beta' } }} />,
      { perfil: consultor },
    )
    const caixa = await screen.findByRole('region', { name: 'Check-in' })
    expect(caixa).toHaveTextContent('Você tem um check-in aberto em Provedor Beta desde')
    expect(caixa).toHaveTextContent('Faça o check-out lá para começar aqui.')
    expect(caixa).not.toHaveTextContent('Faça o check-in no botão')
  })

  it('caixa Check-in sem check-in aberto: "Sem check-in aberto" e o último', async () => {
    tela(gestor)
    const caixa = await screen.findByRole('region', { name: 'Check-in' })
    expect(caixa).toHaveTextContent('Sem check-in aberto')
    expect(caixa).toHaveTextContent('Último: 12/11/2026, 1 h 30 (Ana Lima)')
  })

  it('cliente arquivado: o check-list fica só para ler, e a tela diz isso', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({ ...DADOS, pode_marcar: false })
    tela(consultor, { cliente: { ...CLIENTE, arquivado: true } })
    expect(await screen.findByText('Este cliente está arquivado: o check-list fica só para ler.')).toBeInTheDocument()
    for (const caixa of screen.getAllByRole('checkbox')) expect(caixa).toBeDisabled()
  })

  it('Iniciar na linha: em andamento na hora (otimista); com a resposta, o relógio corre; o aviso diz isso', async () => {
    let responder
    vi.mocked(marcarTarefa).mockImplementation(() => new Promise((r) => { responder = r }))
    const desde = AGORA.toISOString()
    vi.mocked(lerChecklist).mockResolvedValueOnce(DADOS).mockResolvedValue({
      ...DADOS, tarefas: TAREFAS.map((t) => (t.id === 't2' ? { ...t, estado: 'andamento', tempo_segundos: 65, trecho_aberto_desde: desde } : t)),
    })
    tela(consultor)
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar Análise do DRE' }))
    expect(marcarTarefa).toHaveBeenCalledWith('t2', 'andamento')
    const item = linhaDe('Análise do DRE')
    expect(item.querySelector('[data-selo="andamento"]')).toHaveTextContent('Em andamento')
    expect(item).toHaveAttribute('aria-busy', 'true')
    responder({ estado: 'andamento', liberadas: [], na_sessao: false, tempo_segundos: 65, trecho_aberto_desde: desde, erro: null })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Análise do DRE em andamento.'))
    expect(linhaDe('Análise do DRE').querySelector('[data-selo="andamento"]')).toHaveTextContent('Em andamento · 01:05')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
  })

  it('Pausar na linha: pausada, com os minutos feitos no aviso', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({
      estado: 'pausada', liberadas: [], na_sessao: false, tempo_segundos: 12 * 60 + 30, trecho_aberto_desde: null, erro: null,
    })
    tela(consultor)
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar Plano de ação' }))
    expect(marcarTarefa).toHaveBeenCalledWith('t5', 'pausada')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Plano de ação pausada (12 min feitos).'))
  })

  it('a pausada: o selo com os minutos, Retomar na linha e "Pausada" no fluxograma e na legenda', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({
      ...DADOS, tarefas: TAREFAS.map((t) => (t.id === 't5' ? { ...t, estado: 'pausada', tempo_segundos: 25 * 60 } : t)),
    })
    const { container } = tela(consultor)
    expect(await screen.findByRole('button', { name: 'Retomar Plano de ação' })).toBeEnabled()
    expect(linhaDe('Plano de ação').querySelector('[data-selo="pausada"]')).toHaveTextContent('Pausada · 25 min')
    await userEvent.click(screen.getByRole('button', { name: 'Fluxograma' }))
    expect(screen.getByRole('button', { name: 'Plano de ação: Pausada' })).toBeInTheDocument()
    expect(container.querySelector('[data-tarefa="t5"]')).toHaveAttribute('data-situacao', 'pausada')
    expect(within(screen.getByRole('list', { name: 'Legenda do fluxograma' })).getByText('Pausada')).toBeInTheDocument()
  })

  it('💬 N na linha abre o Editar; comentar lá relê o check-list (a contagem) sem avisar a página', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({
      ...DADOS, pode_comentar: true, tarefas: TAREFAS.map((t) => (t.id === 't2' ? { ...t, comentarios: 2 } : t)),
    })
    vi.mocked(comentarTarefa).mockResolvedValue({
      erro: null,
      comentario: { id: 'c1', texto: 'Liguei', criado_em: AGORA.toISOString(), editado_em: null, autor: { nome: 'Ana Lima' }, pode_editar: true, pode_apagar: true },
    })
    const { aoMudar } = tela(consultor)
    await userEvent.click(await screen.findByRole('button', { name: '2 comentários em Análise do DRE' }))
    const janela = screen.getByRole('dialog', { name: 'Análise do DRE' })
    expect(comentariosDaTarefa).toHaveBeenCalledWith({ tarefaId: 't2' })
    await userEvent.type(await within(janela).findByRole('textbox', { name: 'Novo comentário' }), 'Liguei')
    await userEvent.click(within(janela).getByRole('button', { name: 'Comentar' }))
    expect(comentarTarefa).toHaveBeenCalledWith('t2', 'Liguei')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Análise do DRE' })).toBeInTheDocument()
  })

  it('no Editar, o comentário escrito vai junto no Salvar, depois da situação', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'feita', liberadas: [], na_sessao: false, erro: null })
    vi.mocked(comentarTarefa).mockResolvedValue({ erro: null, comentario: { id: 'c1' } })
    tela(consultor)
    const janela = await editar('Coleta de documentos')
    await userEvent.click(situacaoNoEditar(janela, 'Feita'))
    await userEvent.type(await within(janela).findByRole('textbox', { name: 'Novo comentário' }), 'Recebi por e-mail')
    await salvar(janela)
    expect(comentarTarefa).toHaveBeenCalledWith('t3', 'Recebi por e-mail')
    expect(marcarTarefa.mock.invocationCallOrder[0]).toBeLessThan(comentarTarefa.mock.invocationCallOrder[0])
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      'Coleta de documentos feita. Sem check-in aberto neste cliente: fica feita, fora de uma sessão. Comentário enviado.'))
  })

  it('a 360 px nada rola para o lado: barra quebra linha, caixas uma embaixo da outra, o fluxograma rola dentro do cartão', async () => {
    const { container } = tela(consultor)
    const modelo = await screen.findByRole('region', { name: 'Modelo aplicado' })
    expect(screen.getByText('Filtros').closest('.card')).toHaveClass('flex-wrap')
    expect(modelo.parentElement).toHaveClass('grid-cols-1', 'lg:grid-cols-2', 'min-w-0')
    await userEvent.click(screen.getByRole('button', { name: 'Fluxograma' }))
    const quadro = container.querySelector('[data-caixa-do-fluxo]')
    expect(quadro).toHaveClass('overflow-auto', 'max-w-full')
    expect(quadro.closest('.card')).toHaveClass('overflow-hidden', 'min-w-0')
    expect(container.innerHTML).not.toMatch(/max-w-(?:sm|md|lg|xl|\dxl|screen)[^"]*mx-auto|mx-auto[^"]*max-w-(?:sm|md|lg|xl|\dxl|screen)/)
  })

  it('no celular o fluxograma começa "Em pé"', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    try {
      tela(consultor)
      await userEvent.click(await screen.findByRole('button', { name: 'Fluxograma' }))
      expect(within(screen.getByRole('group', { name: 'Orientação do fluxograma' })).getByRole('button', { name: 'Em pé' }))
        .toHaveAttribute('aria-pressed', 'true')
    } finally {
      window.matchMedia = original
    }
  })
})

describe('ChecklistDoCliente: não se aplica', () => {
  const NSA = tarefa('t6', 'e2', 6, 'Inventário', {
    vence_em: '2026-11-01', estado: 'nao_se_aplica', motivo: 'O cliente não tem estoque', feita_em: '2026-11-14T15:00:00Z',
    feita_por: { nome: 'Ana Lima' },
  })
  const COM_NSA = {
    ...DADOS,
    tarefas: [...TAREFAS, NSA],
    etapas: [DADOS.etapas[0], { ...DADOS.etapas[1], tarefas: 3, nao_se_aplica: 1 }],
    resumo: { ...DADOS.resumo, tarefas: 6, nao_se_aplica: 1, resolvidas: 2 },
  }

  it('lista: selo cinza com ícone próprio no lugar da caixa; o motivo e quem marcou só no Editar; a etapa conta como resolvida', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(COM_NSA)
    tela(consultor)
    const plano = await screen.findByRole('region', { name: '2 · Plano' })
    expect(plano).toHaveTextContent('1 de 3')
    expect(nomesDasCaixas()).not.toContain('Inventário')
    const item = linhaDe('Inventário')
    expect(item.querySelector('[data-selo="nao_se_aplica"] .lucide-ban')).not.toBeNull()
    expect(item.querySelector('.lucide-check')).toBeNull()
    expect(item).toHaveTextContent('Não se aplica')
    expect(item).not.toHaveTextContent('Ana Lima')
    expect(item).not.toHaveTextContent('O cliente não tem estoque')
    expect(item).not.toHaveTextContent('Atrasada')
    const janela = await editar('Inventário')
    expect(within(janela).getByRole('textbox', { name: 'Motivo' })).toHaveValue('O cliente não tem estoque')
    expect(janela).toHaveTextContent('por Ana Lima em 14/11/2026')
  })

  it('a etapa diz "resolvidas" como o fluxograma; Tirar e Trocar modelo contam também as que não se aplicam', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({ ...COM_NSA, pode_aplicar: true, pode_marcar: false })
    vi.mocked(modelosParaAplicar).mockResolvedValue({ itens: [], total: 0 })
    tela(gestor)
    expect(await screen.findByRole('region', { name: '2 · Plano' })).toHaveTextContent('1 de 3 resolvidas')
    expect(screen.getByRole('region', { name: '1 · Diagnóstico' })).toHaveTextContent('1 de 3 feitas')
    await userEvent.click(screen.getByRole('button', { name: 'Tirar modelo' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('O check-list sai da aba (2 de 6 resolvidas: 1 feita, 1 não se aplica).')
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Trocar modelo' }))
    expect(screen.getByRole('dialog', { name: 'Trocar o modelo de Provedor Alfa' }))
      .toHaveTextContent('O check-list atual (2 de 6 resolvidas: 1 feita, 1 não se aplica) é trocado')
  })

  it('cadeia: a que depende de uma "não se aplica" presa fica bloqueada, esperando a pendente de verdade', async () => {
    const presa = tarefa('t6', 'e2', 6, 'Inventário', { estado: 'nao_se_aplica', motivo: 'Sem estoque', depende_de: ['t2'] })
    const depois = tarefa('t7', 'e2', 7, 'Contagem', { depende_de: ['t6'] })
    vi.mocked(lerChecklist).mockResolvedValue({ ...COM_NSA, tarefas: [...TAREFAS, presa, depois] })
    tela(consultor)
    const caixa = await screen.findByRole('checkbox', { name: 'Contagem' })
    expect(caixa).toBeDisabled()
    expect(caixa).toHaveAccessibleDescription('Espera: Análise do DRE')
  })

  it('marcar "não se aplica" numa tarefa que já estava (tela velha, outro motivo): avisa, fecha e relê', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({
      erro: 'Esta tarefa já está como não se aplica. Para trocar o motivo, use o Editar da tarefa.', desatualizado: true,
    })
    const { aoMudar } = tela(consultor)
    await userEvent.click(await screen.findByRole('button', { name: 'Não se aplica: Análise do DRE' }))
    const janela = screen.getByRole('dialog', { name: 'Por que não se aplica?' })
    await userEvent.type(within(janela).getByRole('textbox', { name: 'Motivo' }), 'Outro motivo')
    await userEvent.click(within(janela).getByRole('button', { name: 'Marcar não se aplica' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast.error).toHaveBeenCalledWith('Esta tarefa já está como não se aplica. Para trocar o motivo, use o Editar da tarefa.')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalled()
  })

  it('caixa Modelo aplicado: "2 de 6 resolvidas: 1 feita, 1 não se aplica" e o % conta as duas', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(COM_NSA)
    tela(consultor)
    const modelo = await screen.findByRole('region', { name: 'Modelo aplicado' })
    expect(modelo).toHaveTextContent('2 de 6 resolvidas: 1 feita, 1 não se aplica')
    expect(within(modelo).getByRole('progressbar', { name: 'Progresso do check-list' })).toHaveAttribute('aria-valuenow', '33')
  })

  it('"Mostrar" ganha "Não se aplica" (só quando há alguma); Pendentes não conta a que não se aplica', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(COM_NSA)
    tela(consultor)
    const mostrar = await screen.findByRole('group', { name: 'Mostrar' })
    expect(within(mostrar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todas6', 'Pendentes4', 'Feitas1', 'Não se aplica1'])
    await userEvent.click(within(mostrar).getByRole('button', { name: /^Não se aplica/ }))
    expect(titulosNaLista()).toEqual(['Inventário'])
    await userEvent.click(within(mostrar).getByRole('button', { name: /^Pendentes/ }))
    expect(titulosNaLista()).not.toContain('Inventário')
    await userEvent.click(within(mostrar).getByRole('button', { name: /^Feitas/ }))
    expect(nomesDasCaixas()).toEqual(['Reunião de alinhamento'])
  })

  it('o consultor marca pela linha, com o motivo pedido na hora: grava, fecha, avisa o que liberou, relê e avisa a página', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'nao_se_aplica', liberadas: [{ id: 't4', titulo: 'Mapa de custos' }], na_sessao: true, erro: null })
    const { aoMudar } = tela(consultor)
    await userEvent.click(await screen.findByRole('button', { name: 'Não se aplica: Análise do DRE' }))
    const janela = screen.getByRole('dialog', { name: 'Por que não se aplica?' })
    await userEvent.type(within(janela).getByRole('textbox', { name: 'Motivo' }), '  O DRE já veio auditado ')
    await userEvent.click(within(janela).getByRole('button', { name: 'Marcar não se aplica' }))
    expect(marcarTarefa).toHaveBeenCalledWith('t2', 'nao_se_aplica', 'O DRE já veio auditado')
    expect(anotarTarefa).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith(
      'Análise do DRE: não se aplica. Agora dá para fazer: Mapa de custos. Entrou no resumo deste check-in.')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalled()
  })

  it('sem check-in aberto, o aviso diz que fica fora de uma sessão; Reabrir desfaz', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(COM_NSA)
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'nao_se_aplica', liberadas: [], na_sessao: false, erro: null })
    tela(consultor)
    await userEvent.click(await screen.findByRole('button', { name: 'Não se aplica: Coleta de documentos' }))
    let janela = screen.getByRole('dialog', { name: 'Por que não se aplica?' })
    await userEvent.type(within(janela).getByRole('textbox', { name: 'Motivo' }), 'Documentos já entregues')
    await userEvent.click(within(janela).getByRole('button', { name: 'Marcar não se aplica' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      'Coleta de documentos: não se aplica. Sem check-in aberto neste cliente: fica fora de uma sessão.'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'a_fazer', liberadas: [], na_sessao: false, erro: null })
    janela = await editar('Inventário')
    await userEvent.click(situacaoNoEditar(janela, 'A fazer'))
    await salvar(janela)
    expect(marcarTarefa).toHaveBeenLastCalledWith('t6', 'a_fazer')
    await waitFor(() => expect(toast.success).toHaveBeenLastCalledWith('Inventário voltou para a fazer.'))
  })

  it('fluxograma: caixa cinza com a situação "Não se aplica" e a legenda com a cor nova', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(COM_NSA)
    const { container } = tela(consultor)
    await screen.findByRole('region', { name: '1 · Diagnóstico' })
    await userEvent.click(screen.getByRole('button', { name: 'Fluxograma' }))
    const fluxo = screen.getByRole('group', { name: 'Fluxograma das tarefas de Provedor Alfa' })
    expect(within(fluxo).getByRole('button', { name: 'Inventário: Não se aplica' })).toBeInTheDocument()
    expect(container.querySelector('[data-tarefa="t6"]')).toHaveAttribute('data-situacao', 'nao_se_aplica')
    expect(container.querySelector('[data-tarefa="t6"] .lucide-ban')).not.toBeNull()
    expect(within(fluxo).getByText('1 de 3 resolvidas')).toBeInTheDocument()
    const legenda = screen.getByRole('list', { name: 'Legenda do fluxograma' })
    expect(within(legenda).getByText('Não se aplica')).toBeInTheDocument()
  })

  it('a gestão e a Central só leem: o motivo aparece na janela, sem "Não se aplica" nem a situação para mudar', async () => {
    for (const [perfil, lapis] of [[gestor, 'Editar'], [central, 'Ver']]) {
      vi.mocked(lerChecklist).mockResolvedValue({ ...COM_NSA, pode_aplicar: true, pode_marcar: false, pode_comentar: perfil === gestor })
      const { unmount } = tela(perfil)
      expect(await screen.findByText('Inventário', { selector: '[data-titulo]' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Não se aplica:/ })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: `${lapis} Inventário` }))
      const janela = screen.getByRole('dialog', { name: 'Inventário' })
      expect(within(janela).getByRole('region', { name: 'Motivo' })).toHaveTextContent('O cliente não tem estoque')
      expect(within(janela).queryByRole('group', { name: 'Situação' })).not.toBeInTheDocument()
      await userEvent.click(within(janela.querySelector('[data-slot="janela-rodape"]')).getByRole('button', { name: 'Fechar' }))
      unmount()
    }
  })

  it('trocar o motivo é no Editar: grava com trocarMotivo, avisa, relê e avisa a página', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(COM_NSA)
    vi.mocked(trocarMotivo).mockResolvedValue({ erro: null })
    const { aoMudar } = tela(consultor)
    const janela = await editar('Inventário')
    const motivo = within(janela).getByRole('textbox', { name: 'Motivo' })
    await userEvent.clear(motivo)
    await userEvent.type(motivo, 'O estoque é do fornecedor')
    await salvar(janela)
    expect(trocarMotivo).toHaveBeenCalledWith('t6', 'O estoque é do fornecedor')
    expect(marcarTarefa).not.toHaveBeenCalled()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Inventário: motivo trocado.'))
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalled()
  })
})

describe('ChecklistDoCliente: sem modelo', () => {
  it('o consultor vê que a gestão aplica e a caixa Check-in; sem barra, cartões nem lista', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(SEM_MODELO)
    tela(consultor)
    const modelo = await screen.findByRole('region', { name: 'Modelo de check-in' })
    expect(within(modelo).getByRole('heading', { name: 'Este cliente ainda não tem um modelo' })).toBeInTheDocument()
    expect(modelo).toHaveTextContent('A gestão aplica o modelo. Enquanto isso, o check-in funciona como hoje.')
    expect(within(modelo).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Check-in' })).toHaveTextContent('Ainda não há check-ins neste cliente.')
    expect(screen.queryByText('Filtros')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Andamento do check-list' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('quem aplica: Aplicar modelo abre a janela; aplicado, fecha, avisa, relê e avisa a página', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({ ...SEM_MODELO, pode_aplicar: true, pode_marcar: false })
    vi.mocked(modelosParaAplicar).mockResolvedValue({
      itens: [{ id: 'm1', nome: 'Gestão financeira', tipo: 'gestao', da_central: true, etapas: 2, tarefas: 5, obrigatorias: 4, maior_prazo: 20, do_tipo_do_consultor: true }],
      total: 1,
    })
    vi.mocked(aplicarModelo).mockResolvedValue({ id: 'cl2', erro: null })
    const { aoMudar } = tela(gestor)
    const modelo = await screen.findByRole('region', { name: 'Modelo de check-in' })
    expect(modelo).toHaveTextContent('Escolha um modelo para o consultor seguir como check-list.')
    await userEvent.click(within(modelo).getByRole('button', { name: 'Aplicar modelo' }))
    const janela = screen.getByRole('dialog', { name: 'Aplicar modelo em Provedor Alfa' })
    await escolherNoSeletor(userEvent, 'Modelo', 'Gestão financeira')
    await userEvent.click(within(janela).getByRole('button', { name: 'Aplicar modelo' }))
    expect(aplicarModelo).toHaveBeenCalledWith({ clienteId: 'k1', modeloId: 'm1', inicio: '2026-11-17' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('"Gestão financeira" aplicado em Provedor Alfa.')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalled()
  })

  it('cliente sem consultoria ou arquivado: a caixa diz o que falta', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({ ...SEM_MODELO, consultor: null })
    const { unmount } = tela(central, { cliente: { ...CLIENTE, consultoria_id: null, consultor_id: null, consultor: null } })
    expect(await screen.findByRole('region', { name: 'Modelo de check-in' }))
      .toHaveTextContent('Mande o cliente para uma consultoria antes de aplicar um modelo.')
    unmount()
    tela(central, { cliente: { ...CLIENTE, arquivado: true } })
    expect(await screen.findByRole('region', { name: 'Modelo de check-in' }))
      .toHaveTextContent('Cliente arquivado: reative o cliente para aplicar um modelo.')
  })
})

describe('ChecklistDoCliente: aba Check-ins (acréscimo de 18/11)', () => {
  const tabela = () => screen.queryByRole('region', { name: 'Tabela de check-ins (teste)' })

  it('com modelo, "Visualização" tem Lista, Fluxograma e Check-ins; a tabela só aparece na aba Check-ins', async () => {
    tela(consultor, { checkins: TABELA_DE_CHECKINS })
    const visao = await screen.findByRole('group', { name: 'Visualização' })
    expect(within(visao).getAllByRole('button').map((b) => b.textContent)).toEqual(['Lista', 'Fluxograma', 'Check-ins'])
    expect(tabela()).not.toBeInTheDocument()

    await userEvent.click(within(visao).getByRole('button', { name: 'Check-ins' }))
    expect(within(visao).getByRole('button', { name: 'Check-ins' })).toHaveAttribute('aria-pressed', 'true')
    expect(tabela()).toBeInTheDocument()
    // Somem a lista, o fluxograma e os filtros só de tarefas; a barra, a caixa do modelo e a da sessão ficam.
    expect(screen.queryByRole('region', { name: '1 · Diagnóstico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Fluxograma' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Mostrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Orientação do fluxograma' })).not.toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Modelo aplicado' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Check-in' })).toBeInTheDocument()
    // A tabela vem depois das caixas.
    const caixa = screen.getByRole('region', { name: 'Modelo aplicado' })
    expect(caixa.compareDocumentPosition(tabela()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await userEvent.click(within(visao).getByRole('button', { name: 'Lista' }))
    expect(screen.getByRole('region', { name: '1 · Diagnóstico' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Mostrar' })).toBeInTheDocument()
    expect(tabela()).not.toBeInTheDocument()
  })

  it('do fluxograma para Check-ins e de volta: a orientação só no fluxograma', async () => {
    tela(consultor, { checkins: TABELA_DE_CHECKINS })
    await userEvent.click(await screen.findByRole('button', { name: 'Fluxograma' }))
    expect(screen.getByRole('group', { name: 'Orientação do fluxograma' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Check-ins' }))
    expect(screen.queryByRole('group', { name: 'Orientação do fluxograma' })).not.toBeInTheDocument()
    expect(tabela()).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fluxograma' }))
    expect(screen.getByRole('region', { name: 'Fluxograma' })).toBeInTheDocument()
    expect(tabela()).not.toBeInTheDocument()
  })

  it('quem só acompanha: na aba Check-ins não aparece o aviso de quem marca as tarefas', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(GERENCIA)
    tela(gestor, { checkins: TABELA_DE_CHECKINS })
    expect(await screen.findByText(/Você acompanha o andamento/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Check-ins' }))
    expect(screen.queryByText(/Você acompanha o andamento/)).not.toBeInTheDocument()
    expect(tabela()).toBeInTheDocument()
  })

  it('sem modelo: sem abas, e a tabela fica embaixo das caixas, como antes', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(SEM_MODELO)
    tela(consultor, { checkins: TABELA_DE_CHECKINS })
    const modelo = await screen.findByRole('region', { name: 'Modelo de check-in' })
    expect(screen.queryByRole('group', { name: 'Visualização' })).not.toBeInTheDocument()
    expect(tabela()).toBeInTheDocument()
    expect(modelo.compareDocumentPosition(tabela()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('se o check-list não carrega, a tabela de check-ins aparece mesmo assim (embaixo do aviso)', async () => {
    vi.mocked(lerChecklist).mockRejectedValue(new Error('rede'))
    tela(consultor, { checkins: TABELA_DE_CHECKINS })
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o check-list.')
    expect(tabela()).toBeInTheDocument()
  })
})

describe('ChecklistDoCliente: leitura', () => {
  it('se a leitura falha, avisa; quem não vê o cliente (nulo) não vê nada', async () => {
    vi.mocked(lerChecklist).mockRejectedValue(new Error('rede'))
    const { unmount } = tela(consultor)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o check-list.')
    unmount()
    vi.mocked(lerChecklist).mockResolvedValue(null)
    const { container } = tela(consultor)
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(container).toBeEmptyDOMElement()
  })
})
