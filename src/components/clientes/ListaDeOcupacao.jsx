import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarOcupacao } from '@/lib/horas'
import { sugestaoDe } from './rotulos'

function Barra({ ocupacao }) {
  const n = Number(ocupacao)
  const cheia = !Number.isNaN(n) && n > 1
  const largura = ocupacao === null || ocupacao === undefined || Number.isNaN(n) ? 0 : Math.min(n, 1) * 100
  return (
    <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${cheia ? 'bg-notice' : 'bg-primary'}`} style={{ width: `${largura}%` }} />
    </div>
  )
}

// Opções em rádio com barra de ocupação. itens: { id, nome, ocupacao, ... }; aoEscolher recebe o item inteiro.
export default function ListaDeOcupacao({
  itens, total, escolhido, aoEscolher, aoMostrarMais, rotuloDoValor, atualId, semSugestao = false, carregandoMais = false,
}) {
  const sugestao = semSugestao ? null : sugestaoDe(itens, atualId)
  const rotulo = rotuloDoValor ?? ((i) => formatarOcupacao(i.ocupacao))
  return (
    <div>
      <div role="radiogroup" aria-label="Opções" className="grid gap-2">
        {itens.map((item) => (
          <label key={item.id}
            className={`grid gap-1.5 rounded-lg border p-3 transition-colors has-[:disabled]:opacity-60 ${
              item.id === escolhido ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/40'
            } ${item.id === atualId ? 'cursor-default' : 'cursor-pointer'}`}>
            <span className="flex items-center gap-3">
              <input type="radio" name="opcao-de-ocupacao" className="size-4 accent-primary" checked={item.id === escolhido}
                disabled={item.id === atualId} onChange={() => aoEscolher(item)} />
              <span className="min-w-0 flex-1 truncate font-semibold">{item.nome}</span>
              {item.id === sugestao?.id && (
                <Badge variant="default"><Sparkles /> Sugestão: menor ocupação</Badge>
              )}
              {item.id === atualId && <Badge variant="secondary">Atual</Badge>}
              <span className="text-sm tabular-nums text-muted-foreground">{rotulo(item)}</span>
            </span>
            <Barra ocupacao={item.ocupacao} />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>Mostrando {itens.length.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}</span>
        {itens.length < total && (
          <Button type="button" variant="outline" size="sm" disabled={carregandoMais} onClick={aoMostrarMais}>Mostrar mais</Button>
        )}
      </div>
    </div>
  )
}
