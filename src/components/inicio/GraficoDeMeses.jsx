import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import GraficoDeColunas from '@/components/graficos/GraficoDeColunas'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { fraseDosMeses } from '@/lib/frasesDosGraficos'
import { rotuloCurto, rotuloDoMes } from '@/lib/mes'

const ALTURA = 210
const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const nomeDoMes = (mes) => rotuloDoMes(mes).split(' ')[0].toLowerCase()
const utilizacao = (realizado, capacidade) => (capacidade ? formatarOcupacao(realizado / capacidade) : '—')

// Legenda fixa (também enquanto carrega, para a linha dela não pular): capacidade parcial e "fora do período" só
// quando o gráfico tem.
function legendaDe(meses, hoje) {
  return [
    { forma: 'quadrado', cor: 'serie', texto: 'Realizado' },
    { forma: 'linha', cor: 'ref', texto: 'Capacidade' },
    ...(meses?.at(-1)?.parcial && hoje ? [{ forma: 'tracejado', cor: 'ref', texto: `Capacidade até ${diaMes(hoje)}` }] : []),
    ...(meses?.some((m) => !m.no_periodo) ? [{ forma: 'quadrado', cor: 'color-mix(in srgb, var(--grafico-serie) 42%, var(--card))', texto: 'Fora do período' }] : []),
  ]
}

// Realizado × capacidade por mês (Início, todos; design "1."): colunas do realizado e a linha da capacidade de cada mês
// (painel_do_inicio.horas_por_mes, de 6 a 24 meses). Meses fora do período esmaecidos; o mês em andamento com a
// capacidade até hoje (trecho tracejado, ponto vazado). R7: com 0 h em todos os meses, a frase e a capacidade do último
// mês em texto. `painel` nulo = carregando; `erro`, `atualizando` e `aoTentarDeNovo` vêm do Início.
export default function GraficoDeMeses({ painel, periodo, erro = false, atualizando = false, aoTentarDeNovo }) {
  const titulo = 'Realizado × capacidade por mês'
  const meses = painel?.horas_por_mes
  const hoje = painel?.ate_efetivo
  if (erro || !painel) {
    return (
      <CartaoDeGrafico titulo={titulo} estado={erro ? 'erro' : 'carregando'} altura={ALTURA} legenda={legendaDe(null)}
        erro="Não foi possível carregar o gráfico de horas por mês." aoTentarDeNovo={aoTentarDeNovo} />
    )
  }

  const rotuloDoPonto = (m) => `${rotuloDoMes(m.mes)}${m.parcial && hoje ? ` (até ${diaMes(hoje)})` : ''}`
  const vazio = !meses.length || meses.every((m) => !m.realizado)
  const ultimo = meses.at(-1)
  return (
    <CartaoDeGrafico titulo={titulo} leitura={vazio ? null : fraseDosMeses(painel, periodo)} legenda={legendaDe(meses, hoje)}
      altura={ALTURA} atualizando={atualizando} estado={vazio ? 'vazio' : 'pronto'}
      vazio={(
        <>
          <p>Sem horas nos últimos {meses.length} meses.</p>
          {ultimo && (
            <p className="mt-1 text-rotulo">
              Capacidade de {nomeDoMes(ultimo.mes)}{ultimo.parcial ? ' até hoje' : ''}: <b className="font-semibold text-foreground tabular-nums">{formatarHoras(ultimo.capacidade)}</b>
            </p>
          )}
        </>
      )}
      tabela={{
        rotulo: 'Realizado e capacidade por mês',
        colunas: ['Mês', 'Realizado', 'Capacidade', 'Utilização'],
        linhas: meses.map((m) => [rotuloDoPonto(m), formatarHoras(m.realizado), formatarHoras(m.capacidade), utilizacao(m.realizado, m.capacidade)]),
      }}>
      <GraficoDeColunas altura={ALTURA} linhaDeReferencia rotuloAria="Realizado e capacidade por mês"
        itens={meses.map((m) => ({
          chave: m.mes, rotulo: rotuloCurto(m.mes), valor: m.realizado, referencia: m.capacidade, esmaecido: !m.no_periodo, parcial: m.parcial,
          aria: `${rotuloCurto(m.mes)}: ${formatarHoras(m.realizado)} de ${formatarHoras(m.capacidade)}`,
          dica: {
            titulo: rotuloDoPonto(m),
            linhas: [
              { valor: formatarHoras(m.realizado), rotulo: 'realizado', cor: 'serie' },
              { valor: formatarHoras(m.capacidade), rotulo: m.parcial ? 'capacidade até hoje' : 'capacidade', cor: 'ref', tracejado: m.parcial },
              { valor: utilizacao(m.realizado, m.capacidade), rotulo: 'utilização' },
            ],
          },
        }))} />
    </CartaoDeGrafico>
  )
}
