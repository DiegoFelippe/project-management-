import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anexosDoCartao, apagarAnexo, enviarAnexo, urlAssinada } from '@/data/quadro'
import AnexosDoCartao from './AnexosDoCartao'

vi.mock('@/data/quadro', () => ({
  ANEXOS_POR_PAGINA: 15, anexosDoCartao: vi.fn(), enviarAnexo: vi.fn(), apagarAnexo: vi.fn(), urlAssinada: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const anexo = (id, nome, extras = {}) => ({
  id, nome, tamanho: 1536, tipo: 'application/pdf', caminho: `k1/c1/${id}-${nome}`, enviado_em: '2026-11-10T13:00:00Z',
  enviado_por: { id: 'p1', nome: 'Ana Lima', foto: null, cor: null }, pode_apagar: true, ...extras,
})
const ANEXOS = [anexo('a1', 'contrato.pdf'), anexo('a2', 'planilha.xlsx', { pode_apagar: false, enviado_por: { id: 'g1', nome: 'Gabi Souza' } })]
const SEM_PERMISSAO = 'Você não tem permissão para isso.'

let clicar
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(anexosDoCartao).mockResolvedValue({ itens: ANEXOS, total: 2 })
  vi.mocked(enviarAnexo).mockImplementation(async (_onde, arquivo) => ({ erro: null, anexo: anexo('n1', arquivo.name) }))
  vi.mocked(apagarAnexo).mockResolvedValue({ erro: null })
  vi.mocked(urlAssinada).mockResolvedValue({ url: 'https://assinado.local/contrato.pdf?token=t&download=contrato.pdf' })
  clicar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => clicar.mockRestore())

function tela(props = {}) {
  const aoMexer = vi.fn()
  const aoRecusar = vi.fn()
  render(<AnexosDoCartao clienteId="k1" cartaoId="c1" podeMexer aoMexer={aoMexer} aoRecusar={aoRecusar} {...props} />)
  return { aoMexer, aoRecusar }
}

const tabela = () => screen.findByRole('table', { name: 'Anexos do cartão' })
const linha = (nome) => within(screen.getByRole('cell', { name: nome }).closest('tr'))

describe('anexos do cartão', () => {
  it('lista em tabela: nome, tamanho, quem enviou e quando; Baixar para todos e Apagar só nos que a pessoa pode', async () => {
    tela()
    const t = await tabela()
    expect(anexosDoCartao).toHaveBeenCalledWith({ cartaoId: 'c1', pagina: 1 })
    expect(within(t).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Nome', 'Tamanho', 'Enviado por', 'Quando', 'Ações'])
    expect(linha('contrato.pdf').getByText('1,5 KB')).toBeInTheDocument()
    expect(linha('contrato.pdf').getByText('Ana Lima')).toBeInTheDocument()
    expect(linha('contrato.pdf').getByRole('button', { name: 'Apagar contrato.pdf' })).toBeInTheDocument()
    expect(linha('planilha.xlsx').getByRole('button', { name: 'Baixar planilha.xlsx' })).toBeInTheDocument()
    expect(linha('planilha.xlsx').queryByRole('button', { name: /Apagar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Anexos/ })).toHaveTextContent('2')
  })

  it('paginação: some com 15 ou menos; aparece com mais e Próxima pede a página 2 ao banco', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<AnexosDoCartao clienteId="k1" cartaoId="c1" podeMexer aoMexer={vi.fn()} aoRecusar={vi.fn()} />)
    await tabela()
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    unmount()
    const quinze = Array.from({ length: 15 }, (_, i) => anexo(`x${i}`, `arquivo-${i}.pdf`))
    vi.mocked(anexosDoCartao).mockResolvedValue({ itens: quinze, total: 32 })
    tela()
    await tabela()
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('1–15 de 32')
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(anexosDoCartao).toHaveBeenLastCalledWith({ cartaoId: 'c1', pagina: 2 })
  })

  it('enviar pelo botão: sobe na pasta do cartão e relê a primeira página', async () => {
    const user = userEvent.setup()
    const { aoMexer } = tela()
    await tabela()
    const arquivo = new File(['x'], 'ata.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Escolher arquivos para anexar'), arquivo)
    expect(enviarAnexo).toHaveBeenCalledWith({ clienteId: 'k1', cartaoId: 'c1' }, arquivo)
    await waitFor(() => expect(anexosDoCartao).toHaveBeenCalledTimes(2))
    expect(anexosDoCartao).toHaveBeenLastCalledWith({ cartaoId: 'c1', pagina: 1 })
    expect(toast.success).toHaveBeenCalledWith('ata.pdf anexado.')
    expect(aoMexer).toHaveBeenCalled()
  })

  it('arrastar arquivos para a área de anexos envia cada um', async () => {
    tela()
    await tabela()
    const a = new File(['a'], 'a.pdf', { type: 'application/pdf' })
    const b = new File(['b'], 'b.png', { type: 'image/png' })
    const area = screen.getByRole('region', { name: 'Anexos' })
    fireEvent.dragOver(area, { dataTransfer: { files: [a, b], types: ['Files'] } })
    expect(screen.getByText('Solte para anexar.')).toBeInTheDocument()
    fireEvent.drop(area, { dataTransfer: { files: [a, b], types: ['Files'] } })
    await waitFor(() => expect(enviarAnexo).toHaveBeenCalledTimes(2))
    expect(enviarAnexo).toHaveBeenNthCalledWith(1, { clienteId: 'k1', cartaoId: 'c1' }, a)
    expect(enviarAnexo).toHaveBeenNthCalledWith(2, { clienteId: 'k1', cartaoId: 'c1' }, b)
  })

  it('baixar usa o link assinado com o nome original', async () => {
    const user = userEvent.setup()
    tela()
    await tabela()
    await user.click(linha('contrato.pdf').getByRole('button', { name: 'Baixar contrato.pdf' }))
    expect(urlAssinada).toHaveBeenCalledWith('k1/c1/a1-contrato.pdf', { nome: 'contrato.pdf' })
    await waitFor(() => expect(clicar).toHaveBeenCalled())
  })

  it('apagar pede confirmação dizendo que o arquivo some; depois relê a lista', async () => {
    const user = userEvent.setup()
    const { aoMexer } = tela()
    await tabela()
    await user.click(linha('contrato.pdf').getByRole('button', { name: 'Apagar contrato.pdf' }))
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent('Apagar o anexo contrato.pdf?')
    expect(confirmar).toHaveTextContent('O arquivo sai do cartão e some de vez.')
    await user.click(within(confirmar).getByRole('button', { name: 'Apagar anexo' }))
    expect(apagarAnexo).toHaveBeenCalledWith(ANEXOS[0])
    await waitFor(() => expect(anexosDoCartao).toHaveBeenCalledTimes(2))
    expect(aoMexer).toHaveBeenCalled()
  })

  it('só leitura: sem enviar, arrastar nem apagar; baixar continua', async () => {
    tela({ podeMexer: false })
    await tabela()
    expect(screen.queryByLabelText('Escolher arquivos para anexar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apagar|Escolher arquivo/ })).not.toBeInTheDocument()
    expect(linha('contrato.pdf').getByRole('button', { name: 'Baixar contrato.pdf' })).toBeInTheDocument()
    const area = screen.getByRole('region', { name: 'Anexos' })
    fireEvent.drop(area, { dataTransfer: { files: [new File(['a'], 'a.pdf')], types: ['Files'] } })
    expect(enviarAnexo).not.toHaveBeenCalled()
  })

  it('envio recusado: o motivo aparece e quem chama é avisado (ele confere o acesso)', async () => {
    vi.mocked(enviarAnexo).mockResolvedValue({ erro: SEM_PERMISSAO })
    const user = userEvent.setup()
    const { aoRecusar } = tela()
    await tabela()
    await user.upload(screen.getByLabelText('Escolher arquivos para anexar'), new File(['x'], 'ata.pdf'))
    expect(await screen.findByRole('alert')).toHaveTextContent(`ata.pdf: ${SEM_PERMISSAO}`)
    expect(aoRecusar).toHaveBeenCalledWith(SEM_PERMISSAO)
  })

  it('sem anexos: o aviso', async () => {
    vi.mocked(anexosDoCartao).mockResolvedValue({ itens: [], total: 0 })
    tela()
    expect(await screen.findByText('Nenhum anexo.')).toBeInTheDocument()
  })
})
