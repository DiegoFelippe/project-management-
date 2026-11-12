// Tema do app: 'sistema' (segue o computador), 'claro' ou 'escuro'. A escolha fica neste navegador.
// O index.html aplica o tema antes de a página aparecer, para não piscar claro.
export const CHAVE_TEMA = 'consultoria:tema'
export const TEMAS = ['sistema', 'claro', 'escuro']

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
  document.documentElement.classList.toggle('dark', escuroAtivo(tema))
}
