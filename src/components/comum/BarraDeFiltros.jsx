import { Children, useState, useSyncExternalStore } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import BarraDaPagina from './BarraDaPagina'

// Celular = abaixo de 640 px (o `sm` do Tailwind). Pergunta pelo largo (min-width), como as outras telas, e sem
// matchMedia (testes) fica no computador.
const LARGO = '(min-width: 640px)'
const consulta = () => (typeof window.matchMedia === 'function' ? window.matchMedia(LARGO) : null)
const assinar = (aviso) => {
  const c = consulta()
  c?.addEventListener?.('change', aviso)
  return () => c?.removeEventListener?.('change', aviso)
}
const noCelular = () => consulta()?.matches === false

const plural = (n) => `${n} ${n === 1 ? 'ativo' : 'ativos'}`

// Os campos que, no celular, vão para a gaveta de baixo (no computador ficam na barra, no lugar onde estão). Tem de ser
// filho direto da BarraDeFiltros.
export function NaGaveta({ children }) {
  return children
}

// A gaveta de baixo do celular (auditoria, G6): os campos um embaixo do outro, com o rótulo em cima e a largura toda, e
// no rodapé Limpar (desligado sem filtro ativo) e Ver resultados (os filtros valem na hora; ele só fecha a gaveta).
// `data-slot="dialog-content"`: as listas dos campos (Flutuante) abrem dentro da janela do Radix, que prende o foco.
function Gaveta({ aberta, aoMudar, ativos, aoLimpar, children }) {
  return (
    <Sheet open={aberta} onOpenChange={aoMudar}>
      <SheetContent side="bottom" data-slot="dialog-content" className="bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="border-b px-4 pt-4 pb-3">
          <SheetTitle className="text-janela font-bold">Filtros</SheetTitle>
          <SheetDescription className="text-rotulo">Os filtros valem na hora.</SheetDescription>
        </div>
        <div className={cn('flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4',
          '[&>*]:w-full [&_div:has(>label)]:flex-col [&_div:has(>label)]:items-stretch [&_div:has(>label)]:gap-1.5 [&_label+div]:w-full')}>
          {children}
        </div>
        <div className="flex gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" className="flex-1" disabled={!aoLimpar || ativos === 0} onClick={aoLimpar}>Limpar</Button>
          <Button type="button" className="flex-1" onClick={() => aoMudar(false)}>Ver resultados</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Cartão (BarraDaPagina) que reúne, nesta ordem, o rótulo "Filtros" (ícone + texto, sempre, como no Calendário), as abas,
// a busca, os filtros pequenos e a ação principal (no fim, à direita).
// No celular (auditoria, G6; pedido do Diego, 17/11), os filhos marcados com NaGaveta saem da barra e vão para uma gaveta
// de baixo, e o rótulo vira o botão que a abre: "Filtros" ou "Filtros (2 ativos)". A busca e a ação principal ficam à
// vista. `ativos`: quantos filtros da gaveta estão fora do padrão (a tela conta); `aoLimpar`: volta todos ao padrão.
export default function BarraDeFiltros({ children, className, ativos = 0, aoLimpar }) {
  const celular = useSyncExternalStore(assinar, noCelular, () => false)
  const [aberta, setAberta] = useState(false)
  const filhos = Children.toArray(children)
  const daGaveta = filhos.filter((filho) => filho.type === NaGaveta)
  const comGaveta = celular && daGaveta.length > 0

  if (!comGaveta) {
    return (
      <BarraDaPagina className={className}>
        <span className="inline-flex items-center gap-1.5 text-rotulo font-semibold text-foreground/80">
          <SlidersHorizontal className="size-3.5 text-primary-texto" aria-hidden="true" /> Filtros
        </span>
        {children}
      </BarraDaPagina>
    )
  }

  return (
    <BarraDaPagina className={className}>
      <Button type="button" variant="outline" size="sm" aria-haspopup="dialog" aria-expanded={aberta} onClick={() => setAberta(true)}
        className={cn(ativos > 0 && 'border-primary/40 bg-accent text-accent-foreground')}>
        <SlidersHorizontal className="text-primary-texto" aria-hidden="true" />
        <span>Filtros</span>
        {ativos > 0 && <>{' '}<span className="-ml-0.5 tabular-nums">({plural(ativos)})</span></>}
      </Button>
      {filhos.filter((filho) => filho.type !== NaGaveta)}
      <Gaveta aberta={aberta} aoMudar={setAberta} ativos={ativos} aoLimpar={aoLimpar}>{daGaveta}</Gaveta>
    </BarraDaPagina>
  )
}

// Busca com lupa. `rotulo` é o nome acessível do campo. No celular ela encolhe para caber ao lado do botão Filtros.
export function CampoBusca({ rotulo, placeholder, valor, aoMudar }) {
  return (
    <div className="relative max-w-xs flex-1 max-sm:min-w-32 sm:min-w-48">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input type="search" aria-label={rotulo} placeholder={placeholder} className="pl-9" value={valor}
        onChange={(e) => aoMudar(e.target.value)} />
    </div>
  )
}

// Ação principal da barra (botão azul): vai para o fim da linha.
export function AcaoPrincipal({ children, className }) {
  return <div className={cn('ml-auto flex items-center gap-2', className)}>{children}</div>
}
