import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, XIcon } from 'lucide-react'
import { DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const LARGURAS = { md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }

// Padrão Hub: todo formulário é uma janela. Cabeçalho (ícone, título, descrição, fechar), corpo rolável e
// rodapé à direita. Esc e o X fecham; clique fora NÃO fecha (para não perder o que foi digitado).
// No celular a janela encosta embaixo (bottom sheet).
export default function JanelaFormulario({ aberto, aoFechar, titulo, descricao, icone: Icone, largura = 'md', rodape, enviando = false, children }) {
  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="janela-formulario"
          aria-busy={enviando || undefined}
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            'bg-card fixed z-50 flex w-full flex-col overflow-hidden border shadow-[var(--shadow-modal)] duration-200',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'inset-x-0 bottom-0 max-h-[95dvh] rounded-t-2xl data-[state=open]:slide-in-from-bottom-8',
            'sm:inset-auto sm:top-[50%] sm:left-[50%] sm:max-h-[calc(100dvh-2rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:data-[state=open]:zoom-in-95',
            LARGURAS[largura] ?? LARGURAS.md,
          )}
        >
          <header className="flex items-start gap-3 border-b px-6 py-4">
            {Icone && (
              <span data-slot="janela-icone" className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                <Icone className="size-5" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[15px] leading-tight font-bold tracking-normal [font-stretch:100%]">{titulo}</DialogTitle>
              {descricao && <DialogDescription className="mt-0.5 text-[12.5px]">{descricao}</DialogDescription>}
            </div>
            <DialogPrimitive.Close className="botao-animado text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 grid size-8 shrink-0 place-items-center rounded-lg transition-[color,background-color,translate,scale] duration-150 outline-none hover:-translate-y-px focus-visible:ring-[3px] active:scale-[0.97] [&_svg]:size-4">
              <XIcon />
              <span className="sr-only">Fechar</span>
            </DialogPrimitive.Close>
          </header>
          <div data-slot="janela-corpo" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">{children}</div>
          {rodape && (
            <footer data-slot="janela-rodape" className="bg-muted/40 flex items-center justify-end gap-2 border-t px-6 py-3.5">
              {enviando && <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />}
              {rodape}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}

// Seção do formulário: rótulo pequeno em maiúsculas e os campos embaixo.
export function SecaoFormulario({ titulo, className, children }) {
  return (
    <section data-slot="secao-formulario" className={cn('space-y-3', className)}>
      {titulo && <h3 className="section-label">{titulo}</h3>}
      {children}
    </section>
  )
}
