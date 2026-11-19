import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import GraficoDeLinha from '@/components/graficos/GraficoDeLinha'
import { burnupDoPainel, fraseDoBurnupDoPainel } from '@/lib/frasesDosGraficos'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { formatarDia } from '@/lib/mes'

const ALTURA = 240
const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const noPeriodo = (p) => (p?.tipo === 'mes' ? 'no mês' : p?.tipo === 'ano' ? 'no ano' : 'no período')

function legendaDe(projecao, acima) {
  return [
    { forma: 'linha', cor: 'serie', texto: 'Realizado acumulado' },
    ...(projecao ? [{ forma: 'tracejado', cor: acima ? 'acima' : 'serie', texto: 'Projeção no ritmo de hoje' }] : []),
    { forma: 'linha', cor: 'ref', texto: 'Capacidade' },
  ]
}

// Horas no período × capacidade (Início, todos; pedido do Diego, 19/11): o realizado acumulado dia a dia até hoje (área),
// a projeção tracejada no ritmo de hoje até o fim (vermelha quando passa da capacidade) e a linha da capacidade do
// período inteiro (horas_do_painel_por_dia, no recorte de quem vê). `dados` nulo = carregando.
export default function HorasNoPeriodoDoPainel({ dados, periodo, erro = false, atualizando = false, aoTentarDeNovo }) {
  const quando = noPeriodo(periodo)
  const titulo = `Horas ${quando} × capacidade`
  if (erro || !dados) {
    return <CartaoDeGrafico titulo={titulo} estado={erro ? 'erro' : 'carregando'} altura={ALTURA} legenda={legendaDe(false)}
      erro="Não foi possível carregar as horas do período." aoTentarDeNovo={aoTentarDeNovo} />
  }

  const { dias, capacidade } = dados
  const { acumulado, ultimo, realizado, projecao, emAndamento } = burnupDoPainel(dados)
  const n = dias.length
  // Menos de 0,1 h a tela diria "0 h": vazio, como nos blocos que o banco já arredonda a 1 casa.
  const comHoras = Math.round(realizado * 10) > 0
  const acima = projecao != null && capacidade > 0 && projecao > capacidade
  // A projeção (no ritmo de hoje) vai em linha reta do realizado de hoje até o fim do período.
  const projetado = projecao != null ? acumulado.map((_, i) => (i < ultimo ? null : realizado + ((projecao - realizado) * (i - ultimo)) / (n - 1 - ultimo))) : null
  const doMes = periodo?.tipo === 'mes'
  const dia = (d) => (doMes ? diaMes(d) : formatarDia(d))
  const daCapacidade = (horas) => (capacidade > 0 ? [{ valor: formatarOcupacao(horas / capacidade), rotulo: 'da capacidade' }] : [])
  const dicas = dias.map((d, i) => {
    if (i <= ultimo) {
      return { titulo: dia(d.dia), linhas: [{ valor: formatarHoras(acumulado[i]), rotulo: 'acumulado', cor: 'serie' }, { valor: d.horas ? `+${formatarHoras(d.horas)}` : '—', rotulo: 'no dia' }, ...daCapacidade(acumulado[i])] }
    }
    if (projetado) return { titulo: dia(d.dia), linhas: [{ valor: `≈ ${formatarHoras(projetado[i])}`, rotulo: 'projeção', cor: acima ? 'acima' : 'serie', tracejado: true }, ...daCapacidade(projetado[i])] }
    return { titulo: dia(d.dia), linhas: [{ valor: '—', rotulo: 'ainda não chegou' }] }
  })
  // Os mesmos números da dica: no Mês, cada dia até hoje; num período (até 2 anos), só os dias com horas.
  const linhas = dias.slice(0, ultimo + 1).flatMap((d, i) => (doMes || d.horas
    ? [[dia(d.dia), formatarHoras(d.horas), formatarHoras(acumulado[i]), ...(capacidade > 0 ? [formatarOcupacao(acumulado[i] / capacidade)] : [])]]
    : []))

  return (
    <CartaoDeGrafico titulo={titulo} leitura={comHoras ? fraseDoBurnupDoPainel(dados, periodo) : null} legenda={legendaDe(projetado, acima)}
      altura={ALTURA} atualizando={atualizando} estado={comHoras ? 'pronto' : 'vazio'} vazio={`Nenhuma hora ${quando}.`}
      tabela={{ rotulo: 'Horas por dia', colunas: ['Dia', 'No dia', 'Acumulado', ...(capacidade > 0 ? ['Da capacidade'] : [])], linhas }}>
      {/* Período novo (dados novos) = gráfico novo, que se desenha de novo; a releitura do mesmo período não. */}
      <GraficoDeLinha key={`${dias[0]?.dia}|${n}`} altura={ALTURA} unidade="h" rotulos={dias.map((d) => diaMes(d.dia))}
        rotuloAria={`Horas ${quando}: ${formatarHoras(realizado)}${emAndamento ? ' até hoje' : ''}${capacidade > 0 ? ` de ${formatarHoras(capacidade)} de capacidade` : ''}`}
        series={[
          { nome: 'acumulado', area: true, pontos: acumulado.map((v, i) => (i <= ultimo ? v : null)) },
          ...(projetado ? [{ nome: 'projeção', tracejada: true, pontos: projetado, cor: acima ? 'acima' : undefined }] : []),
        ]}
        dicas={dicas}
        referenciaHorizontal={capacidade > 0 ? { valor: capacidade, rotulo: `Capacidade ${formatarHoras(capacidade)}` } : null}
        marcas={[
          { serie: 0, i: ultimo, lado: projetado ? 'esquerda' : 'acima', texto: formatarHoras(realizado) },
          ...(projetado ? [{ serie: 1, i: n - 1, texto: `≈ ${formatarHoras(projecao)}` }] : []),
        ]} />
    </CartaoDeGrafico>
  )
}
