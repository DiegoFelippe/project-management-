import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import GraficoDeLinha from '@/components/graficos/GraficoDeLinha'
import { fraseDasSemanas } from '@/lib/frasesDosGraficos'
import { formatarHoras } from '@/lib/horas'
import { hoje as hojeEmSP } from '@/lib/mes'

// O gráfico de linha fica mais alto que o padrão (200) para acompanhar o cartão do lado (horas por cliente), como no
// protótipo; o cartão recebe a mesma altura enquanto carrega.
const ALTURA = 280
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const checkins = (n) => `${INTEIRO.format(n)} ${n === 1 ? 'check-in' : 'check-ins'}`

function legendaDe(semanas) {
  const fora = semanas?.findIndex((s) => s.no_periodo) > 0
  return [
    { forma: 'linha', cor: 'serie', texto: 'Check-ins' },
    ...(semanas?.at(-1)?.parcial ? [{ forma: 'tracejado', cor: 'serie', texto: 'Semana em andamento' }] : []),
    ...(fora ? [{ forma: 'faixa', cor: 'var(--muted)', texto: 'Semanas do período' }] : []),
  ]
}

// Check-ins por semana (design "6."): uma semana (segunda a domingo) por ponto, nas semanas que o período toca (no
// mínimo 8; as do período numa faixa de fundo quando a linha começa antes), a semana em andamento tracejada com
// "N até hoje" na ponta e o pico marcado (checkins_por_semana). Um alvo focável; ← → andam de semana em semana.
export default function CheckinsPorSemana({ dados, periodo, erro = false, atualizando = false, aoTentarDeNovo }) {
  const titulo = 'Check-ins por semana'
  if (erro || !dados) {
    return <CartaoDeGrafico titulo={titulo} estado={erro ? 'erro' : 'carregando'} altura={ALTURA} legenda={legendaDe(null)}
      erro="Não foi possível carregar os check-ins por semana." aoTentarDeNovo={aoTentarDeNovo} />
  }
  const { semanas } = dados
  const n = semanas.length
  const vazio = !n || semanas.every((s) => !s.checkins)
  const hoje = hojeEmSP()
  const temParcial = Boolean(semanas.at(-1)?.parcial)
  const inicioDoPeriodo = semanas.findIndex((s) => s.no_periodo)
  const iPico = dados.pico ? semanas.findIndex((s) => s.semana === dados.pico.semana) : -1
  const rotulo = (s) => `Semana de ${diaMes(s.semana)}${s.parcial ? ` (até ${diaMes(hoje)})` : ''}`
  const ultima = semanas.at(-1)

  return (
    <CartaoDeGrafico titulo={titulo} leitura={vazio ? null : fraseDasSemanas(dados, periodo)} legenda={legendaDe(semanas)}
      altura={ALTURA} atualizando={atualizando} estado={vazio ? 'vazio' : 'pronto'}
      vazio={`Nenhum check-in ${periodo?.tipo === 'mes' ? 'no mês' : periodo?.tipo === 'ano' ? 'no ano' : 'no período'}.`}
      tabela={{
        rotulo: 'Check-ins por semana',
        colunas: ['Semana de', 'Check-ins', 'Horas'],
        linhas: semanas.map((s) => [`${diaMes(s.semana)}${s.parcial ? ' (em andamento)' : ''}`, INTEIRO.format(s.checkins), formatarHoras(s.horas)]),
      }}>
      {!vazio && (
        <GraficoDeLinha altura={ALTURA} rotulos={semanas.map((s) => diaMes(s.semana))}
          rotuloAria="Check-ins por semana"
          series={[
            { nome: 'check-ins', area: true, pontos: semanas.map((s) => (s.parcial ? null : s.checkins)) },
            ...(temParcial ? [{ nome: 'check-ins até hoje', tracejada: true, pontos: semanas.map((s, i) => (i === n - 1 ? s.checkins : null)) }] : []),
          ]}
          dicas={semanas.map((s) => ({
            titulo: rotulo(s),
            linhas: [{ valor: checkins(s.checkins), cor: 'serie', tracejado: s.parcial }, { valor: formatarHoras(s.horas), rotulo: 'registradas' }],
          }))}
          faixa={inicioDoPeriodo > 0 ? [inicioDoPeriodo, n - 1] : null}
          marcas={[
            { serie: temParcial ? 1 : 0, i: n - 1, lado: temParcial ? 'abaixo' : 'acima', texto: `${INTEIRO.format(ultima.checkins)}${temParcial ? ' até hoje' : ''}` },
            ...(iPico >= 0 && iPico !== n - 1 && dados.pico.checkins > 0 ? [{ serie: 0, i: iPico, texto: `pico ${INTEIRO.format(dados.pico.checkins)}` }] : []),
          ]} />
      )}
    </CartaoDeGrafico>
  )
}
