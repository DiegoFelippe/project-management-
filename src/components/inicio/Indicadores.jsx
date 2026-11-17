import { Gauge, Hourglass, Timer, Users } from 'lucide-react'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import { colunasDoMes, formatarHoras, formatarOcupacao } from '@/lib/horas'

const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

// Os números do mês ou do período, como vieram do banco (painel_do_inicio), nos cartões do padrão. Mês passado e
// qualquer período: "Utilização" e nada de reservado. Sem `painel` (carregando), os rótulos saem de `pessoa` (o
// consultor), `passado` e `intervalo` (período que não é o Mês), e os números ficam "—".
export default function Indicadores({ painel, pessoa, passado: passadoAgora, intervalo: intervaloAgora = false }) {
  const recorte = painel?.recorte ?? (pessoa ? 'pessoa' : 'consultoria')
  const passado = painel?.passado ?? passadoAgora
  const intervalo = painel?.intervalo ?? intervaloAgora
  const noQue = intervalo ? 'no período' : 'no mês'
  const i = painel?.indicadores
  const acima = i?.ocupacao > 1
  const hoje = passado ? ' hoje' : ''
  const ocupacao = {
    chave: 'ocupacao', rotulo: colunasDoMes(passado).at(-1), icone: Gauge, tom: acima ? 'perigo' : 'ceu',
    valor: i ? formatarOcupacao(i.ocupacao) : null, destaque: acima ? 'perigo' : null,
  }
  const realizado = { chave: 'realizado', rotulo: 'Realizado', icone: Timer, tom: 'positivo', valor: i ? formatarHoras(i.realizado) : null }

  const cartoes = recorte === 'pessoa'
    ? [
      { chave: 'clientes', rotulo: `Meus clientes${hoje}`, icone: Users, valor: i?.clientes_ativos },
      { chave: 'capacidade', rotulo: 'Minha capacidade', icone: Hourglass, tom: 'neutro', valor: i ? formatarHoras(i.capacidade) : null,
        detalhe: i && !passado ? `Reservado ${formatarHoras(i.reservado)}` : null },
      ocupacao,
      realizado,
    ]
    : [
      { chave: 'clientes', rotulo: `Clientes ativos${hoje}`, icone: Users, valor: i?.clientes_ativos,
        detalhe: i ? `${plural(i.clientes_novos, 'novo', 'novos')} ${noQue}` : null },
      { chave: 'aguardando', rotulo: `Aguardando consultor${hoje}`, icone: Hourglass, tom: 'aviso', valor: i?.aguardando,
        destaque: i?.aguardando > 0 ? 'atencao' : null,
        detalhe: i && recorte === 'tudo'
          ? `${i.a_distribuir.toLocaleString('pt-BR')} a distribuir · ${i.sem_consultor.toLocaleString('pt-BR')} sem consultor` : null },
      { ...ocupacao,
        detalhe: i ? `Capacidade ${formatarHoras(i.capacidade)}${passado ? '' : ` · reservado ${formatarHoras(i.reservado)}`}` : null },
      realizado,
    ]

  return <CartoesDeNumeros rotulo={intervalo ? 'Indicadores do período' : 'Indicadores do mês'} cartoes={cartoes} className="mb-0" />
}
