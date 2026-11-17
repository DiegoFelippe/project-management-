import { useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, XIcon } from 'lucide-react'
import { DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const LARGURAS = { md: 'sm:max-w-[min(32rem,calc(100%-2rem))]', lg: 'sm:max-w-[min(42rem,calc(100%-2rem))]', xl: 'sm:max-w-[min(56rem,calc(100%-2rem))]', '5xl': 'sm:max-w-[min(64rem,calc(100%-2rem))]' }

// Primeiro foco do corpo da janela: de preferência um campo de digitar/escolher (no CampoNumero, o botão
// "Diminuir" vem antes do número e um Enter nele diminuiria o valor); só então o primeiro focável.
const CAMPO = 'input:not([disabled]):not([type="hidden"]):not([type="file"]), textarea:not([disabled]), [role="combobox"]:not([disabled]), [aria-haspopup]:not([disabled])'
const FOCAVEL = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Padrão Hub: todo formulário é uma janela. Cabeçalho (ícone, título, descrição, fechar), corpo rolável e
// rodapé à direita. Esc e o X fecham; clique fora NÃO fecha (para não perder o que foi digitado).
// No celular a janela encosta embaixo (bottom sheet).
// Opcionais (fichas grandes, como a da pessoa): `abas` (um controle de abas, numa faixa abaixo do título),
// `alturaFixa` (no desktop a janela tem altura fixa e só o corpo rola, então trocar de aba não muda o tamanho)
// e `acaoEsquerda` (botão à esquerda do rodapé, ex.: Desativar).
// Convenção de envio: enquanto `enviando`, Esc e X não fecham, e o botão principal que quem chama põe no
// `rodape` mostra "Salvando…" (e fica desabilitado). O componente só mostra o spinner e marca aria-busy.
export default function JanelaFormulario({ aberto, aoFechar, titulo, descricao, icone: Icone, largura = 'md', rodape, abas, alturaFixa = false, acaoEsquerda, enviando = false, children }) {
  const corpo = useRef(null)
  // Ao abrir, o foco vai para o primeiro campo do corpo (e não para o X do cabeçalho, onde um Enter fecharia a janela).
  function focarPrimeiroCampo(e) {
    const campo = corpo.current?.querySelector(CAMPO) ?? corpo.current?.querySelector(FOCAVEL)
    if (!campo) return
    e.preventDefault()
    campo.focus()
  }
  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={(abrir) => !abrir && !enviando && aoFechar()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="janela-formulario"
          aria-busy={enviando || undefined}
          onOpenAutoFocus={focarPrimeiroCampo}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => enviando && e.preventDefault()}
          {...(descricao ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'bg-card fixed z-50 flex w-full flex-col border shadow-[var(--shadow-modal)] duration-200',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'inset-x-0 bottom-0 max-h-[95dvh] rounded-t-2xl data-[state=open]:slide-in-from-bottom-8',
            'sm:inset-auto sm:top-[50%] sm:left-[50%] sm:max-h-[calc(100dvh-2rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:data-[state=open]:zoom-in-95',
            LARGURAS[largura] ?? LARGURAS.md,
            alturaFixa && 'sm:h-[min(760px,calc(100dvh-2rem))]',
          )}
        >
          <header className={cn('flex items-start gap-3 rounded-t-2xl px-6 py-4', abas ? 'pb-3' : 'border-b')}>
            {Icone && (
              <span data-slot="janela-icone" className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                <Icone className="size-5" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-janela font-bold">{titulo}</DialogTitle>
              {descricao && <DialogDescription className="mt-0.5 text-rotulo">{descricao}</DialogDescription>}
            </div>
            <DialogPrimitive.Close disabled={enviando} className="botao-animado text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 grid size-8 shrink-0 place-items-center rounded-lg transition-[color,background-color,translate,scale] duration-150 outline-none hover:-translate-y-px focus-visible:ring-[3px] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4">
              <XIcon />
              <span className="sr-only">Fechar</span>
            </DialogPrimitive.Close>
          </header>
          {abas && <div data-slot="janela-abas" className="border-b px-6 pb-3">{abas}</div>}
          <div ref={corpo} data-slot="janela-corpo" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">{children}</div>
          {(rodape || acaoEsquerda) && (
            <footer data-slot="janela-rodape" className="bg-muted/40 flex items-center justify-end gap-2 rounded-b-2xl border-t px-6 py-3.5">
              {acaoEsquerda && <div className="mr-auto">{acaoEsquerda}</div>}
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
