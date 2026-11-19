import { useMemo } from 'react'
import { CircleAlert } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ContextoDoCampo, juntarIds } from './contextoDoCampo'

// Rótulo + campo dos formulários, com a dica e o erro embaixo (usabilidade, U2; pedido do Diego, 18/11). `id` é o do
// campo de dentro (o rótulo aponta para ele). Com `erro`, a mensagem aparece embaixo, em vermelho, e o campo de dentro
// (Input, Textarea e os de src/components/campos/) ganha sozinho aria-invalid (a borda vermelha) e aria-describedby
// (a dica e o erro). A janela confere tudo ao salvar e mostra os erros de uma vez (useEnvio.conferir).
export default function Campo({ id, rotulo, dica, erro, className, children }) {
  const dicaId = dica ? `${id}-dica` : undefined
  const erroId = erro ? `${id}-erro` : undefined
  const contexto = useMemo(() => ({ id, invalido: Boolean(erro), descritoPor: juntarIds(dicaId, erroId) }), [id, erro, dicaId, erroId])
  return (
    <ContextoDoCampo.Provider value={contexto}>
      <div data-slot="campo" className={cn('grid min-w-0 gap-2', className)}>
        {rotulo && <Label htmlFor={id}>{rotulo}</Label>}
        {children}
        {dica && <p id={dicaId} className="text-legenda text-muted-foreground">{dica}</p>}
        {erro && <ErroDoCampo id={erroId}>{erro}</ErroDoCampo>}
      </div>
    </ContextoDoCampo.Provider>
  )
}

// A mensagem de erro embaixo do campo (também para os blocos que não usam o Campo, como um grupo de horários).
export function ErroDoCampo({ id, children, className }) {
  return (
    <p id={id} data-slot="erro-do-campo" className={cn('text-destructive flex items-start gap-1.5 text-rotulo', className)}>
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}
