import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apagarArquivo, enviarArquivo, linkParaBaixar, listarArquivos } from '@/data/arquivos'
import { renderizarTela } from '@/test/renderizar'
import ArquivosDoCliente from './ArquivosDoCliente'

vi.mock('@/data/arquivos', () => ({
  listarArquivos: vi.fn(), enviarArquivo: vi.fn(), linkParaBaixar: vi.fn(), apagarArquivo: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const CLIENTE = { id: 'k1', nome: 'Provedor Alfa', consultoria_id: 's1', consultor_id: 'p1' }
const ARQUIVOS = [
  { id: 'a1', nome: 'contrato.pdf', tamanho: 1536, tipo: 'application/pdf', enviado_em: '2026-11-10T12:00:00Z', consultoria_id: 's1', caminho: 'k1/x-contrato.pdf', autor: 'Ana' },
  { id: 'a2', nome: 'planilha.xlsx', tamanho: 3 * 1048576, tipo: null, enviado_em: '2026-11-09T12:00:00Z', consultoria_id: null, caminho: 'k1/y-planilha.xlsx', autor: 'Central' },
]
const central = { id: 'c0', papel: 'central', consultoria_id: null }
const admin = { id: 'a9', papel: 'admin', consultoria_id: 's1' }
const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 's1' }
const outraPessoa = { id: 'p7', papel: 'pessoa', consultoria_id: 's1' }
const adminDeOutra = { id: 'a8', papel: 'admin', consultoria_id: 's2' }

const tela = (perfil = central, cliente = CLIENTE) =>
  renderizarTela(<ArquivosDoCliente cliente={cliente} perfil={perfil} />, { perfil })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarArquivos).mockResolvedValue({ itens: ARQUIVOS, total: 2 })
  vi.mocked(enviarArquivo).mockResolvedValue({ erro: null })
  vi.mocked(apagarArquivo).mockResolvedValue({ erro: null })
  vi.mocked(linkParaBaixar).mockResolvedValue({ url: 'https://x.test/a' })
})

const arquivoDe = (nome, tamanho = 10) => {
  const f = new File(['x'], nome, { type: 'application/pdf' })
  Object.defineProperty(f, 'size', { value: tamanho })
  return f
}

describe('ArquivosDoCliente', () => {
  it('lista os arquivos com tamanho, autor e ações', async () => {
    tela()
    const tabela = await screen.findByRole('table', { name: 'Arquivos' })
    expect(listarArquivos).toHaveBeenCalledWith('k1', { pagina: 1 })
    const linha = within(tabela).getByRole('row', { name: /contrato\.pdf/ })
    expect(within(linha).getByText('1,5 KB')).toBeInTheDocument()
    expect(within(linha).getByText('Ana')).toBeInTheDocument()
    expect(within(tabela).getByText('3 MB')).toBeInTheDocument()
    expect(within(linha).getByRole('button', { name: 'Baixar' })).toBeInTheDocument()
  })

  it('sem arquivos mostra a lista vazia', async () => {
    vi.mocked(listarArquivos).mockResolvedValue({ itens: [], total: 0 })
    tela()
    expect(await screen.findByText('Nenhum arquivo enviado ainda.')).toBeInTheDocument()
  })

  it('fora da faixa volta para a página 1', async () => {
    vi.mocked(listarArquivos).mockResolvedValueOnce({ itens: ARQUIVOS, total: 20 })
    tela()
    await screen.findByRole('table', { name: 'Arquivos' })
    vi.mocked(listarArquivos).mockResolvedValueOnce({ itens: [], total: 5, foraDaFaixa: true })
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    await waitFor(() => expect(listarArquivos).toHaveBeenCalledTimes(3))
    expect(listarArquivos).toHaveBeenNthCalledWith(2, 'k1', { pagina: 2 })
    expect(listarArquivos).toHaveBeenLastCalledWith('k1', { pagina: 1 })
  })

  it('arquivo de 26 MB mostra o erro e não envia', async () => {
    tela()
    await screen.findByRole('table', { name: 'Arquivos' })
    await userEvent.upload(screen.getByTestId('entrada-de-arquivo'), arquivoDe('grande.zip', 26 * 1048576), { applyAccept: false })
    expect(await screen.findByText(/grande\.zip.*O arquivo passa de 25 MB\./)).toBeInTheDocument()
    expect(enviarArquivo).not.toHaveBeenCalled()
  })

  it('soltar um arquivo envia e recarrega a lista', async () => {
    tela()
    await screen.findByRole('table', { name: 'Arquivos' })
    const arquivo = arquivoDe('novo.pdf')
    fireEvent.drop(screen.getByTestId('area-de-soltar'), { dataTransfer: { files: [arquivo] } })
    await waitFor(() => expect(enviarArquivo).toHaveBeenCalledWith('k1', arquivo))
    await waitFor(() => expect(listarArquivos).toHaveBeenCalledTimes(2))
  })

  it('mostra o progresso e desabilita a área enquanto envia', async () => {
    let terminar
    vi.mocked(enviarArquivo).mockReturnValue(new Promise((r) => { terminar = r }))
    tela()
    await screen.findByRole('table', { name: 'Arquivos' })
    await userEvent.upload(screen.getByTestId('entrada-de-arquivo'), arquivoDe('lento.pdf'))
    expect(await screen.findByText('Enviando lento.pdf…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escolher arquivo' })).toBeDisabled()
    terminar({ erro: null })
    await waitFor(() => expect(screen.queryByText('Enviando lento.pdf…')).not.toBeInTheDocument())
  })

  it('vários arquivos sobem um depois do outro e cada erro aparece', async () => {
    vi.mocked(enviarArquivo).mockResolvedValueOnce({ erro: 'Sem permissão.' }).mockResolvedValueOnce({ erro: null })
    tela()
    await screen.findByRole('table', { name: 'Arquivos' })
    await userEvent.upload(screen.getByTestId('entrada-de-arquivo'), [arquivoDe('a.pdf'), arquivoDe('b.pdf')])
    await waitFor(() => expect(enviarArquivo).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/a\.pdf.*Sem permissão\./)).toBeInTheDocument()
  })

  it('Baixar abre o link temporário em outra aba', async () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    tela()
    const linha = within(await screen.findByRole('table', { name: 'Arquivos' })).getByRole('row', { name: /contrato\.pdf/ })
    await userEvent.click(within(linha).getByRole('button', { name: 'Baixar' }))
    expect(linkParaBaixar).toHaveBeenCalledWith(ARQUIVOS[0])
    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://x.test/a', '_blank', 'noopener'))
    abrir.mockRestore()
  })

  it('Baixar com erro avisa', async () => {
    vi.mocked(linkParaBaixar).mockResolvedValue({ erro: 'Falhou.' })
    tela()
    const linha = within(await screen.findByRole('table', { name: 'Arquivos' })).getByRole('row', { name: /contrato\.pdf/ })
    await userEvent.click(within(linha).getByRole('button', { name: 'Baixar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Falhou.'))
  })

  it('Apagar confirma, apaga e recarrega', async () => {
    tela()
    const linha = within(await screen.findByRole('table', { name: 'Arquivos' })).getByRole('row', { name: /contrato\.pdf/ })
    await userEvent.click(within(linha).getByRole('button', { name: 'Apagar' }))
    expect(apagarArquivo).not.toHaveBeenCalled()
    const janela = screen.getByRole('alertdialog')
    expect(within(janela).getByText('O arquivo some de vez.')).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Apagar arquivo' }))
    expect(apagarArquivo).toHaveBeenCalledWith(ARQUIVOS[0])
    await waitFor(() => expect(listarArquivos).toHaveBeenCalledTimes(2))
  })

  it('mostra o aviso quando o objeto guardado não saiu', async () => {
    vi.mocked(apagarArquivo).mockResolvedValue({ erro: null, aviso: 'A cópia não saiu.' })
    tela()
    const linha = within(await screen.findByRole('table', { name: 'Arquivos' })).getByRole('row', { name: /contrato\.pdf/ })
    await userEvent.click(within(linha).getByRole('button', { name: 'Apagar' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar arquivo' }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('A cópia não saiu.'))
  })

  it('quem pode enviar vê a área de soltar; os outros não', async () => {
    for (const [perfil, vê] of [[central, true], [admin, true], [consultor, true], [outraPessoa, false], [adminDeOutra, false]]) {
      const { unmount } = tela(perfil)
      await screen.findByRole('table', { name: 'Arquivos' })
      expect(!!screen.queryByTestId('area-de-soltar')).toBe(vê)
      expect(!!screen.queryByRole('button', { name: 'Escolher arquivo' })).toBe(vê)
      unmount()
    }
  })

  it('Apagar só aparece para central, quem enviou e a administração da consultoria do arquivo', async () => {
    const linhaDe = async (perfil, nome) => {
      const { unmount } = tela(perfil)
      const linha = within(await screen.findByRole('table', { name: 'Arquivos' })).getByRole('row', { name: new RegExp(nome) })
      return { linha, unmount }
    }
    let r = await linhaDe(outraPessoa, 'contrato')
    expect(within(r.linha).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
    r.unmount()
    r = await linhaDe(admin, 'contrato')
    expect(within(r.linha).getByRole('button', { name: 'Apagar' })).toBeInTheDocument()
    r.unmount()
    r = await linhaDe(admin, 'planilha')
    expect(within(r.linha).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
    r.unmount()
    vi.mocked(listarArquivos).mockResolvedValue({ itens: [{ ...ARQUIVOS[0], enviado_por: 'p1' }], total: 1 })
    r = await linhaDe(consultor, 'contrato')
    expect(within(r.linha).getByRole('button', { name: 'Apagar' })).toBeInTheDocument()
    r.unmount()
    r = await linhaDe(central, 'contrato')
    expect(within(r.linha).getByRole('button', { name: 'Apagar' })).toBeInTheDocument()
    r.unmount()
  })
})
