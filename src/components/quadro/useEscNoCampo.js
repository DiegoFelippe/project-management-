import { useEffect, useRef } from 'react'

// Esc dentro de uma edição no lugar (título mudado, barra de link, comentário, item do checklist) cancela só ela, sem
// fechar a janela do cartão: a escuta fica na janela do navegador, na captura, para chegar antes do Esc do Radix (como a
// Flutuante dos campos). `area`: ref do campo (ou do bloco) da edição; só vale com o foco lá dentro e `ativo` ligado.
export function useEscNoCampo(area, ativo, aoCancelar) {
  const cancelar = useRef(aoCancelar)
  useEffect(() => {
    cancelar.current = aoCancelar
  })
  useEffect(() => {
    if (!ativo) return undefined
    const tecla = (e) => {
      if (e.key !== 'Escape' || !area.current?.contains(e.target)) return
      e.stopPropagation()
      e.preventDefault()
      cancelar.current()
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [area, ativo])
}
