import { colunasDoMes, formatarHoras, formatarOcupacao } from '@/lib/horas'
import { cn } from '@/lib/utils'

function Indicador({ rotulo, valor, detalhe, tom }) {
  return (
    <div className="card p-4" data-indicador={rotulo}>
      <p className="text-corpo text-muted-foreground">{rotulo}</p>
      <p className={cn('mt-1 text-destaque font-bold tabular-nums',
        tom === 'atencao' && 'text-notice', tom === 'acima' && 'text-destructive')}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-rotulo text-muted-foreground">{detalhe}</p>}
    </div>
  )
}

const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

// Os números do mês, como vieram do banco. Mês passado: "Utilização" e nada de reservado.
export default function Indicadores({ painel }) {
  const { recorte, passado, indicadores: i } = painel
  const rotuloOcupacao = colunasDoMes(passado).at(-1)
  const acima = i.ocupacao > 1
  const capacidade = `Capacidade ${formatarHoras(i.capacidade)}${passado ? '' : ` · reservado ${formatarHoras(i.reservado)}`}`

  if (recorte === 'pessoa') {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo={passado ? 'Meus clientes hoje' : 'Meus clientes'} valor={i.clientes_ativos.toLocaleString('pt-BR')} />
        <Indicador rotulo="Minha capacidade" valor={formatarHoras(i.capacidade)} detalhe={passado ? null : `Reservado ${formatarHoras(i.reservado)}`} />
        <Indicador rotulo={rotuloOcupacao} valor={formatarOcupacao(i.ocupacao)} tom={acima ? 'acima' : null} />
        <Indicador rotulo="Realizado" valor={formatarHoras(i.realizado)} />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Indicador rotulo={passado ? 'Clientes ativos hoje' : 'Clientes ativos'} valor={i.clientes_ativos.toLocaleString('pt-BR')}
        detalhe={`${plural(i.clientes_novos, 'novo', 'novos')} no mês`} />
      <Indicador rotulo={passado ? 'Aguardando consultor hoje' : 'Aguardando consultor'} valor={i.aguardando.toLocaleString('pt-BR')} tom={i.aguardando > 0 ? 'atencao' : null}
        detalhe={recorte === 'tudo' ? `${i.a_distribuir.toLocaleString('pt-BR')} a distribuir · ${i.sem_consultor.toLocaleString('pt-BR')} sem consultor` : null} />
      <Indicador rotulo={rotuloOcupacao} valor={formatarOcupacao(i.ocupacao)} tom={acima ? 'acima' : null} detalhe={capacidade} />
      <Indicador rotulo="Realizado" valor={formatarHoras(i.realizado)} />
    </div>
  )
}
