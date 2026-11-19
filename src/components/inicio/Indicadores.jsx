import { Gauge, Hourglass, ListChecks, Timer, Users } from 'lucide-react'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { rotuloDaComparacao } from '@/lib/periodo'
import { variacao } from '@/lib/variacao'

// Recorte de quem vê pelo papel, enquanto o painel não chega (depois vale o do banco).
const RECORTE_DO_PAPEL = { central: 'tudo', dono: 'tudo', pessoa: 'pessoa' }

// Os 4 números do mês ou do período (painel_do_inicio), com a variação contra o período anterior (comparacao_do_inicio):
// "▲ 12% vs 1–17 de out." (design "Cartões de números"). Central: Realizado, Ocupação, Clientes em atendimento e
// Aguardando (consultoria ou consultor); gestão: o mesmo com Aguardando consultor; consultor: Realizado, Minha ocupação,
// Meus clientes e Check-ins. Mês passado e período: "Utilização" (realizado ÷ capacidade). Sem `painel` (carregando),
// os rótulos saem do `papel`, de `passado` e de `intervalo`, e os números ficam "—".
// `comparacao`: o JSON do banco; null = ainda carrega (a linha mostra "—"); undefined = falhou (a linha some, o número
// fica). Comparação vazia (Mês futuro: `forma` nula) também tira a linha. `atualizando`: trocou o período e os números
// novos ainda não chegaram (os de antes ficam a 60%).
export default function Indicadores({ painel, comparacao, papel, passado: passadoAgora, intervalo: intervaloAgora = false, atualizando = false }) {
  const recorte = painel?.recorte ?? RECORTE_DO_PAPEL[papel] ?? 'consultoria'
  const passado = painel?.passado ?? passadoAgora
  const intervalo = painel?.intervalo ?? intervaloAgora
  const consultor = recorte === 'pessoa'
  const i = painel?.indicadores
  const anterior = comparacao?.indicadores
  const comparado = comparacao?.forma ? rotuloDaComparacao(comparacao) : null

  // A linha de variação de um número: "—" enquanto o painel ou a comparação carrega; nenhuma quando a comparação falhou,
  // veio vazia ou falta um dos números (variacao() devolve undefined).
  function linha(chave, opcoes) {
    if (comparacao === undefined) return undefined
    if (!i || comparacao === null) return null
    if (!comparado || !anterior) return undefined
    const v = variacao(i[chave], anterior[chave], opcoes)
    return v && { ...v, comparado }
  }

  const acima = i?.ocupacao > 1
  const aguardando = i?.aguardando
  const checkins = i?.checkins
  const cartoes = [
    { chave: 'realizado', rotulo: 'Realizado', icone: Timer, tom: 'positivo', valor: i ? formatarHoras(i.realizado) : null,
      variacao: linha('realizado', { tipo: 'percentual', unidade: 'h' }) },
    { chave: 'ocupacao', rotulo: `${consultor ? 'Minha ' : ''}${passado ? 'utilização' : 'ocupação'}`.replace(/^./, (c) => c.toUpperCase()),
      icone: Gauge, tom: acima ? 'perigo' : 'ceu', destaque: acima ? 'perigo' : null, valor: i ? formatarOcupacao(i.ocupacao) : null,
      variacao: linha('ocupacao', { tipo: 'pontos', limiteDoBom: 1 }) },
    { chave: 'clientes', rotulo: consultor ? 'Meus clientes' : 'Clientes em atendimento', icone: Users, valor: i?.clientes_em_atendimento ?? null,
      variacao: linha('clientes_em_atendimento', { tipo: 'quantidade' }) },
    consultor
      ? { chave: 'checkins', rotulo: 'Check-ins', icone: ListChecks, valor: checkins ?? null,
        variacao: linha('checkins', { tipo: 'percentual', unidade: anterior && Math.abs((checkins ?? 0) - (anterior.checkins ?? 0)) === 1 ? 'check-in' : 'check-ins' }) }
      : { chave: 'aguardando', rotulo: recorte === 'tudo' ? 'Aguardando (consultoria ou consultor)' : 'Aguardando consultor', icone: Hourglass,
        tom: 'aviso', valor: aguardando ?? null, destaque: aguardando > 0 ? 'atencao' : null,
        variacao: linha('aguardando', { tipo: 'quantidade', subirEhBom: false }) },
  ]

  return (
    <CartoesDeNumeros rotulo={intervalo ? 'Indicadores do período' : 'Indicadores do mês'} cartoes={cartoes}
      className={`mb-0 transition-opacity duration-200 ${atualizando ? 'opacity-60' : ''}`} />
  )
}
