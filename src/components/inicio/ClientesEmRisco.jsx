import { useRef, useState } from 'react'
import { Link } from 'react-router'
import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import Dica from '@/components/graficos/Dica'
import MiniBarra from '@/components/graficos/MiniBarra'
import { pontoDoFoco, useDica } from '@/components/graficos/useDica'
import { Celula, Linha, Tabela } from '@/components/comum/Tabela'
import { clientesEmRisco } from '@/data/painel'
import { fraseDoRisco } from '@/lib/frasesDosGraficos'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { formatarDia } from '@/lib/mes'
import { useLeitura } from '@/lib/useLeitura'
import { useListaPaginada } from '@/lib/useListaPaginada'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const LIMITE_DIAS = 30
const LIMITE_RITMO = 1.2
const NO_GRAFICO = 6
const dias = (n) => `${INTEIRO.format(n)} ${n === 1 ? 'dia' : 'dias'}`
const ritmo = (c) => (c.ritmo == null ? '—' : formatarOcupacao(c.ritmo))
const ultimo = (c) => (c.ultimo_checkin ? `há ${dias(c.sem_checkin_dias)} (${formatarDia(c.ultimo_checkin)})` : `nenhum há ${dias(c.sem_checkin_dias)}`)

// Leituras do módulo (estáveis para o useLeitura): a primeira página para as linhas do gráfico e a tabela paginada.
const lerPrimeira = () => clientesEmRisco(1)
const lerPagina = ({ pagina }) => clientesEmRisco(pagina)

// Uma mini barra focável (Tab), com a dica no mouse, no toque e no foco.
function Medida({ aria, dica, mostrar, esconder, children }) {
  return (
    <span role="img" aria-label={aria} tabIndex={0} data-alvo-da-dica=""
      className="block rounded-md px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onPointerMove={(e) => mostrar(dica, e.clientX, e.clientY)} onPointerDown={(e) => mostrar(dica, e.clientX, e.clientY)}
      onPointerLeave={(e) => e.pointerType !== 'touch' && esconder()}
      onFocus={(e) => mostrar(dica, ...pontoDoFoco(e.currentTarget))} onBlur={esconder}>
      {children}
    </span>
  )
}

function Linhas({ itens, recorte }) {
  const contem = useRef(null)
  const { dica, mostrar, esconder } = useDica(contem)
  const sub = (c) => (recorte === 'tudo' ? c.consultoria_nome : recorte === 'consultoria' ? c.consultor_nome : null)
  const colunas = 'grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-1'
  return (
    <div ref={contem} className="min-w-0">
      <div aria-hidden="true" className={`${colunas} px-1.5 pb-1 text-legenda text-muted-foreground max-sm:hidden`}>
        <span>Cliente</span><span>Último check-in</span><span>Ritmo × previsão (30 dias)</span>
      </div>
      <ul role="list" aria-label="Clientes em risco" className="grid">
        {itens.map((c) => (
          <li key={c.id} className={`${colunas} rounded-lg border-t px-1.5 py-1.5 first:border-t-0 hover:bg-muted/70`}>
            <span className="flex min-w-0 flex-col max-sm:col-span-2">
              <Link to={`/clientes/${c.id}`} title={c.nome} className="truncate text-rotulo font-medium hover:text-primary hover:underline pointer-coarse:py-2">{c.nome}</Link>
              {sub(c) && <span title={sub(c)} className="truncate text-legenda text-muted-foreground">{sub(c)}</span>}
            </span>
            <Medida mostrar={mostrar} esconder={esconder}
              aria={`${c.nome}, último check-in: ${ultimo(c)}${c.sem_checkin ? ', passou de 30 dias' : ''}`}
              dica={{ titulo: c.nome, linhas: [{ valor: ultimo(c), rotulo: 'último check-in' }, { valor: '30 dias', rotulo: 'limite' }] }}>
              <MiniBarra rotulo="Último check-in" valor={c.sem_checkin_dias} limite={LIMITE_DIAS} maximo={60} acima={c.sem_checkin}
                texto={`${INTEIRO.format(c.sem_checkin_dias)} d`} />
            </Medida>
            <Medida mostrar={mostrar} esconder={esconder}
              aria={`${c.nome}, ritmo dos últimos 30 dias: ${ritmo(c)} da previsão${c.acima_do_ritmo ? ', acima de 120%' : ''}`}
              dica={{ titulo: c.nome, linhas: [
                { valor: formatarHoras(c.horas_30), rotulo: 'nos últimos 30 dias' }, { valor: formatarHoras(c.horas_mes), rotulo: 'previsão por mês' },
                { valor: ritmo(c), rotulo: 'da previsão' }, { valor: '120%', rotulo: 'limite' },
              ] }}>
              <MiniBarra rotulo="Ritmo × previsão (30 dias)" valor={c.ritmo ?? 0} limite={LIMITE_RITMO} maximo={1.8} acima={c.acima_do_ritmo} texto={ritmo(c)} />
            </Medida>
          </li>
        ))}
      </ul>
      <Dica estado={dica} />
    </div>
  )
}

// A visão em tabela: todos os clientes em risco, 15 por página, pedidos ao banco (regra "Escala").
function TabelaDoRisco({ recorte, versao }) {
  const { itens, erro, paginacao } = useListaPaginada(lerPagina, { versao })
  const sub = recorte === 'tudo' ? 'consultoria_nome' : recorte === 'consultoria' ? 'consultor_nome' : null
  if (erro) return <p role="alert" className="py-2 text-corpo text-destructive">Não foi possível carregar a lista dos clientes em risco.</p>
  return (
    <div className="overflow-hidden rounded-xl border">
      <Tabela rotulo="Clientes em risco" colunas={['Cliente', 'Último check-in', 'Ritmo × previsão (30 dias)']} semAcoes semCartao larguraMinima={420}
        paginacao={paginacao}>
        {(itens ?? []).map((c) => (
          <Linha key={c.id}>
            <Celula>
              <Link to={`/clientes/${c.id}`} className="font-medium hover:underline">{c.nome}</Link>
              {sub && c[sub] && <span className="block text-rotulo text-muted-foreground">{c[sub]}</span>}
            </Celula>
            <Celula className={`whitespace-nowrap tabular-nums ${c.sem_checkin ? 'font-semibold text-destructive' : ''}`}>{dias(c.sem_checkin_dias)}</Celula>
            <Celula className={`whitespace-nowrap tabular-nums ${c.acima_do_ritmo ? 'font-semibold text-destructive' : ''}`}>{ritmo(c)}</Celula>
          </Linha>
        ))}
      </Tabela>
    </div>
  )
}

// Clientes em risco hoje (design "4."; não depende do período, então não recarrega ao trocá-lo): sem check-in há 30+
// dias ou ritmo dos últimos 30 dias acima de 120% da previsão (clientes_em_risco, já ordenado por risco). Até 6 linhas
// com as duas mini barras; "Ver todos os N" abre a tabela paginada no banco. `versao` muda depois de um check-in feito
// no Início (relê).
export default function ClientesEmRisco({ recorte, versao = 0 }) {
  const [tentativa, setTentativa] = useState(0)
  const [emTabela, setEmTabela] = useState(false)
  const leitura = useLeitura(lerPrimeira, { tentativa, versao })
  const titulo = recorte === 'pessoa' ? 'Meus clientes em risco' : 'Clientes em risco'
  if (!leitura.dados) {
    return <CartaoDeGrafico titulo={titulo} estado={leitura.erro ? 'erro' : 'carregando'} altura={240}
      erro="Não foi possível carregar os clientes em risco." aoTentarDeNovo={() => setTentativa((t) => t + 1)} />
  }
  const risco = leitura.dados
  const mostrados = risco.itens.slice(0, NO_GRAFICO)
  return (
    <CartaoDeGrafico titulo={titulo} leitura={fraseDoRisco(risco)} estado={risco.total ? 'pronto' : 'vazio'}
      vazio="Todos com check-in recente e dentro da previsão." emTabela={emTabela} aoMudarTabela={setEmTabela}
      tabela={<TabelaDoRisco recorte={recorte} versao={versao} />}>
      <Linhas itens={mostrados} recorte={recorte} />
      {risco.total > mostrados.length && (
        <button type="button" onClick={() => setEmTabela(true)}
          className="botao-animado mt-2 text-rotulo font-medium text-primary transition-[translate,scale] hover:-translate-y-px hover:underline active:scale-[0.97] pointer-coarse:min-h-11">
          Ver todos os {INTEIRO.format(risco.total)}
        </button>
      )}
    </CartaoDeGrafico>
  )
}
