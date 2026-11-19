import { useEffect } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { anexosDoCartao, buscarCartao, cartoesDoQuadro, comentariosDoCartao, quadroPorId, urlsAssinadas } from '@/data/quadro'
import { ouvirQuadro } from '@/data/quadroAoVivo'
import {
  apagarQuadro, arquivarQuadro, criarQuadro, marcarFavorito, quadrosArquivados, quadrosParaEscolher, quadrosPorIds,
  renomearQuadro, restaurarQuadro, timesParaNovoQuadro,
} from '@/data/quadros'
import { lembrarQuadro, lerMemoria } from '@/lib/quadrosRecentes'
import { simularGeometria } from '@/test/arrastar'
import { prepararEditor } from '@/test/editor'
import Quadros from './Quadros'

vi.mock('@/data/quadro', () => ({
  CARTOES_POR_PAGINA: 50, ARQUIVADOS_POR_PAGINA: 15, COMENTARIOS_POR_VEZ: 30, ANEXOS_POR_PAGINA: 15,
  quadroPorId: vi.fn(), cartoesDoQuadro: vi.fn(), cartoesArquivados: vi.fn(), pessoasDoQuadro: vi.fn(), moverCartao: vi.fn(),
  moverColuna: vi.fn(), apagarColuna: vi.fn(), criarCartao: vi.fn(), restaurarCartao: vi.fn(), apagarCartao: vi.fn(),
  criarColuna: vi.fn(), editarColuna: vi.fn(),
  buscarCartao: vi.fn(), editarCartao: vi.fn(), arquivarCartao: vi.fn(), adicionarResponsavel: vi.fn(), tirarResponsavel: vi.fn(),
  criarItemDoChecklist: vi.fn(), editarItemDoChecklist: vi.fn(), apagarItemDoChecklist: vi.fn(), comentariosDoCartao: vi.fn(),
  comentar: vi.fn(), editarComentario: vi.fn(), apagarComentario: vi.fn(), anexosDoCartao: vi.fn(), enviarAnexo: vi.fn(),
  apagarAnexo: vi.fn(), urlAssinada: vi.fn(), enviarImagemDaDescricao: vi.fn(), urlsAssinadas: vi.fn(),
}))
vi.mock('@/data/quadros', () => ({
  QUADROS_ARQUIVADOS_POR_PAGINA: 15, quadrosParaEscolher: vi.fn(), quadrosPorIds: vi.fn(), quadrosArquivados: vi.fn(),
  timesParaNovoQuadro: vi.fn(), criarQuadro: vi.fn(), renomearQuadro: vi.fn(), arquivarQuadro: vi.fn(), restaurarQuadro: vi.fn(),
  marcarFavorito: vi.fn(), apagarQuadro: vi.fn(),
}))
vi.mock('@/data/quadroAoVivo', () => ({ ouvirQuadro: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

// A memória do último quadro só guarda uuids: a pessoa e os quadros dos testes têm ids de verdade.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ANA = { id: '0a000000-0000-4000-8000-00000000000a', nome: 'Ana Lima', foto: null, cor: null, papel: 'pessoa', consultoria_id: 's1' }
const PESSOAL_ID = id(1)
const DO_TIME_ID = id(2)
const FAVORITO_ID = id(3)
const SUMIDO_ID = id(9)
const DO_CLIENTE_ID = id(7)

const COLUNAS = [
  { id: 'col1', nome: 'A fazer', cor: null, concluidos: false, posicao: 1024, cartoes: 2, arquivados: 0 },
  { id: 'col2', nome: 'Feito', cor: null, concluidos: true, posicao: 2048, cartoes: 0, arquivados: 1 },
]
const PESSOAL = {
  id: PESSOAL_ID, cliente_id: null, tipo: 'pessoa', nome: 'Minhas tarefas', time: null, consultoria_id: 's1', criado_em: '2026-11-17T10:00:00Z',
  arquivado_em: null, favorito: false, pode_mexer: true, pode_gerir: true, pode_administrar: true, colunas: COLUNAS,
}
const DO_TIME = {
  ...PESSOAL, id: DO_TIME_ID, tipo: 'time', nome: 'Sprint', time: { id: 't1', nome: 'Comercial' }, pode_gerir: false, pode_administrar: false,
  colunas: [{ id: 'col7', nome: 'Ideias', cor: null, concluidos: false, posicao: 1024, cartoes: 0, arquivados: 0 }],
}
const FAVORITO = { ...PESSOAL, id: FAVORITO_ID, nome: 'Prioridades', favorito: true }
const DO_CLIENTE = { id: DO_CLIENTE_ID, cliente_id: 'k1', consultoria_id: 's1', pode_mexer: true, pode_gerir: false, colunas: COLUNAS }
const ARQUIVADO = { ...PESSOAL, arquivado_em: '2026-11-17T12:00:00Z', pode_mexer: false, pode_gerir: false }

let quadros
const cartao = (cid, colunaId, titulo) => ({
  id: cid, coluna_id: colunaId, titulo, resumo: null, prioridade: null, prazo: null, criado_por: ANA.id, criado_em: '2026-11-10T10:00:00Z',
  responsaveis: [], checklist: { total: 0, feitos: 0 }, comentarios: 0, anexos: 0,
})
const CARTOES = { col1: [cartao('c1', 'col1', 'Mapear boletos'), cartao('c2', 'col1', 'Revisar contratos')], col2: [], col7: [] }
const itemDaLista = (q) => ({ id: q.id, nome: q.nome, tipo: q.tipo, time: q.time, cartoes: 2, favorito: q.favorito })
const vazio = { itens: [], total: 0 }

let navegar
function Endereco() {
  const local = useLocation()
  const ir = useNavigate()
  useEffect(() => {
    navegar = ir
  }, [ir])
  return <output aria-label="Endereço">{local.pathname}</output>
}
const endereco = () => screen.getByRole('status', { name: 'Endereço' }).textContent

function montar(caminho, perfil = ANA) {
  simularGeometria()
  return render(
    <AuthContext.Provider value={{ perfil }}>
      <MemoryRouter initialEntries={[caminho]}>
        <Routes>
          <Route path="/quadros" element={<Quadros />} />
          <Route path="/quadros/:id" element={<Quadros />} />
          <Route path="*" element={null} />
        </Routes>
        <Endereco />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const coluna = (nome) => screen.findByRole('region', { name: `Coluna ${nome}` })
const abrirMenu = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Mais ações do quadro' }))
  return within(screen.getByRole('menu', { name: 'Mais ações do quadro' })).getAllByRole('menuitem').map((i) => i.textContent)
}

let avisar
let parar
beforeAll(prepararEditor)
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  quadros = { [PESSOAL_ID]: PESSOAL, [DO_TIME_ID]: DO_TIME, [FAVORITO_ID]: FAVORITO, [DO_CLIENTE_ID]: DO_CLIENTE }
  vi.mocked(quadroPorId).mockImplementation(async (qid) => quadros[qid] ?? null)
  vi.mocked(cartoesDoQuadro).mockImplementation(async ({ colunaId }) => ({ itens: CARTOES[colunaId] ?? [], total: (CARTOES[colunaId] ?? []).length }))
  vi.mocked(quadrosParaEscolher).mockResolvedValue({ favoritos: vazio, meus: { itens: [itemDaLista(PESSOAL)], total: 1 }, dosTimes: vazio })
  vi.mocked(quadrosPorIds).mockResolvedValue([])
  vi.mocked(quadrosArquivados).mockResolvedValue(vazio)
  vi.mocked(timesParaNovoQuadro).mockResolvedValue({ itens: [{ id: 't1', nome: 'Comercial' }], total: 1 })
  vi.mocked(criarQuadro).mockResolvedValue({ id: FAVORITO_ID, erro: null })
  for (const f of [renomearQuadro, arquivarQuadro, restaurarQuadro, marcarFavorito, apagarQuadro]) vi.mocked(f).mockResolvedValue({ erro: null })
  vi.mocked(buscarCartao).mockResolvedValue({
    id: 'c1', quadro_id: PESSOAL_ID, coluna_id: 'col1', titulo: 'Mapear boletos', descricao: null, prioridade: null, prazo: null,
    arquivado_em: null, criado_em: '2026-11-10T13:00:00Z', coluna: { id: 'col1', nome: 'A fazer', concluidos: false },
    criado_por: { id: ANA.id, nome: 'Ana Lima', foto: null, cor: null }, responsaveis: [], checklist: [], comentarios: 0, anexos: 0,
    pode_mexer: true, pode_apagar: true,
  })
  vi.mocked(comentariosDoCartao).mockResolvedValue({ itens: [], haMais: false })
  vi.mocked(anexosDoCartao).mockResolvedValue({ itens: [], total: 0 })
  vi.mocked(urlsAssinadas).mockResolvedValue({ urls: {} })
  avisar = null
  parar = vi.fn()
  vi.mocked(ouvirQuadro).mockImplementation((_qid, aoMudar) => {
    avisar = aoMudar
    return parar
  })
})

describe('Quadros: qual quadro abre', () => {
  it('abre no último quadro guardado quando o banco o devolve', async () => {
    lembrarQuadro(ANA.id, DO_TIME_ID)
    montar('/quadros')
    await waitFor(() => expect(endereco()).toBe(`/quadros/${DO_TIME_ID}`))
    expect(await coluna('Ideias')).toBeInTheDocument()
    expect(quadroPorId).toHaveBeenCalledWith(DO_TIME_ID)
    expect(quadrosParaEscolher).not.toHaveBeenCalled()
  })

  it('último sumido: abre o primeiro favorito, sem mensagem, e o tira da memória', async () => {
    lembrarQuadro(ANA.id, SUMIDO_ID)
    vi.mocked(quadrosParaEscolher).mockResolvedValue({
      favoritos: { itens: [itemDaLista(FAVORITO)], total: 1 }, meus: { itens: [itemDaLista(PESSOAL)], total: 1 }, dosTimes: vazio,
    })
    montar('/quadros')
    await waitFor(() => expect(endereco()).toBe(`/quadros/${FAVORITO_ID}`))
    expect(quadrosParaEscolher).toHaveBeenCalledWith({ limite: 1 })
    await coluna('A fazer')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/não existe|não tem acesso/)).not.toBeInTheDocument()
    await waitFor(() => expect(lerMemoria(ANA.id)).toEqual({ ultimo: FAVORITO_ID, recentes: [FAVORITO_ID] }))
  })

  it('o último arquivado também não abre: cai no primeiro de Dos times e sai da memória', async () => {
    quadros[PESSOAL_ID] = ARQUIVADO
    lembrarQuadro(ANA.id, PESSOAL_ID)
    vi.mocked(quadrosParaEscolher).mockResolvedValue({ favoritos: vazio, meus: vazio, dosTimes: { itens: [itemDaLista(DO_TIME)], total: 1 } })
    montar('/quadros')
    await waitFor(() => expect(endereco()).toBe(`/quadros/${DO_TIME_ID}`))
    await waitFor(() => expect(lerMemoria(ANA.id).recentes).toEqual([DO_TIME_ID]))
  })

  it('o último sendo de cliente também não abre: cai no primeiro de Meus e sai da memória', async () => {
    lembrarQuadro(ANA.id, DO_CLIENTE_ID)
    montar('/quadros')
    await waitFor(() => expect(endereco()).toBe(`/quadros/${PESSOAL_ID}`))
    expect(quadroPorId).toHaveBeenCalledWith(DO_CLIENTE_ID)
    expect(screen.queryByText(/de um cliente/)).not.toBeInTheDocument()
    await waitFor(() => expect(lerMemoria(ANA.id).recentes).toEqual([PESSOAL_ID]))
  })

  it('restaurar a partir do vazio abre o quadro restaurado', async () => {
    const user = userEvent.setup()
    vi.mocked(quadrosParaEscolher).mockResolvedValue({ favoritos: vazio, meus: vazio, dosTimes: vazio })
    vi.mocked(quadrosArquivados).mockResolvedValue({
      itens: [{ ...itemDaLista(PESSOAL), arquivado_em: '2026-11-17T12:00:00Z', pode_administrar: true }], total: 1,
    })
    montar('/quadros')
    await screen.findByText('Você ainda não tem quadros.')
    await user.click(screen.getByRole('button', { name: 'Quadros arquivados' }))
    const tabela = await screen.findByRole('table', { name: 'Quadros arquivados' })
    await user.click(within(tabela).getByRole('button', { name: 'Restaurar' }))
    expect(restaurarQuadro).toHaveBeenCalledWith(PESSOAL_ID)
    await waitFor(() => expect(endereco()).toBe(`/quadros/${PESSOAL_ID}`))
    expect(await coluna('A fazer')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Quadros arquivados' })).not.toBeInTheDocument()
  })

  it('sem quadros: ListaVazia com Novo quadro (que abre a janela)', async () => {
    const user = userEvent.setup()
    vi.mocked(quadrosParaEscolher).mockResolvedValue({ favoritos: vazio, meus: vazio, dosTimes: vazio })
    montar('/quadros')
    expect(await screen.findByText('Você ainda não tem quadros.')).toBeInTheDocument()
    expect(endereco()).toBe('/quadros')
    await user.click(screen.getByRole('button', { name: 'Novo quadro' }))
    expect(await screen.findByRole('dialog', { name: 'Novo quadro' })).toBeInTheDocument()
  })

  it('o banco não respondeu ao decidir: o erro aparece com Tentar de novo', async () => {
    const user = userEvent.setup()
    vi.mocked(quadrosParaEscolher).mockRejectedValueOnce(new Error('rede'))
    montar('/quadros')
    expect(await screen.findByText('Não foi possível carregar os quadros.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(endereco()).toBe(`/quadros/${PESSOAL_ID}`))
  })

  it('/quadros/:id sem acesso: mensagem e link para os meus quadros (e sai da memória)', async () => {
    const user = userEvent.setup()
    lembrarQuadro(ANA.id, SUMIDO_ID)
    montar(`/quadros/${SUMIDO_ID}`)
    expect(await screen.findByText('Este quadro não existe ou você não tem acesso a ele.')).toBeInTheDocument()
    expect(ouvirQuadro).not.toHaveBeenCalled()
    await waitFor(() => expect(lerMemoria(ANA.id).recentes).toEqual([]))
    await user.click(screen.getByRole('link', { name: 'Ir para os meus quadros' }))
    await waitFor(() => expect(endereco()).toBe(`/quadros/${PESSOAL_ID}`))
  })

  it('/quadros/<não é um id>: "não existe", sem ir ao banco (nada de erro com Tentar de novo)', async () => {
    montar('/quadros/abc')
    expect(await screen.findByText('Este quadro não existe ou você não tem acesso a ele.')).toBeInTheDocument()
    expect(quadroPorId).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para os meus quadros' })).toHaveAttribute('href', '/quadros')
  })

  it('quadro de cliente manda para o cliente: mensagem com o link da página do cliente', async () => {
    montar(`/quadros/${DO_CLIENTE_ID}`)
    expect(await screen.findByText('Este quadro é de um cliente: abra pela página do cliente.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir o cliente' })).toHaveAttribute('href', '/clientes/k1')
    expect(screen.queryByRole('region', { name: 'Coluna A fazer' })).not.toBeInTheDocument()
    expect(ouvirQuadro).not.toHaveBeenCalled()
    expect(lerMemoria(ANA.id).recentes).toEqual([])
  })
})

describe('Quadros: o quadro aberto', () => {
  it('cabeçalho com título, quem vê, seletor, estrela e ⋯ (e o quadro entra nos recentes)', async () => {
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    expect(screen.getByRole('heading', { level: 1, name: 'Quadros' })).toBeInTheDocument()
    expect(screen.getByText('Pessoal · só você vê')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /trocar de quadro/ })).toHaveTextContent('Minhas tarefas')
    expect(screen.getByRole('button', { name: 'Favorito' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Mais ações do quadro' })).toBeInTheDocument()
    expect(lerMemoria(ANA.id)).toEqual({ ultimo: PESSOAL_ID, recentes: [PESSOAL_ID] })
  })

  it('quadro do time: o subtítulo diz o time', async () => {
    montar(`/quadros/${DO_TIME_ID}`)
    await coluna('Ideias')
    expect(screen.getByText('Time Comercial · o time vê e mexe')).toBeInTheDocument()
  })

  it('barra começa com Filtros, sem seletor Consultoria, e não há cartões de números', async () => {
    const { container } = montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    const barra = screen.getByText('Filtros').closest('.card')
    expect(barra.firstElementChild).toHaveTextContent('Filtros')
    expect(within(barra).queryByText('Consultoria')).not.toBeInTheDocument()
    expect(within(barra).getByRole('button', { name: 'Novo cartão' })).toBeInTheDocument()
    expect(container.querySelector('[data-cartao]')).toBeNull()
    expect(screen.queryByRole('region', { name: /Indicadores/ })).not.toBeInTheDocument()
  })

  it('arquivado: só para ler e ⋯ com Restaurar (que restaura e relê)', async () => {
    const user = userEvent.setup()
    quadros[PESSOAL_ID] = ARQUIVADO
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    expect(screen.getByText('Quadro arquivado: só para ler.')).toBeInTheDocument()
    expect(screen.getByText('Arquivado · só para ler')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo cartão' })).not.toBeInTheDocument()
    expect(await abrirMenu(user)).toEqual(['Novo quadro', 'Quadros arquivados', 'Restaurar', 'Apagar'])
    // Arquivado não entra nos recentes.
    expect(lerMemoria(ANA.id).recentes).toEqual([])
    quadros[PESSOAL_ID] = PESSOAL
    const antes = vi.mocked(quadroPorId).mock.calls.length
    await user.click(screen.getByRole('menuitem', { name: 'Restaurar' }))
    expect(restaurarQuadro).toHaveBeenCalledWith(PESSOAL_ID)
    await waitFor(() => expect(vi.mocked(quadroPorId).mock.calls.length).toBeGreaterThan(antes))
    expect(toast.success).toHaveBeenCalledWith('Quadro Minhas tarefas restaurado.')
    await waitFor(() => expect(screen.queryByText('Quadro arquivado: só para ler.')).not.toBeInTheDocument())
  })

  it('restaurar com nome repetido: a mensagem de renomear um deles', async () => {
    const user = userEvent.setup()
    const mensagem = 'Já existe um quadro aberto com esse nome. Renomeie um deles e tente de novo.'
    vi.mocked(restaurarQuadro).mockResolvedValue({ erro: mensagem })
    quadros[PESSOAL_ID] = ARQUIVADO
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    await abrirMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Restaurar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensagem))
  })

  it('⋯ sem Renomear/Arquivar/Apagar para quem não administra', async () => {
    const user = userEvent.setup()
    montar(`/quadros/${DO_TIME_ID}`)
    await coluna('Ideias')
    expect(await abrirMenu(user)).toEqual(['Novo quadro', 'Quadros arquivados'])
  })

  it('aviso do canal com o quadro apagado → sem acesso, com o caminho de volta (e sai da memória)', async () => {
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    expect(ouvirQuadro).toHaveBeenCalledWith(PESSOAL_ID, expect.any(Function), { juntarMs: 300 })
    delete quadros[PESSOAL_ID]
    await act(async () => avisar({
      eventos: [{ tabela: 'quadros', operacao: 'delete', acesso: true }], tudo: true, acesso: true, tabelas: ['quadros'], colunas: [], cartoes: [],
    }))
    expect(await screen.findByText('Este quadro foi apagado ou você não tem mais acesso a ele.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Coluna A fazer' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para os meus quadros' })).toHaveAttribute('href', '/quadros')
    expect(parar).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Favorito' })).not.toBeInTheDocument()
    expect(lerMemoria(ANA.id).recentes).toEqual([])
  })

  it('a 360 px nada rola para o lado: o cabeçalho quebra linha, o seletor encolhe e as colunas rolam dentro da faixa', async () => {
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    const seletor = screen.getByRole('button', { name: /trocar de quadro/ })
    expect(seletor.className).toMatch(/max-sm:w-\[calc\(100vw-[\d.]+rem\)\]/)
    expect(seletor.querySelector('.truncate')).not.toBeNull()
    const cabecalho = screen.getByRole('heading', { level: 1, name: 'Quadros' }).closest('.flex-wrap')
    expect(cabecalho).not.toBeNull()
    expect(seletor.parentElement).toHaveClass('flex-wrap')
    expect(cabecalho.innerHTML).not.toMatch(/min-w-\[(?:[4-9]\d\d|\d{4,})px\]|w-\[(?:[4-9]\d\d|\d{4,})px\]/)
    expect(screen.getByRole('region', { name: 'Colunas do quadro' })).toHaveClass('overflow-x-auto')
  })

  it('trocar de quadro com a janela aberta não a reabre no outro', async () => {
    const user = userEvent.setup()
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    // Janela do cartão aberta no quadro pessoal…
    await user.click(screen.getByRole('button', { name: 'Cartão Mapear boletos' }))
    expect(await screen.findByRole('dialog', { name: 'Mapear boletos' })).toBeInTheDocument()
    // …e o endereço muda (voltar do navegador, link): o outro quadro abre do zero, sem a janela.
    await act(async () => navegar(`/quadros/${DO_TIME_ID}`))
    expect(await coluna('Ideias')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /trocar de quadro/ })).toHaveTextContent('Sprint')

    // O mesmo com a janela de novo cartão (que guardava a coluna do quadro anterior).
    await user.click(screen.getByRole('button', { name: 'Novo cartão' }))
    expect(await screen.findByRole('dialog', { name: 'Novo cartão' })).toBeInTheDocument()
    await act(async () => navegar(`/quadros/${PESSOAL_ID}`))
    expect(await coluna('A fazer')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Quadros: o CRUD do quadro no cabeçalho', () => {
  it('escolher no seletor abre o outro quadro', async () => {
    const user = userEvent.setup()
    vi.mocked(quadrosParaEscolher).mockResolvedValue({
      favoritos: vazio, meus: { itens: [itemDaLista(PESSOAL)], total: 1 }, dosTimes: { itens: [itemDaLista(DO_TIME)], total: 1 },
    })
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    await user.click(screen.getByRole('button', { name: /trocar de quadro/ }))
    const dosTimes = await screen.findByRole('group', { name: 'Dos times' })
    await user.click(within(dosTimes).getByRole('option', { name: /Sprint/ }))
    await waitFor(() => expect(endereco()).toBe(`/quadros/${DO_TIME_ID}`))
    expect(await coluna('Ideias')).toBeInTheDocument()
  })

  it('Novo quadro cria e abre o novo', async () => {
    const user = userEvent.setup()
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    await abrirMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Novo quadro' }))
    const janela = await screen.findByRole('dialog', { name: 'Novo quadro' })
    await user.type(within(janela).getByLabelText('Nome'), 'Prioridades')
    await user.click(within(janela).getByRole('button', { name: 'Criar quadro' }))
    expect(criarQuadro).toHaveBeenCalledWith({ nome: 'Prioridades', timeId: null })
    await waitFor(() => expect(endereco()).toBe(`/quadros/${FAVORITO_ID}`))
    expect(toast.success).toHaveBeenCalledWith('Quadro Prioridades criado.')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo quadro' })).not.toBeInTheDocument())
  })

  it('Renomear abre com o nome preenchido, salva e relê o quadro', async () => {
    const user = userEvent.setup()
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    await abrirMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }))
    const janela = await screen.findByRole('dialog', { name: 'Renomear quadro' })
    const nome = within(janela).getByLabelText('Nome')
    expect(nome).toHaveValue('Minhas tarefas')
    quadros[PESSOAL_ID] = { ...PESSOAL, nome: 'Tarefas da semana' }
    await user.clear(nome)
    await user.type(nome, 'Tarefas da semana')
    await user.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(renomearQuadro).toHaveBeenCalledWith(PESSOAL_ID, 'Tarefas da semana')
    await waitFor(() => expect(screen.getByRole('button', { name: /trocar de quadro/ })).toHaveTextContent('Tarefas da semana'))
    expect(screen.queryByRole('dialog', { name: 'Renomear quadro' })).not.toBeInTheDocument()
  })

  it('Arquivar pede confirmação e o quadro fica só para ler', async () => {
    const user = userEvent.setup()
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    await abrirMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Arquivar' }))
    const confirmar = await screen.findByRole('alertdialog', { name: 'Arquivar o quadro Minhas tarefas?' })
    expect(within(confirmar).getByText('O quadro sai da lista e fica em Quadros arquivados, só para ler. Dá para restaurar.')).toBeInTheDocument()
    quadros[PESSOAL_ID] = ARQUIVADO
    await user.click(within(confirmar).getByRole('button', { name: 'Arquivar quadro' }))
    expect(arquivarQuadro).toHaveBeenCalledWith(PESSOAL_ID)
    expect(await screen.findByText('Quadro arquivado: só para ler.')).toBeInTheDocument()
  })

  it('Apagar mostra o que some junto, apaga, volta para /quadros e tira o quadro da memória', async () => {
    const user = userEvent.setup()
    lembrarQuadro(ANA.id, PESSOAL_ID)
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    await abrirMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Apagar' }))
    const janela = await screen.findByRole('dialog', { name: 'Apagar o quadro Minhas tarefas?' })
    expect(await within(janela).findByText(/2 colunas e 3 cartões/)).toBeInTheDocument()
    expect(within(janela).getByRole('button', { name: 'Arquivar' })).toBeInTheDocument()
    vi.mocked(quadrosParaEscolher).mockResolvedValue({ favoritos: vazio, meus: { itens: [itemDaLista(FAVORITO)], total: 1 }, dosTimes: vazio })
    await user.click(within(janela).getByRole('button', { name: 'Apagar quadro' }))
    expect(apagarQuadro).toHaveBeenCalledWith(PESSOAL_ID)
    await waitFor(() => expect(endereco()).toBe(`/quadros/${FAVORITO_ID}`))
    expect(lerMemoria(ANA.id).recentes).not.toContain(PESSOAL_ID)
  })

  it('a estrela marca o favorito e relê só o quadro (os cartões das colunas ficam)', async () => {
    const user = userEvent.setup()
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    await screen.findByRole('button', { name: 'Cartão Mapear boletos' })
    quadros[PESSOAL_ID] = { ...PESSOAL, favorito: true }
    const leiturasDoQuadro = vi.mocked(quadroPorId).mock.calls.length
    const leiturasDeCartoes = vi.mocked(cartoesDoQuadro).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Favorito' }))
    expect(marcarFavorito).toHaveBeenCalledWith(PESSOAL_ID, true)
    await waitFor(() => expect(vi.mocked(quadroPorId).mock.calls.length).toBeGreaterThan(leiturasDoQuadro))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Favorito' })).toHaveAttribute('aria-pressed', 'true'))
    expect(vi.mocked(cartoesDoQuadro).mock.calls.length).toBe(leiturasDeCartoes)
  })

  it('voltar (navegador) ao quadro em que uma janela do cabeçalho estava aberta não a reabre', async () => {
    const user = userEvent.setup()
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    await abrirMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }))
    expect(await screen.findByRole('dialog', { name: 'Renomear quadro' })).toBeInTheDocument()
    await act(async () => navegar(`/quadros/${DO_TIME_ID}`))
    await coluna('Ideias')
    expect(screen.queryByRole('dialog', { name: 'Renomear quadro' })).not.toBeInTheDocument()
    await act(async () => navegar(-1))
    await waitFor(() => expect(endereco()).toBe(`/quadros/${PESSOAL_ID}`))
    await coluna('A fazer')
    expect(screen.queryByRole('dialog', { name: 'Renomear quadro' })).not.toBeInTheDocument()
  })

  it('nome que já começa com "Quadro": os avisos não repetem a palavra', async () => {
    const user = userEvent.setup()
    quadros[PESSOAL_ID] = { ...PESSOAL, nome: 'Quadro de metas' }
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    await abrirMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Arquivar' }))
    const confirmar = await screen.findByRole('alertdialog', { name: 'Arquivar o Quadro de metas?' })
    await user.click(within(confirmar).getByRole('button', { name: 'Arquivar quadro' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Quadro de metas arquivado.'))
  })

  it('Quadros arquivados → Abrir abre o arquivado, só para ler', async () => {
    const user = userEvent.setup()
    quadros[FAVORITO_ID] = { ...FAVORITO, arquivado_em: '2026-11-17T12:00:00Z', pode_mexer: false }
    vi.mocked(quadrosArquivados).mockResolvedValue({
      itens: [{ ...itemDaLista(FAVORITO), arquivado_em: '2026-11-17T12:00:00Z', pode_administrar: true }], total: 1,
    })
    montar(`/quadros/${PESSOAL_ID}`)
    await coluna('A fazer')
    await abrirMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Quadros arquivados' }))
    const tabela = await screen.findByRole('table', { name: 'Quadros arquivados' })
    await user.click(within(tabela).getByRole('button', { name: 'Abrir' }))
    await waitFor(() => expect(endereco()).toBe(`/quadros/${FAVORITO_ID}`))
    expect(await screen.findByText('Quadro arquivado: só para ler.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Quadros arquivados' })).not.toBeInTheDocument()
  })
})
