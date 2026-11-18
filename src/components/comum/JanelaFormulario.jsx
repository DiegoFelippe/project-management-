import { createContext, useContext, useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, XIcon } from 'lucide-react'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const LARGURAS = { md: 'sm:max-w-[min(32rem,calc(100%-2rem))]', lg: 'sm:max-w-[min(42rem,calc(100%-2rem))]', xl: 'sm:max-w-[min(56rem,calc(100%-2rem))]', '5xl': 'sm:max-w-[min(64rem,calc(100%-2rem))]', '7xl': 'sm:max-w-[min(80rem,calc(100%-2rem))]' }

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
// Rodapé padrão (auditoria, C3): com `rotuloEnviar`, a janela monta Cancelar (outline, chama aoFechar) + o botão
// principal, que mostra `rotuloEnviando` ("Salvando…" se não vier) enquanto `enviando`. O principal envia o <form> do
// corpo pelo id (`form`, como type="submit", então o Enter nos campos também envia) ou, sem `form`, é um botão comum
// que chama `aoEnviar`; `envioDesabilitado` o desliga (ex.: nada escolhido ainda). `rodape` fica para os rodapés
// diferentes (Fechar, Testar, a mensagem do modelo...) e vence o padrão.
// Convenção de envio: enquanto `enviando`, Esc e X não fecham e os botões do rodapé ficam desabilitados. O componente
// mostra o spinner e marca aria-busy.
// Erros dos campos (usabilidade, U2): `erros` é o objeto do useEnvio ({ campo: mensagem }); cada vez que ele muda e tem
// algum erro (cada Salvar conferido cria um objeto novo), o foco vai para o primeiro campo marcado (aria-invalid) do
// corpo, na ordem da tela. As mensagens ficam embaixo de cada campo (Campo, de src/components/campos/).
// Pergunta ao descartar (usabilidade, U4): com `alterado` (cada janela compara o que está na tela com o que abriu),
// Cancelar, Esc e o X perguntam "Descartar o que você digitou?" (Continuar editando / Descartar) antes de chamar
// `aoFechar`. O sucesso fecha sem perguntar (o useEnvio chama o `aoFechar` da janela direto). Num `rodape` diferente,
// o Cancelar é o `BotaoCancelar`, que passa pela mesma pergunta. Enquanto envia, nada fecha nem pergunta.
const ContextoDaJanela = createContext(null)

export default function JanelaFormulario({
  aberto, aoFechar, titulo, descricao, icone: Icone, largura = 'md', rodape, abas, alturaFixa = false, acaoEsquerda, enviando = false,
  rotuloEnviar, rotuloEnviando = 'Salvando…', form, aoEnviar, envioDesabilitado = false, erros, alterado = false, children,
}) {
  const corpo = useRef(null)
  const [confirmando, setConfirmando] = useState(false)

  // Cancelar, Esc e o X: com algo digitado, pergunta antes; enquanto envia, nada.
  function pedirParaFechar() {
    if (enviando) return
    if (alterado) setConfirmando(true)
    else aoFechar()
  }

  useEffect(() => {
    if (!erros || Object.keys(erros).length === 0) return
    corpo.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [erros])

  // Ao abrir, o foco vai para o primeiro campo do corpo (e não para o X do cabeçalho, onde um Enter fecharia a janela).
  function focarPrimeiroCampo(e) {
    const campo = corpo.current?.querySelector(CAMPO) ?? corpo.current?.querySelector(FOCAVEL)
    if (!campo) return
    e.preventDefault()
    campo.focus()
  }
  const botoes = rodape ?? (rotuloEnviar && (
    <>
      <BotaoCancelar />
      <Button type={form ? 'submit' : 'button'} form={form} onClick={form ? undefined : aoEnviar} disabled={enviando || envioDesabilitado}>
        {enviando ? rotuloEnviando : rotuloEnviar}
      </Button>
    </>
  ))
  return (
    <ContextoDaJanela.Provider value={{ pedirParaFechar, enviando }}>
      <DialogPrimitive.Root open={aberto} onOpenChange={(abrir) => !abrir && pedirParaFechar()}>
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
                <span data-slot="janela-icone" className="bg-primary/10 text-primary-texto grid size-10 shrink-0 place-items-center rounded-xl">
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
            {(botoes || acaoEsquerda) && (
              <footer data-slot="janela-rodape" className="bg-muted/40 flex items-center justify-end gap-2 rounded-b-2xl border-t px-6 py-3.5">
                {acaoEsquerda && <div className="mr-auto">{acaoEsquerda}</div>}
                {enviando && <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />}
                {botoes}
              </footer>
            )}
          </DialogPrimitive.Content>
        </DialogPortal>
      </DialogPrimitive.Root>
      {aberto && confirmando && !enviando && (
        <ConfirmarAcao aberto aoFechar={() => setConfirmando(false)} titulo="Descartar o que você digitou?"
          descricao="O que você digitou nesta janela se perde: nada foi salvo." rotuloConfirmar="Descartar" rotuloCancelar="Continuar editando"
          aoConfirmar={() => { setConfirmando(false); aoFechar(); return { erro: null } }} />
      )}
    </ContextoDaJanela.Provider>
  )
}

// O Cancelar do rodapé (o padrão e os rodapés diferentes): passa pela pergunta de descartar e fica desligado enquanto
// a janela envia.
export function BotaoCancelar({ children = 'Cancelar' }) {
  const janela = useContext(ContextoDaJanela)
  return <Button type="button" variant="outline" onClick={janela?.pedirParaFechar} disabled={janela?.enviando}>{children}</Button>
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

// O cartão de uma seção (o mesmo canto e borda dos cartões de opção): um bloco só por seção. Com linhas
// (chave, situação), passe `divide-y overflow-hidden` e cada linha traz o próprio `px-3 py-2.5`; com campos, `p-3`.
export function CartaoDaSecao({ className, children, ...props }) {
  return <div data-slot="cartao-secao" className={cn('bg-card rounded-xl border', className)} {...props}>{children}</div>
}
