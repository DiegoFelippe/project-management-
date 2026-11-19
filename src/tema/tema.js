// Tema do app: 'sistema' (segue o computador), 'claro' ou 'escuro'. A escolha fica neste navegador
// (vale também na tela de login) e, com a pessoa logada, no perfil dela: ao entrar em outro computador,
// o tema salvo no perfil vira o padrão de lá. O index.html aplica o tema antes de a página aparecer.
export const CHAVE_TEMA = 'consultoria:tema'
export const TEMAS = ['sistema', 'claro', 'escuro']
// Cor da barra da janela do app instalado (e da barra do navegador no celular): a mesma da moldura
// (--moldura no src/index.css). O index.html usa os mesmos valores antes de a página aparecer.
export const COR_DA_BARRA = { claro: '#ffffff', escuro: '#0e1424' }

export function lerTema() {
  try {
    const tema = localStorage.getItem(CHAVE_TEMA)
    return TEMAS.includes(tema) ? tema : 'sistema'
  } catch {
    return 'sistema'
  }
}

export function guardarTema(tema) {
  try {
    localStorage.setItem(CHAVE_TEMA, tema)
  } catch {
    // navegador sem armazenamento: vale só nesta visita
  }
}

export function escuroAtivo(tema) {
  return tema === 'escuro' || (tema === 'sistema' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches))
}

export function aplicarTema(tema) {
  const escuro = escuroAtivo(tema)
  document.documentElement.classList.toggle('dark', escuro)
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
  }
  meta.content = escuro ? COR_DA_BARRA.escuro : COR_DA_BARRA.claro
}

// Avisa os botões de tema abertos quando o tema muda por fora (ex.: o salvo no perfil, ao entrar).
export const EVENTO_TEMA = 'consultoria:tema'

export function adotarTemaDoPerfil(tema) {
  if (!TEMAS.includes(tema)) return
  guardarTema(tema)
  aplicarTema(tema)
  window.dispatchEvent(new CustomEvent(EVENTO_TEMA, { detail: tema }))
}
