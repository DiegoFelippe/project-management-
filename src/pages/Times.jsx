import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Avatar from '@/components/comum/Avatar'
import BarraDeFiltros, { AcaoPrincipal, CampoBusca } from '@/components/comum/BarraDeFiltros'
import Cabecalho from '@/components/comum/Cabecalho'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import EditarTime from '@/components/times/EditarTime'
import NovoTime from '@/components/times/NovoTime'
import { Button } from '@/components/ui/button'
import { buscarPessoas } from '@/data/pessoas'
import { apagarTime, criarTime, editarTime, listarTimes } from '@/data/times'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'

// Rostos: o gestor e os primeiros membros (amostra que vem do banco); o número é o total contado no banco.
function Rostos({ time }) {
  const visiveis = [time.gestor, ...time.membros.filter((m) => m.id !== time.gestor?.id)].filter(Boolean).slice(0, 4)
  const total = time.totalMembros + (time.gestor ? 1 : 0)
  const resto = total - visiveis.length
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center">
        {visiveis.map((p, i) => (
          <Avatar key={p.id} pessoa={p} className={i ? '-ml-1.5' : ''} />
        ))}
        {resto > 0 && (
          <span className="-ml-1.5 grid size-7 place-items-center rounded-full bg-muted text-mini font-bold text-muted-foreground ring-2 ring-card">
            +{resto > 99 ? '99' : resto}
          </span>
        )}
      </div>
      <span className="text-muted-foreground">{total.toLocaleString('pt-BR')} {total === 1 ? 'pessoa' : 'pessoas'}</span>
    </div>
  )
}

export default function Times() {
  const { perfil } = useAuth()
  const ehDono = veTudo(perfil)
  const [consultoriaId, setConsultoriaId] = useState(ehDono ? '' : perfil.consultoria_id)
  const [resultado, setResultado] = useState(null)
  const [pagina, setPagina] = useState(1)
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [erro, setErro] = useState(null)
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [apagando, setApagando] = useState(null)
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)

  // Uma página por vez, paginada no banco (regra "Escala" no CLAUDE.md).
  useEffect(() => {
    let ativo = true
    listarTimes({ consultoriaId: consultoriaId || undefined, busca: buscaAtrasada || undefined, pagina })
      .then((r) => {
        if (!ativo) return
        if (r.foraDaFaixa && pagina > 1) return setPagina(1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os times.'))
    return () => {
      ativo = false
    }
  }, [consultoriaId, buscaAtrasada, pagina, versao])

  // Gestores para escolher ao criar ou editar um time (o administrador): busca no banco pelo nome, nunca a lista inteira.
  const buscarGestores = useCallback(
    (termo) => buscarPessoas({ consultoriaId: perfil.consultoria_id, papeis: ['gestor', 'admin'], termo }),
    [perfil.consultoria_id],
  )

  // Mexer no time: administrador da consultoria ou o gestor do time. O dono só olha.
  const gerencio = (time) => perfil.papel === 'admin' || (perfil.papel === 'gestor' && time.gestor_id === perfil.id)

  async function salvarEdicao(time, dados) {
    const resposta = await editarTime(time.id, dados)
    if (!resposta.erro) {
      toast.success(`Time ${dados.nome} atualizado.`)
      recarregar()
    }
    return resposta
  }

  async function apagar(time) {
    const resposta = await apagarTime(time.id)
    if (!resposta.erro) {
      toast.success(`Time ${time.nome} apagado.`)
      recarregar()
    }
    return resposta
  }

  async function criar(dados) {
    const resposta = await criarTime({
      ...dados,
      gestorId: dados.gestorId ?? perfil.id,
      consultoriaId: perfil.consultoria_id,
    })
    if (resposta.erro) return resposta
    toast.success(`Time ${dados.nome} criado.`)
    setNovo(false)
    recarregar()
    return resposta
  }

  const times = resultado?.itens ?? null
  const total = resultado?.total ?? 0

  return (
    <>
      <Cabecalho titulo="Times" descricao={resultado ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'time' : 'times'}` : null} />
      <BarraDeFiltros>
        <CampoBusca rotulo="Buscar times" placeholder="Buscar time" valor={busca}
          aoMudar={(texto) => { setBusca(texto); setPagina(1) }} />
        {ehDono && <FiltroConsultoria valor={consultoriaId} aoMudar={(id) => { setConsultoriaId(id); setPagina(1) }} />}
        {!ehDono && (
          <AcaoPrincipal>
            <Button onClick={() => setNovo(true)}>
              <Plus /> Novo time
            </Button>
          </AcaoPrincipal>
        )}
      </BarraDeFiltros>
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && times === null && <GraficoCarregando texto="Carregando os times…" className="py-12" />}
      {times?.length === 0 && (
        <ListaVazia>{buscaAtrasada ? 'Nenhum time encontrado.' : ehDono ? 'Nenhum time por aqui.' : 'Nenhum time ainda. Crie o primeiro em "Novo time".'}</ListaVazia>
      )}
      {times?.length > 0 && (
        <Tabela rotulo="Times" colunas={['Time', 'Gestor', 'Pessoas']} paginacao={{ pagina, total, aoMudar: setPagina }}>
          {times.map((t) => (
            <Linha key={t.id}>
              <Celula>
                <Link to={`/times/${t.id}`} className="font-semibold hover:text-primary hover:underline">{t.nome}</Link>
                {t.descricao && <p className="truncate text-rotulo text-muted-foreground">{t.descricao}</p>}
              </Celula>
              <Celula className="text-muted-foreground">{t.gestor?.nome ?? '—'}</Celula>
              <Celula><Rostos time={t} /></Celula>
              <CelulaAcoes>
                {gerencio(t) && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditando(t)}>
                      <Pencil /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setApagando(t)}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 /> Apagar
                    </Button>
                  </>
                )}
              </CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
      {editando && (
        <EditarTime key={editando.id} aberto time={editando} papelDeQuemEdita={perfil.papel} buscarGestores={buscarGestores}
          aoFechar={() => setEditando(null)} aoSalvar={(dados) => salvarEdicao(editando, dados)} />
      )}
      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo={`Apagar o time ${apagando.nome}?`}
          descricao="O time some de vez. As pessoas continuam com acesso; só saem deste time."
          rotuloConfirmar="Apagar time" aoConfirmar={() => apagar(apagando)} />
      )}
      <NovoTime aberto={novo} aoFechar={() => setNovo(false)} papelDeQuemCria={perfil.papel}
        buscarGestores={buscarGestores} aoCriar={criar} />
    </>
  )
}
