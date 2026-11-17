import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apagarColuna, cartoesDoQuadro, criarColuna, editarColuna, indicadoresDoQuadro, moverCartao, moverColuna,
  pessoasDoQuadro, quadroDoCliente, quadroPorId, quadrosDoCliente,
} from '@/data/quadro'
import { ouvirQuadro } from '@/data/quadroAoVivo'
import { somarDias } from '@/lib/calendario'
import { hoje } from '@/lib/mes'
import { arrastarComTeclado, simularGeometria, soltarArrasto } from '@/test/arrastar'
import { escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import QuadroDoCliente from './QuadroDoCliente'

vi.mock('@/data/quadro', () => ({
  CARTOES_POR_PAGINA: 50, ARQUIVADOS_POR_PAGINA: 15,
  quadroDoCliente: vi.fn(), quadrosDoCliente: vi.fn(), quadroPorId: vi.fn(), cartoesDoQuadro: vi.fn(),
  indicadoresDoQuadro: vi.fn(), cartoesArquivados: vi.fn(), pessoasDoQuadro: vi.fn(), moverCartao: vi.fn(),
  moverColuna: vi.fn(), apagarColuna: vi.fn(), criarCartao: vi.fn(), restaurarCartao: vi.fn(), apagarCartao: vi.fn(),
  criarColuna: vi.fn(), editarColuna: vi.fn(),
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
  vi.mocked(indicadoresDoQuadro).mockResolvedValue({ cartoes: 4, atrasados: 1, vencem_em_7_dias: 2, sem_responsavel: 3 })
  vi.mocked(pessoasDoQuadro).mockResolvedValue({ itens: [pessoa('p1', 'Ana Lima'), pessoa('g1', 'Gabi Souza')], total: 2 })
  vi.mocked(moverCartao).mockResolvedValue({ erro: null, cartao: {}, renumerou: false })
  vi.mocked(moverColuna).mockResolvedValue({ erro: null, coluna: {}, renumerou: false })
  vi.mocked(criarColuna).mockResolvedValue({ erro: null, coluna: { id: 'col4' } })
  vi.mocked(editarColuna).mockResolvedValue({ erro: null })
  vi.mocked(apagarColuna).mockResolvedValue({ erro: null, movidos: 1, apagados: 0, idsApagados: [] })
  parar = vi.fn()
  avisar = null
  vi.mocked(ouvirQuadro).mockImplementation((_id, aoMudar) => {
    avisar = aoMudar
    return parar
  })
})

const tela = (perfil = consultor, { cliente = CLIENTE, aoAbrirCartao = vi.fn() } = {}) => {
  simularGeometria()
  const r = renderizarTela(<QuadroDoCliente cliente={cliente} perfil={perfil} aoAbrirCartao={aoAbrirCartao} />, { perfil })
  return { ...r, aoAbrirCartao }
}

const pronto = async () => {
  await screen.findByRole('button', { name: 'Cartão Mapear boletos' })
  await waitFor(() => expect(ordem('Em andamento')).toEqual(['Configurar OLT']))
}

describe('aba Quadro: o que cada um vê', () => {
  it('barra de filtros, os 4 números logo abaixo e as colunas com os cartões', async () => {
    tela()
    const numeros = await cartoesAbaixoDaBarra('Indicadores do quadro')
    await pronto()
    expect(quadroDoCliente).toHaveBeenCalledWith('k1')
    expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ quadroId: 'q1', colunaId: 'col1', pagina: 1 }))
    expect(indicadoresDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ quadroId: 'q1' }))
    expect(numeroDoCartao(numeros, 'Cartões no quadro')).toBe('4')
    expect(numeroDoCartao(numeros, 'Atrasados')).toBe('1')
    expect(numeroDoCartao(numeros, 'Vencem em 7 dias')).toBe('2')
    expect(numeroDoCartao(numeros, 'Sem responsável')).toBe('3')
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
    tela()
    await pronto()
    expect(screen.getByRole('button', { name: 'Novo cartão' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova coluna' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Renomear a coluna A fazer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cor da coluna A fazer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apagar a coluna/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Arquivados' })).toBeInTheDocument()
  })

  it('a gestão também apaga coluna', async () => {
    vi.mocked(quadroDoCliente).mockResolvedValue({ ...QUADRO, pode_gerir: true })
    tela(gestora)
    await pronto()
    expect(screen.getByRole('button', { name: 'Apagar a coluna A fazer' })).toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: /Renomear a coluna/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Adicionar cartão/ })).not.toBeInTheDocument()
    // Um quadro só: sem o seletor de consultoria.
    expect(screen.queryByLabelText('Consultoria')).not.toBeInTheDocument()
    expect(screen.getByText('Você vê este quadro só para ler.')).toBeInTheDocument()
    await arrastarComTeclado(screen.getByRole('button', { name: 'Cartão Mapear boletos' }), ['baixo'])
    expect(moverCartao).not.toHaveBeenCalled()
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

  it('clicar no cartão abre o cartão (aoAbrirCartao)', async () => {
    const user = userEvent.setup()
    const { aoAbrirCartao } = tela()
    await user.click(await screen.findByRole('button', { name: 'Cartão Revisar contratos' }))
    expect(aoAbrirCartao).toHaveBeenCalledWith('c2')
  })

  it('o quadro rola dentro da área dele (colunas de 300 px; a página não alarga)', async () => {
    tela()
    await pronto()
    const area = screen.getByRole('region', { name: 'Colunas do quadro' })
    expect(area).toHaveClass('overflow-x-auto')
    expect(screen.getByRole('region', { name: 'Coluna A fazer' }).closest('[data-rfd-draggable-id]').firstElementChild)
      .toHaveClass('w-[300px]')
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
    await escolherNoSeletor(user, 'Prioridade', 'Alta')
    await waitFor(() => expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ colunaId: 'col1', pagina: 1, prioridade: 'alta' })))
    expect(indicadoresDoQuadro).toHaveBeenLastCalledWith(expect.objectContaining({ quadroId: 'q1', prioridade: 'alta' }))
    expect(screen.getByText(/Com filtro ligado não dá para arrastar/)).toBeInTheDocument()
    await arrastarComTeclado(screen.getByRole('button', { name: 'Cartão Mapear boletos' }), ['baixo'])
    expect(moverCartao).not.toHaveBeenCalled()
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
    await user.click(screen.getByRole('button', { name: 'Renomear a coluna A fazer' }))
    const campo = screen.getByRole('textbox', { name: 'Nome da coluna' })
    expect(campo).toHaveValue('A fazer')
    await user.clear(campo)
    await user.type(campo, 'Backlog{Enter}')
    expect(editarColuna).toHaveBeenCalledWith('col1', { nome: 'Backlog' })
  })

  it('cor (10 e automática) e coluna de concluídos', async () => {
    const user = userEvent.setup()
    tela()
    await pronto()
    await user.click(screen.getByRole('button', { name: 'Cor da coluna Em andamento' }))
    const painel = screen.getByRole('dialog', { name: 'Cor da coluna' })
    expect(within(painel).getAllByRole('radio')).toHaveLength(11)
    expect(within(painel).getByRole('radio', { name: 'Verde' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(painel).getByRole('radio', { name: 'Vermelho' }))
    expect(editarColuna).toHaveBeenCalledWith('col2', { cor: 7 })
    await user.click(screen.getByRole('button', { name: 'Cor da coluna Em andamento' }))
    await user.click(screen.getByRole('switch', { name: 'Coluna de concluídos' }))
    expect(editarColuna).toHaveBeenCalledWith('col2', { concluidos: true })
  })

  it('apagar coluna (gestão) pergunta para onde vão os cartões: a anterior por padrão', async () => {
    vi.mocked(quadroDoCliente).mockResolvedValue({ ...QUADRO, pode_gerir: true })
    const user = userEvent.setup()
    tela(gestora)
    await pronto()
    await user.click(screen.getByRole('button', { name: 'Apagar a coluna Em andamento' }))
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
    await user.click(screen.getByRole('button', { name: 'Renomear a coluna A fazer' }))
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
    await user.click(screen.getByRole('button', { name: 'Apagar a coluna Em andamento' }))
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

  it('aviso de cartões relê só as colunas que mudaram (e os números)', async () => {
    tela()
    await pronto()
    vi.mocked(cartoesDoQuadro).mockClear()
    vi.mocked(indicadoresDoQuadro).mockClear()
    cartoes.col2 = [...cartoes.col2, cartao('c9', 'col2', 'Trocar roteador')]
    await act(async () => avisar({
      eventos: [{ tabela: 'cartoes', operacao: 'insert', cartoes: ['c9'], colunas: ['col2'] }],
      tudo: false, acesso: false, tabelas: ['cartoes'], colunas: ['col2'], cartoes: ['c9'],
    }))
    expect(await screen.findByRole('button', { name: 'Cartão Trocar roteador' })).toBeInTheDocument()
    expect(cartoesDoQuadro).toHaveBeenCalledTimes(1)
    expect(cartoesDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ colunaId: 'col2' }))
    expect(indicadoresDoQuadro).toHaveBeenCalledTimes(1)
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
