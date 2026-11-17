import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { urlsAssinadas } from '@/data/quadro'
import { colar, prepararEditor } from '@/test/editor'
import EditorDaDescricao from './EditorDaDescricao'

vi.mock('@/data/quadro', () => ({ urlsAssinadas: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const PASTA = 'k1/c1/'
const NOSSA = `${PASTA}imagens/0b6f3f5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png`
const OUTRA = `${PASTA}imagens/1b6f3f5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp`

const nos = (no) => [no, ...(no?.content ?? []).flatMap(nos)]
const marcas = (json) => nos(json).flatMap((n) => (n.marks ?? []).map((m) => ({ texto: n.text, ...m })))
const ultimo = (fn) => fn.mock.lastCall[0]

beforeAll(prepararEditor)
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(urlsAssinadas).mockImplementation(async (caminhos) => ({
    urls: Object.fromEntries(caminhos.map((c) => [c, `https://assinado.local/${c}?token=t`])),
  }))
})

function tela(props = {}) {
  const aoMudar = vi.fn()
  const aoEnviarImagem = vi.fn()
  render(<EditorDaDescricao conteudo={null} pasta={PASTA} aoMudar={aoMudar} aoEnviarImagem={aoEnviarImagem} {...props} />)
  return { aoMudar, aoEnviarImagem, editor: screen.getByRole('textbox', { name: 'Descrição do cartão' }) }
}

describe('descrição do cartão: mostrar', () => {
  it('mostra a descrição gravada: títulos, negrito, link e a imagem pela URL assinada (com o caminho no JSON)', async () => {
    const conteudo = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Plano' }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'importante', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://ok.com' } }] },
        ] },
        { type: 'image', attrs: { src: NOSSA } },
        { type: 'image', attrs: { src: OUTRA } },
      ],
    }
    tela({ conteudo })
    expect(screen.getByRole('heading', { level: 2, name: 'Plano' })).toBeInTheDocument()
    expect(screen.getByText('importante').tagName).toBe('STRONG')
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('href', 'https://ok.com')
    await waitFor(() => expect(screen.getAllByRole('img', { name: 'Imagem da descrição' }).map((i) => i.getAttribute('src'))).toEqual([
      `https://assinado.local/${NOSSA}?token=t`, `https://assinado.local/${OUTRA}?token=t`,
    ]))
    // As duas imagens num pedido só.
    expect(urlsAssinadas).toHaveBeenCalledTimes(1)
    expect(urlsAssinadas).toHaveBeenCalledWith([NOSSA, OUTRA])
  })

  it('link com esquema recusado aparece sem endereço; imagem de fora nunca é carregada', async () => {
    tela({
      conteudo: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'perigo', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
          { type: 'image', attrs: { src: 'https://evil.com/x.png' } },
        ],
      },
    })
    expect(screen.getByText('perigo').closest('a').getAttribute('href')).toBe('')
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByText('Imagem indisponível')).toBeInTheDocument()
    expect(document.querySelector('img[src]')).toBeNull()
    expect(urlsAssinadas).not.toHaveBeenCalled()
  })

  it('imagem sem link (a pessoa não a vê, ou o arquivo sumiu): "Imagem indisponível"', async () => {
    vi.mocked(urlsAssinadas).mockResolvedValue({ urls: {} })
    tela({ conteudo: { type: 'doc', content: [{ type: 'image', attrs: { src: NOSSA } }] } })
    expect(await screen.findByText('Imagem indisponível')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Imagem da descrição' })).not.toBeInTheDocument()
  })

  it('a imagem não abriu (link vencido): pede um link novo uma vez; se de novo não abrir, "Imagem indisponível"', async () => {
    let vez = 0
    vi.mocked(urlsAssinadas).mockImplementation(async (caminhos) => {
      vez += 1
      return { urls: Object.fromEntries(caminhos.map((c) => [c, `https://assinado.local/${c}?vez=${vez}`])) }
    })
    tela({ conteudo: { type: 'doc', content: [{ type: 'image', attrs: { src: NOSSA } }] } })
    const img = await screen.findByRole('img', { name: 'Imagem da descrição' })
    await waitFor(() => expect(img).toHaveAttribute('src', `https://assinado.local/${NOSSA}?vez=1`))
    fireEvent.error(img)
    await waitFor(() => expect(img).toHaveAttribute('src', `https://assinado.local/${NOSSA}?vez=2`))
    expect(urlsAssinadas).toHaveBeenCalledTimes(2)
    fireEvent.error(img)
    expect(await screen.findByText('Imagem indisponível')).toBeInTheDocument()
    expect(urlsAssinadas).toHaveBeenCalledTimes(2)
  })

  it('só leitura: sem a barra de ferramentas e o texto não se edita', () => {
    const { editor } = tela({ somenteLeitura: true, conteudo: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'oi' }] }] } })
    expect(editor).toHaveAttribute('contenteditable', 'false')
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('só leitura sem descrição: o aviso no lugar do editor vazio', () => {
    render(<EditorDaDescricao conteudo={null} pasta={PASTA} somenteLeitura aoMudar={vi.fn()} aoEnviarImagem={vi.fn()} />)
    expect(screen.getByText('Sem descrição.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Descrição do cartão' })).not.toBeInTheDocument()
  })
})

describe('descrição do cartão: colar', () => {
  it('HTML de fora (Word, página da web) vira texto formatado seguro: sem script, sem imagem de fora e sem link javascript:', async () => {
    const { editor, aoMudar } = tela()
    colar(editor, {
      html: '<meta charset="utf-8"><style>p{color:red}</style><h1>Título</h1>'
        + '<p class="MsoNormal" style="margin:0"><b>negrito</b> e <a href="javascript:alert(1)">clique</a> e '
        + '<a href=" javascript:alert(2)">outro</a> e <a href="https://ok.com" onclick="alert(3)">ok</a>'
        + '<img src="https://evil.com/x.png"><img src="data:image/png;base64,AAAA"></p><script>alert(4)</script>'
        + '<table><tr><td>célula</td></tr></table>',
      texto: 'Título negrito e clique e outro e ok célula',
    })
    await waitFor(() => expect(aoMudar).toHaveBeenCalled())
    const json = ultimo(aoMudar)
    const texto = JSON.stringify(json)
    expect(texto).not.toMatch(/evil|data:|javascript|alert|script|onclick|color/)
    expect(nos(json).some((n) => n.type === 'image')).toBe(false)
    expect(nos(json).find((n) => n.type === 'heading')?.content?.[0]?.text).toBe('Título')
    expect(marcas(json)).toEqual(expect.arrayContaining([
      expect.objectContaining({ texto: 'negrito', type: 'bold' }),
      expect.objectContaining({ texto: 'ok', type: 'link', attrs: expect.objectContaining({ href: 'https://ok.com' }) }),
    ]))
    expect(marcas(json).filter((m) => m.type === 'link')).toHaveLength(1)
    expect(texto).toContain('célula')
    expect(editor.querySelector('img')).toBeNull()
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/imagem.*não entr/i))
  })

  it('imagem do próprio cartão colada de volta (copiar e colar dentro da descrição) continua', async () => {
    const { editor, aoMudar } = tela()
    colar(editor, { html: `<p>a</p><img src="${NOSSA}">` })
    await waitFor(() => expect(aoMudar).toHaveBeenCalled())
    expect(nos(ultimo(aoMudar)).filter((n) => n.type === 'image').map((n) => n.attrs.src)).toEqual([NOSSA])
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('print colado (arquivo de imagem, sem HTML) sobe para o balde e entra pelo caminho', async () => {
    const { editor, aoMudar, aoEnviarImagem } = tela()
    aoEnviarImagem.mockResolvedValue({ erro: null, caminho: NOSSA })
    const print = new File(['png'], 'print.png', { type: 'image/png' })
    colar(editor, { arquivos: [print] })
    await waitFor(() => expect(aoEnviarImagem).toHaveBeenCalledWith(print))
    await waitFor(() => expect(nos(ultimo(aoMudar)).find((n) => n.type === 'image')?.attrs.src).toBe(NOSSA))
    await waitFor(() => expect(within(editor).getByRole('img', { name: 'Imagem da descrição' }))
      .toHaveAttribute('src', `https://assinado.local/${NOSSA}?token=t`))
    expect(JSON.stringify(ultimo(aoMudar))).not.toContain('assinado.local')
  })
})

describe('descrição do cartão: barra de ferramentas', () => {
  it('tem as formatações do Mochi', () => {
    tela()
    const barra = screen.getByRole('toolbar', { name: 'Formatação da descrição' })
    for (const nome of ['Negrito', 'Itálico', 'Sublinhado', 'Tachado', 'Título 1', 'Título 2', 'Título 3', 'Lista', 'Lista numerada',
      'Citação', 'Código', 'Bloco de código', 'Link', 'Inserir imagem', 'Desfazer', 'Refazer']) {
      expect(within(barra).getByRole('button', { name: nome }), nome).toBeInTheDocument()
    }
  })

  it('imagem pelo botão: escolhe o arquivo, sobe e aparece pela URL assinada; o JSON guarda o caminho', async () => {
    const user = userEvent.setup()
    const { aoMudar, aoEnviarImagem, editor } = tela()
    aoEnviarImagem.mockResolvedValue({ erro: null, caminho: NOSSA })
    const foto = new File(['jpg'], 'foto.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Escolher imagem'), foto)
    await waitFor(() => expect(aoEnviarImagem).toHaveBeenCalledWith(foto))
    await waitFor(() => expect(within(editor).getByRole('img', { name: 'Imagem da descrição' }))
      .toHaveAttribute('src', `https://assinado.local/${NOSSA}?token=t`))
    expect(nos(ultimo(aoMudar)).find((n) => n.type === 'image').attrs.src).toBe(NOSSA)
  })

  it('imagem recusada: o motivo aparece e nada entra', async () => {
    const user = userEvent.setup()
    const { aoMudar, aoEnviarImagem } = tela()
    aoEnviarImagem.mockResolvedValue({ erro: 'Envie uma imagem PNG, JPG, GIF ou WEBP.' })
    await user.upload(screen.getByLabelText('Escolher imagem'), new File(['x'], 'x.png', { type: 'image/png' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Envie uma imagem PNG, JPG, GIF ou WEBP.'))
    expect(aoMudar).not.toHaveBeenCalled()
  })

  it('link pela barra: só http, https e mailto (javascript: é recusado); sem esquema vira https://', async () => {
    const user = userEvent.setup()
    const { aoMudar } = tela()
    await user.click(screen.getByRole('button', { name: 'Link' }))
    const endereco = screen.getByRole('textbox', { name: 'Endereço do link' })
    await user.type(endereco, 'javascript:alert(1){Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Use um endereço que comece com http://, https:// ou mailto:.')
    expect(aoMudar).not.toHaveBeenCalled()
    await user.clear(endereco)
    await user.type(endereco, 'exemplo.com{Enter}')
    await waitFor(() => expect(aoMudar).toHaveBeenCalled())
    expect(marcas(ultimo(aoMudar))).toEqual([
      expect.objectContaining({ texto: 'https://exemplo.com', type: 'link', attrs: expect.objectContaining({ href: 'https://exemplo.com' }) }),
    ])
    expect(screen.queryByRole('textbox', { name: 'Endereço do link' })).not.toBeInTheDocument()
  })
})
