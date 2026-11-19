import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import TarefasMarcadas from '@/components/checkins/TarefasMarcadas'
import { GraficoCarregando } from '@/components/comum/Carregando'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { AcaoDaLinha, Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { Badge } from '@/components/ui/badge'
import { apagarCheckin, editarCheckin, listarCheckins } from '@/data/checkins'
import { formatarHoras, horasEntre } from '@/lib/horas'
import { veTudo } from '@/lib/papeis'
import { useListaPaginada } from '@/lib/useListaPaginada'
import JanelaCheckin from './JanelaCheckin'

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

const lerCheckins = ({ clienteId, pagina }) => listarCheckins({ clienteId, pagina })

// Edita e apaga: o próprio consultor ou admin/gestor, sempre na consultoria do check-in (quem saiu dela só
// vê). A central só vê.
function podeMexer(perfil, checkin) {
  if (perfil.consultoria_id !== checkin.consultoria_id) return false
  return perfil.id === checkin.consultor_id || ['admin', 'gestor'].includes(perfil.papel)
}

// Tabela Check-ins do cliente (de todos os consultores), paginada no banco, com as tarefas do check-list marcadas em
// cada check-in (até 3, as primeiras, e "+N", contado no banco).
// aoMudar() avisa a página depois de editar ou apagar, para recarregar o realizado.
export default function CheckinsDoCliente({ cliente, perfil, versao, aoMudar }) {
  const [editando, setEditando] = useState(null)
  const [apagando, setApagando] = useState(null)
  const { itens, erro: falhou, paginacao } = useListaPaginada(lerCheckins, { clienteId: cliente.id }, { versao })
  const erro = falhou ? 'Não foi possível carregar os check-ins.' : null
  // A central só vê: a tabela fica sem a coluna de ações.
  const soVe = veTudo(perfil)

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

  return (
    <section aria-labelledby="titulo-checkins" className="grid grid-cols-1 gap-2">
      <h2 id="titulo-checkins" className="text-janela font-bold">Check-ins</h2>
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && itens === null && <GraficoCarregando texto="Carregando os check-ins…" className="py-8" />}
      {itens?.length === 0 && <ListaVazia>Nenhum check-in neste cliente ainda.</ListaVazia>}
      {itens?.length > 0 && (
        <Tabela rotulo="Check-ins" colunas={['Data', 'Consultor', 'Horas', 'Tarefas marcadas', 'O que foi feito']} larguraMinima={880}
          semAcoes={soVe} paginacao={paginacao}>
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
                <Celula className="max-w-72 min-w-44">
                  {c.tarefas?.length
                    ? <TarefasMarcadas tarefas={c.tarefas} total={c.total_tarefas ?? c.tarefas.length} rotulo="Tarefas marcadas" />
                    : <span className="text-muted-foreground">—</span>}
                </Celula>
                <Celula className="max-w-md truncate text-muted-foreground">{c.descricao || '—'}</Celula>
                {!soVe && (
                  <CelulaAcoes>
                    <AcaoDaLinha nome="Editar" icone={Pencil} visivel={mexe} onClick={() => setEditando(c)} />
                    <AcaoDaLinha nome="Apagar" icone={Trash2} perigo visivel={mexe} onClick={() => setApagando(c)} />
                  </CelulaAcoes>
                )}
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
          descricao="As horas deste atendimento somem do realizado do cliente. As tarefas marcadas nele continuam feitas no check-list. Não dá para desfazer."
          rotuloConfirmar="Apagar check-in" aoConfirmar={() => apagar(apagando)} />
      )}
    </section>
  )
}
