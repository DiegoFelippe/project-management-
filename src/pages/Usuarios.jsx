import { Pencil, Plus, Send, UserCheck, UserX, Landmark } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Avatar from '@/components/comum/Avatar'
import Cabecalho from '@/components/comum/Cabecalho'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { frase, juntar, useClientesAtivos } from '@/components/clientes/useClientesAtivos'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import FichaDoConsultor from '@/components/usuarios/FichaDoConsultor'
import { definirCarga } from '@/data/capacidade'
import { listarNomesDeConsultorias } from '@/data/consultorias'
import { tirarFoto, trocarFoto } from '@/data/imagens'
import { adicionarMembro, listarOpcoesDeTimes, removerMembro } from '@/data/times'
import { criarAcesso, gerenciarAcesso, listarUsuarios, reenviarConvite } from '@/data/usuarios'
import { veTudo } from '@/lib/papeis'
import { situacao } from '@/lib/situacao'

const COR_DA_SITUACAO = {
  'Convite pendente': 'notice',
  'Senha provisória': 'secondary',
  Ativo: 'positive',
  Desativado: 'outline',
}

export default function Usuarios() {
  const { perfil } = useAuth()
  const ehDono = veTudo(perfil)
  const ehAdminGeral = perfil.papel === 'dono'
  const [consultoriaId, setConsultoriaId] = useState(ehDono ? '' : perfil.consultoria_id)
  const [resultado, setResultado] = useState(null)
  const [pagina, setPagina] = useState(1)
  const [erro, setErro] = useState(null)
  const [times, setTimes] = useState([])
  const [consultorias, setConsultorias] = useState([])
  const [novo, setNovo] = useState(false)
  const [reenviando, setReenviando] = useState(null)
  const [filtro, setFiltro] = useState('ativos')
  const [editando, setEditando] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)

  // Uma página por vez, filtrada no banco (regra "Escala" no CLAUDE.md).
  useEffect(() => {
    let ativo = true
    listarUsuarios({ consultoriaId: consultoriaId || undefined, ativos: filtro === 'ativos', pagina })
      .then((r) => {
        if (!ativo) return
        if (r.foraDaFaixa && pagina > 1) return setPagina(1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar as pessoas.'))
    return () => {
      ativo = false
    }
  }, [consultoriaId, filtro, pagina, versao])

  // Times que aparecem no "Novo acesso": o gestor só os dele; o administrador, todos da consultoria.
  useEffect(() => {
    if (ehDono) return
    listarOpcoesDeTimes({ consultoriaId: perfil.consultoria_id })
      .then((lista) => setTimes(perfil.papel === 'gestor' ? lista.filter((t) => t.gestor_id === perfil.id) : lista))
      .catch(() => setTimes([]))
  }, [ehDono, perfil.consultoria_id, perfil.papel, perfil.id, versao])

  // Consultorias para escolher ao criar um administrador (só quem vê tudo).
  useEffect(() => {
    if (!ehDono) return
    listarNomesDeConsultorias().then(setConsultorias).catch(() => setConsultorias([]))
  }, [ehDono])

  const meusTimes = useMemo(() => new Set(times.map((t) => t.id)), [times])
  // Desativar ou mover para a central: os clientes ativos da pessoa voltam a aguardar consultor (o banco conta).
  const saindo = confirmando && confirmando.acao !== 'reativar' ? confirmando.pessoa : null
  const clientesAtivos = useClientesAtivos(saindo ? { consultorId: saindo.id } : null)
  const sobreOsClientes = frase(clientesAtivos, {
    um: '1 cliente dela volta para Aguardando consultor.',
    varios: '{n} clientes dela voltam para Aguardando consultor.',
    semNumero: 'Os clientes dela voltam para Aguardando consultor.',
  })
  const lista = resultado?.itens ?? []
  const total = resultado?.total ?? 0

  // Quem mexe em quem (as Edge Functions conferem de novo): dono → administradores; administrador →
  // gestores e pessoas; gestor → só o nome e os times dele das pessoas que vê. Ninguém mexe em si mesmo.
  const papeisQueGerencio = ehAdminGeral ? ['admin', 'central'] : ['admin']
  const podeEditar = (p) =>
    p.id !== perfil.id &&
    (ehDono ? papeisQueGerencio.includes(p.papel) : perfil.papel === 'admin' ? p.papel !== 'admin' : p.papel === 'pessoa')
  const podeDesativar = (p) =>
    p.id !== perfil.id && (ehDono ? papeisQueGerencio.includes(p.papel) : perfil.papel === 'admin' && p.papel !== 'admin')
  // Só o administrador geral move para a central (admin, gestor ou pessoa ativos).
  const podeMover = (p) => ehAdminGeral && p.id !== perfil.id && p.ativo !== false && ['admin', 'gestor', 'pessoa'].includes(p.papel)

  async function salvarEdicao(pessoa, { mudancas, carga, timesAdicionar, timesRemover, foto }) {
    if (Object.keys(mudancas).length) {
      const { erro: falha } = await gerenciarAcesso('editar', pessoa.id, mudancas)
      if (falha) return { erro: falha }
    }
    if (carga !== undefined) {
      const { erro: falha } = await definirCarga(pessoa.id, carga)
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
    if (foto?.arquivo || foto?.tirar) {
      const { erro: falha } = foto.arquivo ? await trocarFoto(pessoa.id, foto.arquivo, pessoa.foto) : await tirarFoto(pessoa.id, pessoa.foto)
      if (falha) return { erro: falha }
    }
    toast.success(`${mudancas.nome ?? pessoa.nome} atualizado.`)
    recarregar()
    return { erro: null }
  }

  async function mudarAtivo(pessoa, acao) {
    const resposta = await gerenciarAcesso(acao, pessoa.id)
    if (!resposta.erro) {
      toast.success(acao === 'desativar' ? `${pessoa.nome} foi desativado.` : `${pessoa.nome} foi reativado.`)
      setEditando(null)
      recarregar()
    }
    return resposta
  }

  async function moverParaCentral(pessoa) {
    const resposta = await gerenciarAcesso('mover_para_central', pessoa.id)
    if (!resposta.erro) {
      toast.success(`${pessoa.nome} agora é da central.`)
      recarregar()
    }
    return resposta
  }

  async function criar(dados, { carga } = {}) {
    const resposta = await criarAcesso(dados)
    if (resposta.pessoaId && carga !== undefined) {
      const { erro: falha } = await definirCarga(resposta.pessoaId, carga)
      if (falha) toast.error(`O acesso foi criado, mas a carga semanal não foi salva: ${falha}`)
    }
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
        descricao={resultado ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'pessoa' : 'pessoas'}` : null}>
        {(!ehDono || ehAdminGeral) && (
          <Button onClick={() => setNovo(true)}>
            <Plus /> Novo acesso
          </Button>
        )}
      </Cabecalho>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {ehDono && <FiltroConsultoria valor={consultoriaId} aoMudar={(id) => { setConsultoriaId(id); setPagina(1) }} />}
        <div role="group" aria-label="Mostrar" className="mb-4 inline-flex rounded-lg bg-muted p-1 text-sm font-semibold">
          {[['ativos', 'Ativos'], ['desativados', 'Desativados']].map(([valor, rotulo]) => (
            <button key={valor} type="button" aria-pressed={filtro === valor} onClick={() => { setFiltro(valor); setPagina(1) }}
              className={`botao-animado rounded-md px-3 py-1 transition-[background-color,color,translate,scale] hover:-translate-y-px active:scale-[0.97] ${filtro === valor ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && resultado === null && <GraficoCarregando texto="Carregando as pessoas…" className="py-12" />}
      {resultado && lista.length === 0 && (
        <ListaVazia>{filtro === 'ativos' ? 'Ninguém por aqui ainda.' : 'Ninguém desativado.'}</ListaVazia>
      )}
      {lista.length > 0 && (
        <Tabela rotulo="Usuários" colunas={ehDono ? ['Nome', 'Cargo', 'Telefone', 'Papel', 'Consultoria', 'Times', 'Situação'] : ['Nome', 'Cargo', 'Telefone', 'Papel', 'Times', 'Situação']}
          paginacao={{ pagina, total, aoMudar: setPagina }}>
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
                <Celula className="text-muted-foreground">{p.cargo || '—'}</Celula>
                <Celula className="text-muted-foreground">{p.telefone || '—'}</Celula>
                <Celula className="text-muted-foreground">{NOME_DO_PAPEL[p.papel]}</Celula>
                {ehDono && <Celula className="text-muted-foreground">{p.consultoria?.nome ?? '—'}</Celula>}
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
                  {podeMover(p) && (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmando({ pessoa: p, acao: 'mover' })}>
                      <Landmark /> Mover para a central
                    </Button>
                  )}
                  {p.convite_pendente && p.ativo !== false && (!ehDono || podeEditar(p)) && (
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
        <FichaDoConsultor key={editando.id} aberto pessoa={editando} perfilDeQuem={perfil} times={ehDono ? [] : times}
          podeReenviar={!ehDono || podeEditar(editando)} podeDesativar={podeDesativar(editando)}
          aoReenviar={() => reenviar(editando)} aoPedirAtivo={(acao) => setConfirmando({ pessoa: editando, acao })}
          aoFechar={() => setEditando(null)} aoSalvar={(dados) => salvarEdicao(editando, dados)} />
      )}
      {confirmando && (
        <ConfirmarAcao aberto aoFechar={() => setConfirmando(null)} perigo={confirmando.acao === 'desativar'}
          titulo={confirmando.acao === 'mover' ? `Mover ${confirmando.pessoa.nome} para a central?`
            : confirmando.acao === 'desativar' ? `Desativar ${confirmando.pessoa.nome}?` : `Reativar ${confirmando.pessoa.nome}?`}
          descricao={confirmando.acao === 'mover'
            ? juntar('A pessoa sai da consultoria e dos times, passa a ver todas as consultorias e pode criar consultorias e cadastrar clientes.',
              sobreOsClientes, 'Só dá para desfazer criando um acesso novo.')
            : confirmando.acao === 'desativar'
              ? juntar('A pessoa não entra mais e some das listas de ativos. Nada é apagado: os times e o histórico ficam, e dá para reativar depois.', sobreOsClientes)
              : 'A pessoa volta a entrar, com o mesmo papel e os mesmos times. Os clientes que eram dela não voltam: continuam com quem os recebeu ou em Aguardando consultor.'}
          rotuloConfirmar={confirmando.acao === 'mover' ? 'Mover para a central' : confirmando.acao === 'desativar' ? 'Desativar' : 'Reativar'}
          aoConfirmar={() => (confirmando.acao === 'mover' ? moverParaCentral(confirmando.pessoa) : mudarAtivo(confirmando.pessoa, confirmando.acao))} />
      )}
      {novo && (!ehDono || ehAdminGeral) && (
        <FichaDoConsultor aberto perfilDeQuem={perfil} times={times} consultoriaId={consultoriaId}
          consultorias={ehDono ? consultorias : undefined}
          aoFechar={() => setNovo(false)} aoCriar={criar} aoColocarNosTimes={colocarNosTimes} />
      )}
    </>
  )
}
