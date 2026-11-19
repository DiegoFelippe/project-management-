import { useId, useState } from 'react'
import { Link } from 'react-router'
import BotaoCheckin from '@/components/clientes/BotaoCheckin'
import BarrasHorizontais from '@/components/graficos/BarrasHorizontais'
import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import { corDaSerie } from '@/components/graficos/cores'
import { CelulaAcoes, Celula, Linha, Tabela } from '@/components/comum/Tabela'
import { horasPorCliente } from '@/data/painel'
import { fraseDasHorasPorCliente } from '@/lib/frasesDosGraficos'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { useListaPaginada } from '@/lib/useListaPaginada'
import { useLeituraDoBloco } from './useLeituraDoBloco'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

// O que vai ao banco: o mês ou { de, ate } (o período da barra, src/lib/periodo.js).
const argumento = (periodo) => (periodo.tipo === 'mes' ? periodo.mes : { de: periodo.de, ate: periodo.ate })
const lerMaiores = ({ periodo }) => horasPorCliente(periodo)
const lerPagina = ({ periodo, pagina }) => horasPorCliente(periodo, pagina)

// A visão em tabela: todos os clientes do período, 15 por página no banco, na mesma ordem das barras. O consultor tem
// o check-in completo na última coluna.
function TabelaDeHoras({ periodo, versao, sub, total, previsaoNo, comCheckin }) {
  const { itens, erro, paginacao } = useListaPaginada(lerPagina, { periodo: argumento(periodo), versao })
  if (erro) return <p role="alert" className="py-2 text-corpo text-destructive">Não foi possível carregar as horas por cliente.</p>
  const colunas = ['Cliente', ...(sub ? [sub] : []), 'Realizado', previsaoNo, '% das horas']
  return (
    <div className="overflow-hidden rounded-xl border">
      <Tabela rotulo="Horas por cliente" colunas={colunas} semAcoes={!comCheckin} semCartao larguraMinima={comCheckin ? 620 : 480} paginacao={paginacao}>
        {(itens ?? []).map((c) => (
          <Linha key={c.id}>
            <Celula><Link to={`/clientes/${c.id}`} className="font-medium hover:underline">{c.nome}</Link></Celula>
            {sub && <Celula>{c.sub ?? '—'}</Celula>}
            <Celula className="whitespace-nowrap tabular-nums">{formatarHoras(c.horas)}</Celula>
            <Celula className="whitespace-nowrap tabular-nums">{formatarHoras(c.previsto)}</Celula>
            <Celula className="whitespace-nowrap tabular-nums">{total ? formatarOcupacao(c.horas / total) : '—'}</Celula>
            {comCheckin && <CelulaAcoes>{comCheckin(c)}</CelulaAcoes>}
          </Linha>
        ))}
      </Tabela>
    </div>
  )
}

// Horas por cliente (central e gestão: os 10 com mais horas no período) ou Horas nos meus clientes (consultor: todos
// os dele, com 0 h inclusive) (design "5."): barras com o traço da previsão atual proporcional ao período, uma cor por
// cliente na ordem da paleta (pedido do Diego, 19/11; com mais de 8, as cores se repetem: o nome está ao lado); o que
// passa da previsão segue em vermelho. Rodapé com o resto ("+ 238 outros clientes · 1.204 h"). G2: o consultor faz check-in de cada
// barra (o BotaoCheckin compacto; desabilitado com check-in aberto em outro cliente, ligado ao aviso) e na tabela, com
// o botão completo. Lê horas_por_cliente sozinho (chave = período e `versao`, que muda depois de um check-in).
export default function HorasPorCliente({ periodo, recorte, aberto = null, aoMudar, versao = 0 }) {
  const [tentativa, setTentativa] = useState(0)
  const idDoAviso = useId()
  const leitura = useLeituraDoBloco(lerMaiores, { periodo: argumento(periodo), versao, tentativa })
  const consultor = recorte === 'pessoa'
  const titulo = consultor ? 'Horas nos meus clientes' : 'Horas por cliente (10 maiores)'
  const noMes = periodo.tipo === 'mes'
  const previsaoNo = noMes ? 'Previsão no mês' : 'Previsão no período'
  const legenda = [
    { forma: 'marca', texto: noMes ? 'Previsão atual' : 'Previsão atual, proporcional ao período' },
    { forma: 'quadrado', cor: 'acima', texto: 'Acima da previsão' },
  ]
  if (!leitura.dados) {
    return <CartaoDeGrafico titulo={titulo} estado={leitura.erro ? 'erro' : 'carregando'} altura={300} legenda={legenda}
      erro="Não foi possível carregar as horas por cliente." aoTentarDeNovo={() => setTentativa((t) => t + 1)} />
  }

  const dados = leitura.dados
  const sub = consultor ? null : recorte === 'tudo' ? 'Consultoria' : 'Consultor'
  const checkin = consultor
    ? (c, compacto) => <BotaoCheckin key={aberto?.id ?? 'nenhum'} compacto={compacto} cliente={{ id: c.id, nome: c.nome }} aberto={aberto}
      aoMudar={aoMudar} idDoAviso={idDoAviso} />
    : null
  const vazio = consultor ? !dados.itens.length : !dados.total_horas
  const mostraAviso = consultor && aberto && dados.itens.some((c) => c.id !== aberto.cliente_id)
  const resto = dados.resto?.clientes
    ? `+ ${INTEIRO.format(dados.resto.clientes)} ${dados.resto.clientes === 1 ? 'outro cliente' : 'outros clientes'} · ${formatarHoras(dados.resto.horas)}`
    : null

  return (
    <CartaoDeGrafico titulo={titulo} leitura={vazio ? null : fraseDasHorasPorCliente(dados, periodo)} legenda={legenda}
      altura={300} atualizando={leitura.atualizando} estado={vazio ? 'vazio' : 'pronto'}
      vazio={consultor ? 'Nenhum cliente seu ainda.' : `Nenhuma hora ${noMes ? 'no mês' : periodo.tipo === 'ano' ? 'no ano' : 'no período'}.`}
      tabela={<TabelaDeHoras periodo={periodo} versao={versao} sub={sub} total={dados.total_horas} previsaoNo={previsaoNo}
        comCheckin={checkin && ((c) => checkin(c, false))} />}>
      {mostraAviso && (
        <p id={idDoAviso} className="mb-2 text-rotulo text-muted-foreground">
          Você está com check-in aberto em {aberto.cliente?.nome ?? 'outro cliente'} desde {HORA.format(new Date(aberto.inicio))}.
        </p>
      )}
      <BarrasHorizontais rotulo={titulo} rodape={resto}
        itens={dados.itens.map((c, i) => {
          const previsto = c.previsto > 0 ? c.previsto : null
          return {
            chave: c.id,
            nome: c.nome,
            href: `/clientes/${c.id}`,
            sub: c.sub ?? undefined,
            valor: c.horas,
            cor: corDaSerie(i),
            limite: previsto ?? undefined,
            marca: previsto ?? undefined,
            valorTexto: formatarHoras(c.horas),
            aria: `${c.nome}: ${formatarHoras(c.horas)}${previsto ? ` de ${formatarHoras(previsto)} previstas` : ''}`,
            dica: {
              titulo: c.nome,
              linhas: [
                { valor: formatarHoras(c.horas), rotulo: 'realizado', cor: previsto && c.horas > previsto ? 'acima' : corDaSerie(i) },
                { valor: formatarHoras(c.previsto), rotulo: previsaoNo.toLowerCase() },
                ...(dados.total_horas ? [{ valor: formatarOcupacao(c.horas / dados.total_horas), rotulo: 'das horas' }] : []),
              ],
            },
            acao: checkin ? checkin(c, true) : undefined,
          }
        })} />
    </CartaoDeGrafico>
  )
}
