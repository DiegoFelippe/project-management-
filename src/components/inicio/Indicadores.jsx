import { Gauge, Hourglass, ListChecks, Timer, Users } from 'lucide-react'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { rotuloDaComparacao } from '@/lib/periodo'
import { variacao } from '@/lib/variacao'

// Recorte de quem vê pelo papel, enquanto o painel não chega (depois vale o do banco).
const RECORTE_DO_PAPEL = { central: 'tudo', dono: 'tudo', pessoa: 'pessoa' }

// Os 4 números do mês ou do período (painel_do_inicio), com os ícones na paleta de 19/11 (azul, violeta, turquesa,
// mostarda; a ocupação acima de 100% no vermelho do perigo) e a variação contra o período anterior (comparacao_do_inicio):
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
  // Os números correm até o valor quando chega um período novo (a chave é o período dos dados: numa releitura do mesmo
  // período, depois de um check-in no Início, o número novo aparece direto; ao trocar o período, os de antes ficam a 60%
  // até chegarem os novos, que correm).
  const chave = painel ? `${painel.intervalo}|${painel.de}|${painel.ate}` : null
  const contagem = (numero, formatar) => ({ numero: numero ?? null, formatar, chave })
  const cartoes = [
    { chave: 'realizado', rotulo: 'Realizado', icone: Timer, tom: 'azul', contagem: contagem(i?.realizado, formatarHoras),
      variacao: linha('realizado', { tipo: 'percentual', unidade: 'h' }) },
    { chave: 'ocupacao', rotulo: `${consultor ? 'Minha ' : ''}${passado ? 'utilização' : 'ocupação'}`.replace(/^./, (c) => c.toUpperCase()),
      icone: Gauge, tom: acima ? 'perigo' : 'violeta', destaque: acima ? 'perigo' : null, contagem: contagem(i?.ocupacao, formatarOcupacao),
      variacao: linha('ocupacao', { tipo: 'pontos', limiteDoBom: 1 }) },
    { chave: 'clientes', rotulo: consultor ? 'Meus clientes' : 'Clientes em atendimento', icone: Users, tom: 'turquesa',
      contagem: contagem(i?.clientes_em_atendimento), variacao: linha('clientes_em_atendimento', { tipo: 'quantidade' }) },
    consultor
      ? { chave: 'checkins', rotulo: 'Check-ins', icone: ListChecks, tom: 'mostarda', contagem: contagem(checkins),
        variacao: linha('checkins', { tipo: 'percentual', unidade: anterior && Math.abs((checkins ?? 0) - (anterior.checkins ?? 0)) === 1 ? 'check-in' : 'check-ins' }) }
      : { chave: 'aguardando', rotulo: recorte === 'tudo' ? 'Aguardando (consultoria ou consultor)' : 'Aguardando consultor', icone: Hourglass,
        tom: 'mostarda', contagem: contagem(aguardando), destaque: aguardando > 0 ? 'atencao' : null,
        variacao: linha('aguardando', { tipo: 'quantidade', subirEhBom: false }) },
  ]

  return (
    <CartoesDeNumeros rotulo={intervalo ? 'Indicadores do período' : 'Indicadores do mês'} cartoes={cartoes}
      className={`mb-0 transition-opacity duration-200 ${atualizando ? 'opacity-60' : ''}`} />
  )
}
