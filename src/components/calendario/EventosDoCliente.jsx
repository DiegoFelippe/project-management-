import { useState } from 'react'
import { Eye, Folder, PlayCircle, Video } from 'lucide-react'
import Avatar from '@/components/comum/Avatar'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { AcaoDaLinha, Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { Badge } from '@/components/ui/badge'
import { eventosDoCliente } from '@/data/agenda'
import { diasDoEvento, horarioNoDia } from '@/lib/calendario'
import { formatarDia } from '@/lib/mes'
import { useListaPaginada } from '@/lib/useListaPaginada'
import { cn } from '@/lib/utils'
import { situacaoDaReuniao } from './situacaoDaReuniao'

const ROTULO = 'Eventos do cliente'
const COLUNAS = ['Data', 'Horário', 'Título', 'Organizador', 'Situação']

// A data da linha: o dia do início; no evento de dia inteiro de mais de um dia, até o último ("18–20/11/2026",
// "30/11–02/12/2026", "30/12/2026–02/01/2027"). O de horário mostra o fim no Horário ("22:00 – 19/11 02:00").
function dataDoEvento(evento, primeiro, ultimo) {
  if (!evento.dia_inteiro || ultimo === primeiro) return formatarDia(primeiro)
  const [inicio, fim] = [formatarDia(primeiro), formatarDia(ultimo)]
  if (primeiro.slice(0, 4) !== ultimo.slice(0, 4)) return `${inicio}–${fim}`
  if (primeiro.slice(0, 7) !== ultimo.slice(0, 7)) return `${inicio.slice(0, 5)}–${fim}`
  return `${inicio.slice(0, 2)}–${fim}`
}

// O que a agenda mostra da reunião: Meet, gravação e a situação depois dela (os mesmos nomes do detalhe do evento).
function Situacao({ evento, agora }) {
  const { info } = situacaoDaReuniao(evento, agora)
  const selos = []
  if (evento.meet_link || evento.com_meet) selos.push(<Badge key="meet" variant="secondary"><Video aria-hidden="true" />Meet</Badge>)
  if (evento.gravacao_url) selos.push(<Badge key="gravacao" variant="secondary"><PlayCircle aria-hidden="true" />Gravação</Badge>)
  if (info) {
    selos.push(
      <Badge key="situacao" variant="outline" className={cn('border-transparent', info.tom)}>
        <info.icone aria-hidden="true" />{info.rotulo}
      </Badge>,
    )
  } else if (evento.pasta_id) {
    selos.push(<Badge key="pasta" variant="secondary"><Folder aria-hidden="true" />Pasta</Badge>)
  }
  if (!selos.length) return <span className="text-muted-foreground">—</span>
  return <div className="flex flex-wrap gap-1">{selos}</div>
}

// "Eventos do cliente", a visão Todos da agenda do cliente (pedido do Diego, 17/11): todos os eventos dele, de todas as
// datas, numa tabela paginada no banco (15 por página, do mais novo para o mais antigo: o futuro em cima), rente dentro do
// cartão do calendário. O de hoje e o próximo (o banco diz qual) ganham um selo. "Abrir" abre a mesma janela do
// calendário. `versao` muda quando um evento é criado, editado ou apagado: a lista relê a página em que está. O "Mostrar"
// da barra não filtra esta lista: Todos mostra todos os eventos do cliente, de propósito (ele vale para as visões do
// calendário).
export default function EventosDoCliente({ clienteId, hoje, versao = 0, aoAbrir }) {
  const [agora] = useState(() => Date.now())
  const { resultado, erro, paginacao } = useListaPaginada(eventosDoCliente, { clienteId }, { versao })

  if (!erro && resultado?.itens.length) {
    return (
      <Tabela rotulo={ROTULO} semCartao colunas={COLUNAS} larguraMinima={760}
        paginacao={paginacao}>
        {resultado.itens.map((evento) => {
          const dias = diasDoEvento(evento)
          const [dia, ultimo] = [dias[0], dias.at(-1)]
          // Hoje: começa hoje ou está acontecendo (começou antes e ainda não acabou).
          const deHoje = dia <= hoje && hoje <= ultimo
          const proximo = evento.id === resultado.proximoId
          const organizador = evento.consultor
          return (
            <Linha key={evento.id}>
              <Celula className="whitespace-nowrap">
                <span className="tabular-nums">{dataDoEvento(evento, dia, ultimo)}</span>
                {(deHoje || proximo) && (
                  <span className="ml-2 inline-flex gap-1 align-middle">
                    {deHoje && <Badge variant="notice">Hoje</Badge>}
                    {proximo && <Badge>Próximo</Badge>}
                  </span>
                )}
              </Celula>
              <Celula className="whitespace-nowrap tabular-nums">{horarioNoDia(evento, dia)}</Celula>
              <Celula className="font-medium">{evento.titulo}</Celula>
              <Celula>
                {organizador ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar pessoa={organizador} className="size-6" />
                    <span className="truncate">{organizador.nome}</span>
                  </span>
                ) : <span className="text-muted-foreground">—</span>}
              </Celula>
              <Celula><Situacao evento={evento} agora={agora} /></Celula>
              <CelulaAcoes>
                <AcaoDaLinha nome={`Abrir ${evento.titulo}`} icone={Eye} onClick={() => aoAbrir(evento)} />
              </CelulaAcoes>
            </Linha>
          )
        })}
      </Tabela>
    )
  }

  return (
    <div className="p-2 sm:p-4">
      {erro && <p role="alert" className="text-corpo text-destructive">Não foi possível carregar os eventos do cliente. Tente de novo.</p>}
      {!erro && !resultado && <GraficoCarregando texto="Carregando os eventos…" className="py-6" />}
      {!erro && resultado && <ListaVazia>Nenhum evento marcado para este cliente.</ListaVazia>}
    </div>
  )
}
