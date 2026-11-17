import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apagarComentario, comentar, comentariosDoCartao, editarComentario } from '@/data/quadro'
import ComentariosDoCartao from './ComentariosDoCartao'

vi.mock('@/data/quadro', () => ({
  COMENTARIOS_POR_VEZ: 30, comentariosDoCartao: vi.fn(), comentar: vi.fn(), editarComentario: vi.fn(), apagarComentario: vi.fn(),
}))

const ana = { id: 'p1', nome: 'Ana Lima', foto: null, cor: null, papel: 'pessoa', consultoria_id: 's1' }
const gabi = { id: 'g1', nome: 'Gabi Souza', foto: null, cor: null, papel: 'gestor', consultoria_id: 's1' }
const autor = ({ id, nome }) => ({ id, nome, foto: null, cor: null })
const comentario = (id, texto, quem, extras = {}) => ({
  id, texto, criado_em: '2026-11-10T13:00:00Z', editado_em: null, autor: autor(quem), ...extras,
})
const SEM_PERMISSAO = 'Você não tem permissão para isso.'

beforeEach(() => {
  vi.clearAllMocks()
  // O banco devolve os mais recentes primeiro.
  vi.mocked(comentariosDoCartao).mockImplementation(async ({ antesId }) => (antesId
    ? { itens: [comentario('m1', 'Primeiro de todos', gabi)], haMais: false }
    : { itens: [comentario('m3', 'Liguei para o financeiro', gabi), comentario('m2', 'Boletos levantados', ana)], haMais: true }))
  vi.mocked(comentar).mockImplementation(async (_cartao, texto) => ({
    erro: null, comentario: { id: 'm4', texto, criado_em: '2026-11-17T15:00:00Z', editado_em: null, autor_id: 'p1' },
  }))
  vi.mocked(editarComentario).mockResolvedValue({ erro: null })
  vi.mocked(apagarComentario).mockResolvedValue({ erro: null })
})

function tela(props = {}) {
  const aoMexer = vi.fn()
  const aoRecusar = vi.fn()
  render(<ComentariosDoCartao cartaoId="c1" perfil={ana} podeMexer podeGerir={false} totalInicial={3} aoMexer={aoMexer} aoRecusar={aoRecusar} {...props} />)
  return { aoMexer, aoRecusar }
}

const textos = () => within(screen.getByRole('list', { name: 'Comentários' })).getAllByRole('listitem')
  .map((li) => li.querySelector('[data-texto]')?.textContent)
const doComentario = (texto) => within(screen.getByText(texto).closest('li'))

// O jsdom não mede: a área dos comentários "tem" 100 px por comentário (e 40 do botão de ver anteriores).
let altura
beforeEach(() => {
  altura = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function medir() {
    if (!this.hasAttribute('data-rolagem')) return 0
    const verAnteriores = [...this.querySelectorAll('button')].some((b) => b.textContent.includes('Ver comentários anteriores'))
    return this.querySelectorAll('li').length * 100 + (verAnteriores ? 40 : 0)
  })
})
afterEach(() => altura.mockRestore())
const rolagem = () => document.querySelector('[data-rolagem]')

describe('comentários do cartão: rolagem', () => {
  it('abre no fim (os mais novos à vista) e, depois de comentar, vai para o fim de novo', async () => {
    const user = userEvent.setup()
    tela()
    await waitFor(() => expect(textos()).toHaveLength(2))
    expect(rolagem().scrollTop).toBe(240)
    rolagem().scrollTop = 0
    await user.type(screen.getByRole('textbox', { name: 'Novo comentário' }), 'Contrato enviado')
    await user.click(screen.getByRole('button', { name: 'Comentar' }))
    await waitFor(() => expect(textos()).toHaveLength(3))
    expect(rolagem().scrollTop).toBe(340)
  })

  it('"Ver anteriores" põe os antigos em cima sem tirar do lugar o que a pessoa estava lendo', async () => {
    const user = userEvent.setup()
    tela()
    await waitFor(() => expect(textos()).toHaveLength(2))
    rolagem().scrollTop = 0
    await user.click(screen.getByRole('button', { name: 'Ver comentários anteriores' }))
    await waitFor(() => expect(textos()).toHaveLength(3))
    // Antes: 240 de altura, no topo. Depois: 300 (um comentário a mais, sem o botão): o mesmo comentário continua no topo.
    expect(rolagem().scrollTop).toBe(60)
  })
})

describe('comentários do cartão', () => {
  it('mostra os 30 mais recentes, do mais antigo para o mais novo; "Ver anteriores" pede os de antes do mais antigo', async () => {
    const user = userEvent.setup()
    tela()
    await waitFor(() => expect(textos()).toEqual(['Boletos levantados', 'Liguei para o financeiro']))
    expect(comentariosDoCartao).toHaveBeenCalledWith({ cartaoId: 'c1' })
    expect(screen.getByRole('heading', { name: /Comentários/ })).toHaveTextContent('3')
    expect(doComentario('Liguei para o financeiro').getByText('Gabi Souza')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver comentários anteriores' }))
    expect(comentariosDoCartao).toHaveBeenLastCalledWith({ cartaoId: 'c1', antesId: 'm2' })
    await waitFor(() => expect(textos()).toEqual(['Primeiro de todos', 'Boletos levantados', 'Liguei para o financeiro']))
    expect(screen.queryByRole('button', { name: 'Ver comentários anteriores' })).not.toBeInTheDocument()
  })

  it('comentar: o comentário entra no fim, com o nome de quem comentou, e a caixa esvazia', async () => {
    const user = userEvent.setup()
    const { aoMexer } = tela()
    await waitFor(() => expect(textos()).toHaveLength(2))
    const caixa = screen.getByRole('textbox', { name: 'Novo comentário' })
    await user.type(caixa, '  Contrato enviado  ')
    await user.click(screen.getByRole('button', { name: 'Comentar' }))
    expect(comentar).toHaveBeenCalledWith('c1', 'Contrato enviado')
    await waitFor(() => expect(textos().at(-1)).toBe('Contrato enviado'))
    expect(doComentario('Contrato enviado').getByText('Ana Lima')).toBeInTheDocument()
    expect(caixa).toHaveValue('')
    expect(screen.getByRole('heading', { name: /Comentários/ })).toHaveTextContent('4')
    expect(aoMexer).toHaveBeenCalled()
  })

  it('o próprio comentário: editar (fica "· editado") e apagar com confirmação', async () => {
    const user = userEvent.setup()
    const { aoMexer } = tela()
    await waitFor(() => expect(textos()).toHaveLength(2))
    await user.click(doComentario('Boletos levantados').getByRole('button', { name: 'Editar comentário' }))
    const campo = screen.getByRole('textbox', { name: 'Texto do comentário' })
    await user.clear(campo)
    await user.type(campo, 'Boletos de outubro levantados')
    await user.click(screen.getByRole('button', { name: 'Salvar comentário' }))
    expect(editarComentario).toHaveBeenCalledWith('m2', 'Boletos de outubro levantados')
    await waitFor(() => expect(doComentario('Boletos de outubro levantados').getByText('· editado')).toBeInTheDocument())

    await user.click(doComentario('Boletos de outubro levantados').getByRole('button', { name: 'Apagar comentário' }))
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent('Apagar o comentário?')
    expect(confirmar).toHaveTextContent('O comentário some do cartão.')
    await user.click(within(confirmar).getByRole('button', { name: 'Apagar comentário' }))
    expect(apagarComentario).toHaveBeenCalledWith('m2')
    await waitFor(() => expect(textos()).toEqual(['Liguei para o financeiro']))
    expect(aoMexer).toHaveBeenCalled()
  })

  it('comentário de outra pessoa: quem não é da gestão não edita nem apaga', async () => {
    tela()
    await waitFor(() => expect(textos()).toHaveLength(2))
    expect(doComentario('Liguei para o financeiro').queryByRole('button')).not.toBeInTheDocument()
  })

  it('a gestão apaga o comentário de qualquer um, mas só edita os próprios', async () => {
    tela({ perfil: gabi, podeGerir: true })
    await waitFor(() => expect(textos()).toHaveLength(2))
    const deAna = doComentario('Boletos levantados')
    expect(deAna.getByRole('button', { name: 'Apagar comentário' })).toBeInTheDocument()
    expect(deAna.queryByRole('button', { name: 'Editar comentário' })).not.toBeInTheDocument()
    expect(doComentario('Liguei para o financeiro').getByRole('button', { name: 'Editar comentário' })).toBeInTheDocument()
  })

  it('só leitura: lê os comentários, sem escrever, editar nem apagar', async () => {
    tela({ podeMexer: false })
    await waitFor(() => expect(textos()).toHaveLength(2))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comentar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar|Apagar/ })).not.toBeInTheDocument()
  })

  it('recusado: o texto continua na caixa e quem chama é avisado (ele confere o acesso)', async () => {
    vi.mocked(comentar).mockResolvedValue({ erro: SEM_PERMISSAO })
    const user = userEvent.setup()
    const { aoRecusar } = tela()
    await waitFor(() => expect(textos()).toHaveLength(2))
    await user.type(screen.getByRole('textbox', { name: 'Novo comentário' }), 'Contrato enviado')
    await user.click(screen.getByRole('button', { name: 'Comentar' }))
    await waitFor(() => expect(aoRecusar).toHaveBeenCalledWith(SEM_PERMISSAO))
    expect(screen.getByRole('textbox', { name: 'Novo comentário' })).toHaveValue('Contrato enviado')
    expect(textos()).toHaveLength(2)
  })

  it('sem comentários: o aviso', async () => {
    vi.mocked(comentariosDoCartao).mockResolvedValue({ itens: [], haMais: false })
    tela({ totalInicial: 0 })
    expect(await screen.findByText('Nenhum comentário ainda.')).toBeInTheDocument()
  })
})
