import { cn } from '@/lib/utils'

const FORMAS = [
  { valor: 'convite', rotulo: 'Enviar convite' },
  { valor: 'senha', rotulo: 'Criar com senha' },
]

// A chave "Enviar convite / Criar com senha" das janelas de criar acesso.
export default function EscolhaForma({ valor, aoMudar, nome = 'forma' }) {
  return (
    <div role="radiogroup" aria-label="Como criar o acesso" className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm font-semibold">
      {FORMAS.map((f) => (
        <label key={f.valor}
          className={cn('cursor-pointer rounded-md py-1.5 text-center text-muted-foreground transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
            valor === f.valor && 'bg-card text-foreground shadow-xs')}>
          <input type="radio" name={nome} value={f.valor} className="sr-only"
            checked={valor === f.valor} onChange={(e) => aoMudar(e.target.value)} />
          {f.rotulo}
        </label>
      ))}
    </div>
  )
}
