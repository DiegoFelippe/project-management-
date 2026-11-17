import { AlarmClock, CalendarClock, LayoutList, UserX } from 'lucide-react'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'

// Os 4 números do quadro, como no Mochi, contados no banco (indicadores_do_quadro): só cartões não arquivados; atrasados
// e "vencem em 7 dias" sem as colunas de concluídos. Seguem só o filtro de responsável da barra (busca, prioridade e
// prazo não mudam os números, como nas outras telas: CLAUDE.md). Sem `indicadores` (carregando), "—".
const CARTOES = [
  { chave: 'cartoes', rotulo: 'Cartões no quadro', icone: LayoutList, tom: 'azul' },
  { chave: 'atrasados', rotulo: 'Atrasados', icone: AlarmClock, tom: 'perigo', destaque: 'perigo' },
  { chave: 'vencem_em_7_dias', rotulo: 'Vencem em 7 dias', icone: CalendarClock, tom: 'aviso' },
  { chave: 'sem_responsavel', rotulo: 'Sem responsável', icone: UserX, tom: 'neutro' },
]

export default function IndicadoresDoQuadro({ indicadores }) {
  return (
    <CartoesDeNumeros rotulo="Indicadores do quadro"
      cartoes={CARTOES.map(({ destaque, ...c }) => {
        const valor = indicadores ? Number(indicadores[c.chave] ?? 0) : null
        return { ...c, valor, destaque: valor > 0 ? destaque : undefined }
      })} />
  )
}
