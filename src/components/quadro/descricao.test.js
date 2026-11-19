import { describe, expect, it, vi } from 'vitest'
import { criarAssinador, imagemDoCartao, limparDescricao, limparHtmlColado, linkPermitido, normalizarLink } from './descricao'

const PASTA = 'k1/c1/'
const UUID = '0b6f3f5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const NOSSA = `${PASTA}imagens/${UUID}.png`

describe('linkPermitido (o mesmo que o banco confere: só http, https e mailto)', () => {
  it.each(['https://exemplo.com', 'http://exemplo.com/a?b=1', 'HTTPS://EXEMPLO.COM', 'mailto:ana@exemplo.com'])('aceita %s', (href) => {
    expect(linkPermitido(href)).toBe(true)
  })

  it.each([
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', '\njavascript:alert(1)', 'java\tscript:alert(1)',
    '&#106;avascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', '//evil.com', '/relativo',
    'exemplo.com', ' https://exemplo.com', 'https:', 'tel:123', 'ftp://exemplo.com', '', null, undefined, 42,
  ])('recusa %j', (href) => {
    expect(linkPermitido(href)).toBe(false)
  })
})

describe('normalizarLink (o que a pessoa digita na barra de link)', () => {
  it('sem esquema vira https://; e-mail vira mailto:; com esquema aceito fica como veio', () => {
    expect(normalizarLink('exemplo.com/x')).toEqual({ href: 'https://exemplo.com/x' })
    expect(normalizarLink('exemplo.com:8080/x')).toEqual({ href: 'https://exemplo.com:8080/x' })
    expect(normalizarLink('  ana@exemplo.com ')).toEqual({ href: 'mailto:ana@exemplo.com' })
    expect(normalizarLink('http://exemplo.com')).toEqual({ href: 'http://exemplo.com' })
    expect(normalizarLink('mailto:ana@exemplo.com')).toEqual({ href: 'mailto:ana@exemplo.com' })
  })

  it('vazio tira o link; outro esquema é recusado com o motivo', () => {
    expect(normalizarLink('   ')).toEqual({ href: null })
    for (const ruim of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'vbscript:x', 'tel:123']) {
      expect(normalizarLink(ruim), ruim).toEqual({ erro: 'Use um endereço que comece com http://, https:// ou mailto:.' })
    }
  })
})

describe('imagemDoCartao (só imagem enviada para este cartão, no balde)', () => {
  it('aceita o caminho da pasta de imagens deste cartão', () => {
    expect(imagemDoCartao(NOSSA, PASTA)).toBe(true)
    for (const ext of ['jpg', 'jpeg', 'gif', 'webp']) expect(imagemDoCartao(`${PASTA}imagens/${UUID}.${ext}`, PASTA)).toBe(true)
  })

  it.each([
    [`k1/c2/imagens/${UUID}.png`, 'outro cartão'],
    [`k2/c1/imagens/${UUID}.png`, 'outro cliente'],
    [`https://evil.com/${NOSSA}`, 'endereço de fora'],
    ['https://evil.com/x.png', 'endereço de fora'],
    ['data:image/png;base64,AAAA', 'data:'],
    [`${PASTA}imagens/../${UUID}.png`, 'subir pasta'],
    [`${PASTA}imagens/${UUID}.svg`, 'svg'],
    [`${PASTA}imagens/${UUID}.PNG`, 'extensão maiúscula (o banco recusa)'],
    [`${PASTA}${UUID}-anexo.png`, 'anexo, não imagem'],
    [`${NOSSA}?x=1`, 'com consulta'],
    ['', 'vazio'],
    [null, 'nulo'],
  ])('recusa %s (%s)', (src) => {
    expect(imagemDoCartao(src, PASTA)).toBe(false)
  })

  it('a pasta entra como texto (sem virar expressão regular)', () => {
    expect(imagemDoCartao(`k1xc1/imagens/${UUID}.png`, 'k1.c1/')).toBe(false)
  })
})

describe('limparHtmlColado (Word, página da web)', () => {
  it('tira imagem de fora (e conta), mantém imagem deste cartão', () => {
    const { html, imagensDeFora } = limparHtmlColado(
      `<p>a<img src="https://evil.com/x.png"><img src="${NOSSA}"><img src="data:image/png;base64,AA"><img src="k1/c2/imagens/${UUID}.png"></p>`,
      PASTA,
    )
    expect(imagensDeFora).toBe(3)
    expect(html).toContain(`src="${NOSSA}"`)
    expect(html).not.toMatch(/evil|data:|k1\/c2/)
  })

  it('link com esquema recusado vira texto; o aceito fica', () => {
    const { html } = limparHtmlColado(
      '<p><a href="javascript:alert(1)">clique</a> e <a href=" javascript:x">outro</a> e <a href="https://ok.com">ok</a></p>', PASTA,
    )
    expect(html).not.toContain('javascript')
    expect(html).toContain('clique')
    expect(html).toContain('outro')
    expect(html).toContain('<a href="https://ok.com">ok</a>')
  })

  it('tira script, estilo, quadro e formulário, e os atributos de evento; mantém a formatação', () => {
    const { html } = limparHtmlColado(
      '<style>p{color:red}</style><script>alert(1)</script><p onclick="alert(1)"><b>negrito</b> <i>itálico</i></p>'
        + '<iframe src="https://evil.com"></iframe><form><input value="x"></form><svg><script>alert(1)</script></svg>',
      PASTA,
    )
    expect(html).not.toMatch(/script|style>|iframe|form|input|svg|onclick|alert/)
    expect(html).toContain('<b>negrito</b>')
    expect(html).toContain('<i>itálico</i>')
  })

  it('lê o que foi colado num documento à parte (inerte: nada carrega), não num elemento da página', () => {
    const criar = vi.spyOn(document, 'createElement')
    limparHtmlColado('<img src="https://evil.com/x.png" onerror="alert(1)">', PASTA)
    expect(criar).not.toHaveBeenCalled()
    criar.mockRestore()
  })
})

describe('criarAssinador (as imagens de uma descrição num pedido só)', () => {
  it('junta os caminhos pedidos juntos num pedido e guarda o link', async () => {
    const assinarVarios = vi.fn(async (caminhos) => ({ urls: Object.fromEntries(caminhos.map((c) => [c, `https://assinado/${c}`])) }))
    const assinar = criarAssinador(assinarVarios)
    const [a, b] = await Promise.all([assinar('k1/c1/imagens/a.png'), assinar('k1/c1/imagens/b.png'), assinar('k1/c1/imagens/a.png')])
    expect(a).toBe('https://assinado/k1/c1/imagens/a.png')
    expect(b).toBe('https://assinado/k1/c1/imagens/b.png')
    expect(assinarVarios).toHaveBeenCalledTimes(1)
    expect(assinarVarios).toHaveBeenCalledWith(['k1/c1/imagens/a.png', 'k1/c1/imagens/b.png'])
    expect(await assinar('k1/c1/imagens/a.png')).toBe('https://assinado/k1/c1/imagens/a.png')
    expect(assinarVarios).toHaveBeenCalledTimes(1)
  })

  it('o link guardado vence antes da hora do link (1 h): depois da validade, pede de novo', async () => {
    let agora = 0
    const assinarVarios = vi.fn(async (caminhos) => ({ urls: Object.fromEntries(caminhos.map((c) => [c, `https://assinado/${c}?v=${agora}`])) }))
    const assinar = criarAssinador(assinarVarios, { validade: 50 * 60 * 1000, agora: () => agora })
    expect(await assinar('a')).toBe('https://assinado/a?v=0')
    agora = 49 * 60 * 1000
    expect(await assinar('a')).toBe('https://assinado/a?v=0')
    expect(assinarVarios).toHaveBeenCalledTimes(1)
    agora = 51 * 60 * 1000
    expect(await assinar('a')).toBe(`https://assinado/a?v=${51 * 60 * 1000}`)
    expect(assinarVarios).toHaveBeenCalledTimes(2)
  })

  it('esquecer(caminho) tira o link guardado (a imagem não abriu: pede um novo)', async () => {
    const assinarVarios = vi.fn(async (caminhos) => ({ urls: Object.fromEntries(caminhos.map((c) => [c, `https://assinado/${c}`])) }))
    const assinar = criarAssinador(assinarVarios)
    await assinar('a')
    assinar.esquecer('a')
    await assinar('a')
    expect(assinarVarios).toHaveBeenCalledTimes(2)
  })

  it('o caminho sem link (ou com erro) dá null e é pedido de novo depois', async () => {
    const assinarVarios = vi.fn()
      .mockResolvedValueOnce({ urls: {} })
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce({ urls: { x: 'https://x' } })
    const assinar = criarAssinador(assinarVarios)
    expect(await assinar('x')).toBeNull()
    expect(await assinar('x')).toBeNull()
    expect(await assinar('x')).toBe('https://x')
    expect(assinarVarios).toHaveBeenCalledTimes(3)
  })
})

describe('limparDescricao (o JSON do editor antes de gravar)', () => {
  const texto = (t, marks) => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t })
  const doc = (...content) => ({ type: 'doc', content })

  it('tira imagem que não é deste cartão e a marca de link com esquema recusado (o texto fica)', () => {
    const entrada = doc(
      { type: 'paragraph', content: [texto('a', [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }]), texto('b', [{ type: 'link', attrs: { href: 'https://ok.com' } }])] },
      { type: 'image', attrs: { src: 'https://evil.com/x.png' } },
      { type: 'image', attrs: { src: NOSSA, alt: null } },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'data:image/png;base64,AA' } }] }] }] },
    )
    expect(limparDescricao(entrada, PASTA)).toEqual(doc(
      { type: 'paragraph', content: [texto('a', [{ type: 'bold' }]), texto('b', [{ type: 'link', attrs: { href: 'https://ok.com' } }])] },
      { type: 'image', attrs: { src: NOSSA, alt: null } },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [] }] }] },
    ))
  })

  it('nulo continua nulo; o que já está certo volta igual', () => {
    expect(limparDescricao(null, PASTA)).toBeNull()
    const certo = doc({ type: 'paragraph', content: [texto('oi', [{ type: 'link', attrs: { href: 'mailto:a@b.com' } }])] })
    expect(limparDescricao(certo, PASTA)).toEqual(certo)
  })
})
