import { Plus, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Avatar from '@/components/comum/Avatar'
import Cabecalho from '@/components/comum/Cabecalho'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import NovoAcesso from '@/components/usuarios/NovoAcesso'
import { adicionarMembro, listarTimes } from '@/data/times'
import { criarAcesso, listarUsuarios, reenviarConvite } from '@/data/usuarios'
import { situacao } from '@/lib/situacao'

const COR_DA_SITUACAO = {
  'Convite pendente': 'notice',
  'Senha provisória': 'secondary',
  Ativo: 'positive',
}

export default function Usuarios() {
  const { perfil } = useAuth()
  const ehDono = perfil.papel === 'dono'
  const [consultoriaId, setConsultoriaId] = useState(ehDono ? '' : perfil.consultoria_id)
  const [pessoas, setPessoas] = useState(null)
  const [erro, setErro] = useState(null)
  const [times, setTimes] = useState([])
  const [novo, setNovo] = useState(false)
  const [reenviando, setReenviando] = useState(null)
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)

  useEffect(() => {
    let ativo = true
    listarUsuarios({ consultoriaId: consultoriaId || undefined })
      .then((lista) => {
        if (!ativo) return
        setPessoas(lista)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar as pessoas.'))
    return () => {
      ativo = false
    }
  }, [consultoriaId, versao])

  // Times que aparecem no "Novo acesso": o gestor só os dele; o administrador, todos da consultoria.
  useEffect(() => {
    if (ehDono) return
    listarTimes({ consultoriaId: perfil.consultoria_id })
      .then((lista) => setTimes(perfil.papel === 'gestor' ? lista.filter((t) => t.gestor_id === perfil.id) : lista))
      .catch(() => setTimes([]))
  }, [ehDono, perfil.consultoria_id, perfil.papel, perfil.id, versao])

  const meusTimes = useMemo(() => new Set(times.map((t) => t.id)), [times])

  async function criar(dados) {
    const resposta = await criarAcesso(dados)
    if (resposta.pessoaId) {
      toast.success(dados.forma === 'convite'
        ? `Convite enviado para ${dados.email}.`
        : `Acesso criado. Passe a senha provisória para ${dados.nome}.`)
      setNovo(false)
      recarregar()
    }
    return resposta
  }

  async function colocarNosTimes(pessoaId, idsDosTimes) {
    for (const timeId of idsDosTimes) {
      const { erro: falha } = await adicionarMembro(timeId, pessoaId)
      if (falha) return { erro: falha }
    }
    toast.success('Pessoa colocada nos times.')
    setNovo(false)
    recarregar()
    return { erro: null }
  }

  async function reenviar(pessoa) {
    setReenviando(pessoa.id)
    const { erro: falha } = await reenviarConvite(pessoa.id)
    setReenviando(null)
    if (falha) return toast.error(falha)
    toast.success(`Convite reenviado para ${pessoa.email}.`)
  }

  return (
    <>
      <Cabecalho titulo="Usuários"
        descricao={pessoas ? `${pessoas.length} ${pessoas.length === 1 ? 'pessoa' : 'pessoas'}` : null}>
        {!ehDono && (
          <Button onClick={() => setNovo(true)}>
            <Plus /> Novo acesso
          </Button>
        )}
      </Cabecalho>
      {ehDono && <FiltroConsultoria valor={consultoriaId} aoMudar={setConsultoriaId} />}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && pessoas === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {pessoas?.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card/60 p-8 text-center text-sm text-muted-foreground">
          Ninguém por aqui ainda.
        </div>
      )}
      {pessoas?.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nome</th>
                <th className="px-4 py-2.5 font-medium">Papel</th>
                <th className="px-4 py-2.5 font-medium">Times</th>
                <th className="px-4 py-2.5 font-medium">Situação</th>
                <th className="px-4 py-2.5"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => {
                const s = situacao(p)
                const timesVisiveis = ehDono || perfil.papel === 'admin' ? p.times : p.times.filter((t) => meusTimes.has(t.id))
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar pessoa={p} className="size-8 text-[11px]" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{p.nome}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{NOME_DO_PAPEL[p.papel]}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {timesVisiveis.length === 0 && <span className="text-muted-foreground">—</span>}
                        {timesVisiveis.map((t) => (
                          <Badge key={t.id} variant="outline" className="font-medium">{t.nome}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge variant={COR_DA_SITUACAO[s]}>{s}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {p.convite_pendente && !ehDono && (
                        <Button variant="ghost" size="sm" disabled={reenviando === p.id} onClick={() => reenviar(p)}>
                          <Send /> Reenviar convite
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!ehDono && (
        <NovoAcesso aberto={novo} aoFechar={() => setNovo(false)} papelDeQuemCria={perfil.papel} times={times}
          aoCriar={criar} aoColocarNosTimes={colocarNosTimes} />
      )}
    </>
  )
}
