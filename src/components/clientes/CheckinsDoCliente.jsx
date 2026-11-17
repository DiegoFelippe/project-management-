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

// Edita e apaga: o próprio consultor ou admin/gestor, sempre na consultoria do check-in (quem saiu dela só
// vê). A central só vê.
function podeMexer(perfil, checkin) {
  if (perfil.consultoria_id !== checkin.consultoria_id) return false
  return perfil.id === checkin.consultor_id || ['admin', 'gestor'].includes(perfil.papel)
}

// Tabela Check-ins do cliente (de todos os consultores), paginada no banco.
// aoMudar() avisa a página depois de editar ou apagar, para recarregar o realizado.
export default function CheckinsDoCliente({ cliente, perfil, versao, aoMudar }) {
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [editando, setEditando] = useState(null)
  const [apagando, setApagando] = useState(null)

  useEffect(() => {
    let ativo = true
    listarCheckins({ clienteId: cliente.id, pagina })
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
  }, [cliente.id, pagina, versao])

  async function salvar(checkin, dados) {
    const resposta = await editarCheckin(checkin.id, dados)
    if (!resposta.erro) {
      toast.success('Check-in atualizado.')
      aoMudar()
    }
    return resposta
  }

  async function apagar(checkin) {
    const resposta = await apagarCheckin(checkin.id)
    if (!resposta.erro) {
      toast.success('Check-in apagado.')
      aoMudar()
    }
    return resposta
  }

  const itens = resultado?.itens ?? null
  return (
    <section aria-labelledby="titulo-checkins" className="grid grid-cols-1 gap-2">
      <h2 id="titulo-checkins" className="text-janela font-bold">Check-ins</h2>
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && itens === null && <GraficoCarregando texto="Carregando os check-ins…" className="py-8" />}
      {itens?.length === 0 && <ListaVazia>Nenhum check-in neste cliente ainda.</ListaVazia>}
      {itens?.length > 0 && (
        <Tabela rotulo="Check-ins" colunas={['Data', 'Consultor', 'Horas', 'O que foi feito']}
          paginacao={{ pagina, total: resultado.total, aoMudar: setPagina }}>
          {itens.map((c) => {
            const inicio = new Date(c.inicio)
            const fim = c.fim ? new Date(c.fim) : null
            const mexe = podeMexer(perfil, c)
            return (
              <Linha key={c.id}>
                <Celula className="tabular-nums text-muted-foreground">
                  {DATA.format(inicio)} {HORA.format(inicio)}{fim ? ` – ${HORA.format(fim)}` : ''}
                </Celula>
                <Celula className="font-medium">{c.consultor?.nome ?? '—'}</Celula>
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
        <JanelaCheckin key={editando.id} aberto modo="editar" nomeDoCliente={cliente.nome} checkin={editando}
          aoFechar={() => setEditando(null)} aoSalvar={(dados) => salvar(editando, dados)} />
      )}
      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo="Apagar este check-in?"
          descricao="As horas deste atendimento somem do realizado do cliente. Não dá para desfazer."
          rotuloConfirmar="Apagar check-in" aoConfirmar={() => apagar(apagando)} />
      )}
    </section>
  )
}
