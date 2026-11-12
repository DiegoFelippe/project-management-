import { Toaster as Sonner } from 'sonner'

function Toaster(props) {
  return (
    <Sonner
      theme="light"
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
