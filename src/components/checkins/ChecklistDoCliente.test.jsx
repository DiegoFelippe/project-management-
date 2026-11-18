import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  anotarTarefa, aplicarModelo, lerChecklist, marcarTarefa, modelosParaAplicar, mudarInicio, tirarModelo,
} from '@/data/checklists'
import { escolherData, escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import ChecklistDoCliente from './ChecklistDoCliente'

vi.mock('@/data/checklists', () => ({
  lerChecklist: vi.fn(), modelosParaAplicar: vi.fn(), aplicarModelo: vi.fn(), mudarInicio: vi.fn(), tirarModelo: vi.fn(),
  marcarTarefa: vi.fn(), anotarTarefa: vi.fn(),
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

function tela(perfil, { cliente = CLIENTE, aoMudar = vi.fn() } = {}) {
  const r = renderizarTela(<ChecklistDoCliente cliente={cliente} perfil={perfil} versao={0} aoMudar={aoMudar} />, { perfil })
  return { ...r, aoMudar }
}
const nomesDasCaixas = () => screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA })
  vi.mocked(lerChecklist).mockResolvedValue(DADOS)
})
afterEach(() => vi.useRealTimers())

describe('ChecklistDoCliente: com modelo', () => {
  it('barra (Filtros, Lista/Fluxograma, Todas/Pendentes/Feitas com os números, Próxima) → cartões com os números do banco', async () => {
    // Números do banco que a tela não teria como contar sozinha: os cartões mostram o que veio.
    vi.mocked(lerChecklist).mockResolvedValue({ ...DADOS, resumo: { ...DADOS.resumo, vencem_7_dias: 12, atrasadas: 9 } })
    tela(consultor)
    const cartoes = await cartoesAbaixoDaBarra('Andamento do check-list')
    expect(lerChecklist).toHaveBeenCalledWith('k1')
    expect(numeroDoCartao(cartoes, 'Tarefas feitas')).toBe('1')
    expect(within(cartoes).getByText('de 5 · 20%')).toBeInTheDocument()
    expect(numeroDoCartao(cartoes, 'Obrigatórias feitas')).toBe('1')
    expect(within(cartoes).getByText('de 4')).toBeInTheDocument()
    expect(numeroDoCartao(cartoes, 'Vencem em 7 dias')).toBe('12')
    expect(numeroDoCartao(cartoes, 'Atrasadas')).toBe('9')

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

  it('a lista: um cartão por etapa ("1 de 3" e barra) e, em cada tarefa, a caixa, o título, os selos, a descrição e a nota', async () => {
    vi.mocked(lerChecklist).mockResolvedValue({ ...DADOS, tarefas: TAREFAS.map((t) => (t.id === 't1' ? { ...t, na_sessao: true } : t)) })
    tela(consultor)
    const diagnostico = await screen.findByRole('region', { name: '1 · Diagnóstico' })
    expect(diagnostico).toHaveTextContent('1 de 3')
    expect(within(diagnostico).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    expect(screen.getByRole('region', { name: '2 · Plano' })).toHaveTextContent('0 de 2')
    expect(nomesDasCaixas()).toEqual(['Reunião de alinhamento', 'Análise do DRE', 'Coleta de documentos', 'Mapa de custos', 'Plano de ação'])

    const item = (titulo) => screen.getByRole('checkbox', { name: titulo }).closest('li')
    expect(item('Reunião de alinhamento')).toHaveTextContent('Feita')
    expect(item('Reunião de alinhamento')).toHaveTextContent('por Ana Lima em 12/11/2026')
    expect(item('Reunião de alinhamento')).toHaveTextContent('Nesta sessão')
    expect(item('Reunião de alinhamento')).toHaveTextContent('Objetivos e escopo')
    expect(item('Análise do DRE')).toHaveTextContent('Vence 20/11')
    expect(item('Análise do DRE')).toHaveTextContent('Faltam os extratos de setembro')
    expect(item('Coleta de documentos')).toHaveTextContent('Opcional')
    expect(item('Coleta de documentos')).toHaveTextContent('Atrasada · venceu 15/11')
    expect(item('Mapa de custos')).toHaveTextContent('Vence hoje')
    expect(item('Mapa de custos')).toHaveTextContent('Bloqueada')
    expect(item('Plano de ação')).toHaveTextContent('Em andamento')
    expect(item('Análise do DRE')).not.toHaveTextContent('Nesta sessão')
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
    expect(caixa).toBeDisabled()
    expect(marcarTarefa).toHaveBeenCalledWith('t1', 'a_fazer')
    responder({ estado: 'a_fazer', liberadas: [], na_sessao: false, erro: null })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Reunião de alinhamento voltou para a fazer.'))
    await waitFor(() => expect(caixa).toBeEnabled())
  })

  it('se o banco recusa, a caixa volta como estava e avisa o motivo (sem reler nem avisar a página)', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({ erro: 'Este check-list foi trocado ou tirado. Atualize a página para ver o atual.' })
    const { aoMudar } = tela(consultor)
    const caixa = await screen.findByRole('checkbox', { name: 'Reunião de alinhamento' })
    await userEvent.click(caixa)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Este check-list foi trocado ou tirado. Atualize a página para ver o atual.'))
    expect(caixa).toBeChecked()
    expect(lerChecklist).toHaveBeenCalledTimes(1)
    expect(aoMudar).not.toHaveBeenCalled()
  })

  it('a bloqueada fica desligada, com o motivo (o que ela espera) à vista e ligado à caixa', async () => {
    tela(consultor)
    const caixa = await screen.findByRole('checkbox', { name: 'Mapa de custos' })
    expect(caixa).toBeDisabled()
    expect(caixa).toHaveAccessibleDescription('Bloqueada espera Análise do DRE')
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

  it('a Central só lê as tarefas (a janela da tarefa só tem Fechar) e aplica', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(GERENCIA)
    tela(central)
    await userEvent.click(await screen.findByRole('button', { name: 'Análise do DRE' }))
    const janela = screen.getByRole('dialog', { name: 'Análise do DRE' })
    const rodape = janela.querySelector('[data-slot="janela-rodape"]')
    expect(within(rodape).getAllByRole('button').map((b) => b.textContent.trim())).toEqual(['Fechar'])
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
    vi.mocked(tirarModelo).mockResolvedValue({ erro: null })
    const { aoMudar } = tela(gestor)
    await userEvent.click(await screen.findByRole('button', { name: 'Tirar modelo' }))
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent('Tirar "Gestão financeira" de Provedor Alfa?')
    expect(confirmar).toHaveTextContent('O check-list sai da aba (1 de 5 feitas). O que foi feito continua nos check-ins e no Histórico.')
    expect(tirarModelo).not.toHaveBeenCalled()
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Tirar modelo' }))
    expect(tirarModelo).toHaveBeenCalledWith('cl1')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('"Gestão financeira" saiu de Provedor Alfa. O que foi feito continua nos check-ins e no Histórico.')
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

  it('o título da tarefa abre a janela; "Marcar como feita" marca, fecha, relê e avisa', async () => {
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'feita', liberadas: [], na_sessao: false, erro: null })
    const { aoMudar } = tela(consultor)
    await userEvent.click(await screen.findByRole('button', { name: 'Análise do DRE' }))
    const janela = screen.getByRole('dialog', { name: 'Análise do DRE' })
    expect(janela).toHaveTextContent('Provedor Alfa · etapa 1, Diagnóstico · obrigatória')
    await userEvent.click(within(janela).getByRole('button', { name: 'Marcar como feita' }))
    expect(marcarTarefa).toHaveBeenCalledWith('t2', 'feita')
    // A nota não mudou: não grava a nota.
    expect(anotarTarefa).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Análise do DRE feita. Sem check-in aberto neste cliente: fica feita, fora de uma sessão.')
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalled()
  })

  it('na janela, a nota mudada é gravada antes de mudar a situação; só a nota: "Nota salva."', async () => {
    vi.mocked(anotarTarefa).mockResolvedValue({ erro: null })
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'andamento', liberadas: [], na_sessao: false, erro: null })
    tela(consultor)
    await userEvent.click(await screen.findByRole('button', { name: 'Coleta de documentos' }))
    let janela = screen.getByRole('dialog', { name: 'Coleta de documentos' })
    await userEvent.type(within(janela).getByLabelText('Nota (opcional)'), 'Pedi ao financeiro')
    await userEvent.click(within(janela).getByRole('button', { name: 'Começar' }))
    expect(anotarTarefa).toHaveBeenCalledWith('t3', 'Pedi ao financeiro')
    expect(marcarTarefa).toHaveBeenCalledWith('t3', 'andamento')
    expect(anotarTarefa.mock.invocationCallOrder[0]).toBeLessThan(marcarTarefa.mock.invocationCallOrder[0])
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Coleta de documentos em andamento.'))

    await userEvent.click(screen.getByRole('button', { name: 'Reunião de alinhamento' }))
    janela = screen.getByRole('dialog', { name: 'Reunião de alinhamento' })
    await userEvent.type(within(janela).getByLabelText('Nota (opcional)'), 'Ata no Drive')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar nota' }))
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
