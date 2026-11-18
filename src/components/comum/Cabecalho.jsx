import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

// "← Times": volta para a lista de onde a página veio. Sozinho, serve às telas de carregando e de erro da página.
export function Voltar({ para, children }) {
  return (
    <Link to={para} className="mb-3 inline-flex items-center gap-1 text-corpo font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" /> {children}
    </Link>
  )
}

// Cabeçalho da página: título na escala, subtítulo e os botões do contexto. `voltarPara` ({ caminho, rotulo }) põe o
// "← rótulo" em cima, nas páginas de detalhe (auditoria, C9). `className` ajusta a margem (ex.: numa grade com gap).
export default function Cabecalho({ titulo, descricao, voltarPara, className, children }) {
  return (
    <>
      {voltarPara && <Voltar para={voltarPara.caminho}>{voltarPara.rotulo}</Voltar>}
      <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
        <div className="min-w-0">
          <h1 className="text-titulo font-bold">{titulo}</h1>
          {descricao && <p className="mt-0.5 text-subtitulo font-normal text-muted-foreground">{descricao}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </>
  )
}
