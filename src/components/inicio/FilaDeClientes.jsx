import { useRef } from 'react'
import { Link } from 'react-router'
import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import Dica from '@/components/graficos/Dica'
import FaixaDeGrupos from '@/components/graficos/FaixaDeGrupos'
import TabelaDoGrafico from '@/components/graficos/TabelaDoGrafico'
import { COR_OUTROS, corDaPaleta, corDe } from '@/components/graficos/cores'
import { escalaBonita } from '@/components/graficos/escala'
import { useDica } from '@/components/graficos/useDica'
import { Celula, Linha, Tabela } from '@/components/comum/Tabela'
import { Badge } from '@/components/ui/badge'
import { fraseDaFila } from '@/lib/frasesDosGraficos'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const dias = (n) => `${NUMERO.format(n)} ${n === 1 ? 'dia' : 'dias'}`
const esperando = (n) => (n === 0 ? 'desde hoje' : `há ${dias(n)}`)
const clientes = (n) => `${INTEIRO.format(n)} ${n === 1 ? 'cliente' : 'clientes'}`
const NA_TABELA = 15

// As etapas de cada recorte, com a cor da paleta (pedido do Diego, 19/11: aguardando consultoria é neutro, em grafite;
// aguardando consultor em mostarda; em atendimento em azul), a mesma na faixa e nos pontos. `chave`: a situação dos pontos
// e a parte da fila no JSON; `situacao`: o filtro de Clientes (?situacao=).
function etapasDe(fila, central) {
  return [
    ...(central ? [{ chave: 'a_distribuir', nome: 'Aguardando consultoria', curto: 'Consultoria', semQuem: 'Sem consultoria', situacao: 'distribuir', dados: fila.a_distribuir, cor: COR_OUTROS }] : []),
    { chave: 'sem_consultor', nome: 'Aguardando consultor', curto: 'Consultor', semQuem: 'Sem consultor', situacao: 'aguardando', dados: fila.sem_consultor, cor: corDaPaleta('mostarda') },
    { chave: 'em_atendimento', nome: 'Em atendimento', dados: fila.em_atendimento, cor: corDaPaleta('azul') },
  ].map((etapa) => ({ ...etapa, espera: etapa.chave !== 'em_atendimento' }))
}

// "Há quantos dias esperam": uma faixa por etapa de espera, um ponto por cliente na posição dos dias (0 = hoje). Os
// pontos não são focáveis (seriam até 40 paradas): a faixa tem um nome que resume e a tabela lista todos. Mouse e toque
// mostram a dica do ponto.
function Pontos({ etapas, pontos, central }) {
  const contem = useRef(null)
  const { dica, mostrar, esconder } = useDica(contem)
  const { topo, marcas } = escalaBonita(Math.max(10, ...pontos.map((p) => p.dias)), 4, true)
  const posicao = (d) => `${(d / topo) * 100}%`
  const sair = (e) => {
    if (e.pointerType !== 'touch') esconder()
  }
  return (
    <div ref={contem} className="min-w-0">
      <p className="mt-1 mb-1 text-mini font-semibold tracking-wide text-muted-foreground uppercase">Há quantos dias esperam</p>
      <div className="grid gap-0.5">
        {etapas.map((etapa) => {
          const daqui = pontos.filter((p) => p.situacao === etapa.chave)
          const total = etapa.dados?.total ?? 0
          const usados = {}
          const faixa = daqui.length
            ? `${daqui.length < total ? `os ${INTEIRO.format(daqui.length)} que esperam há mais tempo, ` : ''}de ${dias(Math.min(...daqui.map((p) => p.dias)))} a ${dias(Math.max(...daqui.map((p) => p.dias)))}`
            : 'ninguém esperando'
          return (
            <div key={etapa.chave} className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5 max-sm:grid-cols-[74px_minmax(0,1fr)]">
              <span className="truncate text-legenda text-muted-foreground" title={etapa.nome}>{etapa.curto}</span>
              <div role="img" aria-label={`${etapa.nome}: ${clientes(total)}, ${faixa}`} className="relative h-[30px] border-b border-input">
                {marcas.map((v) => <span key={v} aria-hidden="true" className="absolute inset-y-0 border-l border-grafico-grade" style={{ left: posicao(v) }} />)}
                {daqui.map((p) => {
                  // Pontos no mesmo dia se empilham (no meio, em cima, embaixo), sem sair da faixa.
                  const k = (usados[p.dias] = (usados[p.dias] ?? -1) + 1)
                  const deslocamento = [0, -7, 7][k % 3]
                  const conteudo = { titulo: p.nome, linhas: [{ valor: esperando(p.dias), rotulo: etapa.nome.toLowerCase() }, ...(central && p.consultoria_nome ? [{ valor: p.consultoria_nome }] : [])] }
                  return (
                    <span key={p.id} data-ponto="" data-alvo-da-dica="" aria-hidden="true"
                      className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card transition-transform hover:scale-135 after:absolute after:-inset-[7px] after:rounded-full"
                      style={{ left: posicao(p.dias), top: `calc(50% + ${deslocamento}px)`, background: corDe(etapa.cor) }}
                      onPointerMove={(e) => mostrar(conteudo, e.clientX, e.clientY)} onPointerDown={(e) => mostrar(conteudo, e.clientX, e.clientY)}
                      onPointerLeave={sair} />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div aria-hidden="true" className="relative mt-0.5 ml-[102px] h-4 max-sm:ml-[84px]">
        {marcas.map((v) => (
          <span key={v} className="absolute -translate-x-1/2 text-legenda whitespace-nowrap text-muted-foreground tabular-nums" style={{ left: posicao(v) }}>
            {v === 0 ? 'hoje' : `${INTEIRO.format(v)} d`}
          </span>
        ))}
      </div>
      <Dica estado={dica} />
    </div>
  )
}

// Um link por etapa de espera para Clientes já filtrado na situação ("Ver os 23 aguardando consultor").
function Links({ etapas }) {
  const comGente = etapas.filter((e) => e.espera && e.dados?.total)
  if (!comGente.length) return null
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-rotulo">
      {comGente.map((e) => (
        <Link key={e.chave} to={`/clientes?situacao=${e.situacao}`} className="font-medium text-primary hover:underline pointer-coarse:py-3">
          Ver {e.dados.total === 1 ? 'o 1' : `os ${INTEIRO.format(e.dados.total)}`} {e.nome.toLowerCase()}
        </Link>
      ))}
    </p>
  )
}

// Fila de clientes (central e gestão; design "2." e, de 19/11, a faixa): as etapas de hoje numa faixa só, com o número de
// cada uma na legenda (central: aguardando consultoria → aguardando consultor → em atendimento; gestão, sem a primeira),
// os pontos de quem espera e a leitura do período (fila_de_clientes). Na visão em tabela, as etapas com a espera média e a
// maior, e os 15 que esperam há mais tempo (M6: no celular uma coluna só, com a situação e a espera embaixo do nome); o
// link de cada etapa para Clientes filtrado. Ninguém na fila: o vazio do cartão.
export default function FilaDeClientes({ fila, recorte, periodo, erro = false, atualizando = false, aoTentarDeNovo }) {
  const titulo = 'Fila de clientes'
  if (erro || !fila) {
    return <CartaoDeGrafico titulo={titulo} estado={erro ? 'erro' : 'carregando'} altura={230}
      erro="Não foi possível carregar a fila de clientes." aoTentarDeNovo={aoTentarDeNovo} />
  }
  const central = recorte === 'tudo'
  const etapas = etapasDe(fila, central)
  const deEspera = etapas.filter((e) => e.espera)
  const nome = Object.fromEntries(deEspera.map((e) => [e.chave, e]))
  const primeiros = fila.pontos.slice(0, NA_TABELA)
  const naFila = etapas.reduce((soma, e) => soma + (e.dados?.total ?? 0), 0)

  const tabela = (
    <div className="grid gap-3">
      <TabelaDoGrafico rotulo="Etapas da fila hoje" colunas={['Etapa', 'Clientes', 'Espera média', 'Maior espera']}
        linhas={etapas.map((e) => [e.nome, INTEIRO.format(e.dados?.total ?? 0),
          e.espera && e.dados?.total ? dias(e.dados.media_dias) : '—', e.espera && e.dados?.total ? dias(e.dados.maior_dias) : '—'])} />
      {primeiros.length ? (
        // M6: no celular, só a coluna do cliente (a situação e a espera vão embaixo do nome) e nada rola para o lado.
        <div className="overflow-hidden rounded-xl border max-sm:[&_td+td]:hidden max-sm:[&_th+th]:hidden">
          <Tabela rotulo="Clientes esperando" colunas={['Cliente', 'Situação', 'Esperando']} semAcoes semCartao larguraMinima={0}>
            {primeiros.map((p) => (
              <Linha key={p.id}>
                <Celula className="max-sm:min-w-0">
                  <Link to={`/clientes/${p.id}`} className="font-medium hover:underline">{p.nome}</Link>
                  {central && p.consultoria_nome && <span className="block text-rotulo text-muted-foreground">{p.consultoria_nome}</span>}
                  <span data-no-celular="" className="block text-rotulo text-muted-foreground sm:hidden">{nome[p.situacao]?.semQuem} · {esperando(p.dias)}</span>
                </Celula>
                <Celula><Badge variant="notice">{nome[p.situacao]?.nome ?? p.situacao}</Badge></Celula>
                <Celula className="whitespace-nowrap tabular-nums">{esperando(p.dias)}</Celula>
              </Linha>
            ))}
          </Tabela>
        </div>
      ) : <p className="py-2 text-corpo text-muted-foreground">Ninguém esperando.</p>}
      <Links etapas={etapas} />
    </div>
  )

  return (
    <CartaoDeGrafico titulo={titulo} leitura={fraseDaFila(fila, periodo)} atualizando={atualizando} tabela={tabela}
      estado={naFila ? 'pronto' : 'vazio'} vazio="Nenhum cliente na fila hoje.">
      <FaixaDeGrupos rotulo="Etapas da fila hoje" grupos={etapas.map((e) => ({ nome: e.nome, n: e.dados?.total ?? 0, cor: e.cor }))} />
      {fila.total_esperando > 0 && <div className="mt-3"><Pontos etapas={deEspera} pontos={fila.pontos} central={central} /></div>}
      <div className="mt-3"><Links etapas={etapas} /></div>
    </CartaoDeGrafico>
  )
}
