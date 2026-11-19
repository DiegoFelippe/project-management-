import { useEffect } from 'react'

// O que está sendo arrastado tem arquivo (e não só texto ou um trecho da página)?
export const temArquivos = (evento) => Array.from(evento.dataTransfer?.types ?? []).includes('Files')

// Enquanto a janela do cartão está aberta, arquivo solto fora de onde ele é aceito (a área de Anexos de quem mexe, a
// descrição para imagens) não abre no lugar do app: o navegador trocaria a página e o que não foi salvo se perderia. Quem
// aceita o arquivo cancela o padrão primeiro; aqui só se barra o resto (cursor de "não pode" ao arrastar por cima).
export function useArquivosSoltos() {
  useEffect(() => {
    const sobre = (e) => {
      if (!temArquivos(e) || e.defaultPrevented) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    }
    const soltar = (e) => {
      if (temArquivos(e)) e.preventDefault()
    }
    window.addEventListener('dragover', sobre)
    window.addEventListener('drop', soltar)
    return () => {
      window.removeEventListener('dragover', sobre)
      window.removeEventListener('drop', soltar)
    }
  }, [])
}
