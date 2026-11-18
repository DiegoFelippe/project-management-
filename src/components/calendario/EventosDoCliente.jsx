import { useEffect, useState } from 'react'
import { Eye, Folder, PlayCircle, Video } from 'lucide-react'
import Avatar from '@/components/comum/Avatar'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { eventosDoCliente } from '@/data/agenda'
import { diaEmSP, horarioNoDia } from '@/lib/calendario'
import { formatarDia } from '@/lib/mes'
import { cn } from '@/lib/utils'
import { situacaoDaReuniao } from './situacaoDaReuniao'

const ROTULO = 'Eventos do cliente'
const COLUNAS = ['Data', 'Horário', 'Título', 'Organizador', 'Situação']

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
// calendário. `versao` muda quando um evento é criado, editado ou apagado: a lista relê a página em que está.
export default function EventosDoCliente({ clienteId, hoje, versao = 0, aoAbrir }) {
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(false)
  const [agora] = useState(() => Date.now())

  useEffect(() => {
    let ativo = true
    eventosDoCliente({ clienteId, pagina })
      .then((r) => {
        if (!ativo) return
        if (r.foraDaFaixa) return setPagina(1)
        setResultado(r)
        setErro(false)
      })
      .catch(() => ativo && setErro(true))
    return () => {
      ativo = false
    }
  }, [clienteId, pagina, versao])

  if (!erro && resultado?.itens.length) {
    return (
      <Tabela rotulo={ROTULO} semCartao colunas={COLUNAS} larguraMinima={760}
        paginacao={{ pagina, total: resultado.total, aoMudar: setPagina }}>
        {resultado.itens.map((evento) => {
          const dia = diaEmSP(evento.inicio)
          const deHoje = dia === hoje
          const proximo = evento.id === resultado.proximoId
          const organizador = evento.consultor
          return (
            <Linha key={evento.id}>
              <Celula className="whitespace-nowrap">
                <span className="tabular-nums">{formatarDia(dia)}</span>
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
                <Button type="button" variant="ghost" size="sm" aria-label={`Abrir ${evento.titulo}`} onClick={() => aoAbrir(evento)}>
                  <Eye /> Abrir
                </Button>
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
