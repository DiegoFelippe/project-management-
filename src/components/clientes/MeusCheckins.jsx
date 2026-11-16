import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { GraficoCarregando } from '@/components/comum/Carregando'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apagarCheckin, editarCheckin, listarCheckins } from '@/data/checkins'
import { formatarHoras, horasEntre } from '@/lib/horas'
import JanelaCheckin from './JanelaCheckin'

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })
const BOTAO_PERIGO = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'

// Tabela dos check-ins do consultor (os dele, de qualquer cliente, inclusive de quem já saiu da carteira).
// Editar e Apagar só nos da consultoria atual (consultoriaId): os de uma consultoria antiga ficam só para ver.
// aoMudar() avisa a tela depois de editar ou apagar, para ela recarregar o check-in aberto.
export default function MeusCheckins({ consultorId, consultoriaId, aoMudar }) {
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [versao, setVersao] = useState(0)
  const [editando, setEditando] = useState(null)
  const [apagando, setApagando] = useState(null)

  useEffect(() => {
    let ativo = true
    listarCheckins({ consultorId, pagina })
      .then((r) => {
        if (!ativo) return
        if (r.foraDaFaixa && pagina > 1) return setPagina(1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os check-ins.'))
    return () => {
      ativo = false
    }
  }, [consultorId, pagina, versao])

  function mudou() {
    setVersao((v) => v + 1)
    aoMudar()
  }

  async function salvar(checkin, dados) {
    const resposta = await editarCheckin(checkin.id, dados)
    if (!resposta.erro) {
      toast.success('Check-in atualizado.')
      mudou()
    }
    return resposta
  }

  async function apagar(checkin) {
    const resposta = await apagarCheckin(checkin.id)
    if (!resposta.erro) {
      toast.success('Check-in apagado.')
      mudou()
    }
    return resposta
  }

  const itens = resultado?.itens ?? null
  const total = resultado?.total ?? 0

  return (
    <>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && itens === null && <GraficoCarregando texto="Carregando os check-ins…" className="py-12" />}
      {itens?.length === 0 && <ListaVazia>Você ainda não registrou nenhum check-in.</ListaVazia>}
      {itens?.length > 0 && (
        <Tabela rotulo="Meus check-ins" colunas={['Cliente', 'Data', 'Horário', 'Horas', 'O que foi feito']}
          paginacao={{ pagina, total, aoMudar: setPagina }}>
          {itens.map((c) => {
            const inicio = new Date(c.inicio)
            const fim = c.fim ? new Date(c.fim) : null
            const mexe = c.consultoria_id === consultoriaId
            return (
              <Linha key={c.id}>
                <Celula className="font-semibold">{c.cliente?.nome ?? '—'}</Celula>
                <Celula className="tabular-nums text-muted-foreground">{DATA.format(inicio)}</Celula>
                <Celula className="tabular-nums text-muted-foreground">
                  {HORA.format(inicio)} – {fim ? HORA.format(fim) : '…'}
                </Celula>
                <Celula className="tabular-nums">
                  {fim ? formatarHoras(horasEntre(inicio, fim)) : <Badge variant="notice">Em aberto</Badge>}
                </Celula>
                <Celula className="max-w-md truncate text-muted-foreground">{c.descricao || '—'}</Celula>
                <CelulaAcoes>
                  {mexe && <Button variant="ghost" size="sm" onClick={() => setEditando(c)}><Pencil /> Editar</Button>}
                  {mexe && <Button variant="ghost" size="sm" onClick={() => setApagando(c)} className={BOTAO_PERIGO}><Trash2 /> Apagar</Button>}
                </CelulaAcoes>
              </Linha>
            )
          })}
        </Tabela>
      )}
      {editando && (
        <JanelaCheckin key={editando.id} aberto modo="editar" nomeDoCliente={editando.cliente?.nome ?? 'cliente'} checkin={editando}
          aoFechar={() => setEditando(null)} aoSalvar={(dados) => salvar(editando, dados)} />
      )}
      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo="Apagar este check-in?"
          descricao="As horas deste atendimento somem do realizado do cliente. Não dá para desfazer."
          rotuloConfirmar="Apagar check-in" aoConfirmar={() => apagar(apagando)} />
      )}
    </>
  )
}
