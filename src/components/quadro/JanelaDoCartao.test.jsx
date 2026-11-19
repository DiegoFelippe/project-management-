import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adicionarResponsavel, anexosDoCartao, apagarCartao, arquivarCartao, buscarCartao, comentariosDoCartao, editarCartao,
  enviarImagemDaDescricao, moverCartao, pessoasDoQuadro, tirarResponsavel, urlsAssinadas,
} from '@/data/quadro'
import { somarDias } from '@/lib/calendario'
import { hoje } from '@/lib/mes'
import { colar, prepararEditor } from '@/test/editor'
import { renderizarTela } from '@/test/renderizar'
import JanelaDoCartao, { ESPERA_AO_FECHAR } from './JanelaDoCartao'

vi.mock('@/data/quadro', () => ({
  COMENTARIOS_POR_VEZ: 30, ANEXOS_POR_PAGINA: 15,
  buscarCartao: vi.fn(), editarCartao: vi.fn(), moverCartao: vi.fn(), arquivarCartao: vi.fn(), apagarCartao: vi.fn(),
  adicionarResponsavel: vi.fn(), tirarResponsavel: vi.fn(), pessoasDoQuadro: vi.fn(),
  criarItemDoChecklist: vi.fn(), editarItemDoChecklist: vi.fn(), apagarItemDoChecklist: vi.fn(),
  comentariosDoCartao: vi.fn(), comentar: vi.fn(), editarComentario: vi.fn(), apagarComentario: vi.fn(),
  anexosDoCartao: vi.fn(), enviarAnexo: vi.fn(), apagarAnexo: vi.fn(), urlAssinada: vi.fn(),
  enviarImagemDaDescricao: vi.fn(), urlsAssinadas: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const ana = { id: 'p1', nome: 'Ana Lima', foto: null, cor: null, papel: 'pessoa', consultoria_id: 's1' }
const central = { id: 'c0', nome: 'Cora Central', papel: 'central', consultoria_id: null }
const COLUNAS = [
  { id: 'col1', nome: 'A fazer', cor: null, concluidos: false },
  { id: 'col2', nome: 'Em andamento', cor: null, concluidos: false },
  { id: 'col3', nome: 'Concluído', cor: null, concluidos: true },
]
const QUADRO = { id: 'q1', cliente_id: 'k1', consultoria_id: 's1', pode_mexer: true, pode_gerir: false, colunas: COLUNAS }
const NOSSA = 'k1/c1/imagens/0b6f3f5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png'
const SEM_PERMISSAO = 'Você não tem permissão para isso.'
const pessoa = (id, nome) => ({ id, nome, foto: null, cor: null })

const CARTAO = {
  id: 'c1', quadro_id: 'q1', coluna_id: 'col1', titulo: 'Mapear boletos', prioridade: 'alta', prazo: '2026-11-20', posicao: 1024,
  descricao: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Levantar os boletos em aberto' }] }] },
  arquivado_em: null, criado_em: '2026-11-10T13:00:00Z', atualizado_em: '2026-11-10T13:00:00Z',
  coluna: { id: 'col1', nome: 'A fazer', concluidos: false }, criado_por: pessoa('p1', 'Ana Lima'),
  responsaveis: [pessoa('p1', 'Ana Lima')],
  checklist: [{ id: 'i1', texto: 'Separar por mês', feito: true, posicao: 1024 }, { id: 'i2', texto: 'Somar', feito: false, posicao: 2048 }],
  comentarios: 1, anexos: 1, pode_mexer: true, pode_apagar: true,
}

beforeAll(prepararEditor)
beforeEach(() => {
  // reset (não só clear): respostas "uma vez" que sobraram de um teste não passam para o próximo.
  vi.resetAllMocks()
  vi.mocked(buscarCartao).mockResolvedValue(CARTAO)
  vi.mocked(editarCartao).mockResolvedValue({ erro: null })
  vi.mocked(moverCartao).mockResolvedValue({ erro: null, cartao: { id: 'c1', coluna_id: 'col2' }, renumerou: false })
  vi.mocked(arquivarCartao).mockResolvedValue({ erro: null })
  vi.mocked(apagarCartao).mockResolvedValue({ erro: null })
  vi.mocked(adicionarResponsavel).mockResolvedValue({ erro: null })
  vi.mocked(tirarResponsavel).mockResolvedValue({ erro: null })
  vi.mocked(pessoasDoQuadro).mockResolvedValue({ itens: [pessoa('p1', 'Ana Lima'), pessoa('g1', 'Gabi Souza')], total: 2 })
  vi.mocked(comentariosDoCartao).mockResolvedValue({
    itens: [{ id: 'm1', texto: 'Boletos levantados', criado_em: '2026-11-11T13:00:00Z', editado_em: null, autor: pessoa('p1', 'Ana Lima') }],
    haMais: false,
  })
  vi.mocked(anexosDoCartao).mockResolvedValue({
    itens: [{ id: 'a1', nome: 'contrato.pdf', tamanho: 2048, tipo: 'application/pdf', caminho: 'k1/c1/a1-contrato.pdf', enviado_em: '2026-11-11T13:00:00Z', enviado_por: pessoa('p1', 'Ana Lima'), pode_apagar: true }],
    total: 1,
  })
  vi.mocked(urlsAssinadas).mockImplementation(async (caminhos) => ({ urls: Object.fromEntries(caminhos.map((c) => [c, `https://assinado.local/${c}`])) }))
})

function abrir({ perfil = ana, quadro = QUADRO, motivoSomenteLeitura = null } = {}) {
  const aoFechar = vi.fn()
  const aoQuadroMudou = vi.fn()
  renderizarTela(<JanelaDoCartao cartaoId="c1" quadro={quadro} perfil={perfil} motivoSomenteLeitura={motivoSomenteLeitura} aoFechar={aoFechar} aoQuadroMudou={aoQuadroMudou} />, { perfil })
  return { aoFechar, aoQuadroMudou }
}

const janela = () => screen.findByRole('dialog', { name: 'Mapear boletos' })
const lateral = () => within(screen.getByRole('complementary', { name: 'Detalhes do cartão' }))

async function escolher(user, rotulo, opcao) {
  await user.click(lateral().getByLabelText(rotulo))
  await waitFor(() => expect(screen.getAllByRole('option').some((o) => o.querySelector('span > span')?.textContent === opcao)).toBe(true))
  await user.click(screen.getAllByRole('option').find((o) => o.querySelector('span > span')?.textContent === opcao))
}

describe('janela do cartão: abrir', () => {
  it('abre preenchida: título, coluna e quem criou, descrição, checklist, lateral, comentários e anexos', async () => {
    abrir()
    const j = await janela()
    expect(buscarCartao).toHaveBeenCalledWith('c1')
    expect(j).toHaveAccessibleDescription('A fazer · criado em 10/11/2026 às 10:00 por Ana Lima')
    expect(within(j).getByLabelText('Título')).toHaveValue('Mapear boletos')
    expect(within(j).getByRole('textbox', { name: 'Descrição do cartão' })).toHaveTextContent('Levantar os boletos em aberto')
    expect(within(j).getByRole('checkbox', { name: 'Separar por mês' })).toBeChecked()
    expect(within(j).getByText('1/2')).toBeInTheDocument()
    expect(lateral().getByLabelText('Coluna')).toHaveTextContent('A fazer')
    expect(lateral().getByLabelText('Prioridade')).toHaveTextContent('Alta')
    expect(lateral().getByLabelText('Prazo')).toHaveTextContent('20 de nov de 2026')
    expect(lateral().getByRole('list', { name: 'Responsáveis do cartão' })).toHaveTextContent('Ana Lima')
    expect(await within(j).findByText('Boletos levantados')).toBeInTheDocument()
    expect(await within(j).findByRole('table', { name: 'Anexos do cartão' })).toHaveTextContent('contrato.pdf')
    expect(within(j).getByRole('button', { name: 'Arquivar' })).toBeInTheDocument()
    expect(within(j).getByRole('button', { name: 'Apagar' })).toBeInTheDocument()
    // No celular (360 px) só o ícone aparece; o nome acessível fica.
    expect(within(within(j).getByRole('button', { name: 'Arquivar' })).getByText('Arquivar')).toHaveClass('max-sm:sr-only')
    expect(within(within(j).getByRole('button', { name: 'Apagar' })).getByText('Apagar')).toHaveClass('max-sm:sr-only')
  })

  it('cartão que já não existe (ou que a pessoa não vê mais) ao abrir: avisa, fecha e relê o quadro', async () => {
    vi.mocked(buscarCartao).mockResolvedValue(null)
    const { aoFechar, aoQuadroMudou } = abrir()
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
    expect(toast.warning).toHaveBeenCalledWith('Este cartão não está mais no quadro (ou você não o vê mais).')
    expect(aoQuadroMudou).toHaveBeenCalled()
  })

  it('erro de rede ao abrir: o aviso e Tentar de novo', async () => {
    vi.mocked(buscarCartao).mockRejectedValueOnce(new Error('rede'))
    const user = userEvent.setup()
    abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir o cartão.')
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await janela()).toBeInTheDocument()
  })
})

describe('janela do cartão: grava campo a campo', () => {
  it('título grava sozinho ao sair do campo, mostrando "Salvando…" e depois "Salvo"', async () => {
    let responder
    vi.mocked(editarCartao).mockReturnValue(new Promise((r) => { responder = r }))
    const user = userEvent.setup()
    abrir()
    const j = await janela()
    const titulo = within(j).getByLabelText('Título')
    await user.clear(titulo)
    await user.type(titulo, 'Mapear boletos de outubro')
    await user.tab()
    expect(editarCartao).toHaveBeenCalledWith('c1', { titulo: 'Mapear boletos de outubro' })
    expect(within(j).getByText('Salvando…')).toBeInTheDocument()
    await act(async () => responder({ erro: null }))
    expect(within(j).getByText('Salvo')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Mapear boletos de outubro' })).toBeInTheDocument()
  })

  it('título vazio não grava: volta ao que estava; sem mudança, nada vai ao banco', async () => {
    const user = userEvent.setup()
    abrir()
    const j = await janela()
    const titulo = within(j).getByLabelText('Título')
    await user.click(titulo)
    await user.tab()
    await user.clear(titulo)
    await user.tab()
    expect(titulo).toHaveValue('Mapear boletos')
    expect(editarCartao).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Dê um título ao cartão.')
  })

  it('prioridade, prazo (atalho Amanhã) e coluna gravam cada um sozinho', async () => {
    const user = userEvent.setup()
    abrir()
    await janela()
    await escolher(user, 'Prioridade', 'Baixa')
    expect(editarCartao).toHaveBeenLastCalledWith('c1', { prioridade: 'baixa' })
    await waitFor(() => expect(lateral().getByText('Salvo')).toBeInTheDocument())

    await user.click(lateral().getByLabelText('Prazo'))
    await user.click(screen.getByRole('button', { name: 'Amanhã' }))
    expect(editarCartao).toHaveBeenLastCalledWith('c1', { prazo: somarDias(hoje(), 1) })

    await user.click(lateral().getByLabelText('Prazo'))
    await user.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(editarCartao).toHaveBeenLastCalledWith('c1', { prazo: '' })

    await escolher(user, 'Coluna', 'Em andamento')
    expect(moverCartao).toHaveBeenCalledWith({ cartaoId: 'c1', colunaId: 'col2' })
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAccessibleDescription(/^Em andamento · criado em/))
  })

  it('responsáveis: incluir pela busca (só quem atende o cliente) e tirar', async () => {
    const user = userEvent.setup()
    abrir()
    await janela()
    await escolher(user, 'Responsáveis', 'Gabi Souza')
    // O quadro vai junto: o texto da recusa depende do tipo dele (do cliente, pessoal ou do time).
    expect(adicionarResponsavel).toHaveBeenCalledWith('c1', 'g1', { quadro: QUADRO })
    expect(pessoasDoQuadro).toHaveBeenCalledWith(expect.objectContaining({ quadroId: 'q1' }))
    await waitFor(() => expect(lateral().getByRole('list', { name: 'Responsáveis do cartão' })).toHaveTextContent('Gabi Souza'))
    await user.click(lateral().getByRole('button', { name: 'Tirar Ana Lima' }))
    expect(tirarResponsavel).toHaveBeenCalledWith('c1', 'p1')
    await waitFor(() => expect(lateral().getByRole('list', { name: 'Responsáveis do cartão' })).not.toHaveTextContent('Ana Lima'))
  })

  it('descrição: grava 900 ms depois que a pessoa para (uma vez só), com o JSON do editor, e mostra "Salvo"', async () => {
    abrir()
    const j = await janela()
    const editor = within(j).getByRole('textbox', { name: 'Descrição do cartão' })
    colar(editor, { html: '<p><b>Urgente</b></p>' })
    colar(editor, { html: '<p>e mais isto</p>' })
    await new Promise((r) => setTimeout(r, 500))
    expect(editarCartao).not.toHaveBeenCalled()
    await waitFor(() => expect(editarCartao).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const [id, { descricao }] = vi.mocked(editarCartao).mock.calls[0]
    expect(id).toBe('c1')
    expect(descricao.type).toBe('doc')
    expect(JSON.stringify(descricao)).toContain('Urgente')
    expect(JSON.stringify(descricao)).toContain('e mais isto')
    expect(await within(j).findByText('Salvo')).toBeInTheDocument()
  })

  it('imagem da descrição sobe para a pasta deste cartão (cliente e cartão certos)', async () => {
    vi.mocked(enviarImagemDaDescricao).mockResolvedValue({ erro: null, caminho: NOSSA })
    const user = userEvent.setup()
    abrir()
    const j = await janela()
    const foto = new File(['png'], 'foto.png', { type: 'image/png' })
    await user.upload(within(j).getByLabelText('Escolher imagem'), foto)
    expect(enviarImagemDaDescricao).toHaveBeenCalledWith({ pasta: 'k1', cartaoId: 'c1' }, foto)
    await waitFor(() => expect(within(j).getByRole('img', { name: 'Imagem da descrição' })).toHaveAttribute('src', `https://assinado.local/${NOSSA}`))
  })

  it('fechar com a descrição ainda esperando grava antes e devolve as colunas mexidas (o quadro relê)', async () => {
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    colar(within(j).getByRole('textbox', { name: 'Descrição do cartão' }), { html: '<p>Nova descrição</p>' })
    await user.click(within(j).getAllByRole('button', { name: 'Fechar' })[0])
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith(['col1']))
    expect(editarCartao).toHaveBeenCalledWith('c1', { descricao: expect.objectContaining({ type: 'doc' }) })
  })

  it('fechar com a descrição recusada: a janela fica aberta e pergunta o que fazer; "Fechar sem salvar" descarta e fecha', async () => {
    vi.mocked(editarCartao).mockResolvedValue({ erro: 'A descrição tem uma formatação que o quadro não aceita. Cole o texto de novo, sem a formatação.' })
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    colar(within(j).getByRole('textbox', { name: 'Descrição do cartão' }), { html: '<p>Nova descrição</p>' })
    await user.click(within(j).getAllByRole('button', { name: 'Fechar' }).at(-1))
    const pergunta = await screen.findByRole('alertdialog', { name: 'Algumas mudanças não foram salvas' })
    expect(pergunta).toHaveTextContent('Não foi possível salvar a descrição.')
    expect(within(j).getByText('Erro ao salvar')).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
    await user.click(within(pergunta).getByRole('button', { name: 'Continuar editando' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(within(j).getByRole('textbox', { name: 'Descrição do cartão' })).toHaveTextContent('Nova descrição')
    expect(aoFechar).not.toHaveBeenCalled()

    await user.click(within(j).getAllByRole('button', { name: 'Fechar' }).at(-1))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Fechar sem salvar' }))
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
  })

  it('a descrição que falhou ao gravar (depois dos 900 ms) volta a esperar: Fechar tenta de novo e, gravando, fecha', async () => {
    vi.mocked(editarCartao).mockResolvedValueOnce({ erro: 'Não foi possível concluir. Tente de novo.' }).mockResolvedValue({ erro: null })
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    colar(within(j).getByRole('textbox', { name: 'Descrição do cartão' }), { html: '<p>Texto importante</p>' })
    expect(await within(j).findByText('Erro ao salvar', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(editarCartao).toHaveBeenCalledTimes(1)
    await user.click(within(j).getAllByRole('button', { name: 'Fechar' }).at(-1))
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith(['col1']))
    expect(editarCartao).toHaveBeenCalledTimes(2)
    expect(vi.mocked(editarCartao).mock.calls[1]).toEqual(vi.mocked(editarCartao).mock.calls[0])
    expect(JSON.stringify(vi.mocked(editarCartao).mock.calls[1][1])).toContain('Texto importante')
  })

  it('falhou de novo ao fechar: pergunta; "Tentar de novo" grava e fecha', async () => {
    vi.mocked(editarCartao)
      .mockResolvedValueOnce({ erro: 'Não foi possível concluir. Tente de novo.' })
      .mockResolvedValueOnce({ erro: 'Não foi possível concluir. Tente de novo.' })
      .mockResolvedValue({ erro: null })
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    colar(within(j).getByRole('textbox', { name: 'Descrição do cartão' }), { html: '<p>Texto importante</p>' })
    await within(j).findByText('Erro ao salvar', {}, { timeout: 2000 })
    await user.click(within(j).getAllByRole('button', { name: 'Fechar' }).at(-1))
    const pergunta = await screen.findByRole('alertdialog', { name: 'Algumas mudanças não foram salvas' })
    expect(aoFechar).not.toHaveBeenCalled()
    await user.click(within(pergunta).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith(['col1']))
    expect(editarCartao).toHaveBeenCalledTimes(3)
  })

  it('título com erro de rede: o cabeçalho não mostra o título que não gravou, o campo guarda o texto e Fechar tenta de novo', async () => {
    vi.mocked(editarCartao).mockResolvedValueOnce({ erro: 'Não foi possível concluir. Tente de novo.' }).mockResolvedValue({ erro: null })
    vi.mocked(buscarCartao).mockResolvedValueOnce(CARTAO).mockRejectedValue(new Error('rede'))
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    const titulo = within(j).getByLabelText('Título')
    await user.clear(titulo)
    await user.type(titulo, 'Mapear boletos de outubro')
    await user.tab()
    expect(await within(j).findByText('Erro ao salvar')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Mapear boletos' })).toBeInTheDocument()
    expect(titulo).toHaveValue('Mapear boletos de outubro')
    await user.click(within(j).getAllByRole('button', { name: 'Fechar' }).at(-1))
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith(['col1']))
    expect(editarCartao).toHaveBeenCalledTimes(2)
    expect(editarCartao).toHaveBeenLastCalledWith('c1', { titulo: 'Mapear boletos de outubro' })
  })

  it('outro campo que falhou (prioridade): Fechar pergunta, dizendo qual; "Tentar de novo" refaz a mudança', async () => {
    vi.mocked(editarCartao).mockResolvedValueOnce({ erro: 'Não foi possível concluir. Tente de novo.' }).mockResolvedValue({ erro: null })
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    await escolher(user, 'Prioridade', 'Baixa')
    await waitFor(() => expect(lateral().getByText('Erro ao salvar')).toBeInTheDocument())
    await user.click(within(j).getAllByRole('button', { name: 'Fechar' }).at(-1))
    const pergunta = await screen.findByRole('alertdialog', { name: 'Algumas mudanças não foram salvas' })
    expect(pergunta).toHaveTextContent('Não foi possível salvar a prioridade.')
    expect(editarCartao).toHaveBeenCalledTimes(1)
    await user.click(within(pergunta).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith(['col1']))
    expect(editarCartao).toHaveBeenLastCalledWith('c1', { prioridade: 'baixa' })
  })

  it('arquivo solto fora da área de anexos não abre no lugar do app (nada se perde); arrastar texto segue normal', async () => {
    abrir()
    await janela()
    const arquivo = { files: [new File(['a'], 'a.pdf')], types: ['Files'] }
    expect(fireEvent.dragOver(document.body, { dataTransfer: arquivo })).toBe(false)
    expect(fireEvent.drop(document.body, { dataTransfer: arquivo })).toBe(false)
    expect(fireEvent.dragOver(document.body, { dataTransfer: { files: [], types: ['text/plain'] } })).toBe(true)
  })

  it('fechar não fica preso se o banco não responde: espera um tempo e fecha', async () => {
    vi.mocked(editarCartao).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    await escolher(user, 'Prioridade', 'Baixa')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await user.click(within(j).getAllByRole('button', { name: 'Fechar' }).at(-1))
      expect(within(j).getByRole('button', { name: 'Salvando…' })).toBeDisabled()
      expect(aoFechar).not.toHaveBeenCalled()
      await act(async () => vi.advanceTimersByTimeAsync(ESPERA_AO_FECHAR))
      expect(aoFechar).toHaveBeenCalledWith([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('fechar sem mudar nada não pede releitura', async () => {
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    await user.click(within(j).getAllByRole('button', { name: 'Fechar' })[0])
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith([]))
  })

  it('mudou de coluna: as duas colunas são relidas ao fechar', async () => {
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    await escolher(user, 'Coluna', 'Concluído')
    await waitFor(() => expect(within(j).getAllByText('Salvo').length).toBeGreaterThan(0))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
    expect(aoFechar.mock.calls[0][0].sort()).toEqual(['col1', 'col3'])
  })
})

describe('janela do cartão: recusas do banco', () => {
  it('erro ao salvar: "Erro ao salvar", o motivo e o cartão relido (escolhas voltam ao gravado; o texto digitado fica)', async () => {
    vi.mocked(editarCartao).mockResolvedValue({ erro: 'Confira os campos destacados.' })
    const user = userEvent.setup()
    const { aoQuadroMudou } = abrir()
    const j = await janela()
    const titulo = within(j).getByLabelText('Título')
    await user.clear(titulo)
    await user.type(titulo, 'x'.repeat(10))
    await user.tab()
    expect(await within(j).findByText('Erro ao salvar')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('Confira os campos destacados.')
    await waitFor(() => expect(buscarCartao).toHaveBeenCalledTimes(2))
    expect(aoQuadroMudou).toHaveBeenCalled()
    // O cabeçalho mostra o que está gravado; o texto que não gravou continua no campo (Fechar tenta de novo ou pergunta).
    expect(screen.getByRole('dialog', { name: 'Mapear boletos' })).toBeInTheDocument()
    expect(titulo).toHaveValue('x'.repeat(10))
    await escolher(user, 'Prioridade', 'Baixa')
    await waitFor(() => expect(buscarCartao).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(lateral().getByLabelText('Prioridade')).toHaveTextContent('Alta'))
  })

  it('sem permissão no meio (42501): a janela passa a só leitura e o quadro é relido', async () => {
    vi.mocked(editarCartao).mockResolvedValue({ erro: SEM_PERMISSAO })
    vi.mocked(buscarCartao).mockResolvedValueOnce(CARTAO).mockResolvedValue({ ...CARTAO, pode_mexer: false, pode_apagar: false })
    const user = userEvent.setup()
    const { aoQuadroMudou, aoFechar } = abrir()
    const j = await janela()
    await escolher(user, 'Prioridade', 'Média')
    await waitFor(() => expect(within(j).getByText('Você vê este cartão só para ler.')).toBeInTheDocument())
    expect(within(j).queryByLabelText('Título')).not.toBeInTheDocument()
    expect(within(j).queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(SEM_PERMISSAO)
    expect(aoQuadroMudou).toHaveBeenCalled()
    expect(aoFechar).not.toHaveBeenCalled()
  })

  it('cartão (ou coluna) que sumiu no meio: avisa, fecha e relê o quadro', async () => {
    vi.mocked(moverCartao).mockResolvedValue({ erro: 'Essa coluna não está mais no quadro. Atualize o quadro e tente de novo.' })
    vi.mocked(buscarCartao).mockResolvedValueOnce(CARTAO).mockResolvedValue(null)
    const user = userEvent.setup()
    const { aoQuadroMudou, aoFechar } = abrir()
    await janela()
    await escolher(user, 'Coluna', 'Em andamento')
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
    expect(toast.warning).toHaveBeenCalledWith('Este cartão não está mais no quadro (ou você não o vê mais).')
    expect(aoQuadroMudou).toHaveBeenCalled()
  })
})

describe('janela do cartão: arquivar e apagar', () => {
  it('arquivar pede confirmação (dá para restaurar) e fecha relendo a coluna', async () => {
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    await user.click(within(j).getByRole('button', { name: 'Arquivar' }))
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent('Arquivar o cartão Mapear boletos?')
    expect(confirmar).toHaveTextContent(/Arquivados/)
    await user.click(within(confirmar).getByRole('button', { name: 'Arquivar cartão' }))
    expect(arquivarCartao).toHaveBeenCalledWith('c1')
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith(['col1']))
    expect(toast.success).toHaveBeenCalledWith('Cartão arquivado.')
  })

  it('apagar pede confirmação dizendo que checklist, comentários e anexos somem junto', async () => {
    const user = userEvent.setup()
    const { aoFechar } = abrir()
    const j = await janela()
    await user.click(within(j).getByRole('button', { name: 'Apagar' }))
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent('Apagar o cartão Mapear boletos?')
    await waitFor(() => expect(confirmar).toHaveTextContent('o checklist (2 itens), os comentários (1) e os anexos (1) somem junto'))
    expect(confirmar).toHaveTextContent(/Arquivar/)
    expect(apagarCartao).not.toHaveBeenCalled()
    await user.click(within(confirmar).getByRole('button', { name: 'Apagar cartão' }))
    expect(apagarCartao).toHaveBeenCalledWith('c1')
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith(['col1']))
    expect(toast.success).toHaveBeenCalledWith('Cartão apagado.')
  })

  it('apagado, mas um arquivo ficou no armazenamento: o aviso', async () => {
    vi.mocked(apagarCartao).mockResolvedValue({ erro: null, aviso: 'Alguns anexos ou imagens não saíram do armazenamento. Avise o suporte.' })
    const user = userEvent.setup()
    abrir()
    const j = await janela()
    await user.click(within(j).getByRole('button', { name: 'Apagar' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar cartão' }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Alguns anexos ou imagens não saíram do armazenamento. Avise o suporte.'))
  })

  it('quem não criou o cartão (e não é da gestão) não vê Apagar', async () => {
    vi.mocked(buscarCartao).mockResolvedValue({ ...CARTAO, pode_apagar: false })
    abrir()
    const j = await janela()
    expect(within(j).getByRole('button', { name: 'Arquivar' })).toBeInTheDocument()
    expect(within(j).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })
})

describe('janela do cartão: só leitura', () => {
  it('central (ou dono): lê tudo, sem campos, sem gravar, sem Arquivar nem Apagar', async () => {
    vi.mocked(buscarCartao).mockResolvedValue({ ...CARTAO, pode_mexer: false, pode_apagar: false })
    abrir({ perfil: central, quadro: { ...QUADRO, pode_mexer: false } })
    const j = await janela()
    expect(within(j).getByText('Você vê este cartão só para ler.')).toBeInTheDocument()
    expect(within(j).queryByLabelText('Título')).not.toBeInTheDocument()
    expect(within(j).getByRole('textbox', { name: 'Descrição do cartão' })).toHaveAttribute('contenteditable', 'false')
    expect(within(j).queryByRole('toolbar')).not.toBeInTheDocument()
    expect(within(j).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(j).queryByRole('combobox')).not.toBeInTheDocument()
    expect(lateral().getByText('Alta')).toBeInTheDocument()
    expect(lateral().getByText('A fazer')).toBeInTheDocument()
    expect(within(j).queryByRole('button', { name: /Arquivar|Apagar|Comentar|Adicionar item|Escolher arquivo/ })).not.toBeInTheDocument()
    expect(within(j).queryByRole('button', { name: /^Tirar / })).not.toBeInTheDocument()
    expect(await within(j).findByRole('button', { name: 'Baixar contrato.pdf' })).toBeInTheDocument()
  })

  it('motivoSomenteLeitura: o aviso diz por quê (o texto que o QuadroDoCliente passa com o cliente arquivado)', async () => {
    vi.mocked(buscarCartao).mockResolvedValue({ ...CARTAO, pode_mexer: false, pode_apagar: false })
    abrir({ motivoSomenteLeitura: 'Cliente arquivado: o quadro é só para ler.' })
    const j = await janela()
    expect(within(j).getByText('Cliente arquivado: o quadro é só para ler.')).toBeInTheDocument()
  })
})
