// Tema do app: 'sistema' (segue o computador), 'claro' ou 'escuro'. A escolha fica neste navegador.
// O index.html aplica o tema antes de a página aparecer, para não piscar claro.
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
