import { useEffect, useState } from 'react'

// O navegador avisa (beforeinstallprompt) quando o app pode ser instalado; guardamos o aviso
// para abrir a janela de instalar quando a pessoa clicar em "Instalar app".
export function useInstalar() {
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    const aoPoder = (evento) => {
      evento.preventDefault()
      setAviso(evento)
    }
    const aoInstalar = () => setAviso(null)
    window.addEventListener('beforeinstallprompt', aoPoder)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', aoPoder)
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [])

  async function instalar() {
    if (!aviso) return
    await aviso.prompt()
    await aviso.userChoice?.catch(() => null)
    setAviso(null) // o aviso só vale uma vez
  }

  return { podeInstalar: Boolean(aviso), instalar }
}
