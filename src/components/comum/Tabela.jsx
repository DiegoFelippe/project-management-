// Padrão das listas do app (regra no CLAUDE.md): tabela em cartão, uma linha por item e, na última
// coluna, as ações da linha (Editar abre o formulário com aquele item já preenchido).
import { cn } from '@/lib/utils'

export function Tabela({ rotulo, colunas, larguraMinima = 720, children }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
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
