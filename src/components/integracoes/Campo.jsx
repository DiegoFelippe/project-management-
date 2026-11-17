import { Label } from '@/components/ui/label'

// Rótulo + campo dos formulários de integração, com uma dica opcional embaixo (ligada ao campo por aria-describedby).
export default function Campo({ id, rotulo, dica, children }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {dica && <p id={`${id}-dica`} className="text-legenda text-muted-foreground">{dica}</p>}
    </div>
  )
}
