// Padrão das listas do app (regras no CLAUDE.md): tabela em cartão, uma linha por item e, na última
// coluna, as ações da linha (Editar abre o formulário com aquele item já preenchido). Acima de 15
// registros, a paginação (feita no banco) aparece embaixo da tabela.
import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
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
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-corpo text-muted-foreground">
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

// Diz se o contêiner rola para o lado agora (mede de novo quando ele ou a janela mudam de tamanho). Mede no
// useLayoutEffect: a primeira medida vale já na primeira pintura (com useEffect, a tabela aparecia um quadro sem a
// região e a parada do Tab, e o teste do Histórico oscilava conforme o efeito rodava antes ou depois de ela aparecer).
function useRolaParaOLado(ativo) {
  const ref = useRef(null)
  const [rola, setRola] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!ativo || !el) return undefined
    const medir = () => setRola(el.scrollWidth > el.clientWidth + 1)
    medir()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir)
      return () => window.removeEventListener('resize', medir)
    }
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    if (el.firstElementChild) observador.observe(el.firstElementChild)
    return () => observador.disconnect()
  }, [ativo])
  return [ref, ativo && rola]
}

// semAcoes: tabela só de leitura, sem a coluna de ações; quando ela rola para o lado (no celular), a rolagem recebe o
// foco do teclado e tem nome, porque na tabela não há nada que receba o foco (auditoria, R13); cabendo na tela, nada de
// parada a mais no Tab. No celular (abaixo de sm) a coluna de ações não fica fixa e a primeira coluna tem 160 px no
// mínimo, para o nome não sumir nem quebrar letra a letra em 360 px (auditoria, G1).
// titulo: cabeçalho dentro do cartão.
// semCartao: a tabela entra rente no cartão de quem a usa (ex.: a visão Todos da agenda do cliente, dentro do cartão do calendário).
export function Tabela({ rotulo, titulo, colunas, larguraMinima = 720, paginacao, semAcoes = false, semCartao = false, children }) {
  const [rolagem, rola] = useRolaParaOLado(semAcoes)
  return (
    <div className={cn('overflow-hidden', !semCartao && 'card')}>
      {titulo && <h2 className="px-4 pt-4 pb-2 text-subtitulo font-semibold text-muted-foreground">{titulo}</h2>}
      <div ref={rolagem} className="overflow-x-auto focus-visible:-outline-offset-2"
        {...(rola ? { role: 'region', 'aria-label': `Tabela ${rotulo}`, tabIndex: 0 } : {})}>
        <table aria-label={rotulo} className="w-full text-left text-corpo" style={{ minWidth: larguraMinima }}>
          <thead className="border-b bg-muted/50 text-rotulo text-muted-foreground">
            <tr>
              {colunas.map((coluna, i) => (
                <th key={coluna} className={cn('px-4 py-2.5 font-medium', i === 0 && 'max-sm:min-w-40')}>{coluna}</th>
              ))}
              {!semAcoes && <th className="sticky right-0 max-sm:static border-l bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] px-4 py-2.5"><span className="sr-only">Ações</span></th>}
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
  return <tr className={cn('group border-b transition-colors last:border-0 hover:bg-muted/40', className)}>{children}</tr>
}

export function Celula({ className, children }) {
  return <td className={cn('px-4 py-3', className)}>{children}</td>
}

// No toque (pointer-coarse), 8 px entre uma ação e outra (cada botão de ícone já tem 44 px lá).
export function CelulaAcoes({ children }) {
  return <td className="bg-card group-hover:bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))] sticky right-0 max-sm:static border-l px-4 py-3 text-right whitespace-nowrap pointer-coarse:[&>*+*]:ml-2">{children}</td>
}

const PERIGO = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'

// Ação da linha (auditoria de 17/11, G1; Padrão Hub): só o ícone, com o nome no aria-label e no title. Posições fixas:
// cada tabela põe as ações sempre na mesma ordem e, na linha em que uma delas não vale, `visivel={false}` deixa o
// espaço vazio (do tamanho do botão), para o lápis nunca mudar de lugar. `perigo`: apagar, desativar, desconectar...
// Exceção (fora daqui): a linha com uma única ação principal (ex.: "Conectar") pode ter texto, num Button ghost sm.
// `para`: a ação é um link (abre outra página). `classeDoIcone`: ex.: animate-spin enquanto testa.
export function AcaoDaLinha({ nome, icone: Icone, perigo = false, visivel = true, para, classeDoIcone, className, ...props }) {
  if (!visivel) return <span aria-hidden="true" className="inline-block size-8 align-middle pointer-coarse:min-h-11 pointer-coarse:min-w-11" />
  const icone = <Icone aria-hidden="true" className={classeDoIcone} />
  const comum = { variant: 'ghost', size: 'icon', 'aria-label': nome, title: nome, className: cn(perigo && PERIGO, className) }
  if (para) return <Button asChild {...comum}><Link to={para} {...props}>{icone}</Link></Button>
  return <Button type="button" {...comum} {...props}>{icone}</Button>
}

export function ListaVazia({ children }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/60 p-8 text-center text-corpo text-muted-foreground">
      {children}
    </div>
  )
}
