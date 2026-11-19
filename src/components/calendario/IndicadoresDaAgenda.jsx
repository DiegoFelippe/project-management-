import { CalendarCheck, CalendarDays, FolderCheck, Hourglass } from 'lucide-react'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'

// Os 4 números da agenda, como os do Hub, do banco (indicadores_da_agenda, no recorte de quem vê). "Reunião" é evento
// com cliente ou com Meet; a semana vai de domingo a sábado. Sem `indicadores` (carregando), "—".
const CARTOES = [
  { chave: 'semana', rotulo: 'Reuniões na semana', icone: CalendarDays, tom: 'azul' },
  { chave: 'mes', rotulo: 'Reuniões no mês', icone: CalendarCheck, tom: 'ceu' },
  { chave: 'aguardando', rotulo: 'Aguardando transcrição', icone: Hourglass, tom: 'aviso' },
  { chave: 'pastas_no_mes', rotulo: 'Pastas criadas no mês', icone: FolderCheck, tom: 'positivo' },
]

export default function IndicadoresDaAgenda({ indicadores }) {
  return (
    <CartoesDeNumeros rotulo="Indicadores da agenda"
      cartoes={CARTOES.map((c) => ({ ...c, valor: indicadores ? Number(indicadores[c.chave] ?? 0) : null }))} />
  )
}
