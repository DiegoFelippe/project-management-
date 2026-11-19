// Descrição do cartão (editor TipTap): o que entra e o que fica de fora. O banco confere de novo a cada gravação
// (private.erro_na_descricao, migração 20261117125011_quadro_anexos.sql): link só http, https ou mailto; imagem só a
// enviada para este cartão, guardada pelo caminho no balde "quadros" (o link assinado é feito na hora de mostrar e nunca
// entra no JSON).

const ESQUEMAS = new Set(['http:', 'https:', 'mailto:'])
export const LINK_RECUSADO = 'Use um endereço que comece com http://, https:// ou mailto:.'

// Link aceito: começa (sem nada antes, como o banco confere) por http:, https: ou mailto: e é um endereço válido com um
// desses esquemas. javascript:, data:, endereço relativo e as formas disfarçadas (espaço, tab ou quebra antes ou no meio
// do esquema, entidade HTML) ficam de fora. Vale ao digitar, ao colar e ao mostrar.
export function linkPermitido(href) {
  if (typeof href !== 'string' || !/^(https?|mailto):/i.test(href)) return false
  try {
    return ESQUEMAS.has(new URL(href).protocol)
  } catch {
    return false
  }
}

// O que a pessoa digitou na barra de link: vazio tira o link ({ href: null }); com esquema, só os aceitos; sem esquema,
// e-mail vira mailto: e o resto, https://. { href } ou { erro }.
export function normalizarLink(texto) {
  const limpo = String(texto ?? '').trim()
  if (!limpo) return { href: null }
  // "algo:" no começo é um esquema, menos "exemplo.com:8080" e "localhost:3000" (endereço com porta).
  const comPorta = /^([^\s:/]+\.[^\s:/]+|localhost):\d/i.test(limpo)
  const comEsquema = !comPorta && /^[a-z][a-z0-9+.-]*:/i.test(limpo)
  const href = comEsquema ? limpo : /^[^\s/@:]+@[^\s/@:]+\.[^\s/@:]+$/.test(limpo) ? `mailto:${limpo}` : `https://${limpo}`
  return linkPermitido(href) ? { href } : { erro: LINK_RECUSADO }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const escapar = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Imagem da descrição deste cartão: `<pasta do quadro>/<cartao>/imagens/<uuid>.<png|jpg|jpeg|gif|webp>`, a mesma forma
// que o banco aceita. `pasta` = `<pasta do quadro>/<cartao>/` (pastaDoQuadro: `<cliente>` ou `quadro/<id>`).
export function imagemDoCartao(src, pasta) {
  if (typeof src !== 'string' || !pasta) return false
  return new RegExp(`^${escapar(pasta)}imagens/${UUID}\\.(png|jpg|jpeg|gif|webp)$`).test(src)
}

// Elementos que nunca viram texto formatado (o editor também os ignora; aqui saem antes, por garantia).
const PERIGOSOS = 'script, style, link, meta, base, iframe, frame, frameset, object, embed, applet, template, noscript, '
  + 'svg, math, form, input, button, select, textarea, video, audio, source, track, canvas, dialog'

// HTML colado (Word, Google Docs, página da web) antes de o editor ler: tira o que é perigoso, as imagens que não são
// deste cartão (nunca são baixadas nem guardadas: o documento é lido à parte, sem carregar nada) e os links com esquema
// recusado (o texto fica). Os estilos ficam: o editor só lê deles negrito, itálico etc. { html, imagensDeFora }.
export function limparHtmlColado(html, pasta) {
  const documento = new DOMParser().parseFromString(String(html ?? ''), 'text/html')
  const corpo = documento.body
  corpo.querySelectorAll(PERIGOSOS).forEach((el) => el.remove())
  let imagensDeFora = 0
  for (const img of corpo.querySelectorAll('img')) {
    if (imagemDoCartao(img.getAttribute('src'), pasta)) continue
    img.remove()
    imagensDeFora += 1
  }
  for (const a of corpo.querySelectorAll('a')) {
    if (!linkPermitido(a.getAttribute('href'))) a.replaceWith(...a.childNodes)
  }
  for (const el of corpo.querySelectorAll('*')) {
    for (const { name } of [...el.attributes]) if (/^on/i.test(name)) el.removeAttribute(name)
  }
  return { html: corpo.innerHTML, imagensDeFora }
}

// O JSON do editor antes de gravar (a última garantia na tela; o banco recusa do mesmo jeito): sai a imagem que não é
// deste cartão e a marca de link com esquema recusado (o texto do link fica). Nulo continua nulo.
export function limparDescricao(no, pasta) {
  if (!no || typeof no !== 'object') return no ?? null
  const limpo = { ...no }
  if (Array.isArray(no.marks)) {
    limpo.marks = no.marks.filter((m) => m?.type !== 'link' || linkPermitido(m.attrs?.href))
    if (!limpo.marks.length) delete limpo.marks
  }
  if (Array.isArray(no.content)) {
    limpo.content = no.content
      .filter((filho) => filho?.type !== 'image' || imagemDoCartao(filho.attrs?.src, pasta))
      .map((filho) => limparDescricao(filho, pasta))
  }
  return limpo
}

// Assina os caminhos das imagens em lotes (os pedidos na mesma volta vão juntos num pedido só, sem um pedido por imagem)
// e guarda o link de cada caminho por `validade` (50 min: o link do balde vale 1 h; depois disso, pede outro).
// `assinarVarios(caminhos)` → { urls: { [caminho]: url } } (urlsAssinadas). Devolve `assinar(caminho)` →
// Promise<url | null>; o caminho que não ganhou link é pedido de novo na próxima vez, e `assinar.esquecer(caminho)` tira
// o link guardado (a imagem não abriu com ele).
export const VALIDADE_DO_LINK_GUARDADO = 50 * 60 * 1000

export function criarAssinador(assinarVarios, { validade = VALIDADE_DO_LINK_GUARDADO, agora = Date.now } = {}) {
  const links = new Map() // caminho → { promessa, vence }
  let lote = null
  function assinar(caminho) {
    const guardado = links.get(caminho)
    if (guardado && agora() < guardado.vence) return guardado.promessa
    if (!lote) {
      const este = new Map()
      lote = este
      setTimeout(async () => {
        lote = null
        let urls = {}
        try {
          urls = (await assinarVarios([...este.keys()]))?.urls ?? {}
        } catch {
          urls = {}
        }
        for (const [c, resolver] of este) {
          if (!urls[c]) links.delete(c)
          resolver(urls[c] ?? null)
        }
      }, 0)
    }
    const pendente = lote.has(caminho) ? null : new Promise((resolver) => lote.set(caminho, resolver))
    const promessa = pendente ?? links.get(caminho).promessa
    links.set(caminho, { promessa, vence: agora() + validade })
    return promessa
  }
  assinar.esquecer = (caminho) => links.delete(caminho)
  return assinar
}
