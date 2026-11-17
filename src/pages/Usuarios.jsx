import { Gauge, Pencil, Plus, Send, UserCheck, UserX, Landmark } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import Avatar from '@/components/comum/Avatar'
import BarraDeFiltros, { AcaoPrincipal } from '@/components/comum/BarraDeFiltros'
import NavegacaoDoMes from '@/components/comum/NavegacaoDoMes'
import Cabecalho from '@/components/comum/Cabecalho'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { frase, juntar, useClientesAtivos } from '@/components/clientes/useClientesAtivos'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import CapacidadeDaPessoa from '@/components/usuarios/CapacidadeDaPessoa'
import FichaDoConsultor from '@/components/usuarios/FichaDoConsultor'
import { definirCarga, ocupacaoDasPessoas } from '@/data/capacidade'
import { buscarConsultoriasAtivas } from '@/data/consultorias'
import { mudarCor, tirarFoto, trocarFoto } from '@/data/imagens'
import { adicionarMembro, listarOpcoesDeTimes, removerMembro } from '@/data/times'
import { buscarUsuario, criarAcesso, gerenciarAcesso, listarUsuarios, reenviarConvite } from '@/data/usuarios'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { mesAtual } from '@/lib/mes'
import { ehPapelDeConsultoria, veTudo } from '@/lib/papeis'
import { situacao } from '@/lib/situacao'

const ABAS = [{ valor: 'ativos', rotulo: 'Ativos' }, { valor: 'desativados', rotulo: 'Desativados' }]
// Situação é etiqueta ao lado do nome, só quando não é o estado normal ("Ativo" não aparece).
const COR_DA_SITUACAO = {
  'Convite pendente': 'notice',
  'Senha provisória': 'secondary',
  Desativado: 'outline',
}

// Largura mínima da tabela (soma das colunas): abaixo disso ela rola dentro do cartão, com as ações fixas.
function larguraDaTabela({ comNumeros, ehDono }) {
  const base = comNumeros ? 1140 : 910
  return ehDono ? base + 110 : base
}

// Ação da linha: só o ícone (Padrão Hub), com o nome da ação em aria-label e title.
function AcaoDaLinha({ nome, className, children, ...props }) {
  return (
    <Button variant="ghost" size="icon" aria-label={nome} title={nome} className={className} {...props}>
      {children}
    </Button>
  )
}

function Ocupacao({ n, passado }) {
  if (!n) return <span className="text-muted-foreground">—</span>
  const apoio = passado
    ? `${formatarHoras(n.realizado)} de ${formatarHoras(n.capacidade)}`
    : `${formatarHoras(n.reservado)} de ${formatarHoras(n.capacidade)}`
  const largura = Math.max(0, Math.min(100, Math.round((n.ocupacao ?? 0) * 100)))
  return (
    <div className="w-32">
      <p className="font-semibold">{formatarOcupacao(n.ocupacao)}</p>
      <div aria-hidden="true" className="my-1 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${largura}%` }} />
      </div>
      <p className="text-xs whitespace-nowrap text-muted-foreground">{apoio}</p>
    </div>
  )
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
  const [novo, setNovo] = useState(false)
  const [reenviando, setReenviando] = useState(null)
  const [filtro, setFiltro] = useState('ativos')
  const [editando, setEditando] = useState(null)
  const [capacidade, setCapacidade] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  // ?pessoa=<id>&mes=AAAA-MM-01 (links do painel do Início): abre a pessoa no mês pedido; mês inválido cai no atual.
  const [parametros] = useSearchParams()
  const pessoaPedida = parametros.get('pessoa')
  const [mes, setMes] = useState(() => {
    const pedido = parametros.get('mes')
    return /^\d{4}-(0[1-9]|1[0-2])-01$/.test(pedido ?? '') ? pedido : mesAtual()
  })
  const [aviso, setAviso] = useState(null)
  const [numeros, setNumeros] = useState({ mes: null, passado: false, porId: {} })
  const [erroNumeros, setErroNumeros] = useState(false)
  const [versao, setVersao] = useState(0)
  const [versaoNumeros, setVersaoNumeros] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)
  const recarregarNumeros = () => setVersaoNumeros((v) => v + 1)

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

  // Capacidade do mês: uma chamada por (página, mês), com os ids das linhas da página (o banco calcula).
  // Mudar o mês não muda a página. Se falhar, a lista segue com "—" e um aviso.
  useEffect(() => {
    const ids = (resultado?.itens ?? []).map((p) => p.id)
    if (filtro !== 'ativos' || ids.length === 0) return
    let ativo = true
    // `passado` é decidido junto com o pedido: o rótulo (Utilização) não vira de repente na virada do mês.
    const passadoNoPedido = mes < mesAtual()
    ocupacaoDasPessoas({ ids, mes })
      .then((porId) => {
        if (!ativo) return
        setNumeros({ mes, passado: passadoNoPedido, porId })
        setErroNumeros(false)
      })
      .catch(() => {
        if (!ativo) return
        setNumeros({ mes, passado: passadoNoPedido, porId: {} })
        setErroNumeros(true)
      })
    return () => {
      ativo = false
    }
  }, [resultado, filtro, mes, versaoNumeros])

  // Times que aparecem no "Novo acesso": o gestor só os dele; o administrador, todos da consultoria.
  useEffect(() => {
    if (ehDono) return
    listarOpcoesDeTimes({ consultoriaId: perfil.consultoria_id })
      .then((lista) => setTimes(perfil.papel === 'gestor' ? lista.filter((t) => t.gestor_id === perfil.id) : lista))
      .catch(() => setTimes([]))
  }, [ehDono, perfil.consultoria_id, perfil.papel, perfil.id, versao])

  const meusTimes = useMemo(() => new Set(times.map((t) => t.id)), [times])
  // Desativar ou mover para a central: os clientes ativos da pessoa voltam a aguardar consultor (o banco conta).
  const saindo = confirmando && confirmando.acao !== 'reativar' ? confirmando.pessoa : null
  const clientesAtivos = useClientesAtivos(saindo ? { consultorId: saindo.id } : null)
  const sobreOsClientes = frase(clientesAtivos, {
    um: '1 cliente dela volta para Aguardando consultor.',
    varios: '{n} clientes dela voltam para Aguardando consultor.',
    semNumero: 'Os clientes dela voltam para Aguardando consultor.',
  })
  // Só nos ativos há números do mês (desativados não têm capacidade a mostrar).
  const comNumeros = filtro === 'ativos'
  const passado = numeros.mes === mes ? numeros.passado : mes < mesAtual()
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
  // Carga e ausências (espelha o banco: central/dono, ou admin/gestor da mesma consultoria, inclusive em si mesmo).
  const podeCapacidade = (p) =>
    ehPapelDeConsultoria(p.papel) && p.ativo !== false &&
    (ehDono || (['admin', 'gestor'].includes(perfil.papel) && p.consultoria_id === perfil.consultoria_id))
  // Só o administrador geral move para a central (admin, gestor ou pessoa ativos).
  const podeMover = (p) => ehAdminGeral && p.id !== perfil.id && p.ativo !== false && ['admin', 'gestor', 'pessoa'].includes(p.papel)

  // Pessoa vinda do painel: carregada por id (o RLS decide se ela aparece) e aberta na ação que faz sentido.
  useEffect(() => {
    if (!pessoaPedida) return
    let ativo = true
    buscarUsuario(pessoaPedida)
      .then((p) => {
        if (!ativo) return
        if (!p) return setAviso('Você não tem acesso a essa pessoa.')
        if (podeCapacidade(p)) setCapacidade(p)
        else if (podeEditar(p) && p.ativo !== false) setEditando(p)
        else setAviso('Você só consulta essa pessoa: não há o que alterar.')
      })
      .catch(() => ativo && setAviso('Não foi possível abrir essa pessoa.'))
    return () => {
      ativo = false
    }
    // Só uma vez por pedido: os pode* mudam de identidade a cada render, mas dependem só do perfil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoaPedida])

  async function salvarEdicao(pessoa, { mudancas, carga, timesAdicionar, timesRemover, foto, cor }) {
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
    if (cor !== undefined) {
      const { erro: falha } = await mudarCor(pessoa.id, cor)
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

  async function criar(dados, { carga, foto, cor } = {}) {
    const resposta = await criarAcesso(dados)
    if (resposta.pessoaId && carga !== undefined) {
      const { erro: falha } = await definirCarga(resposta.pessoaId, carga)
      if (falha) toast.error(`O acesso foi criado, mas a carga semanal não foi salva: ${falha}`)
    }
    // Foto e cor só podem ir depois de criar (o arquivo mora na pasta do id novo). Se falharem, a pessoa continua criada.
    if (resposta.pessoaId && foto?.arquivo) {
      const { erro: falha } = await trocarFoto(resposta.pessoaId, foto.arquivo, null)
      if (falha) toast.error(`Pessoa criada, mas a foto não foi enviada: ${falha}`)
    }
    if (resposta.pessoaId && cor) {
      const { erro: falha } = await mudarCor(resposta.pessoaId, cor)
      if (falha) toast.error(`Pessoa criada, mas a cor não foi salva: ${falha}`)
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
        descricao={resultado ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'pessoa' : 'pessoas'}` : null} />
      <BarraDeFiltros>
        <AbasSegmentadas rotulo="Mostrar" abas={ABAS} valor={filtro} aoMudar={(valor) => { setFiltro(valor); setPagina(1); setResultado(null) }} />
        {comNumeros && <NavegacaoDoMes mes={mes} aoMudar={setMes} />}
        {ehDono && <FiltroConsultoria valor={consultoriaId} aoMudar={(id) => { setConsultoriaId(id); setPagina(1) }} />}
        {(!ehDono || ehAdminGeral) && (
          <AcaoPrincipal>
            <Button onClick={() => setNovo(true)}>
              <Plus /> Novo acesso
            </Button>
          </AcaoPrincipal>
        )}
      </BarraDeFiltros>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {aviso && <p role="status" className="mb-3 text-sm text-muted-foreground">{aviso}</p>}
      {comNumeros && erroNumeros && !erro && <p role="status" className="mb-3 text-sm text-muted-foreground">Não foi possível carregar a capacidade do mês.</p>}
      {!erro && resultado === null && <GraficoCarregando texto="Carregando as pessoas…" className="py-12" />}
      {resultado && lista.length === 0 && (
        <ListaVazia>{filtro === 'ativos' ? 'Ninguém por aqui ainda.' : 'Ninguém desativado.'}</ListaVazia>
      )}
      {lista.length > 0 && (
        <Tabela rotulo="Usuários" larguraMinima={larguraDaTabela({ comNumeros, ehDono })}
          colunas={[
            'Nome', 'Cargo', 'Telefone', 'Papel', ...(ehDono ? ['Consultoria'] : []), 'Times',
            ...(comNumeros ? [passado ? 'Utilização' : 'Ocupação', 'Realizado'] : []),
          ]}
          paginacao={{ pagina, total, aoMudar: setPagina }}>
          {lista.map((p) => {
            const s = situacao(p)
            // Só vale o que veio para o mês mostrado; quem o banco não devolveu (central, dono) fica com "—".
            const n = numeros.mes === mes ? numeros.porId[p.id] : undefined
            const timesVisiveis = ehDono || perfil.papel === 'admin' ? p.times : p.times.filter((t) => meusTimes.has(t.id))
            return (
              <Linha key={p.id}>
                <Celula>
                  <div className="flex items-center gap-3">
                    <Avatar pessoa={p} className="size-8 text-[11px]" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold">{p.nome}</p>
                        {s !== 'Ativo' && <Badge variant={COR_DA_SITUACAO[s]} className="shrink-0">{s}</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                    </div>
                  </div>
                </Celula>
                <Celula className="min-w-28 max-w-44 text-muted-foreground">{p.cargo || '—'}</Celula>
                <Celula className="whitespace-nowrap text-muted-foreground">{p.telefone || '—'}</Celula>
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
                {comNumeros && (
                  <>
                    <Celula className="tabular-nums"><Ocupacao n={n} passado={passado} /></Celula>
                    <Celula className="tabular-nums">{formatarHoras(n?.realizado)}</Celula>
                  </>
                )}
                <CelulaAcoes>
                  {podeEditar(p) && p.ativo !== false && (
                    <AcaoDaLinha nome="Editar" onClick={() => setEditando(p)}><Pencil /></AcaoDaLinha>
                  )}
                  {podeCapacidade(p) && (
                    <AcaoDaLinha nome="Capacidade" onClick={() => setCapacidade(p)}><Gauge /></AcaoDaLinha>
                  )}
                  {podeDesativar(p) && (
                    <AcaoDaLinha nome={p.ativo === false ? 'Reativar' : 'Desativar'}
                      onClick={() => setConfirmando({ pessoa: p, acao: p.ativo === false ? 'reativar' : 'desativar' })}
                      className={p.ativo === false ? '' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'}>
                      {p.ativo === false ? <UserCheck /> : <UserX />}
                    </AcaoDaLinha>
                  )}
                  {podeMover(p) && (
                    <AcaoDaLinha nome="Mover para a central" onClick={() => setConfirmando({ pessoa: p, acao: 'mover' })}><Landmark /></AcaoDaLinha>
                  )}
                  {p.convite_pendente && p.ativo !== false && (!ehDono || podeEditar(p)) && (
                    <AcaoDaLinha nome="Reenviar convite" disabled={reenviando === p.id} onClick={() => reenviar(p)}><Send /></AcaoDaLinha>
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
          aoFechar={() => setEditando(null)} aoSalvar={(dados) => salvarEdicao(editando, dados)}
          aoMudarAusencias={recarregarNumeros} />
      )}
      {capacidade && (
        <CapacidadeDaPessoa key={capacidade.id} pessoa={capacidade} aoFechar={() => setCapacidade(null)}
          aoMudarAusencias={recarregarNumeros}
          aoSalvar={async (horas) => {
            const resposta = await definirCarga(capacidade.id, horas)
            if (!resposta.erro) {
              toast.success(`Carga de ${capacidade.nome} atualizada.`)
              recarregar()
            }
            return resposta
          }} />
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
          buscarConsultorias={ehDono ? buscarConsultoriasAtivas : undefined}
          aoFechar={() => setNovo(false)} aoCriar={criar} aoColocarNosTimes={colocarNosTimes} />
      )}
    </>
  )
}
