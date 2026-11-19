import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apagarArquivo, apagarPasta, buscarPasta, criarPasta, enviarArquivo, linkParaBaixar, listarArquivos, listarPastas, renomearPasta,
} from '@/data/arquivos'
import { renderizarTela } from '@/test/renderizar'
import ArquivosDoCliente from './ArquivosDoCliente'

// O computador num fuso longe de São Paulo (antes de o componente criar os formatadores): o "Quando" não pode
// depender dele.
const fusoOriginal = vi.hoisted(() => {
  const original = process.env.TZ
  process.env.TZ = 'Asia/Tokyo'
  return original
})
afterAll(() => {
  if (fusoOriginal === undefined) delete process.env.TZ
  else process.env.TZ = fusoOriginal
})

vi.mock('@/data/arquivos', () => ({
  listarArquivos: vi.fn(), enviarArquivo: vi.fn(), linkParaBaixar: vi.fn(), apagarArquivo: vi.fn(),
  listarPastas: vi.fn(), criarPasta: vi.fn(), renomearPasta: vi.fn(), apagarPasta: vi.fn(), buscarPasta: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const CLIENTE = { id: 'k1', nome: 'Provedor Alfa', consultoria_id: 's1', consultor_id: 'p1' }
const ARQUIVOS = [
  { id: 'a1', nome: 'contrato.pdf', tamanho: 1536, tipo: 'application/pdf', enviado_em: '2026-11-10T12:00:00Z', consultoria_id: 's1', caminho: 'k1/x-contrato.pdf', autor: 'Ana' },
  { id: 'a2', nome: 'planilha.xlsx', tamanho: 3 * 1048576, tipo: null, enviado_em: '2026-11-09T12:00:00Z', consultoria_id: null, caminho: 'k1/y-planilha.xlsx', autor: 'Central' },
]
const PASTAS = [
  { id: 'd1', nome: 'Contratos', evento_id: null, consultoria_id: 's1', criada_por: 'p1', criada_em: '2026-11-08T12:00:00Z', arquivos: 3 },
  { id: 'd2', nome: 'Reunião 12/11', evento_id: 'e1', consultoria_id: null, criada_por: 'c0', criada_em: '2026-11-07T12:00:00Z', arquivos: 0 },
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
  vi.mocked(listarPastas).mockResolvedValue({ itens: [], total: 0 })
  vi.mocked(criarPasta).mockResolvedValue({ erro: null })
  vi.mocked(renomearPasta).mockResolvedValue({ erro: null })
  vi.mocked(apagarPasta).mockResolvedValue({ erro: null })
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
    expect(listarArquivos).toHaveBeenCalledWith('k1', { pastaId: null, pagina: 1 })
    const linha = within(tabela).getByRole('row', { name: /contrato\.pdf/ })
    expect(within(linha).getByText('1,5 KB')).toBeInTheDocument()
    expect(within(linha).getByText('Ana')).toBeInTheDocument()
    expect(within(tabela).getByText('3 MB')).toBeInTheDocument()
    expect(within(linha).getByRole('button', { name: 'Baixar' })).toBeInTheDocument()
  })

  it('tamanho abaixo de 1 KB aparece em bytes', async () => {
    vi.mocked(listarArquivos).mockResolvedValue({ itens: [{ ...ARQUIVOS[0], tamanho: 45 }], total: 1 })
    tela()
    const linha = within(await screen.findByRole('table', { name: 'Arquivos' })).getByRole('row', { name: /contrato\.pdf/ })
    expect(within(linha).getByText('45 B')).toBeInTheDocument()
  })

  it('"Quando" aparece no horário de São Paulo, qualquer que seja o fuso do computador', async () => {
    vi.mocked(listarArquivos).mockResolvedValue({ itens: [{ ...ARQUIVOS[0], enviado_em: '2026-11-10T02:30:00Z' }], total: 1 })
    tela()
    const linha = within(await screen.findByRole('table', { name: 'Arquivos' })).getByRole('row', { name: /contrato\.pdf/ })
    expect(within(linha).getByText('09/11/2026, 23:30')).toBeInTheDocument()
  })

  it('paginação: some com 15, aparece com 16, Próxima pede a página 2', async () => {
    vi.mocked(listarArquivos).mockResolvedValue({ itens: ARQUIVOS, total: 15 })
    const { unmount } = tela()
    await screen.findByRole('table', { name: 'Arquivos' })
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    unmount()
    vi.mocked(listarArquivos).mockResolvedValue({ itens: ARQUIVOS, total: 16 })
    tela()
    expect(await screen.findByText('1–15 de 16')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    await waitFor(() => expect(listarArquivos).toHaveBeenLastCalledWith('k1', { pastaId: null, pagina: 2 }))
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
    expect(listarArquivos).toHaveBeenNthCalledWith(2, 'k1', { pastaId: null, pagina: 2 })
    expect(listarArquivos).toHaveBeenLastCalledWith('k1', { pastaId: null, pagina: 1 })
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
    await waitFor(() => expect(enviarArquivo).toHaveBeenCalledWith('k1', arquivo, { pastaId: null }))
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

  it('Baixar baixa pelo link temporário na mesma aba, sem window.open (o Safari bloqueia depois do await)', async () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    const cliques = []
    const clicar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      cliques.push({ href: this.href, download: this.download, naPagina: document.body.contains(this) })
    })
    tela()
    const linha = within(await screen.findByRole('table', { name: 'Arquivos' })).getByRole('row', { name: /contrato\.pdf/ })
    await userEvent.click(within(linha).getByRole('button', { name: 'Baixar' }))
    expect(linkParaBaixar).toHaveBeenCalledWith(ARQUIVOS[0])
    await waitFor(() => expect(cliques).toEqual([{ href: 'https://x.test/a', download: 'contrato.pdf', naPagina: true }]))
    expect(abrir).not.toHaveBeenCalled()
    expect(document.querySelector('a[download]')).toBeNull()
    abrir.mockRestore()
    clicar.mockRestore()
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

  it('dois problemas iguais aparecem os dois, sem chave repetida na lista', async () => {
    const erroDoConsole = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(enviarArquivo).mockResolvedValue({ erro: 'Sem permissão.' })
    tela()
    await screen.findByRole('table', { name: 'Arquivos' })
    await userEvent.upload(screen.getByTestId('entrada-de-arquivo'), [arquivoDe('a.pdf'), arquivoDe('a.pdf')])
    await waitFor(() => expect(screen.getAllByText('a.pdf: Sem permissão.')).toHaveLength(2))
    expect(erroDoConsole.mock.calls.flat().join(' ')).not.toMatch(/same key/)
    erroDoConsole.mockRestore()
  })

  it('cliente arquivado: só a central vê a área de soltar (como o banco)', async () => {
    const arquivado = { ...CLIENTE, arquivado: true }
    for (const [perfil, vê] of [[central, true], [admin, false], [consultor, false]]) {
      const { unmount } = tela(perfil, arquivado)
      await screen.findByRole('table', { name: 'Arquivos' })
      expect(!!screen.queryByTestId('area-de-soltar')).toBe(vê)
      unmount()
    }
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

  describe('pastas', () => {
    beforeEach(() => {
      vi.mocked(listarPastas).mockResolvedValue({ itens: PASTAS, total: 2 })
    })
    const linhaDaPasta = async (nome) =>
      within(await screen.findByRole('table', { name: 'Pastas' })).getByRole('row', { name: new RegExp(nome) })

    it('lista as pastas numa tabela, antes dos arquivos soltos', async () => {
      tela()
      const tabela = await screen.findByRole('table', { name: 'Pastas' })
      expect(listarPastas).toHaveBeenCalledWith('k1', { pagina: 1 })
      const linha = within(tabela).getByRole('row', { name: /Contratos/ })
      expect(within(linha).getByText('3')).toBeInTheDocument()
      expect(within(tabela).getByText('Reunião 12/11')).toBeInTheDocument()
      const tabelas = await screen.findAllByRole('table')
      expect(tabelas.map((t) => t.getAttribute('aria-label'))).toEqual(['Pastas', 'Arquivos'])
    })

    it('paginação das pastas: some com 15, aparece com 16, Próxima pede a página 2', async () => {
      vi.mocked(listarPastas).mockResolvedValue({ itens: PASTAS, total: 15 })
      const { unmount } = tela()
      await screen.findByRole('table', { name: 'Pastas' })
      expect(screen.queryByText(/de 15$/)).not.toBeInTheDocument()
      unmount()
      vi.mocked(listarPastas).mockResolvedValue({ itens: PASTAS, total: 16 })
      tela()
      expect(await screen.findByText('1–15 de 16')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
      await waitFor(() => expect(listarPastas).toHaveBeenLastCalledWith('k1', { pagina: 2 }))
    })

    it('Nova pasta abre a janela, cria e recarrega as pastas', async () => {
      tela()
      await screen.findByRole('table', { name: 'Pastas' })
      await userEvent.click(screen.getByRole('button', { name: 'Nova pasta' }))
      const janela = screen.getByRole('dialog', { name: 'Nova pasta' })
      await userEvent.type(within(janela).getByLabelText('Nome da pasta'), '  Atas  ')
      await userEvent.click(within(janela).getByRole('button', { name: 'Criar pasta' }))
      expect(criarPasta).toHaveBeenCalledWith('k1', 'Atas')
      await waitFor(() => expect(listarPastas).toHaveBeenCalledTimes(2))
      expect(screen.queryByRole('dialog', { name: 'Nova pasta' })).not.toBeInTheDocument()
    })

    it('Nova pasta mostra o erro do banco e continua aberta', async () => {
      vi.mocked(criarPasta).mockResolvedValue({ erro: 'Já existe uma pasta com esse nome.' })
      tela()
      await screen.findByRole('table', { name: 'Pastas' })
      await userEvent.click(screen.getByRole('button', { name: 'Nova pasta' }))
      const janela = screen.getByRole('dialog', { name: 'Nova pasta' })
      await userEvent.type(within(janela).getByLabelText('Nome da pasta'), 'Contratos')
      await userEvent.click(within(janela).getByRole('button', { name: 'Criar pasta' }))
      expect(await within(janela).findByText('Já existe uma pasta com esse nome.')).toBeInTheDocument()
    })

    it('Nova pasta com nome vazio não chama o banco', async () => {
      tela()
      await screen.findByRole('table', { name: 'Pastas' })
      await userEvent.click(screen.getByRole('button', { name: 'Nova pasta' }))
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Nova pasta' })).getByRole('button', { name: 'Criar pasta' }))
      expect(criarPasta).not.toHaveBeenCalled()
      expect(screen.getByText('Dê um nome à pasta.')).toBeInTheDocument()
    })

    it('Renomear abre o formulário com o nome da linha e salva', async () => {
      tela()
      await userEvent.click(within(await linhaDaPasta('Contratos')).getByRole('button', { name: 'Renomear' }))
      const janela = screen.getByRole('dialog', { name: 'Renomear pasta' })
      const campo = within(janela).getByLabelText('Nome da pasta')
      expect(campo).toHaveValue('Contratos')
      await userEvent.clear(campo)
      await userEvent.type(campo, 'Contratos 2026')
      await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
      expect(renomearPasta).toHaveBeenCalledWith('d1', 'Contratos 2026')
      await waitFor(() => expect(listarPastas).toHaveBeenCalledTimes(2))
    })

    it('Apagar diz quantos arquivos somem junto, apaga e recarrega', async () => {
      tela()
      await userEvent.click(within(await linhaDaPasta('Contratos')).getByRole('button', { name: 'Apagar' }))
      expect(apagarPasta).not.toHaveBeenCalled()
      const janela = screen.getByRole('alertdialog')
      expect(within(janela).getByText('Os 3 arquivos dela somem de vez.')).toBeInTheDocument()
      await userEvent.click(within(janela).getByRole('button', { name: 'Apagar pasta' }))
      expect(apagarPasta).toHaveBeenCalledWith(PASTAS[0])
      await waitFor(() => expect(listarPastas).toHaveBeenCalledTimes(2))
    })

    it('Apagar pasta vazia diz que só a pasta some; com 1 arquivo, no singular', async () => {
      tela()
      await userEvent.click(within(await linhaDaPasta('Reunião')).getByRole('button', { name: 'Apagar' }))
      expect(within(screen.getByRole('alertdialog')).getByText('A pasta está vazia; só ela some.')).toBeInTheDocument()
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    })

    it('pasta com arquivos que a pessoa não apagaria: sem confirmação, só a mensagem', async () => {
      vi.mocked(listarPastas).mockResolvedValue({ itens: [{ ...PASTAS[0], bloqueados: 2 }], total: 1 })
      tela()
      await userEvent.click(within(await linhaDaPasta('Contratos')).getByRole('button', { name: 'Apagar' }))
      const janela = screen.getByRole('alertdialog')
      expect(within(janela).getByText('Esta pasta tem 2 arquivos que só quem enviou (ou a gestão/central) pode apagar. Apague-os antes ou peça a quem pode.')).toBeInTheDocument()
      expect(within(janela).queryByRole('button', { name: 'Apagar pasta' })).not.toBeInTheDocument()
      expect(apagarPasta).not.toHaveBeenCalled()
      await userEvent.click(within(janela).getByRole('button', { name: 'Entendi' }))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('Apagar pasta com 1 arquivo fala no singular', async () => {
      vi.mocked(listarPastas).mockResolvedValue({ itens: [{ ...PASTAS[0], arquivos: 1 }], total: 1 })
      tela()
      await userEvent.click(within(await linhaDaPasta('Contratos')).getByRole('button', { name: 'Apagar' }))
      expect(within(screen.getByRole('alertdialog')).getByText('O 1 arquivo dela some de vez.')).toBeInTheDocument()
    })

    it('Renomear e Apagar só aparecem para a central, quem criou e a administração da consultoria da pasta', async () => {
      const botoes = async (perfil, nome) => {
        const { unmount } = tela(perfil)
        const linha = await linhaDaPasta(nome)
        const r = {
          renomear: !!within(linha).queryByRole('button', { name: 'Renomear' }),
          apagar: !!within(linha).queryByRole('button', { name: 'Apagar' }),
        }
        unmount()
        return r
      }
      expect(await botoes(outraPessoa, 'Contratos')).toEqual({ renomear: false, apagar: false })
      expect(await botoes(consultor, 'Contratos')).toEqual({ renomear: true, apagar: true })
      expect(await botoes(admin, 'Contratos')).toEqual({ renomear: true, apagar: true })
      expect(await botoes(adminDeOutra, 'Contratos')).toEqual({ renomear: false, apagar: false })
      expect(await botoes(admin, 'Reunião')).toEqual({ renomear: false, apagar: false })
      expect(await botoes(central, 'Reunião')).toEqual({ renomear: true, apagar: true })
    })

    it('só quem pode enviar vê Nova pasta', async () => {
      for (const [perfil, vê] of [[central, true], [admin, true], [consultor, true], [outraPessoa, false]]) {
        const { unmount } = tela(perfil)
        await screen.findByRole('table', { name: 'Pastas' })
        expect(!!screen.queryByRole('button', { name: 'Nova pasta' })).toBe(vê)
        unmount()
      }
    })

    it('abrir a pasta lista os arquivos dela, com Voltar, e envia para dentro dela', async () => {
      tela()
      await userEvent.click(within(await linhaDaPasta('Contratos')).getByRole('button', { name: 'Abrir' }))
      expect(await screen.findByRole('heading', { name: 'Contratos' })).toBeInTheDocument()
      await waitFor(() => expect(listarArquivos).toHaveBeenLastCalledWith('k1', { pastaId: 'd1', pagina: 1 }))
      expect(screen.queryByRole('table', { name: 'Pastas' })).not.toBeInTheDocument()
      const arquivo = arquivoDe('dentro.pdf')
      fireEvent.drop(screen.getByTestId('area-de-soltar'), { dataTransfer: { files: [arquivo] } })
      await waitFor(() => expect(enviarArquivo).toHaveBeenCalledWith('k1', arquivo, { pastaId: 'd1' }))
      await userEvent.click(screen.getByRole('button', { name: /Voltar/ }))
      expect(await screen.findByRole('table', { name: 'Pastas' })).toBeInTheDocument()
      await waitFor(() => expect(listarArquivos).toHaveBeenLastCalledWith('k1', { pastaId: null, pagina: 1 }))
    })

    it('pasta aberta sem arquivos mostra a lista vazia', async () => {
      vi.mocked(listarArquivos).mockResolvedValue({ itens: [], total: 0 })
      tela()
      await userEvent.click(within(await linhaDaPasta('Contratos')).getByRole('button', { name: 'Abrir' }))
      expect(await screen.findByText('Nenhum arquivo nesta pasta.')).toBeInTheDocument()
    })
  })
})

// O Calendário leva à pasta da reunião: /clientes/<id>?aba=arquivos&pasta=<id da pasta>.
describe('ArquivosDoCliente aberto numa pasta pelo endereço', () => {
  it('abre a pasta do endereço (lida no banco) e mostra só os arquivos dela', async () => {
    vi.mocked(buscarPasta).mockResolvedValue({ id: 'd2', nome: 'Reunião 12/11', cliente_id: 'k1' })
    renderizarTela(<ArquivosDoCliente cliente={CLIENTE} perfil={central} />, { perfil: central, endereco: '/clientes/k1?aba=arquivos&pasta=d2' })
    expect(await screen.findByRole('heading', { name: 'Reunião 12/11' })).toBeInTheDocument()
    expect(buscarPasta).toHaveBeenCalledWith('d2')
    await waitFor(() => expect(listarArquivos).toHaveBeenLastCalledWith('k1', { pastaId: 'd2', pagina: 1 }))
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  })

  it('pasta de outro cliente (ou que a pessoa não vê) fica na raiz', async () => {
    vi.mocked(buscarPasta).mockResolvedValue({ id: 'd9', nome: 'De outro', cliente_id: 'k2' })
    renderizarTela(<ArquivosDoCliente cliente={CLIENTE} perfil={central} />, { perfil: central, endereco: '/clientes/k1?aba=arquivos&pasta=d9' })
    await waitFor(() => expect(buscarPasta).toHaveBeenCalledWith('d9'))
    expect(await screen.findByRole('heading', { name: 'Arquivos' })).toBeInTheDocument()
    expect(screen.queryByText('De outro')).not.toBeInTheDocument()
  })
})
