import { useSyncExternalStore } from 'react'
import { Toaster as Sonner } from 'sonner'

// segue a classe .dark do <html> (o botão de tema troca com a página aberta)
const acompanhar = (aviso) => {
  const observador = new MutationObserver(aviso)
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observador.disconnect()
}
const estaEscuro = () => document.documentElement.classList.contains('dark')

function Toaster(props) {
  const escuro = useSyncExternalStore(acompanhar, estaEscuro)
  return (
    <Sonner
      theme={escuro ? 'dark' : 'light'}
      position="bottom-center"
      className="toaster group"
      style={{
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--border-radius': '14px',
      }}
      toastOptions={{ classNames: { toast: 'shadow-lg! font-sans!', title: 'font-semibold!' } }}
      {...props}
    />
  )
}

export { Toaster }
