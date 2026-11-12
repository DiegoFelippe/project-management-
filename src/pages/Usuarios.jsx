import { Pencil, Plus, Send, UserCheck, UserX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Avatar from '@/components/comum/Avatar'
import Cabecalho from '@/components/comum/Cabecalho'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import EditarAcesso from '@/components/usuarios/EditarAcesso'
import NovoAcesso from '@/components/usuarios/NovoAcesso'
import { adicionarMembro, listarTimes, removerMembro } from '@/data/times'
import { criarAcesso, gerenciarAcesso, listarUsuarios, reenviarConvite } from '@/data/usuarios'
import { situacao } from '@/lib/situacao'

const COR_DA_SITUACAO = {
  'Convite pendente': 'notice',
  'Senha provisória': 'secondary',
  Ativo: 'positive',
  Desativado: 'outline',
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
  const [filtro, setFiltro] = useState('ativos')
  const [editando, setEditando] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
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
  const lista = useMemo(
    () => (pessoas ?? []).filter((p) => (filtro === 'ativos' ? p.ativo !== false : p.ativo === false)),
    [pessoas, filtro],
  )

  // Quem mexe em quem (as Edge Functions conferem de novo): dono → administradores; administrador →
  // gestores e pessoas; gestor → só o nome e os times dele das pessoas que vê. Ninguém mexe em si mesmo.
  const podeEditar = (p) =>
    p.id !== perfil.id &&
    (ehDono ? p.papel === 'admin' : perfil.papel === 'admin' ? p.papel !== 'admin' : p.papel === 'pessoa')
  const podeDesativar = (p) => p.id !== perfil.id && (ehDono ? p.papel === 'admin' : perfil.papel === 'admin' && p.papel !== 'admin')

  async function salvarEdicao(pessoa, { nome, papel, timesAdicionar, timesRemover }) {
    const mudancas = {}
    if (nome !== pessoa.nome) mudancas.nome = nome
    if (papel && papel !== pessoa.papel) mudancas.papel = papel
    if (Object.keys(mudancas).length) {
      const { erro: falha } = await gerenciarAcesso('editar', pessoa.id, mudancas)
      if (falha) return { erro: falha }
    }
    for (const timeId of timesAdicionar) {
      const { erro: falha } = await adicionarMembro(timeId, pessoa.id)
      if (falha) return { erro: falha }
    }
    for (const timeId of timesRemover) {
      const { erro: falha } = await removerMembro(timeId, pessoa.id)
      if (falha) return { erro: falha }
    }
    toast.success(`${nome} atualizado.`)
    recarregar()
    return { erro: null }
  }

  async function mudarAtivo(pessoa, acao) {
    const resposta = await gerenciarAcesso(acao, pessoa.id)
    if (!resposta.erro) {
      toast.success(acao === 'desativar' ? `${pessoa.nome} foi desativado.` : `${pessoa.nome} foi reativado.`)
      recarregar()
    }
    return resposta
  }

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
        descricao={pessoas ? `${lista.length} ${lista.length === 1 ? 'pessoa' : 'pessoas'}` : null}>
        {!ehDono && (
          <Button onClick={() => setNovo(true)}>
            <Plus /> Novo acesso
          </Button>
        )}
      </Cabecalho>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {ehDono && <FiltroConsultoria valor={consultoriaId} aoMudar={setConsultoriaId} />}
        <div role="group" aria-label="Mostrar" className="mb-4 inline-flex rounded-lg bg-muted p-1 text-sm font-semibold">
          {[['ativos', 'Ativos'], ['desativados', 'Desativados']].map(([valor, rotulo]) => (
            <button key={valor} type="button" aria-pressed={filtro === valor} onClick={() => setFiltro(valor)}
              className={`botao-animado rounded-md px-3 py-1 transition-[background-color,color,translate,scale] hover:-translate-y-px active:scale-[0.97] ${filtro === valor ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && pessoas === null && <GraficoCarregando texto="Carregando as pessoas…" className="py-12" />}
      {pessoas && lista.length === 0 && (
        <ListaVazia>{filtro === 'ativos' ? 'Ninguém por aqui ainda.' : 'Ninguém desativado.'}</ListaVazia>
      )}
      {lista.length > 0 && (
        <Tabela rotulo="Usuários" colunas={['Nome', 'Papel', 'Times', 'Situação']}>
          {lista.map((p) => {
            const s = situacao(p)
            const timesVisiveis = ehDono || perfil.papel === 'admin' ? p.times : p.times.filter((t) => meusTimes.has(t.id))
            return (
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
                <Celula>
                  <div className="flex flex-wrap gap-1">
                    {timesVisiveis.length === 0 && <span className="text-muted-foreground">—</span>}
                    {timesVisiveis.map((t) => (
                      <Badge key={t.id} variant="outline" className="font-medium">{t.nome}</Badge>
                    ))}
                  </div>
                </Celula>
                <Celula><Badge variant={COR_DA_SITUACAO[s]}>{s}</Badge></Celula>
                <CelulaAcoes>
                  {podeEditar(p) && p.ativo !== false && (
                    <Button variant="ghost" size="sm" onClick={() => setEditando(p)}>
                      <Pencil /> Editar
                    </Button>
                  )}
                  {podeDesativar(p) && (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmando({ pessoa: p, acao: p.ativo === false ? 'reativar' : 'desativar' })}
                      className={p.ativo === false ? '' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'}>
                      {p.ativo === false ? <><UserCheck /> Reativar</> : <><UserX /> Desativar</>}
                    </Button>
                  )}
                  {p.convite_pendente && p.ativo !== false && !ehDono && (
                    <Button variant="ghost" size="sm" disabled={reenviando === p.id} onClick={() => reenviar(p)}>
                      <Send /> Reenviar convite
                    </Button>
                  )}
                </CelulaAcoes>
              </Linha>
            )
          })}
        </Tabela>
      )}
      {editando && (
        <EditarAcesso key={editando.id} aberto pessoa={editando} papelDeQuemEdita={perfil.papel} times={ehDono ? [] : times}
          aoFechar={() => setEditando(null)} aoSalvar={(dados) => salvarEdicao(editando, dados)} />
      )}
      {confirmando && (
        <ConfirmarAcao aberto aoFechar={() => setConfirmando(null)} perigo={confirmando.acao === 'desativar'}
          titulo={confirmando.acao === 'desativar' ? `Desativar ${confirmando.pessoa.nome}?` : `Reativar ${confirmando.pessoa.nome}?`}
          descricao={confirmando.acao === 'desativar'
            ? 'A pessoa não entra mais e some das listas de ativos. Nada é apagado: os times e o histórico ficam, e dá para reativar depois.'
            : 'A pessoa volta a entrar, do jeito que estava antes de ser desativada.'}
          rotuloConfirmar={confirmando.acao === 'desativar' ? 'Desativar' : 'Reativar'}
          aoConfirmar={() => mudarAtivo(confirmando.pessoa, confirmando.acao)} />
      )}
      {!ehDono && (
        <NovoAcesso aberto={novo} aoFechar={() => setNovo(false)} papelDeQuemCria={perfil.papel} times={times}
          aoCriar={criar} aoColocarNosTimes={colocarNosTimes} />
      )}
    </>
  )
}
