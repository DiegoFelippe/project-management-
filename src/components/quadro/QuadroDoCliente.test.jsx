import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  anexosDoCartao, apagarColuna, buscarCartao, cartoesDoQuadro, comentariosDoCartao, criarCartao, criarColuna, editarCartao,
  editarColuna, moverCartao, moverColuna, pessoasDoQuadro, quadroDoCliente, quadroPorId, quadrosDoCliente,
} from '@/data/quadro'
import { ouvirQuadro } from '@/data/quadroAoVivo'
import { somarDias } from '@/lib/calendario'
import { hoje } from '@/lib/mes'
import { arrastarComTeclado, simularGeometria, soltarArrasto } from '@/test/arrastar'
import { escolherNoSeletor } from '@/test/campos'
import { prepararEditor } from '@/test/editor'
import { renderizarTela } from '@/test/renderizar'
import QuadroDoCliente from './QuadroDoCliente'

vi.mock('@/data/quadro', () => ({
  CARTOES_POR_PAGINA: 50, ARQUIVADOS_POR_PAGINA: 15,
  quadroDoCliente: vi.fn(), quadrosDoCliente: vi.fn(), quadroPorId: vi.fn(), cartoesDoQuadro: vi.fn(),
  cartoesArquivados: vi.fn(), pessoasDoQuadro: vi.fn(), moverCartao: vi.fn(),
  moverColuna: vi.fn(), apagarColuna: vi.fn(), criarCartao: vi.fn(), restaurarCartao: vi.fn(), apagarCartao: vi.fn(),
  criarColuna: vi.fn(), editarColuna: vi.fn(),
  // Janela do cartão
  COMENTARIOS_POR_VEZ: 30, ANEXOS_POR_PAGINA: 15, buscarCartao: vi.fn(), editarCartao: vi.fn(), arquivarCartao: vi.fn(),
  adicionarResponsavel: vi.fn(), tirarResponsavel: vi.fn(), criarItemDoChecklist: vi.fn(), editarItemDoChecklist: vi.fn(),
  apagarItemDoChecklist: vi.fn(), comentariosDoCartao: vi.fn(), comentar: vi.fn(), editarComentario: vi.fn(),
  apagarComentario: vi.fn(), anexosDoCartao: vi.fn(), enviarAnexo: vi.fn(), apagarAnexo: vi.fn(), urlAssinada: vi.fn(),
  enviarImagemDaDescricao: vi.fn(), urlsAssinadas: vi.fn(),
}))
vi.mock('@/data/quadroAoVivo', () => ({ ouvirQuadro: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 's1' }
const gestora = { id: 'g1', papel: 'gestor', consultoria_id: 's1' }
const central = { id: 'c0', papel: 'central', consultoria_id: null }
const CLIENTE = { id: 'k1', nome: 'Provedor Alfa', consultoria_id: 's1', consultor_id: 'p1', arquivado: false }

const COLUNAS = [
  { id: 'col1', nome: 'A fazer', cor: null, concluidos: false, posicao: 1024, cartoes: 3, arquivados: 0 },
  { id: 'col2', nome: 'Em andamento', cor: 4, concluidos: false, posicao: 2048, cartoes: 1, arquivados: 1 },
  { id: 'col3', nome: 'Concluído', cor: null, concluidos: true, posicao: 3072, cartoes: 0, arquivados: 0 },
]
const QUADRO = { id: 'q1', cliente_id: 'k1', consultoria_id: 's1', pode_mexer: true, pode_gerir: false, colunas: COLUNAS }

const pessoa = (id, nome) => ({ id, nome, foto: null, cor: null })
const cartao = (id, colunaId, titulo, extras = {}) => ({
  id, coluna_id: colunaId, titulo, resumo: null, prioridade: null, prazo: null, criado_por: 'p1', criado_em: '2026-11-10T10:00:00Z',
  responsaveis: [], checklist: { total: 0, feitos: 0 }, comentarios: 0, anexos: 0, ...extras,
})

let cartoes
let parar
let avisar
const ordem = (nome) => within(screen.getByRole('region', { name: `Coluna ${nome}` }))
  .queryAllByRole('button', { name: /^Cartão / }).map((b) => b.getAttribute('aria-label').replace('Cartão ', ''))

// O cartão aberto na janela (a janela tem os testes dela; aqui, só a ligação com o quadro).
const cartaoAberto = (id, colunaId, titulo, extras = {}) => ({
  id, quadro_id: 'q1', coluna_id: colunaId, titulo, descricao: null, prioridade: null, prazo: null, arquivado_em: null,
  criado_em: '2026-11-10T13:00:00Z', coluna: { id: colunaId, nome: COLUNAS.find((c) => c.id === colunaId)?.nome, concluidos: false },
  criado_por: pessoa('p1', 'Ana Lima'), responsaveis: [], checklist: [], comentarios: 0, anexos: 0, pode_mexer: true, pode_apagar: true,
  ...extras,
})

beforeAll(prepararEditor)
beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  cartoes = {
    col1: [
      cartao('c1', 'col1', 'Mapear boletos', {
        prioridade: 'alta', prazo: somarDias(hoje(), -2), resumo: 'Levantar os boletos em aberto',
        responsaveis: [pessoa('p1', 'Ana Lima'), pessoa('g1', 'Gabi Souza'), pessoa('p2', 'Beto Reis'), pessoa('p3', 'Caio Melo')],
        checklist: { total: 5, feitos: 2 }, comentarios: 3, anexos: 1,
      }),
      cartao('c2', 'col1', 'Revisar contratos'),
      cartao('c3', 'col1', 'Ligar para o financeiro', { prazo: hoje() }),
    ],
    col2: [cartao('c4', 'col2', 'Configurar OLT', { prazo: somarDias(hoje(), 1) })],
    col3: [],
  }
  vi.mocked(quadroDoCliente).mockResolvedValue(QUADRO)
  vi.mocked(quadrosDoCliente).mockResolvedValue([])
  vi.mocked(quadroPorId).mockResolvedValue(null)
  vi.mocked(cartoesDoQuadro).mockImplementation(async ({ colunaId }) => ({ itens: cartoes[colunaId], total: cartoes[colunaId].length }))
  vi.mocked(pessoasDoQuadro).mockResolvedValue({ itens: [pessoa('p1', 'Ana Lima'), pessoa('g1', 'Gabi Souza')], total: 2 })
  vi.mocked(moverCartao).mockResolvedValue({ erro: null, cartao: {}, renumerou: false })
  vi.mocked(moverColuna).mockResolvedValue({ erro: null, coluna: {}, renumerou: false })
  vi.mocked(criarColuna).mockResolvedValue({ erro: null, coluna: { id: 'col4' } })
  vi.mocked(editarColuna).mockResolvedValue({ erro: null })
  vi.mocked(apagarColuna).mockResolvedValue({ erro: null, movidos: 1, apagados: 0, idsApagados: [] })
  vi.mocked(buscarCartao).mockImplementation(async (id) => {
    const c = Object.values(cartoes).flat().find((x) => x.id === id)
    return c ? cartaoAberto(c.id, c.coluna_id, c.titulo) : null
  })
  vi.mocked(editarCartao).mockResolvedValue({ erro: null })
  vi.mocked(comentariosDoCartao).mockResolvedValue({ itens: [], haMais: false })
  vi.mocked(anexosDoCartao).mockResolvedValue({ itens: [], total: 0 })
  vi.mocked(criarCartao).mockResolvedValue({ erro: null, cartao: { id: 'c9' } })
  parar = vi.fn()
  avisar = null
  vi.mocked(ouvirQuadro).mockImplementation((_id, aoMudar) => {
    avisar = aoMudar
    return parar
  })
})

const tela = (perfil = consultor, { cliente = CLIENTE } = {}) => {
  simularGeometria()
  return renderizarTela(<QuadroDoCliente cliente={cliente} perfil={perfil} />, { perfil })
}

// Sem arrastar (só leitura ou filtro ligado), o espaço abre o cartão: ele continua um botão. Fecha a janela que abriu.
const fecharJanelaDoCartao = async (titulo) => {
  const janela = await screen.findByRole('dialog', { name: titulo })
  await userEvent.setup().click(within(janela).getAllByRole('button', { name: 'Fechar' }).at(-1))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

const pronto = async () => {
  await screen.findByRole('button', { name: 'Cartão Mapear boletos' })
  await waitFor(() => expect(ordem('Em andamento')).toEqual(['Configurar OLT']))
}

// Ações da coluna: um "⋯" por coluna (auditoria de 17/11, M5) com Renomear, Cor e, para a gestão, Apagar coluna.
const acoesDaColuna = async (user, nome) => {
  await user.click(screen.getByRole('button', { name: `Ações da coluna ${nome}` }))
  return screen.getByRole('menu', { name: `Ações da coluna ${nome}` })
}
const naColuna = async (user, nome, acao) => user.click(within(await acoesDaColuna(user, nome)).getByRole('menuitem', { name: acao }))

describe('aba Quadro: o que cada um vê', () => {
  it('barra de filtros, sem cartões de números abaixo (pedido do Diego, 17/11), e as colunas com os cartões', async () => {
    tela()
    await pronto()
    expect(screen.queryByRole('region', { name: 'Indicadores do quadro' })).not.toBeInTheDocument()
    expect(screen.queryByText('Cartões no quadro')).not.toBeInTheDocument()
    expect(quadroDoCliente).toHaveBeenCalledWith('k1')
    expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ quadroId: 'q1', colunaId: 'col1', pagina: 1 }))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['A fazer', 'Em andamento', 'Concluído'])
    expect(ordem('A fazer')).toEqual(['Mapear boletos', 'Revisar contratos', 'Ligar para o financeiro'])
    expect(within(screen.getByRole('region', { name: 'Coluna A fazer' })).getByTitle('3 cartões')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Coluna Concluído' })).getByText('Nenhum cartão aqui')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Coluna de concluídos' })).toBeInTheDocument()
  })

  it('o cartão mostra prioridade, prazo, até 3 rostos + "+N", checklist, comentários e anexos', async () => {
    tela()
    const c1 = await screen.findByRole('button', { name: 'Cartão Mapear boletos' })
    const dentro = within(c1)
    expect(dentro.getByText('Alta')).toBeInTheDocument()
    expect(dentro.getByText('Atrasado há 2 dias')).toBeInTheDocument()
    expect(dentro.getByText('Levantar os boletos em aberto')).toBeInTheDocument()
    expect(dentro.getAllByTitle(/Ana Lima|Gabi Souza|Beto Reis|Caio Melo/)).toHaveLength(3)
    expect(dentro.getByText('+1')).toBeInTheDocument()
    expect(dentro.getByTitle('Checklist: 2 de 5 feitos')).toHaveTextContent('2/5')
    expect(dentro.getByTitle('3 comentários')).toHaveTextContent('3')
    expect(dentro.getByTitle('1 anexo')).toHaveTextContent('1')
    expect(within(screen.getByRole('button', { name: 'Cartão Ligar para o financeiro' })).getByText('Hoje')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: 'Cartão Configurar OLT' })).getByText('Amanhã')).toBeInTheDocument()
  })

  it('o consultor do cliente mexe: Novo cartão, Nova coluna, renomear e cor; apagar coluna não (é da gestão)', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    expect(screen.getByRole('button', { name: 'Novo cartão' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova coluna' })).toBeInTheDocument()
    const menu = await acoesDaColuna(user, 'A fazer')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Renomear', 'Cor'])
    expect(screen.getByRole('button', { name: 'Arquivados' })).toBeInTheDocument()
  })

  it('cada coluna tem um "⋯" só, sempre à vista, no lugar dos três ícones (auditoria, M5)', async () => {
    vi.mocked(quadroDoCliente).mockResolvedValue({ ...QUADRO, pode_gerir: true })
    tela(gestora)
    await pronto()
    for (const nome of ['A fazer', 'Em andamento', 'Concluído']) {
      const coluna = screen.getByRole('region', { name: `Coluna ${nome}` })
      expect(within(coluna).getByRole('button', { name: `Ações da coluna ${nome}` })).toHaveAttribute('aria-haspopup', 'menu')
      expect(within(coluna).queryByRole('button', { name: /^(Renomear|Cor da coluna|Apagar a coluna)/ })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('coluna com cor escolhida tem o véu da cor; sem cor, o corpo neutro e só o contador na cor automática (modelo atual, 19/11)', async () => {
    tela()
    await pronto()
    const coluna = screen.getByRole('region', { name: 'Coluna Em andamento' })
    const contador = within(coluna).getByTitle('1 cartão')
    expect(contador).toHaveClass('bg-cor-verde-cheio', 'text-cor-verde-sobre')
    expect(contador.getAttribute('style') ?? '').not.toMatch(/background/)
    expect(coluna).toHaveClass('bg-cor-verde-suave/40')
    // Sem cor escolhida: corpo neutro; só o contador leva a cor automática pela posição (A fazer, a 1ª, é índigo).
    const automatica = screen.getByRole('region', { name: 'Coluna A fazer' })
    expect(within(automatica).getByTitle('3 cartões')).toHaveClass('bg-cor-indigo-cheio', 'text-cor-indigo-sobre')
    expect(automatica).toHaveClass('bg-muted/60', 'border-border/70')
    expect(automatica.className).not.toMatch(/bg-cor-/)
  })

  it('a gestão também apaga coluna (Apagar coluna no menu, em vermelho)', async () => {
    vi.mocked(quadroDoCliente).mockResolvedValue({ ...QUADRO, pode_gerir: true })
    const user = userEvent.setup()
    tela(gestora)
    await pronto()
    const menu = await acoesDaColuna(user, 'A fazer')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Renomear', 'Cor', 'Apagar coluna'])
    expect(within(menu).getByRole('menuitem', { name: 'Apagar coluna' })).toHaveClass('text-destructive')
  })

  it('a central só lê: sem Novo cartão, Nova coluna, ações nas colunas nem arrastar', async () => {
    vi.mocked(quadrosDoCliente).mockResolvedValue([
      { id: 'q1', atual: true, criado_em: '2026-11-10T10:00:00Z', consultoria: { id: 's1', nome: 'Consultoria Beta' } },
    ])
    vi.mocked(quadroPorId).mockResolvedValue({ ...QUADRO, pode_mexer: false })
    tela(central)
    await pronto()
    expect(quadrosDoCliente).toHaveBeenCalledWith('k1')
    expect(quadroPorId).toHaveBeenCalledWith('q1')
    expect(quadroDoCliente).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Novo cartão' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova coluna' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ações da coluna/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Adicionar cartão/ })).not.toBeInTheDocument()
    // Um quadro só: sem o seletor de consultoria.
    expect(screen.queryByLabelText('Consultoria')).not.toBeInTheDocument()
    expect(screen.getByText('Você vê este quadro só para ler.')).toBeInTheDocument()
    await arrastarComTeclado(screen.getByRole('button', { name: 'Cartão Mapear boletos' }), ['baixo'])
    expect(moverCartao).not.toHaveBeenCalled()
    await fecharJanelaDoCartao('Mapear boletos')
    expect(ordem('A fazer')).toEqual(['Mapear boletos', 'Revisar contratos', 'Ligar para o financeiro'])
  })

  it('a central escolhe o quadro de uma consultoria anterior (o seletor só aparece com mais de um quadro)', async () => {
    vi.mocked(quadrosDoCliente).mockResolvedValue([
      { id: 'q1', atual: true, criado_em: '2026-11-10T10:00:00Z', consultoria: { id: 's1', nome: 'Consultoria Beta' } },
      { id: 'q0', atual: false, criado_em: '2026-10-01T10:00:00Z', consultoria: { id: 's0', nome: 'Consultoria Alfa' } },
    ])
    vi.mocked(quadroPorId).mockImplementation(async (id) => ({ ...QUADRO, id, pode_mexer: false }))
    const user = userEvent.setup()
    tela(central)
    await pronto()
    expect(screen.getByLabelText('Consultoria')).toHaveTextContent('Consultoria Beta')
    await escolherNoSeletor(user, 'Consultoria', 'Consultoria Alfa')
    await waitFor(() => expect(quadroPorId).toHaveBeenCalledWith('q0'))
    await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ quadroId: 'q0', colunaId: 'col1' })))
    expect(ouvirQuadro).toHaveBeenLastCalledWith('q0', expect.any(Function), { juntarMs: 300 })
    // O quadro escolhido é de quem atendeu antes: a barra diz.
    expect(await screen.findByText('Atendeu antes')).toBeInTheDocument()
  })

  it('a central vê que o quadro é de uma consultoria anterior mesmo quando é o único (sem seletor)', async () => {
    vi.mocked(quadrosDoCliente).mockResolvedValue([
      { id: 'q0', atual: false, criado_em: '2026-10-01T10:00:00Z', consultoria: { id: 's0', nome: 'Consultoria Alfa' } },
    ])
    vi.mocked(quadroPorId).mockImplementation(async (id) => ({ ...QUADRO, id, pode_mexer: false }))
    tela(central)
    await pronto()
    expect(quadroPorId).toHaveBeenCalledWith('q0')
    expect(screen.queryByLabelText('Consultoria')).not.toBeInTheDocument()
    expect(screen.getByText('Atendeu antes · Consultoria Alfa')).toBeInTheDocument()
  })

  it('o quadro da consultoria que atende hoje não ganha o aviso', async () => {
    vi.mocked(quadrosDoCliente).mockResolvedValue([
      { id: 'q1', atual: true, criado_em: '2026-11-10T10:00:00Z', consultoria: { id: 's1', nome: 'Consultoria Beta' } },
    ])
    vi.mocked(quadroPorId).mockImplementation(async (id) => ({ ...QUADRO, id, pode_mexer: false }))
    tela(central)
    await pronto()
    expect(screen.queryByText(/Atendeu antes/)).not.toBeInTheDocument()
  })

  it('cliente arquivado: o quadro é só para ler', async () => {
    vi.mocked(quadroDoCliente).mockResolvedValue({ ...QUADRO, pode_mexer: false })
    tela(consultor, { cliente: { ...CLIENTE, arquivado: true } })
    await pronto()
    expect(screen.getByText('Cliente arquivado: o quadro é só para ler.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo cartão' })).not.toBeInTheDocument()
  })

  it('sem quadro: a central vê que nenhuma consultoria abriu o quadro', async () => {
    tela(central)
    expect(await screen.findByText('Nenhuma consultoria abriu o quadro deste cliente ainda.')).toBeInTheDocument()
    expect(ouvirQuadro).not.toHaveBeenCalled()
  })

  it('sem quadro para quem só lê (cliente arquivado): o aviso', async () => {
    vi.mocked(quadroDoCliente).mockResolvedValue(null)
    tela(consultor, { cliente: { ...CLIENTE, arquivado: true } })
    expect(await screen.findByText('Este cliente não tem quadro.')).toBeInTheDocument()
  })

  it('erro ao carregar o quadro: o aviso e Tentar de novo', async () => {
    vi.mocked(quadroDoCliente).mockRejectedValueOnce(new Error('rede'))
    const user = userEvent.setup()
    tela()
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o quadro.')
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await pronto()
  })

  it('erro numa releitura não tira o quadro da tela', async () => {
    tela()
    await pronto()
    vi.mocked(quadroDoCliente).mockRejectedValueOnce(new Error('rede'))
    await act(async () => avisar({ eventos: [{ motivo: 'plano_b' }], tudo: true, acesso: false, tabelas: [], colunas: [], cartoes: [] }))
    await waitFor(() => expect(quadroDoCliente).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cartão Mapear boletos' })).toBeInTheDocument()
  })

  it('clicar no cartão abre a janela do cartão', async () => {
    const user = userEvent.setup()
    tela()
    await user.click(await screen.findByRole('button', { name: 'Cartão Revisar contratos' }))
    expect(await screen.findByRole('dialog', { name: 'Revisar contratos' })).toBeInTheDocument()
    expect(buscarCartao).toHaveBeenCalledWith('c2')
  })

  it('depois de criar pelo "Novo cartão", a janela abre no cartão novo (para completar)', async () => {
    const user = userEvent.setup()
    vi.mocked(buscarCartao).mockImplementation(async (id) => (id === 'c9' ? cartaoAberto('c9', 'col1', 'Enviar contrato') : null))
    tela()
    await pronto()
    await user.click(screen.getByRole('button', { name: 'Novo cartão' }))
    await user.type(within(screen.getByRole('dialog', { name: 'Novo cartão' })).getByLabelText('Título'), 'Enviar contrato')
    await user.click(screen.getByRole('button', { name: 'Criar cartão' }))
    expect(await screen.findByRole('dialog', { name: 'Enviar contrato' })).toBeInTheDocument()
    expect(buscarCartao).toHaveBeenCalledWith('c9')
    expect(screen.queryByRole('dialog', { name: 'Novo cartão' })).not.toBeInTheDocument()
  })

  it('fechar a janela depois de mudar algo relê a coluna do cartão e os números (mesmo sem o tempo real)', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    await user.click(screen.getByRole('button', { name: 'Cartão Configurar OLT' }))
    const janela = await screen.findByRole('dialog', { name: 'Configurar OLT' })
    const titulo = within(janela).getByLabelText('Título')
    await user.clear(titulo)
    await user.type(titulo, 'Configurar a OLT')
    await user.tab()
    await waitFor(() => expect(editarCartao).toHaveBeenCalledWith('c4', { titulo: 'Configurar a OLT' }))
    const antes = vi.mocked(cartoesDoQuadro).mock.calls.length
    await user.click(within(janela).getAllByRole('button', { name: 'Fechar' }).at(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(vi.mocked(cartoesDoQuadro).mock.calls.length).toBe(antes + 1))
    expect(cartoesDoQuadro).toHaveBeenLastCalledWith(expect.objectContaining({ quadroId: 'q1', colunaId: 'col2', pagina: 1 }))
  })

  it('fechar sem mudar nada não relê nada', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    await user.click(screen.getByRole('button', { name: 'Cartão Configurar OLT' }))
    const janela = await screen.findByRole('dialog', { name: 'Configurar OLT' })
    const antes = vi.mocked(cartoesDoQuadro).mock.calls.length
    await user.click(within(janela).getAllByRole('button', { name: 'Fechar' }).at(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(vi.mocked(cartoesDoQuadro).mock.calls.length).toBe(antes)
  })

  it('cartão que sumiu enquanto a janela abria: aviso, a janela fecha e o quadro é relido', async () => {
    const user = userEvent.setup()
    vi.mocked(buscarCartao).mockResolvedValue(null)
    tela()
    await pronto()
    const antes = vi.mocked(quadroDoCliente).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Cartão Configurar OLT' }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Este cartão não está mais no quadro (ou você não o vê mais).'))
    await waitFor(() => expect(vi.mocked(quadroDoCliente).mock.calls.length).toBeGreaterThan(antes))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('o quadro rola dentro da área dele (colunas de 300 px; a página não alarga)', async () => {
    tela()
    await pronto()
    const area = screen.getByRole('region', { name: 'Colunas do quadro' })
    expect(area).toHaveClass('overflow-x-auto')
    // Texto só para leitor de tela (sr-only, position: absolute) dentro do quadro fica preso na área que rola, não no
    // <main> (a 360 px a página inteira rolava para o lado): a área é o bloco de posição dele.
    expect(area).toHaveClass('relative')
    for (const el of area.querySelectorAll('.sr-only')) {
      expect(area.contains(el.parentElement.closest('.relative, .absolute, .fixed, .sticky'))).toBe(true)
    }
    expect(screen.getByRole('button', { name: 'Adicionar cartão em A fazer' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Coluna A fazer' }).closest('[data-rfd-draggable-id]').firstElementChild)
      .toHaveClass('w-[300px]')
  })
})

// Área que rola nos testes (o jsdom não rola): scrollTop e scrollLeft guardam o valor.
const rolavel = (el) => {
  const valor = { scrollTop: 0, scrollLeft: 0 }
  for (const campo of Object.keys(valor)) {
    Object.defineProperty(el, campo, { configurable: true, get: () => valor[campo], set: (v) => { valor[campo] = v } })
  }
  return el
}

// Arrasto com o mouse (o do teclado é cancelado pela biblioteca quando a roda gira): aperta, passa do limite de 5 px
// (levanta), move até o ponto e solta.
const esperarQuadro = () => act(() => new Promise((pronto) => setTimeout(pronto, 40)))
async function levantarComMouse(alca) {
  const { left, top } = alca.getBoundingClientRect()
  const ponto = { x: left + 10, y: top + 10 }
  fireEvent.mouseDown(alca, { button: 0, clientX: ponto.x, clientY: ponto.y })
  fireEvent.mouseMove(alca, { button: 0, clientX: ponto.x, clientY: ponto.y + 10 })
  await esperarQuadro()
  return ponto
}
async function soltarComMouse(alca, { x, y }) {
  fireEvent.mouseMove(alca, { button: 0, clientX: x, clientY: y })
  await esperarQuadro()
  fireEvent.mouseUp(alca, { button: 0, clientX: x, clientY: y })
  await esperarQuadro()
  // A animação de soltar espera o fim da transição (o jsdom não anima).
  fireEvent.transitionEnd(alca, { propertyName: 'transform' })
  await esperarQuadro()
}

describe('rolagem (decisão do Diego: o quadro ocupa o resto da tela e cada coluna rola sozinha)', () => {
  it('a lista de cartões de cada coluna é a área que rola (a do arrasto), com o "ver mais" no fim', async () => {
    vi.mocked(cartoesDoQuadro).mockImplementation(async ({ colunaId }) => ({
      itens: cartoes[colunaId], total: colunaId === 'col1' ? 60 : cartoes[colunaId].length,
    }))
    tela()
    await pronto()
    const coluna = screen.getByRole('region', { name: 'Coluna A fazer' })
    const lista = coluna.querySelector('[data-rfd-droppable-id="col1"]')
    expect(lista).toHaveAttribute('data-rolagem-da-coluna')
    expect(lista).toHaveClass('overflow-y-auto')
    expect(within(lista).getAllByRole('button', { name: /^Cartão / })).toHaveLength(3)
    expect(within(lista).getByRole('button', { name: /^Ver mais/ })).toBeInTheDocument()
    // "Adicionar cartão" fica fora da rolagem, sempre à vista no pé da coluna.
    expect(lista).not.toContainElement(within(coluna).getByRole('button', { name: 'Adicionar cartão em A fazer' }))
    // A coluna encolhe até a altura da faixa (e a lista rola por dentro); a faixa só rola de lado.
    // (shrink-0 na coluna a deixava com a altura de todos os cartões, passando do fim da tela.)
    expect(coluna).toHaveClass('min-h-0')
    expect(coluna).not.toHaveClass('shrink-0')
    expect(coluna.closest('[data-rfd-draggable-id]')).toHaveClass('max-h-full', 'flex-col')
    expect(screen.getByRole('region', { name: 'Colunas do quadro' })).toHaveClass('overflow-x-auto', 'overflow-y-hidden')
  })

  it('no meio do arrasto, a roda rola só a coluna sob o ponteiro; a página e a faixa das colunas ficam paradas', async () => {
    simularGeometria()
    renderizarTela(<main><QuadroDoCliente cliente={CLIENTE} perfil={consultor} /></main>, { perfil: consultor })
    await pronto()
    const pagina = rolavel(document.querySelector('main'))
    const faixa = rolavel(screen.getByRole('region', { name: 'Colunas do quadro' }))
    const lista = rolavel(document.querySelector('[data-rfd-droppable-id="col2"]'))
    // Sem arrasto, a roda é da página.
    expect(fireEvent.wheel(pagina, { deltaY: 120 })).toBe(true)

    const alca = screen.getByRole('button', { name: 'Cartão Mapear boletos' })
    const ponto = await levantarComMouse(alca)
    expect(fireEvent.wheel(pagina, { deltaY: 120 })).toBe(false)
    expect(fireEvent.wheel(faixa, { deltaX: 80 })).toBe(false)
    expect(faixa.scrollLeft).toBe(0)
    expect(fireEvent.wheel(lista, { deltaY: 120 })).toBe(false)
    expect(lista.scrollTop).toBe(120)
    expect(fireEvent.wheel(lista, { deltaY: 3, deltaMode: 1 })).toBe(false)
    expect(lista.scrollTop).toBe(168)
    // Se a página rolar por outro caminho (teclas, barra de rolagem), volta na hora.
    pagina.scrollTop = 300
    fireEvent.scroll(pagina)
    expect(pagina.scrollTop).toBe(0)
    faixa.scrollLeft = 200
    fireEvent.scroll(faixa)
    expect(faixa.scrollLeft).toBe(0)

    // Um cartão para baixo e solta: cai onde apareceu.
    await soltarComMouse(alca, { x: ponto.x, y: ponto.y + 100 })
    expect(moverCartao).toHaveBeenCalledWith({ cartaoId: 'c1', colunaId: 'col1', antesId: 'c2', depoisId: 'c3' })
    // Solto, tudo volta a rolar normalmente.
    expect(fireEvent.wheel(pagina, { deltaY: 120 })).toBe(true)
    pagina.scrollTop = 300
    fireEvent.scroll(pagina)
    expect(pagina.scrollTop).toBe(300)
  })

  it('arrastando uma coluna, a faixa rola de lado (é a área da lista de colunas) e a página fica parada', async () => {
    simularGeometria()
    renderizarTela(<main><QuadroDoCliente cliente={CLIENTE} perfil={consultor} /></main>, { perfil: consultor })
    await pronto()
    const pagina = rolavel(document.querySelector('main'))
    const faixa = rolavel(screen.getByRole('region', { name: 'Colunas do quadro' }))
    const alca = screen.getByRole('button', { name: 'Mover a coluna A fazer' })
    const ponto = await levantarComMouse(alca)
    expect(fireEvent.wheel(faixa, { deltaX: 80 })).toBe(false)
    expect(faixa.scrollLeft).toBe(80)
    expect(fireEvent.wheel(pagina, { deltaY: 120 })).toBe(false)
    pagina.scrollTop = 300
    fireEvent.scroll(pagina)
    expect(pagina.scrollTop).toBe(0)
    faixa.scrollLeft = 0
    await soltarComMouse(alca, { x: ponto.x + 320, y: ponto.y })
    expect(moverColuna).toHaveBeenCalledWith({ colunaId: 'col1', antesId: 'col2', depoisId: 'col3' })
    expect(fireEvent.wheel(pagina, { deltaY: 120 })).toBe(true)
  })

  it('o quadro some no meio do arrasto (perdeu o acesso): a trava da rolagem sai junto e a página volta a rolar', async () => {
    simularGeometria()
    renderizarTela(<main><QuadroDoCliente cliente={CLIENTE} perfil={consultor} /></main>, { perfil: consultor })
    await pronto()
    const pagina = rolavel(document.querySelector('main'))
    // Uma releitura do quadro sai antes do arrasto e só volta no meio dele, dizendo que a pessoa não vê mais o quadro.
    let responder
    vi.mocked(quadroDoCliente).mockImplementationOnce(() => new Promise((r) => { responder = r }))
    await act(async () => avisar({ eventos: [{ motivo: 'reconectou' }], tudo: true, acesso: false, tabelas: [], colunas: [], cartoes: [] }))
    await waitFor(() => expect(responder).toBeTypeOf('function'))
    await levantarComMouse(screen.getByRole('button', { name: 'Cartão Mapear boletos' }))
    expect(fireEvent.wheel(pagina, { deltaY: 120 })).toBe(false)

    await act(async () => responder(null))
    expect(await screen.findByText('Você não tem mais acesso a este quadro.')).toBeInTheDocument()
    // A biblioteca desmonta sem chamar onDragEnd: sem soltar a trava aqui, a roda da página inteira ficaria presa.
    expect(fireEvent.wheel(pagina, { deltaY: 120 })).toBe(true)
    pagina.scrollTop = 300
    fireEvent.scroll(pagina)
    expect(pagina.scrollTop).toBe(300)
  })
})

describe('arrastar cartões', () => {
  it('arrastar um cartão para baixo chama mover_cartao com os vizinhos de destino e muda a ordem na hora', async () => {
    let terminar
    vi.mocked(moverCartao).mockReturnValue(new Promise((r) => { terminar = r }))
    tela()
    await pronto()
    await arrastarComTeclado(screen.getByRole('button', { name: 'Cartão Mapear boletos' }), ['baixo'])
    expect(moverCartao).toHaveBeenCalledWith({ cartaoId: 'c1', colunaId: 'col1', antesId: 'c2', depoisId: 'c3' })
    expect(ordem('A fazer')).toEqual(['Revisar contratos', 'Mapear boletos', 'Ligar para o financeiro'])
    await act(async () => terminar({ erro: null, cartao: {}, renumerou: false }))
    expect(ordem('A fazer')).toEqual(['Revisar contratos', 'Mapear boletos', 'Ligar para o financeiro'])
  })

  it('o cartão movido brilha uma vez; ao carregar, nenhum brilha', async () => {
    tela()
    await pronto()
    expect(document.querySelector('.mudou')).toBeNull()
    await arrastarComTeclado(screen.getByRole('button', { name: 'Cartão Revisar contratos' }), ['direita'])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cartão Revisar contratos' })).toHaveClass('mudou'))
    expect(document.querySelectorAll('.mudou')).toHaveLength(1)
  })

  it('arrastar para outra coluna: o vizinho é o cartão de cima na coluna nova e os contadores mudam', async () => {
    tela()
    await pronto()
    // O 2º cartão de "A fazer" vai para a altura do 2º lugar de "Em andamento": depois de "Configurar OLT".
    await arrastarComTeclado(screen.getByRole('button', { name: 'Cartão Revisar contratos' }), ['direita'])
    expect(moverCartao).toHaveBeenCalledWith({ cartaoId: 'c2', colunaId: 'col2', antesId: 'c4', depoisId: null })
    expect(ordem('Em andamento')).toEqual(['Configurar OLT', 'Revisar contratos'])
    expect(ordem('A fazer')).toEqual(['Mapear boletos', 'Ligar para o financeiro'])
    expect(within(screen.getByRole('region', { name: 'Coluna A fazer' })).getByTitle('2 cartões')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Coluna Em andamento' })).getByTitle('2 cartões')).toBeInTheDocument()
  })

  it('para o fim de uma coluna: o de cima vira o vizinho', async () => {
    tela()
    await pronto()
    await arrastarComTeclado(screen.getByRole('button', { name: 'Cartão Mapear boletos' }), ['baixo', 'baixo'])
    expect(moverCartao).toHaveBeenCalledWith({ cartaoId: 'c1', colunaId: 'col1', antesId: 'c3', depoisId: null })
  })

  it('se o banco recusar, o cartão volta, aparece o aviso e o quadro é relido', async () => {
    vi.mocked(moverCartao).mockResolvedValue({ erro: 'O quadro mudou enquanto você arrastava. Atualize o quadro e tente de novo.' })
    tela()
    await pronto()
    vi.mocked(quadroDoCliente).mockClear()
    await arrastarComTeclado(screen.getByRole('button', { name: 'Cartão Mapear boletos' }), ['baixo'])
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('O quadro mudou enquanto você arrastava. Atualize o quadro e tente de novo.'))
    expect(ordem('A fazer')).toEqual(['Mapear boletos', 'Revisar contratos', 'Ligar para o financeiro'])
    await waitFor(() => expect(quadroDoCliente).toHaveBeenCalledWith('k1'))
  })

  it('aviso do tempo real no meio do arrasto espera o arrasto terminar (a ordem da tela não se perde)', async () => {
    tela()
    await pronto()
    vi.mocked(cartoesDoQuadro).mockClear()
    const alca = screen.getByRole('button', { name: 'Cartão Mapear boletos' })
    await arrastarComTeclado(alca, ['baixo'], { soltar: false })
    // Outra pessoa mexeu na coluna enquanto o cartão está levantado.
    await act(async () => avisar({
      eventos: [{ tabela: 'cartoes', operacao: 'update', cartoes: ['c3'], colunas: ['col1'] }],
      tudo: false, acesso: false, tabelas: ['cartoes'], colunas: ['col1'], cartoes: ['c3'],
    }))
    expect(cartoesDoQuadro).not.toHaveBeenCalled()
    // O banco já tem a ordem nova quando a releitura acontece.
    cartoes.col1 = [cartoes.col1[1], cartoes.col1[0], cartoes.col1[2]]
    await soltarArrasto(alca)
    expect(moverCartao).toHaveBeenCalledWith({ cartaoId: 'c1', colunaId: 'col1', antesId: 'c2', depoisId: 'c3' })
    await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ colunaId: 'col1' })))
    expect(ordem('A fazer')).toEqual(['Revisar contratos', 'Mapear boletos', 'Ligar para o financeiro'])
  })

  it('reordenar colunas arrastando o cabeçalho chama mover_coluna com as vizinhas', async () => {
    tela()
    await pronto()
    await arrastarComTeclado(screen.getByRole('button', { name: 'Mover a coluna A fazer' }), ['direita'])
    expect(moverColuna).toHaveBeenCalledWith({ colunaId: 'col1', antesId: 'col2', depoisId: 'col3' })
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Em andamento', 'A fazer', 'Concluído'])
  })
})

describe('filtros', () => {
  it('com filtro ligado, arrastar fica desligado e a tela avisa; os filtros vão para o banco e Limpar volta', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    vi.mocked(cartoesDoQuadro).mockImplementation(async ({ colunaId }) => {
      const itens = cartoes[colunaId].filter((c) => c.prioridade === 'alta')
      return { itens, total: itens.length }
    })
    await escolherNoSeletor(user, 'Prioridade', 'Alta')
    await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ colunaId: 'col1', pagina: 1, prioridade: 'alta' })))
    // Quantos com o filtro: a soma das contagens das colunas filtradas (do banco), não os números do topo.
    expect(await screen.findByText(/^1 cartão com esses filtros\./)).toBeInTheDocument()
    expect(screen.getByText(/Com filtro ligado não dá para arrastar/)).toBeInTheDocument()
    await arrastarComTeclado(screen.getByRole('button', { name: 'Cartão Mapear boletos' }), ['baixo'])
    expect(moverCartao).not.toHaveBeenCalled()
    await fecharJanelaDoCartao('Mapear boletos')
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(screen.queryByText(/Com filtro ligado/)).not.toBeInTheDocument())
    expect(cartoesDoQuadro).toHaveBeenLastCalledWith(expect.objectContaining({ prioridade: '' }))
  })

  it('responsável (com "Sem responsável") e prazo', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    await escolherNoSeletor(user, 'Responsável', 'Sem responsável')
    await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ responsavel: 'sem' })))
    await escolherNoSeletor(user, 'Responsável', 'Gabi Souza')
    await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ responsavel: 'g1' })))
    expect(pessoasDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ quadroId: 'q1' }))
    await escolherNoSeletor(user, 'Prazo', 'Atrasados')
    await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ prazo: 'atrasados', responsavel: 'g1' })))
  })

  // Auditoria, G6: no celular, Prioridade, Responsável e Prazo ficam na gaveta; a busca e o Novo cartão, na barra.
  it('no celular os filtros ficam na gaveta (com "Filtros (1 ativo)"); o Limpar dela mantém a busca', async () => {
    vi.stubGlobal('matchMedia', vi.fn((consulta) => ({
      matches: !consulta.includes('min-width: 640px'), media: consulta, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })))
    try {
      const user = userEvent.setup()
      tela()
      await pronto()
      expect(screen.queryByLabelText('Prioridade')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Novo cartão/ })).toBeInTheDocument()
      await user.type(screen.getByRole('searchbox', { name: 'Buscar cartões' }), 'boleto')
      await user.click(screen.getByRole('button', { name: 'Filtros' }))
      const gaveta = screen.getByRole('dialog', { name: 'Filtros' })
      expect(within(gaveta).getByLabelText('Responsável')).toBeInTheDocument()
      await escolherNoSeletor(user, 'Prioridade', 'Alta')
      await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ prioridade: 'alta', busca: 'boleto' })))
      await user.click(within(gaveta).getByRole('button', { name: 'Ver resultados' }))
      await user.click(screen.getByRole('button', { name: 'Filtros (1 ativo)' }))
      await user.click(within(screen.getByRole('dialog', { name: 'Filtros' })).getByRole('button', { name: 'Limpar' }))
      await waitFor(() => expect(cartoesDoQuadro).toHaveBeenLastCalledWith(expect.objectContaining({ prioridade: '', busca: 'boleto' })))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('busca no banco, depois que a pessoa para de digitar', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    await user.type(screen.getByRole('searchbox', { name: 'Buscar cartões' }), 'boleto')
    await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ colunaId: 'col2', busca: 'boleto' })))
    expect(cartoesDoQuadro).not.toHaveBeenCalledWith(expect.objectContaining({ busca: 'bol' }))
  })
})

describe('colunas', () => {
  it('ver mais carrega a próxima página da coluna (50 por vez)', async () => {
    const muitos = Array.from({ length: 50 }, (_, i) => cartao(`m${i}`, 'col1', `Tarefa ${i + 1}`))
    vi.mocked(cartoesDoQuadro).mockImplementation(async ({ colunaId, pagina }) => {
      if (colunaId !== 'col1') return { itens: cartoes[colunaId], total: cartoes[colunaId].length }
      return pagina === 1 ? { itens: muitos, total: 53 } : { itens: [cartao('m50', 'col1', 'Tarefa 51')], total: 53 }
    })
    const user = userEvent.setup()
    tela()
    await user.click(await screen.findByRole('button', { name: 'Ver mais 3 cartões' }))
    expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ colunaId: 'col1', pagina: 2 }))
    expect(await screen.findByRole('button', { name: 'Cartão Tarefa 51' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cartão Tarefa 1' })).toBeInTheDocument()
  })

  it('releitura (tempo real) no meio do "ver mais": a página pedida entra junto e o botão não fica preso', async () => {
    const muitos = Array.from({ length: 50 }, (_, i) => cartao(`m${i}`, 'col1', `Tarefa ${i + 1}`))
    let falharVerMais
    let paginas2 = 0
    vi.mocked(cartoesDoQuadro).mockImplementation(async ({ colunaId, pagina }) => {
      if (colunaId !== 'col1') return { itens: cartoes[colunaId], total: cartoes[colunaId].length }
      if (pagina === 1) return { itens: muitos, total: 53 }
      paginas2 += 1
      // O primeiro pedido da página 2 (o "ver mais") demora e depois falha: já foi atropelado, não pode avisar nada.
      if (paginas2 === 1) return new Promise((_, rejeitar) => { falharVerMais = rejeitar })
      return { itens: [cartao('m50', 'col1', 'Tarefa 51')], total: 53 }
    })
    const user = userEvent.setup()
    tela()
    await user.click(await screen.findByRole('button', { name: 'Ver mais 3 cartões' }))
    await act(async () => avisar({
      eventos: [{ tabela: 'cartoes', operacao: 'update', cartoes: ['m3'], colunas: ['col1'] }],
      tudo: false, acesso: false, tabelas: ['cartoes'], colunas: ['col1'], cartoes: ['m3'],
    }))
    expect(await screen.findByRole('button', { name: 'Cartão Tarefa 51' })).toBeInTheDocument()
    const verMais = screen.getByRole('button', { name: 'Ver mais 2 cartões' })
    expect(verMais).toBeEnabled()
    await act(async () => falharVerMais(new Error('rede')))
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: 'Cartão Tarefa 51' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Ver mais 2 cartões' })).toBeEnabled()
  })

  it('"ver mais" no meio de uma releitura não perde a releitura: ela é refeita depois', async () => {
    const muitos = Array.from({ length: 50 }, (_, i) => cartao(`m${i}`, 'col1', `Tarefa ${i + 1}`))
    let leituraVelha
    let novo = false
    let paginas1 = 0
    vi.mocked(cartoesDoQuadro).mockImplementation(async ({ colunaId, pagina }) => {
      if (colunaId !== 'col1') return { itens: cartoes[colunaId], total: cartoes[colunaId].length }
      if (pagina === 2) return { itens: [cartao('m50', 'col1', 'Tarefa 51')], total: 53 }
      paginas1 += 1
      // A 2ª leitura da página 1 (a do aviso) demora; quando chega já está velha.
      if (paginas1 === 2) return new Promise((pronto) => { leituraVelha = pronto })
      const itens = novo ? [cartao('n1', 'col1', 'Feito por outra pessoa'), ...muitos.slice(0, 49)] : muitos
      return { itens, total: novo ? 54 : 53 }
    })
    const user = userEvent.setup()
    tela()
    await screen.findByRole('button', { name: 'Ver mais 3 cartões' })
    novo = true
    await act(async () => avisar({
      eventos: [{ tabela: 'cartoes', operacao: 'insert', cartoes: ['n1'], colunas: ['col1'] }],
      tudo: false, acesso: false, tabelas: ['cartoes'], colunas: ['col1'], cartoes: ['n1'],
    }))
    await user.click(screen.getByRole('button', { name: 'Ver mais 3 cartões' }))
    // O aviso não se perde: depois do "ver mais", a coluna é relida (páginas 1 e 2) e o cartão novo aparece.
    expect(await screen.findByRole('button', { name: 'Cartão Feito por outra pessoa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cartão Tarefa 51' })).toBeInTheDocument()
    await act(async () => leituraVelha({ itens: muitos, total: 53 }))
    expect(screen.getByRole('button', { name: 'Cartão Feito por outra pessoa' })).toBeInTheDocument()
  })

  it('"ver mais" recusado por permissão relê o quadro (sem aviso de erro de rede)', async () => {
    const muitos = Array.from({ length: 50 }, (_, i) => cartao(`m${i}`, 'col1', `Tarefa ${i + 1}`))
    vi.mocked(cartoesDoQuadro).mockImplementation(async ({ colunaId, pagina }) => {
      if (colunaId !== 'col1') return { itens: cartoes[colunaId], total: cartoes[colunaId].length }
      if (pagina === 2) throw { code: 'P0001', message: 'sem_permissao' }
      return { itens: muitos, total: 53 }
    })
    const user = userEvent.setup()
    tela()
    const verMais = await screen.findByRole('button', { name: 'Ver mais 3 cartões' })
    vi.mocked(quadroDoCliente).mockResolvedValue(null)
    await user.click(verMais)
    expect(await screen.findByText('Você não tem mais acesso a este quadro.')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('+ Nova coluna no fim do quadro', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    vi.mocked(quadroDoCliente).mockClear()
    await user.click(screen.getByRole('button', { name: 'Nova coluna' }))
    await user.type(screen.getByRole('textbox', { name: 'Nome da nova coluna' }), 'Revisão{Enter}')
    expect(criarColuna).toHaveBeenCalledWith({ quadroId: 'q1', nome: 'Revisão' })
    await waitFor(() => expect(quadroDoCliente).toHaveBeenCalled())
  })

  it('renomear no lugar', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    await naColuna(user, 'A fazer', 'Renomear')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const campo = screen.getByRole('textbox', { name: 'Nome da coluna' })
    expect(campo).toHaveFocus()
    expect(campo).toHaveValue('A fazer')
    await user.clear(campo)
    await user.type(campo, 'Backlog{Enter}')
    expect(editarColuna).toHaveBeenCalledWith('col1', { nome: 'Backlog' })
    // O foco volta ao "⋯" da coluna (o campo sumiu; sem isso ele cairia no fim da página).
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-label', expect.stringMatching(/^Ações da coluna /)))
    // E o Enter não reabre o menu.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('desistir de renomear (Esc) também devolve o foco ao "⋯" da coluna, sem gravar', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    await naColuna(user, 'A fazer', 'Renomear')
    await user.type(screen.getByRole('textbox', { name: 'Nome da coluna' }), 'X{Escape}')
    expect(editarColuna).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ações da coluna A fazer' })).toHaveFocus())
  })

  it('cor (10 e automática) e coluna de concluídos', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    await naColuna(user, 'Em andamento', 'Cor')
    const painel = screen.getByRole('dialog', { name: 'Cor da coluna' })
    expect(within(painel).getAllByRole('radio')).toHaveLength(11)
    expect(within(painel).getByRole('radio', { name: 'Verde' })).toHaveAttribute('aria-checked', 'true')
    // O foco entra no painel, na cor escolhida (o painel fica no fim da página: o Tab não chegaria nele).
    expect(within(painel).getByRole('radio', { name: 'Verde' })).toHaveFocus()
    await user.click(within(painel).getByRole('radio', { name: 'Vermelho' }))
    expect(editarColuna).toHaveBeenCalledWith('col2', { cor: 7 })
    await naColuna(user, 'Em andamento', 'Cor')
    await user.click(screen.getByRole('switch', { name: 'Coluna de concluídos' }))
    expect(editarColuna).toHaveBeenCalledWith('col2', { concluidos: true })
  })

  it('apagar coluna (gestão) pergunta para onde vão os cartões: a anterior por padrão', async () => {
    vi.mocked(quadroDoCliente).mockResolvedValue({ ...QUADRO, pode_gerir: true })
    const user = userEvent.setup()
    tela(gestora)
    await pronto()
    await naColuna(user, 'Em andamento', 'Apagar coluna')
    const janela = screen.getByRole('dialog', { name: 'Apagar a coluna Em andamento?' })
    expect(within(janela).getByLabelText('Para qual coluna')).toHaveTextContent('A fazer')
    await user.click(within(janela).getByRole('button', { name: 'Apagar coluna' }))
    expect(apagarColuna).toHaveBeenCalledWith('col2', { destinoId: 'col1' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Apagar a coluna Em andamento?' })).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Coluna Em andamento apagada.')
  })
})

describe('recusas do banco relêem o quadro', () => {
  it('nova coluna recusada: avisa e relê', async () => {
    vi.mocked(criarColuna).mockResolvedValue({ erro: 'O quadro chegou ao limite de 50 colunas.' })
    const user = userEvent.setup()
    tela()
    await pronto()
    vi.mocked(quadroDoCliente).mockClear()
    await user.click(screen.getByRole('button', { name: 'Nova coluna' }))
    await user.type(screen.getByRole('textbox', { name: 'Nome da nova coluna' }), 'Revisão{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('O quadro chegou ao limite de 50 colunas.'))
    await waitFor(() => expect(quadroDoCliente).toHaveBeenCalled())
  })

  it('renomear recusado: o nome volta, avisa e relê', async () => {
    vi.mocked(editarColuna).mockResolvedValue({ erro: 'Você não tem permissão para isso.' })
    const user = userEvent.setup()
    tela()
    await pronto()
    vi.mocked(quadroDoCliente).mockClear()
    await naColuna(user, 'A fazer', 'Renomear')
    const campo = screen.getByRole('textbox', { name: 'Nome da coluna' })
    await user.clear(campo)
    await user.type(campo, 'Backlog{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Você não tem permissão para isso.'))
    expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('A fazer')
    await waitFor(() => expect(quadroDoCliente).toHaveBeenCalled())
  })

  it('apagar coluna recusado: a janela mostra o motivo e o quadro é relido', async () => {
    vi.mocked(quadroDoCliente).mockResolvedValue({ ...QUADRO, pode_gerir: true })
    vi.mocked(apagarColuna).mockResolvedValue({ erro: 'Essa coluna não está mais no quadro. Atualize o quadro e tente de novo.' })
    const user = userEvent.setup()
    tela(gestora)
    await pronto()
    await naColuna(user, 'Em andamento', 'Apagar coluna')
    vi.mocked(quadroDoCliente).mockClear()
    const janela = screen.getByRole('dialog', { name: 'Apagar a coluna Em andamento?' })
    await user.click(within(janela).getByRole('button', { name: 'Apagar coluna' }))
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Essa coluna não está mais no quadro.')
    await waitFor(() => expect(quadroDoCliente).toHaveBeenCalled())
  })
})

describe('tempo real', () => {
  it('ouve o canal do quadro e para ao sair', async () => {
    const { unmount } = tela()
    await pronto()
    expect(ouvirQuadro).toHaveBeenCalledWith('q1', expect.any(Function), { juntarMs: 300 })
    expect(parar).not.toHaveBeenCalled()
    unmount()
    expect(parar).toHaveBeenCalled()
  })

  it('aviso de cartões relê só as colunas que mudaram ', async () => {
    tela()
    await pronto()
    vi.mocked(cartoesDoQuadro).mockClear()
    cartoes.col2 = [...cartoes.col2, cartao('c9', 'col2', 'Trocar roteador')]
    await act(async () => avisar({
      eventos: [{ tabela: 'cartoes', operacao: 'insert', cartoes: ['c9'], colunas: ['col2'] }],
      tudo: false, acesso: false, tabelas: ['cartoes'], colunas: ['col2'], cartoes: ['c9'],
    }))
    expect(await screen.findByRole('button', { name: 'Cartão Trocar roteador' })).toBeInTheDocument()
    expect(cartoesDoQuadro).toHaveBeenCalledTimes(1)
    expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ colunaId: 'col2' }))
  })

  it('conectou, reconectou ou plano B: relê o quadro todo', async () => {
    tela()
    await pronto()
    vi.mocked(quadroDoCliente).mockClear()
    vi.mocked(cartoesDoQuadro).mockClear()
    await act(async () => avisar({ eventos: [{ motivo: 'conectou' }], tudo: true, acesso: false, tabelas: [], colunas: [], cartoes: [] }))
    await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledTimes(3))
    expect(quadroDoCliente).toHaveBeenCalledWith('k1')
  })

  it('"reler tudo" atropelado por outra leitura do quadro: a leitura que vale relê todas as colunas', async () => {
    vi.mocked(quadroDoCliente).mockResolvedValue({ ...QUADRO, pode_gerir: true })
    const user = userEvent.setup()
    tela(gestora)
    await pronto()
    vi.mocked(cartoesDoQuadro).mockClear()
    let leituraVelha
    vi.mocked(quadroDoCliente).mockReturnValueOnce(new Promise((pronto) => { leituraVelha = pronto }))
    await act(async () => avisar({ eventos: [{ motivo: 'reconectou' }], tudo: true, acesso: false, tabelas: [], colunas: [], cartoes: [] }))
    // Abrir "Apagar coluna" relê o quadro e atropela a leitura do "reler tudo".
    await naColuna(user, 'Em andamento', 'Apagar coluna')
    await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledTimes(3))
    expect(cartoesDoQuadro.mock.calls.map(([p]) => p.colunaId).sort()).toEqual(['col1', 'col2', 'col3'])
    await act(async () => leituraVelha({ ...QUADRO, pode_gerir: true }))
    expect(cartoesDoQuadro).toHaveBeenCalledTimes(3)
  })

  it('sessão que deixou de valer (sem_permissao) numa releitura do quadro: para de ouvir e avisa', async () => {
    tela()
    await pronto()
    vi.mocked(quadroDoCliente).mockRejectedValue({ code: 'P0001', message: 'sem_permissao' })
    await act(async () => avisar({ eventos: [{ motivo: 'plano_b' }], tudo: true, acesso: false, tabelas: [], colunas: [], cartoes: [] }))
    expect(await screen.findByText('Você não tem mais acesso a este quadro.')).toBeInTheDocument()
    expect(parar).toHaveBeenCalled()
  })

  it('quem perdeu o acesso para de ouvir e vê o aviso', async () => {
    tela()
    await pronto()
    vi.mocked(quadroDoCliente).mockResolvedValue(null)
    await act(async () => avisar({ eventos: [{ acesso: true }], tudo: true, acesso: true, tabelas: ['clientes'], colunas: [], cartoes: [] }))
    expect(await screen.findByText('Você não tem mais acesso a este quadro.')).toBeInTheDocument()
    expect(parar).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^Cartão / })).not.toBeInTheDocument()
  })
})
