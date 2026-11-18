import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { consultoresPorOcupacao } from '@/data/capacidade'
import { aplicarModelo, listarAndamento, modelosParaAplicar } from '@/data/checklists'
import { buscarConsultorias } from '@/data/consultorias'
import { indicadoresDeCheckins } from '@/data/indicadores'
import { somarDias } from '@/lib/calendario'
import { hoje } from '@/lib/mes'
import { escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import AndamentoDosClientes from './AndamentoDosClientes'

vi.mock('@/data/checklists', () => ({ listarAndamento: vi.fn(), modelosParaAplicar: vi.fn(), aplicarModelo: vi.fn() }))
vi.mock('@/data/indicadores', () => ({ indicadoresDeCheckins: vi.fn() }))
vi.mock('@/data/capacidade', () => ({ consultoresPorOcupacao: vi.fn() }))
vi.mock('@/data/consultorias', () => ({ buscarConsultorias: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const HOJE = hoje()
const dia = (n) => somarDias(HOJE, n)
const curto = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

const ATRASADO = {
  cliente: { id: 'k1', nome: 'Padaria Pão Quente', cidade: 'Chapecó', uf: 'SC' },
  consultor: { id: 'p1', nome: 'Ana Souza', foto: null, cor: null },
  consultoria: null, pode_aplicar: true,
  checklist: { id: 'cl1', modelo_nome: 'Gestão financeira', tarefas: 14, feitas: 9, pct: 64, atrasadas: 2,
    proxima: { titulo: 'Análise do DRE', vence_em: dia(-3) } },
}
const EM_DIA = {
  cliente: { id: 'k2', nome: 'Mercado Bom Preço', cidade: null, uf: null },
  consultor: null, consultoria: null, pode_aplicar: true,
  checklist: { id: 'cl2', modelo_nome: 'Implantação', tarefas: 5, feitas: 0, pct: 0, atrasadas: 0,
    proxima: { titulo: 'Reunião de início', vence_em: dia(4) } },
}
const COMPLETO = {
  cliente: { id: 'k3', nome: 'Oficina do Zé', cidade: 'Xanxerê', uf: 'SC' },
  consultor: { id: 'p1', nome: 'Ana Souza', foto: null, cor: null }, consultoria: null, pode_aplicar: true,
  checklist: { id: 'cl3', modelo_nome: 'Implantação', tarefas: 5, feitas: 5, pct: 100, atrasadas: 0, proxima: null },
}
const SEM_MODELO = {
  cliente: { id: 'k4', nome: 'Farmácia Central', cidade: 'Concórdia', uf: 'SC' },
  consultor: { id: 'p2', nome: 'Beto Lima', foto: null, cor: null }, consultoria: null, pode_aplicar: true, checklist: null,
}
const LINHAS = [ATRASADO, EM_DIA, COMPLETO, SEM_MODELO]
const daCentral = (linha) => ({ ...linha, consultoria: { id: 'c1', nome: 'STI Consult' } })
const doConsultor = (linha) => ({ ...linha, pode_aplicar: false })

const central = { id: 'u1', papel: 'central', consultoria_id: null }
const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }
const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }

const tela = (perfil) => renderizarTela(<AndamentoDosClientes perfil={perfil} />, { perfil, endereco: '/checkins' })
const linha = (nome) => screen.getByRole('row', { name: new RegExp(nome) })
const celulas = (nome) => within(linha(nome)).getAllByRole('cell').map((c) => c.textContent)
const acoes = (nome) => [...linha(nome).querySelector('td:last-child').querySelectorAll('a, button')]
  .map((b) => b.textContent.trim())

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarAndamento).mockResolvedValue({ itens: LINHAS, total: 4 })
  vi.mocked(indicadoresDeCheckins).mockResolvedValue({ recorte: 'consultoria', clientes: 120, com_modelo: 87,
    progresso_medio: 42, atrasadas: 1234, vencem_7_dias: 31 })
  vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [
    { id: 'p1', nome: 'Ana Souza', capacidade: 100, reservado: 40, ocupacao: 0.4 },
    { id: 'p2', nome: 'Beto Lima', capacidade: 100, reservado: 60, ocupacao: 0.6 },
  ], total: 2 })
  vi.mocked(buscarConsultorias).mockResolvedValue({ itens: [{ id: 'c2', nome: 'Beta' }], total: 1 })
  vi.mocked(modelosParaAplicar).mockResolvedValue({ itens: [
    { id: 'm1', nome: 'Gestão financeira', tipo: null, da_central: true, etapas: 2, tarefas: 14, obrigatorias: 11,
      maior_prazo: 60, do_tipo_do_consultor: false },
  ], total: 1 })
  vi.mocked(aplicarModelo).mockResolvedValue({ id: 'cl9', erro: null })
})

describe('AndamentoDosClientes: a tela', () => {
  it('barra (Filtros, situação, busca e consultor) → cartões do banco → tabela "Andamento dos clientes"', async () => {
    tela(gestor)
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do andamento')
    await vi.waitFor(() => expect(numeroDoCartao(cartoes, 'Clientes com modelo')).toBe('87'))
    expect(within(cartoes).getByText('de 120 clientes')).toBeInTheDocument()
    expect(numeroDoCartao(cartoes, 'Progresso médio')).toBe('42%')
    expect(numeroDoCartao(cartoes, 'Tarefas atrasadas')).toBe('1.234')
    expect(numeroDoCartao(cartoes, 'Vencem em 7 dias')).toBe('31')
    expect(indicadoresDeCheckins).toHaveBeenCalledWith({})

    const barra = screen.getByText('Filtros').closest('.card')
    const situacao = within(barra).getByRole('group', { name: 'Situação' })
    expect(within(situacao).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todos', 'Com atraso', 'Sem modelo'])
    expect(within(barra).getByRole('searchbox', { name: 'Buscar clientes ou modelos' }))
      .toHaveAttribute('placeholder', 'Buscar cliente ou modelo')
    expect(within(barra).getByLabelText('Consultor')).toBeInTheDocument()
    expect(within(barra).queryByLabelText('Consultoria')).not.toBeInTheDocument()

    const tabela = await screen.findByRole('table', { name: 'Andamento dos clientes' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(
      ['Cliente', 'Consultor', 'Modelo', 'Progresso', 'Atrasadas', 'Próxima tarefa', 'Ações'])
    expect(listarAndamento).toHaveBeenCalledWith({ situacao: 'todos', pagina: 1 })
  })

  it('cada linha: cliente e cidade, consultor, modelo, progresso com barra, atrasadas e a próxima tarefa', async () => {
    tela(gestor)
    await screen.findByRole('table', { name: 'Andamento dos clientes' })
    expect(celulas('Padaria Pão Quente').slice(0, 6)).toEqual([
      'Padaria Pão QuenteChapecó/SC', 'ASAna Souza', 'Gestão financeira', '64% · 9 de 14', '2',
      `Análise do DREvenceu ${curto(dia(-3))}`])
    expect(within(linha('Padaria Pão Quente')).getByRole('progressbar', { name: 'Progresso de Padaria Pão Quente' }))
      .toHaveAttribute('aria-valuenow', '64')
    expect(celulas('Mercado Bom Preço').slice(0, 6)).toEqual([
      'Mercado Bom Preço', 'Aguardando consultor', 'Implantação', '0% · 0 de 5', '0', `Reunião de iníciovence ${curto(dia(4))}`])
    expect(celulas('Oficina do Zé').slice(3, 6)).toEqual(['100% · 5 de 5', '0', 'Tudo feito'])
    expect(celulas('Farmácia Central').slice(0, 6)).toEqual(['Farmácia CentralConcórdia/SC', 'BLBeto Lima', 'Sem modelo', '—', '—', '—'])
  })

  it('Abrir leva à aba Check-ins do cliente (o nome também); Aplicar modelo só nos sem modelo', async () => {
    tela(gestor)
    await screen.findByRole('table', { name: 'Andamento dos clientes' })
    expect(within(linha('Padaria Pão Quente')).getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/clientes/k1?aba=checkins')
    expect(within(linha('Padaria Pão Quente')).getByRole('link', { name: 'Padaria Pão Quente' }))
      .toHaveAttribute('href', '/clientes/k1?aba=checkins')
    expect(acoes('Padaria Pão Quente')).toEqual(['Abrir'])
    expect(acoes('Farmácia Central')).toEqual(['Abrir', 'Aplicar modelo'])
  })

  it('Aplicar modelo abre a janela do cliente; aplicado, avisa e relê a lista e os cartões', async () => {
    tela(gestor)
    await screen.findByRole('table', { name: 'Andamento dos clientes' })
    await userEvent.click(within(linha('Farmácia Central')).getByRole('button', { name: 'Aplicar modelo' }))
    const janela = await screen.findByRole('dialog', { name: 'Aplicar modelo em Farmácia Central' })
    expect(janela).toHaveTextContent('Beto Lima vai seguir as tarefas como check-list.')
    await escolherNoSeletor(userEvent, 'Modelo', 'Gestão financeira')
    expect(modelosParaAplicar).toHaveBeenCalledWith({ clienteId: 'k4', busca: '' })
    await userEvent.click(within(janela).getByRole('button', { name: 'Aplicar modelo' }))
    expect(aplicarModelo).toHaveBeenCalledWith({ clienteId: 'k4', modeloId: 'm1', inicio: HOJE })
    expect(toast.success).toHaveBeenCalledWith('"Gestão financeira" aplicado em Farmácia Central.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await vi.waitFor(() => expect(listarAndamento).toHaveBeenCalledTimes(2))
    expect(indicadoresDeCheckins).toHaveBeenCalledTimes(2)
  })

  it('Cancelar fecha a janela sem gravar', async () => {
    tela(gestor)
    await screen.findByRole('table', { name: 'Andamento dos clientes' })
    await userEvent.click(within(linha('Farmácia Central')).getByRole('button', { name: 'Aplicar modelo' }))
    const janela = await screen.findByRole('dialog', { name: 'Aplicar modelo em Farmácia Central' })
    await userEvent.click(within(janela).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(aplicarModelo).not.toHaveBeenCalled()
  })

  it('pagina no banco: some com 15, aparece com 16 e Próxima pede a página 2', async () => {
    vi.mocked(listarAndamento).mockResolvedValue({ itens: LINHAS, total: 15 })
    const { unmount } = tela(gestor)
    await screen.findByRole('table', { name: 'Andamento dos clientes' })
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    unmount()
    vi.mocked(listarAndamento).mockResolvedValue({ itens: LINHAS, total: 16 })
    tela(gestor)
    expect(await screen.findByText('1–15 de 16')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarAndamento).toHaveBeenLastCalledWith({ situacao: 'todos', pagina: 2 })
  })

  it('situação, busca e consultor voltam à página 1 e vão ao banco; só o consultor muda os cartões', async () => {
    vi.mocked(listarAndamento).mockResolvedValue({ itens: LINHAS, total: 40 })
    tela(gestor)
    const proxima = async () => {
      await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
      await vi.waitFor(() => expect(listarAndamento).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 })))
    }
    await proxima()
    await userEvent.click(screen.getByRole('button', { name: 'Com atraso' }))
    await vi.waitFor(() => expect(listarAndamento).toHaveBeenLastCalledWith({ situacao: 'com_atraso', pagina: 1 }))
    await proxima()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar clientes ou modelos' }), 'dre')
    await vi.waitFor(() => expect(listarAndamento).toHaveBeenLastCalledWith({ situacao: 'com_atraso', busca: 'dre', pagina: 1 }))
    expect(indicadoresDeCheckins).toHaveBeenCalledTimes(1)
    await proxima()
    await escolherNoSeletor(userEvent, 'Consultor', 'Beto Lima')
    await vi.waitFor(() => expect(listarAndamento).toHaveBeenLastCalledWith(
      { situacao: 'com_atraso', busca: 'dre', consultorId: 'p2', pagina: 1 }))
    await vi.waitFor(() => expect(indicadoresDeCheckins).toHaveBeenLastCalledWith({ consultorId: 'p2' }))
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 'c1' }))
  })

  it('a Central filtra por consultoria (volta à página 1, muda os cartões e o consultor) e vê a consultoria de cada linha', async () => {
    vi.mocked(listarAndamento).mockResolvedValue({ itens: LINHAS.map(daCentral), total: 40 })
    vi.mocked(indicadoresDeCheckins).mockResolvedValue({ recorte: 'tudo', clientes: 9, com_modelo: 3, progresso_medio: null,
      atrasadas: 0, vencem_7_dias: 0 })
    tela(central)
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do andamento')
    await vi.waitFor(() => expect(numeroDoCartao(cartoes, 'Progresso médio')).toBe('—'))
    expect(celulas('Padaria Pão Quente')[1]).toBe('ASAna SouzaSTI Consult')
    expect(celulas('Mercado Bom Preço')[1]).toBe('Aguardando consultorSTI Consult')
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    await escolherNoSeletor(userEvent, 'Consultor', 'Ana Souza')
    await vi.waitFor(() => expect(listarAndamento).toHaveBeenLastCalledWith({ situacao: 'todos', consultorId: 'p1', pagina: 1 }))
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: null }))
    await escolherNoSeletor(userEvent, 'Consultoria', 'Beta')
    await vi.waitFor(() => expect(listarAndamento).toHaveBeenLastCalledWith({ situacao: 'todos', consultoriaId: 'c2', pagina: 1 }))
    await vi.waitFor(() => expect(indicadoresDeCheckins).toHaveBeenLastCalledWith({ consultoriaId: 'c2' }))
  })

  it('o consultor: sem os filtros de consultoria e consultor, sem Aplicar modelo, e a lista vazia dele', async () => {
    vi.mocked(listarAndamento).mockResolvedValue({ itens: LINHAS.map(doConsultor), total: 4 })
    const { unmount } = tela(consultor)
    await screen.findByRole('table', { name: 'Andamento dos clientes' })
    const barra = screen.getByText('Filtros').closest('.card')
    expect(within(barra).queryByLabelText('Consultor')).not.toBeInTheDocument()
    expect(within(barra).queryByLabelText('Consultoria')).not.toBeInTheDocument()
    expect(acoes('Farmácia Central')).toEqual(['Abrir'])
    unmount()
    vi.mocked(listarAndamento).mockResolvedValue({ itens: [], total: 0 })
    tela(consultor)
    expect(await screen.findByText('Você ainda não tem clientes.')).toBeInTheDocument()
  })

  it('listas vazias (por situação e com busca) e erro ao carregar', async () => {
    vi.mocked(listarAndamento).mockResolvedValue({ itens: [], total: 0 })
    const { unmount } = tela(gestor)
    expect(await screen.findByText('Nenhum cliente em atendimento ainda.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Com atraso' }))
    expect(await screen.findByText('Nenhum cliente com tarefa atrasada.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sem modelo' }))
    expect(await screen.findByText('Todos os clientes já têm um modelo de check-in.')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar clientes ou modelos' }), 'xyz')
    expect(await screen.findByText('Nenhum cliente encontrado.')).toBeInTheDocument()
    unmount()
    vi.mocked(listarAndamento).mockRejectedValue(new Error('x'))
    tela(gestor)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o andamento.')
  })

  it('a 360 px nada rola para o lado: a barra quebra linha, a tabela rola dentro do cartão e as ações viram só ícone', async () => {
    const { container } = tela(gestor)
    await screen.findByRole('table', { name: 'Andamento dos clientes' })
    expect(screen.getByText('Filtros').closest('.card')).toHaveClass('flex-wrap')
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto')
    expect(within(within(linha('Farmácia Central')).getByRole('link', { name: 'Abrir' })).getByText('Abrir'))
      .toHaveClass('max-sm:sr-only')
    expect(within(within(linha('Farmácia Central')).getByRole('button', { name: 'Aplicar modelo' })).getByText('Aplicar modelo'))
      .toHaveClass('max-sm:sr-only')
    expect(container.innerHTML).not.toMatch(/max-w-(?:sm|md|lg|xl|\dxl|screen)[^"]*mx-auto|mx-auto[^"]*max-w-(?:sm|md|lg|xl|\dxl|screen)/)
  })
})
