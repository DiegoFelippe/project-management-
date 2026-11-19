import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import ColunasEmpilhadas from '@/components/graficos/ColunasEmpilhadas'
import { COR_OUTROS, corDaSerie } from '@/components/graficos/cores'
import { diaDaSemana, somarDias } from '@/lib/calendario'
import { fraseDasHorasPorUnidade } from '@/lib/frasesDosGraficos'
import { formatarHoras } from '@/lib/horas'
import { hoje as hojeEmSP } from '@/lib/mes'

const ALTURA = 210
const SUBTITULO = 'Por semana, de segunda a domingo'
const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const noPeriodo = (p) => (p?.tipo === 'mes' ? 'no mês' : p?.tipo === 'ano' ? 'no ano' : 'no período')
const segundaDe = (dia) => somarDias(dia, -((diaDaSemana(dia) + 6) % 7))

// Os nomes e as cores das séries: a ordem do banco (mais horas primeiro) pela paleta; "Outros" (id nulo) em grafite; o
// consultor que a gestão não vê mais (mudou de consultoria: nome nulo) é "Outro consultor" (2, 3… se houver mais de um).
function seriesDe(series) {
  let semNome = 0
  return series.map((s, i) => ({
    nome: s.id == null ? s.nome ?? 'Outros' : s.nome ?? (++semNome > 1 ? `Outro consultor ${semNome}` : 'Outro consultor'),
    cor: s.id == null ? COR_OUTROS : corDaSerie(i),
    horas: s.horas,
    outros: s.id == null,
  }))
}

// Horas por consultor (gestão) ou por consultoria (central) por semana (pedido do Diego, 19/11): colunas empilhadas, as 8
// maiores e "Outros" (horas_por_unidade_por_semana). As semanas são inteiras (segunda a domingo), como em check-ins por
// semana: as das pontas podem ter horas de fora do período, e o subtítulo diz isso. A semana de hoje em destaque.
export default function HorasPorUnidade({ dados, recorte, periodo, erro = false, atualizando = false, aoTentarDeNovo }) {
  const central = (dados?.recorte ?? recorte) === 'tudo'
  const titulo = `Horas por ${central ? 'consultoria' : 'consultor'} por semana`
  if (erro || !dados) {
    return <CartaoDeGrafico titulo={titulo} subtitulo={SUBTITULO} estado={erro ? 'erro' : 'carregando'} altura={ALTURA}
      erro="Não foi possível carregar as horas por semana." aoTentarDeNovo={aoTentarDeNovo} />
  }

  const series = seriesDe(dados.series)
  const { semanas } = dados
  const vazio = !series.some((s) => s.horas.some((h) => h > 0))
  const destaque = semanas.indexOf(segundaDe(hojeEmSP()))
  const total = (i) => series.reduce((soma, s) => soma + (s.horas[i] ?? 0), 0)

  return (
    <CartaoDeGrafico titulo={titulo} subtitulo={SUBTITULO} leitura={vazio ? null : fraseDasHorasPorUnidade({ semanas, series }, periodo)}
      legenda={vazio ? null : series.map((s) => ({ forma: 'quadrado', cor: s.cor, texto: s.nome }))}
      altura={ALTURA} atualizando={atualizando} estado={vazio ? 'vazio' : 'pronto'} vazio={`Nenhuma hora ${noPeriodo(periodo)}.`}
      tabela={{
        rotulo: titulo,
        colunas: ['Semana de', ...series.map((s) => s.nome), 'Total'],
        linhas: semanas.map((semana, i) => [diaMes(semana), ...series.map((s) => formatarHoras(s.horas[i] ?? 0)), formatarHoras(total(i))]),
      }}>
      <ColunasEmpilhadas rotulo={titulo} altura={ALTURA} categorias={semanas.map(diaMes)} destaque={destaque >= 0 ? destaque : undefined}
        series={series.map((s) => ({ nome: s.nome, cor: s.cor, valores: s.horas }))} />
    </CartaoDeGrafico>
  )
}
