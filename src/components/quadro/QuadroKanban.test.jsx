import { useCallback, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import {
  anexosDoCartao, buscarCartao, cartoesDoQuadro, comentariosDoCartao, enviarAnexo, enviarImagemDaDescricao, moverCartao,
  quadroPorId, urlsAssinadas,
} from '@/data/quadro'
import { ouvirQuadro } from '@/data/quadroAoVivo'
import { arrastarComTeclado, simularGeometria } from '@/test/arrastar'
import { prepararEditor } from '@/test/editor'
import QuadroKanban from './QuadroKanban'
import { FILTROS_VAZIOS, useQuadro } from './useQuadro'

vi.mock('@/data/quadro', () => ({
  CARTOES_POR_PAGINA: 50, ARQUIVADOS_POR_PAGINA: 15, COMENTARIOS_POR_VEZ: 30, ANEXOS_POR_PAGINA: 15,
  quadroPorId: vi.fn(), cartoesDoQuadro: vi.fn(), cartoesArquivados: vi.fn(), pessoasDoQuadro: vi.fn(), moverCartao: vi.fn(),
  moverColuna: vi.fn(), apagarColuna: vi.fn(), criarCartao: vi.fn(), restaurarCartao: vi.fn(), apagarCartao: vi.fn(),
  criarColuna: vi.fn(), editarColuna: vi.fn(),
  // Janela do cartão
  buscarCartao: vi.fn(), editarCartao: vi.fn(), arquivarCartao: vi.fn(), adicionarResponsavel: vi.fn(), tirarResponsavel: vi.fn(),
  criarItemDoChecklist: vi.fn(), editarItemDoChecklist: vi.fn(), apagarItemDoChecklist: vi.fn(), comentariosDoCartao: vi.fn(),
  comentar: vi.fn(), editarComentario: vi.fn(), apagarComentario: vi.fn(), anexosDoCartao: vi.fn(), enviarAnexo: vi.fn(),
  apagarAnexo: vi.fn(), urlAssinada: vi.fn(), enviarImagemDaDescricao: vi.fn(), urlsAssinadas: vi.fn(),
}))
vi.mock('@/data/quadroAoVivo', () => ({ ouvirQuadro: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

// O corpo do quadro sem nada do cliente: aqui montado como o menu Quadros vai montar (um quadro pessoal lido pelo id).
const ana = { id: 'p1', nome: 'Ana Lima', foto: null, cor: null, papel: 'pessoa', consultoria_id: 's1' }
const COLUNAS = [
  { id: 'col1', nome: 'A fazer', cor: null, concluidos: false, posicao: 1024, cartoes: 2, arquivados: 0 },
  { id: 'col2', nome: 'Feito', cor: null, concluidos: true, posicao: 2048, cartoes: 0, arquivados: 0 },
]
const PESSOAL = {
  id: 'q9', cliente_id: null, tipo: 'pessoa', nome: 'Minhas tarefas', consultoria_id: 's1', arquivado_em: null, favorito: false,
  pode_mexer: true, pode_gerir: true, colunas: COLUNAS,
}
const DO_TIME = {
  id: 'q8', cliente_id: null, tipo: 'time', nome: 'Sprint', consultoria_id: 's1', arquivado_em: null, favorito: false,
  pode_mexer: true, pode_gerir: false, colunas: [{ id: 'col7', nome: 'Ideias', cor: null, concluidos: false, posicao: 1024, cartoes: 0, arquivados: 0 }],
}
const UUID = '0b6f3f5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

const cartao = (id, colunaId, titulo) => ({
  id, coluna_id: colunaId, titulo, resumo: null, prioridade: null, prazo: null, criado_por: 'p1', criado_em: '2026-11-10T10:00:00Z',
  responsaveis: [], checklist: { total: 0, feitos: 0 }, comentarios: 0, anexos: 0,
})
const CARTOES = { col1: [cartao('c1', 'col1', 'Mapear boletos'), cartao('c2', 'col1', 'Revisar contratos')], col2: [], col7: [] }
const cartaoAberto = (extras = {}) => ({
  id: 'c1', quadro_id: 'q9', coluna_id: 'col1', titulo: 'Mapear boletos', descricao: null, prioridade: null, prazo: null,
  arquivado_em: null, criado_em: '2026-11-10T13:00:00Z', coluna: { id: 'col1', nome: 'A fazer', concluidos: false },
  criado_por: { id: 'p1', nome: 'Ana Lima', foto: null, cor: null }, responsaveis: [], checklist: [], comentarios: 0, anexos: 0,
  pode_mexer: true, pode_apagar: true, ...extras,
})

function QuadroDeTeste({ quadroId, motivo = null, vazio = 'Nenhum quadro por aqui.' }) {
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  const ler = useCallback(async () => ({ quadro: await quadroPorId(quadroId) }), [quadroId])
  const estado = useQuadro({ ler, chave: quadroId, filtros })
  return <QuadroKanban estado={estado} filtros={filtros} aoFiltrar={setFiltros} perfil={ana} motivoSomenteLeitura={motivo} vazio={vazio} />
}

const Envolver = ({ children }) => (
  <AuthContext.Provider value={{ perfil: ana }}><MemoryRouter>{children}</MemoryRouter></AuthContext.Provider>
)
const montar = (props) => {
  simularGeometria()
  return render(<QuadroDeTeste {...props} />, { wrapper: Envolver })
}
const pronto = () => screen.findByRole('button', { name: 'Cartão Mapear boletos' })

let parar
beforeAll(prepararEditor)
beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.mocked(quadroPorId).mockImplementation(async (id) => ({ q9: PESSOAL, q8: DO_TIME })[id] ?? null)
  vi.mocked(cartoesDoQuadro).mockImplementation(async ({ colunaId }) => ({ itens: CARTOES[colunaId], total: CARTOES[colunaId].length }))
  vi.mocked(moverCartao).mockResolvedValue({ erro: null, cartao: {}, renumerou: false })
  vi.mocked(buscarCartao).mockResolvedValue(cartaoAberto())
  vi.mocked(comentariosDoCartao).mockResolvedValue({ itens: [], haMais: false })
  vi.mocked(anexosDoCartao).mockResolvedValue({ itens: [], total: 0 })
  vi.mocked(urlsAssinadas).mockImplementation(async (caminhos) => ({ urls: Object.fromEntries(caminhos.map((c) => [c, `https://assinado.local/${c}`])) }))
  parar = vi.fn()
  vi.mocked(ouvirQuadro).mockReturnValue(parar)
})

describe('QuadroKanban (o corpo do quadro, do cliente ou do menu)', () => {
  it('com motivoSomenteLeitura mostra o motivo e não deixa arrastar nem criar', async () => {
    // O banco devolve pode_mexer falso no quadro arquivado; o motivo diz por quê (no quadro e na janela do cartão).
    vi.mocked(quadroPorId).mockResolvedValue({ ...PESSOAL, pode_mexer: false, pode_gerir: false })
    vi.mocked(buscarCartao).mockResolvedValue(cartaoAberto({ pode_mexer: false, pode_apagar: false }))
    montar({ quadroId: 'q9', motivo: 'Quadro arquivado: só para ler.' })
    await pronto()
    expect(screen.getByText('Quadro arquivado: só para ler.')).toBeInTheDocument()
    expect(screen.queryByText('Você vê este quadro só para ler.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo cartão' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova coluna' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ações da coluna/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Adicionar cartão/ })).not.toBeInTheDocument()
    // Sem arrastar, o espaço abre o cartão (ele continua um botão): nada se move.
    await arrastarComTeclado(screen.getByRole('button', { name: 'Cartão Mapear boletos' }), ['baixo'])
    expect(moverCartao).not.toHaveBeenCalled()
    const janela = await screen.findByRole('dialog', { name: 'Mapear boletos' })
    expect(within(janela).getByText('Quadro arquivado: só para ler.')).toBeInTheDocument()
  })

  it('sem quadro mostra `vazio`', async () => {
    montar({ quadroId: 'sumiu', vazio: 'Este quadro não existe mais.' })
    expect(await screen.findByText('Este quadro não existe mais.')).toBeInTheDocument()
    expect(ouvirQuadro).not.toHaveBeenCalled()
  })

  it('a janela do cartão recebe a pasta do quadro: imagem da descrição e anexo vão para quadro/<id>/… num quadro pessoal', async () => {
    const caminho = `quadro/q9/c1/imagens/${UUID}.png`
    vi.mocked(enviarImagemDaDescricao).mockResolvedValue({ erro: null, caminho })
    vi.mocked(enviarAnexo).mockImplementation(async (_onde, arquivo) => ({ erro: null, anexo: { id: 'x1', nome: arquivo.name } }))
    const user = userEvent.setup()
    montar({ quadroId: 'q9' })
    await user.click(await pronto())
    const janela = await screen.findByRole('dialog', { name: 'Mapear boletos' })
    const foto = new File(['png'], 'foto.png', { type: 'image/png' })
    await user.upload(within(janela).getByLabelText('Escolher imagem'), foto)
    expect(enviarImagemDaDescricao).toHaveBeenCalledWith({ pasta: 'quadro/q9', cartaoId: 'c1' }, foto)
    // O editor aceita a imagem da pasta deste quadro e deste cartão (a de outra pasta ele tira).
    await waitFor(() => expect(within(janela).getByRole('img', { name: 'Imagem da descrição' })).toHaveAttribute('src', `https://assinado.local/${caminho}`))
    const ata = new File(['x'], 'ata.pdf', { type: 'application/pdf' })
    await user.upload(within(janela).getByLabelText('Escolher arquivos para anexar'), ata)
    expect(enviarAnexo).toHaveBeenCalledWith({ pasta: 'quadro/q9', cartaoId: 'c1' }, ata)
  })

  it('mudar a chave recomeça do zero: nada do quadro anterior fica na tela, e o canal troca', async () => {
    const { rerender } = montar({ quadroId: 'q9' })
    await pronto()
    expect(ouvirQuadro).toHaveBeenLastCalledWith('q9', expect.any(Function), { juntarMs: 300 })
    let responder
    vi.mocked(quadroPorId).mockImplementation(() => new Promise((r) => { responder = r }))
    rerender(<QuadroDeTeste quadroId="q8" />)
    expect(await screen.findByText('Carregando o quadro…')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Coluna A fazer' })).not.toBeInTheDocument()
    expect(parar).toHaveBeenCalled()
    await waitFor(() => expect(quadroPorId).toHaveBeenLastCalledWith('q8'))
    responder(DO_TIME)
    expect(await screen.findByRole('region', { name: 'Coluna Ideias' })).toBeInTheDocument()
    expect(ouvirQuadro).toHaveBeenLastCalledWith('q8', expect.any(Function), { juntarMs: 300 })
    expect(cartoesDoQuadro).toHaveBeenLastCalledWith(expect.objectContaining({ quadroId: 'q8', colunaId: 'col7' }))
  })
})
