// Padrão das listas do app (regras no CLAUDE.md): tabela em cartão, uma linha por item e, na última
// coluna, as ações da linha (Editar abre o formulário com aquele item já preenchido). Acima de 15
// registros, a paginação (feita no banco) aparece embaixo da tabela.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { POR_PAGINA } from '@/data/paginar'
import { cn } from '@/lib/utils'

const numero = (n) => n.toLocaleString('pt-BR')

export function Paginacao({ pagina, total, porPagina = POR_PAGINA, aoMudar }) {
  if (total <= porPagina) return null
  const paginas = Math.ceil(total / porPagina)
  const de = (pagina - 1) * porPagina + 1
  const ate = Math.min(total, pagina * porPagina)
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-sm text-muted-foreground">
      <p className="tabular-nums">{numero(de)}–{numero(ate)} de {numero(total)}</p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={pagina <= 1} onClick={() => aoMudar(pagina - 1)}>
          <ChevronLeft /> Anterior
        </Button>
        <span className="px-2 tabular-nums">Página {numero(pagina)} de {numero(paginas)}</span>
        <Button variant="ghost" size="sm" disabled={pagina >= paginas} onClick={() => aoMudar(pagina + 1)}>
          Próxima <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}

export function Tabela({ rotulo, colunas, larguraMinima = 720, paginacao, children }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table aria-label={rotulo} className="w-full text-left text-sm" style={{ minWidth: larguraMinima }}>
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {colunas.map((coluna) => (
                <th key={coluna} className="px-4 py-2.5 font-medium">{coluna}</th>
              ))}
              <th className="px-4 py-2.5"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {paginacao && <Paginacao {...paginacao} />}
    </div>
  )
}

export function Linha({ className, children }) {
  return <tr className={cn('border-b transition-colors last:border-0 hover:bg-muted/40', className)}>{children}</tr>
}

export function Celula({ className, children }) {
  return <td className={cn('px-4 py-3', className)}>{children}</td>
}

export function CelulaAcoes({ children }) {
  return <td className="px-4 py-3 text-right whitespace-nowrap">{children}</td>
}

export function ListaVazia({ children }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/60 p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
