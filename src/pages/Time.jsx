import { ArrowLeft, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Avatar from '@/components/comum/Avatar'
import Cabecalho from '@/components/comum/Cabecalho'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SelectNativo } from '@/components/ui/select-nativo'
import { listarPessoas } from '@/data/pessoas'
import { adicionarMembro, buscarTime, removerMembro } from '@/data/times'

export default function Time() {
  const { id } = useParams()
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

  if (time === undefined) return <p className="text-sm text-muted-foreground">Carregando…</p>
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
      <Cabecalho titulo={time.nome} descricao={`Gestor: ${time.gestor?.nome ?? '—'}`} />
      {time.descricao && <p className="-mt-3 mb-5 max-w-2xl text-sm text-muted-foreground">{time.descricao}</p>}

      {gerencio && (
        <div className="mb-5 flex max-w-xl flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-xs">
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

      <ul className="grid max-w-3xl gap-2" aria-label="Pessoas do time">
        {time.membros.length === 0 && (
          <li className="rounded-xl border border-dashed bg-card/60 p-6 text-center text-sm text-muted-foreground">
            Ninguém no time ainda.
          </li>
        )}
        {time.membros.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs">
            <Avatar pessoa={p} className="size-8 text-[11px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.nome}</p>
              <p className="truncate text-xs text-muted-foreground">{p.email} · {NOME_DO_PAPEL[p.papel]}</p>
            </div>
            {gerencio && (
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => tirar(p)}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                Tirar do time
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
