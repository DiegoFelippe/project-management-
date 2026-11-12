import { ArrowLeft, Pencil, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Avatar from '@/components/comum/Avatar'
import Cabecalho from '@/components/comum/Cabecalho'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import EditarTime from '@/components/times/EditarTime'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SelectNativo } from '@/components/ui/select-nativo'
import { listarPessoas } from '@/data/pessoas'
import { adicionarMembro, apagarTime, buscarTime, editarTime, removerMembro } from '@/data/times'

export default function Time() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [editando, setEditando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const { perfil } = useAuth()
  const [time, setTime] = useState(undefined)
  const [pessoas, setPessoas] = useState([])
  const [escolhida, setEscolhida] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [versao, setVersao] = useState(0)
  const carregar = () => setVersao((v) => v + 1)

  useEffect(() => {
    let ativo = true
    buscarTime(id)
      .then((achado) => ativo && setTime(achado))
      .catch(() => ativo && setTime(null))
    return () => {
      ativo = false
    }
  }, [id, versao])

  // Mexer no time: administrador da consultoria ou o gestor do time. O dono só olha.
  const gerencio = Boolean(time) && (perfil.papel === 'admin' || (perfil.papel === 'gestor' && time.gestor_id === perfil.id))

  useEffect(() => {
    if (!gerencio) return
    listarPessoas({ consultoriaId: perfil.consultoria_id }).then(setPessoas).catch(() => setPessoas([]))
  }, [gerencio, perfil.consultoria_id])

  const disponiveis = useMemo(() => {
    if (!time) return []
    const noTime = new Set([time.gestor_id, ...time.membros.map((m) => m.id)])
    return pessoas.filter((p) => !noTime.has(p.id))
  }, [pessoas, time])

  async function colocar() {
    if (!escolhida) return
    setOcupado(true)
    const { erro } = await adicionarMembro(time.id, escolhida)
    setOcupado(false)
    if (erro) return toast.error(erro)
    setEscolhida('')
    carregar()
  }

  async function tirar(pessoa) {
    setOcupado(true)
    const { erro } = await removerMembro(time.id, pessoa.id)
    setOcupado(false)
    if (erro) return toast.error(erro)
    toast.success(`${pessoa.nome} saiu do time.`)
    carregar()
  }

  const voltar = (
    <Link to="/times" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Times
    </Link>
  )

  if (time === undefined) return <GraficoCarregando texto="Carregando o time…" className="py-12" />
  if (time === null) {
    return (
      <>
        {voltar}
        <p className="text-sm text-muted-foreground">Esse time não existe ou você não tem acesso a ele.</p>
      </>
    )
  }

  return (
    <>
      {voltar}
      <Cabecalho titulo={time.nome} descricao={`Gestor: ${time.gestor?.nome ?? '—'}`}>
        {gerencio && (
          <>
            <Button variant="outline" onClick={() => setEditando(true)}>
              <Pencil /> Editar
            </Button>
            <Button variant="outline" onClick={() => setApagando(true)}
              className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
              <Trash2 /> Apagar time
            </Button>
          </>
        )}
      </Cabecalho>
      {editando && (
        <EditarTime key={time.id + time.nome} aberto time={time} papelDeQuemEdita={perfil.papel}
          gestores={pessoas.filter((p) => p.papel === 'gestor' || p.papel === 'admin')}
          aoFechar={() => setEditando(false)}
          aoSalvar={async (dados) => {
            const resposta = await editarTime(time.id, dados)
            if (!resposta.erro) {
              toast.success('Time atualizado.')
              carregar()
            }
            return resposta
          }} />
      )}
      <ConfirmarAcao aberto={apagando} aoFechar={() => setApagando(false)} titulo={`Apagar o time ${time.nome}?`}
        descricao="O time some de vez. As pessoas continuam com acesso; só saem deste time."
        rotuloConfirmar="Apagar time"
        aoConfirmar={async () => {
          const resposta = await apagarTime(time.id)
          if (!resposta.erro) {
            toast.success(`Time ${time.nome} apagado.`)
            navigate('/times', { replace: true })
          }
          return resposta
        }} />
      {time.descricao && <p className="-mt-3 mb-5 text-sm text-muted-foreground">{time.descricao}</p>}

      {gerencio && (
        <div className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-xs">
          <div className="grid min-w-56 flex-1 gap-1.5">
            <Label htmlFor="colocar-pessoa">Colocar pessoa</Label>
            <SelectNativo id="colocar-pessoa" value={escolhida} onChange={(e) => setEscolhida(e.target.value)}>
              <option value="">{disponiveis.length ? 'Escolha…' : 'Ninguém disponível'}</option>
              {disponiveis.map((p) => (
                <option key={p.id} value={p.id}>{p.nome} ({p.email})</option>
              ))}
            </SelectNativo>
          </div>
          <Button onClick={colocar} disabled={!escolhida || ocupado}>
            <UserPlus /> Colocar no time
          </Button>
        </div>
      )}

      {time.membros.length === 0 && <ListaVazia>Ninguém no time ainda.</ListaVazia>}
      {time.membros.length > 0 && (
        <Tabela rotulo="Pessoas do time" colunas={['Nome', 'Papel']} larguraMinima={560}>
          {time.membros.map((p) => (
            <Linha key={p.id}>
              <Celula>
                <div className="flex items-center gap-3">
                  <Avatar pessoa={p} className="size-8 text-[11px]" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                </div>
              </Celula>
              <Celula className="text-muted-foreground">{NOME_DO_PAPEL[p.papel]}</Celula>
              <CelulaAcoes>
                {gerencio && (
                  <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => tirar(p)}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <UserMinus /> Tirar do time
                  </Button>
                )}
              </CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
    </>
  )
}
