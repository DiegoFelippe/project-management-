import { Ellipsis, Gauge, Landmark, Pencil, Plus, Send, Tags, TrendingUp, UserCheck, UserX, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Seletor from '@/components/campos/Seletor'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import Avatar from '@/components/comum/Avatar'
import BarraDeOcupacao from '@/components/comum/BarraDeOcupacao'
import BarraDeFiltros, { AcaoPrincipal, NaGaveta } from '@/components/comum/BarraDeFiltros'
import NavegacaoDoMes from '@/components/comum/NavegacaoDoMes'
import Cabecalho from '@/components/comum/Cabecalho'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import MenuDeAcoes from '@/components/comum/MenuDeAcoes'
import { AcaoDaLinha, Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { frase, juntar, useClientesAtivos } from '@/components/clientes/useClientesAtivos'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import CapacidadeDaPessoa from '@/components/usuarios/CapacidadeDaPessoa'
import FichaDoConsultor from '@/components/usuarios/FichaDoConsultor'
import MinhaFicha from '@/components/usuarios/MinhaFicha'
import { definirCarga, ocupacaoDasPessoas } from '@/data/capacidade'
import { buscarConsultoriasAtivas } from '@/data/consultorias'
import { mudarCor, tirarFoto, trocarFoto } from '@/data/imagens'
import { indicadoresDeUsuarios } from '@/data/indicadores'
import { adicionarMembro, listarOpcoesDeTimes, removerMembro } from '@/data/times'
import { buscarUsuario, criarAcesso, gerenciarAcesso, listarUsuarios, reenviarConvite } from '@/data/usuarios'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { mesAtual, rotuloCurto } from '@/lib/mes'
import { ehPapelDeConsultoria, veTudo } from '@/lib/papeis'
import { situacao } from '@/lib/situacao'
import { OPCOES_DE_TIPO, rotulosDosTipos } from '@/lib/tiposDeConsultoria'
import { useLeitura } from '@/lib/useLeitura'
import { useListaPaginada } from '@/lib/useListaPaginada'

const ABAS = [{ valor: 'ativos', rotulo: 'Ativos' }, { valor: 'desativados', rotulo: 'Desativados' }]
// O Tipo da barra, com "Sem tipo" no fim: quem é de consultoria e não tem nenhum (o cartão "Sem tipo de consultoria").
const TIPOS_DO_FILTRO = [...OPCOES_DE_TIPO, { valor: 'sem', rotulo: 'Sem tipo' }]

// Cartões (contados no banco, no recorte de quem vê): seguem a consultoria do filtro e o mês; as abas e o Tipo, não.
// "Pessoas ativas" e "Sem tipo de consultoria" levam ao filtro da lista (usabilidade, U5): `ir(tipo)` mostra os ativos
// com aquele Tipo ('' = todos) e `filtro` diz qual vale agora. "Acima de 100%" fica só número: a lista não sabe filtrar
// pela ocupação do mês sem uma função nova no banco (pendente, relatório do lote C1); a ocupação média também.
const lerNumeros = ({ consultoriaId, mes }) => indicadoresDeUsuarios({ consultoriaId, mes })
const cartoesDoMes = (n, passado, mes, { ir, filtro } = {}) => [
  { chave: 'ativas', rotulo: 'Pessoas ativas', icone: Users, valor: n?.pessoas_ativas,
    ...(ir && { destino: () => ir(''), ativo: filtro === 'ativos:' }) },
  { chave: 'ocupacao', rotulo: passado ? 'Utilização média do mês' : 'Ocupação média do mês', icone: Gauge, tom: 'ceu',
    valor: n ? formatarOcupacao(n.ocupacao_media) : null, detalhe: `média por pessoa · ${rotuloCurto(mes)}` },
  { chave: 'acima', rotulo: 'Acima de 100%', icone: TrendingUp, tom: 'perigo', valor: n?.acima_de_100,
    destaque: n?.acima_de_100 > 0 ? 'perigo' : null },
  { chave: 'sem_tipo', rotulo: 'Sem tipo de consultoria', icone: Tags, tom: 'aviso', valor: n?.sem_tipo,
    ...(ir && { destino: () => ir('sem'), ativo: filtro === 'ativos:sem' }) },
]

// Situação é etiqueta ao lado do nome, só quando não é o estado normal ("Ativo" não aparece).
const COR_DA_SITUACAO = {
  'Convite pendente': 'notice',
  'Senha provisória': 'secondary',
  Desativado: 'outline',
}

// Largura mínima da tabela (soma das colunas): abaixo disso ela rola dentro do cartão, com as ações fixas. Cabe na área
// de conteúdo de uma tela de 1440 px (cerca de 1.317 px): mais larga, a coluna de ações fixa cobria a ocupação (R2).
function larguraDaTabela({ comNumeros, ehDono }) {
  const base = comNumeros ? 1180 : 980
  return ehDono ? base + 100 : base
}

// Confirmação do Zerar: segue a chave "Exigir" como está na ficha (`exigida`), mesmo antes de salvar.
function textoDoZerar({ pessoa, exigida }) {
  const inicio = 'O app autenticador cadastrado deixa de valer (para quem perdeu ou trocou de celular) e a pessoa sai de todos os aparelhos em que estava conectada.'
  const depois = exigida
    ? 'Como a verificação é exigida, no próximo acesso ela configura o app de novo antes de entrar.'
    : 'Ela volta a entrar só com a senha e pode ativar de novo em Meu perfil.'
  const naoSalva = exigida !== Boolean(pessoa.exige_2fa) ? ' A chave Exigir ainda não foi salva: salve a ficha para ela valer.' : ''
  return `${inicio} ${depois}${naoSalva}`
}

// O "⋯" das ações raras da linha (MenuDeAcoes, o mesmo das colunas do quadro). Sem nenhuma para a linha, guarda o lugar.
function MaisAcoes({ pessoa, itens }) {
  const validos = itens.filter(Boolean)
  if (!validos.length) return <AcaoDaLinha nome="Mais ações" icone={Ellipsis} visivel={false} />
  return <MenuDeAcoes rotulo={`Mais ações de ${pessoa.nome}`} itens={validos} />
}

function Ocupacao({ n, passado }) {
  if (!n) return <span className="text-muted-foreground">—</span>
  const apoio = passado
    ? `${formatarHoras(n.realizado)} de ${formatarHoras(n.capacidade)}`
    : `${formatarHoras(n.reservado)} de ${formatarHoras(n.capacidade)}`
  // A coluna cresce com o texto ("32,5 h de 167,2 h" inteiro, sem cortar o "h": auditoria, R2); a barra vai junto.
  return (
    <div className="w-max min-w-28">
      <p className="font-semibold tabular-nums">{formatarOcupacao(n.ocupacao)}</p>
      <BarraDeOcupacao ocupacao={n.ocupacao} className="my-1 h-1" />
      <p className="text-rotulo whitespace-nowrap tabular-nums text-muted-foreground">{apoio}</p>
    </div>
  )
}

export default function Usuarios() {
  const { perfil } = useAuth()
  const ehDono = veTudo(perfil)
  const ehAdminGeral = perfil.papel === 'dono'
  const [consultoriaId, setConsultoriaId] = useState(ehDono ? '' : perfil.consultoria_id)
  const [times, setTimes] = useState([])
  const [novo, setNovo] = useState(false)
  const [reenviando, setReenviando] = useState(null)
  const [filtro, setFiltro] = useState('ativos')
  const [tipo, setTipo] = useState('')
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
  const cartoes = useLeitura(lerNumeros, { consultoriaId: consultoriaId || undefined, mes, versao, versaoNumeros }).dados

  // Uma página por vez, filtrada no banco (regra "Escala" no CLAUDE.md). Ativos e desativados têm colunas diferentes:
  // trocar de aba mostra o carregando.
  const { resultado, erro: falhou, paginacao } = useListaPaginada(listarUsuarios,
    { consultoriaId: consultoriaId || undefined, ativos: filtro === 'ativos', tipo: tipo || undefined },
    { versao, limparAoMudar: ['ativos'] })
  const erro = falhou ? 'Não foi possível carregar as pessoas.' : null

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
  const saindo = confirmando && ['desativar', 'mover'].includes(confirmando.acao) ? confirmando.pessoa : null
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
  // No celular, os filtros da gaveta (auditoria, G6): quantos estão fora do padrão e o Limpar que os volta.
  const filtrosAtivos = [filtro !== 'ativos', comNumeros && mes !== mesAtual(), Boolean(tipo), ehDono && Boolean(consultoriaId)]
    .filter(Boolean).length
  function limparFiltros() {
    setFiltro('ativos')
    setMes(mesAtual())
    setTipo('')
    if (ehDono) setConsultoriaId('')
  }
  // Cartão que leva ao filtro (U5): os ativos, com o Tipo do cartão; a lista volta à página 1 (o filtro mudou).
  function irPara(tipoDoCartao) {
    setFiltro('ativos')
    setTipo(tipoDoCartao)
  }

  // Quem mexe em quem (as Edge Functions conferem de novo): dono → administradores; administrador →
  // gestores e pessoas; gestor → só o nome e os times dele das pessoas que vê. Em si mesmo, ninguém administra: a própria
  // linha abre o Meu perfil (a ficha no modo próprio, só com o que a pessoa muda de si).
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
  // Que ações a tabela tem para quem vê (cada uma com o seu lugar em todas as linhas).
  const comCapacidade = ehDono || ['admin', 'gestor'].includes(perfil.papel)

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

  // Zerar a verificação em duas etapas: a ficha continua aberta, já sem o app ativo.
  async function zerarVerificacao(pessoa) {
    const resposta = await gerenciarAcesso('zerar_2fa', pessoa.id)
    if (!resposta.erro) {
      toast.success(`Verificação em duas etapas de ${pessoa.nome} zerada.`)
      setEditando((atual) => (atual?.id === pessoa.id ? { ...atual, verificacao_desde: null } : atual))
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
    if (reenviando) return
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
      <BarraDeFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <NaGaveta><AbasSegmentadas rotulo="Mostrar" abas={ABAS} valor={filtro} aoMudar={setFiltro} /></NaGaveta>
        {comNumeros && <NaGaveta><NavegacaoDoMes mes={mes} aoMudar={setMes} /></NaGaveta>}
        <NaGaveta>
          <div className="flex items-center gap-2">
            <Label htmlFor="filtro-tipo" className="shrink-0 text-muted-foreground">Tipo</Label>
            <div className="w-48">
              <Seletor id="filtro-tipo" tamanho="sm" valor={tipo} aoMudar={setTipo}
                opcoes={TIPOS_DO_FILTRO} rotuloTodos="Todos" />
            </div>
          </div>
        </NaGaveta>
        {ehDono && <NaGaveta><FiltroConsultoria valor={consultoriaId} aoMudar={setConsultoriaId} /></NaGaveta>}
        {(!ehDono || ehAdminGeral) && (
          <AcaoPrincipal>
            <Button onClick={() => setNovo(true)}>
              <Plus /> Novo acesso
            </Button>
          </AcaoPrincipal>
        )}
      </BarraDeFiltros>
      <CartoesDeNumeros rotulo="Indicadores dos usuários"
        cartoes={cartoesDoMes(cartoes, cartoes ? cartoes.passado : mes < mesAtual(), mes, { ir: irPara, filtro: `${filtro}:${tipo}` })} />
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {aviso && <p role="status" className="mb-3 text-corpo text-muted-foreground">{aviso}</p>}
      {comNumeros && erroNumeros && !erro && <p role="status" className="mb-3 text-corpo text-muted-foreground">Não foi possível carregar a capacidade do mês.</p>}
      {!erro && resultado === null && <GraficoCarregando texto="Carregando as pessoas…" className="py-12" />}
      {resultado && lista.length === 0 && (
        <ListaVazia>{filtro === 'ativos' ? 'Ninguém por aqui ainda.' : 'Ninguém desativado.'}</ListaVazia>
      )}
      {lista.length > 0 && (
        <Tabela rotulo="Usuários" larguraMinima={larguraDaTabela({ comNumeros, ehDono })}
          colunas={[
            'Nome', 'Cargo', 'Tipo de consultoria', 'Telefone', 'Papel', ...(ehDono ? ['Consultoria'] : []), 'Times',
            ...(comNumeros ? [passado ? 'Utilização' : 'Ocupação', 'Realizado'] : []),
          ]}
          paginacao={paginacao}>
          {lista.map((p) => {
            const s = situacao(p)
            // Só vale o que veio para o mês mostrado; quem o banco não devolveu (central, dono) fica com "—".
            const n = numeros.mes === mes ? numeros.porId[p.id] : undefined
            const timesVisiveis = ehDono || perfil.papel === 'admin' ? p.times : p.times.filter((t) => meusTimes.has(t.id))
            return (
              <Linha key={p.id}>
                <Celula>
                  {/* Nome e e-mail com teto de largura (o e-mail longo sai com reticências e inteiro no title): a tabela cabe
                      em 1440 px sem a coluna de ações fixa cobrir a ocupação (auditoria, R2). */}
                  <div className="flex max-w-48 items-center gap-3">
                    <Avatar pessoa={p} className="size-8 text-legenda" />
                    <div className="min-w-0">
                      {/* O selo da situação desce para a linha de baixo quando não cabe ao lado: o nome não vira "A…". */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="max-w-full min-w-0 truncate font-semibold">{p.nome}</p>
                        {s !== 'Ativo' && <Badge variant={COR_DA_SITUACAO[s]} className="shrink-0">{s}</Badge>}
                      </div>
                      <p className="truncate text-rotulo text-muted-foreground" title={p.email}>{p.email}</p>
                    </div>
                  </div>
                </Celula>
                <Celula className="min-w-28 max-w-44 text-muted-foreground">{p.cargo || '—'}</Celula>
                <Celula>
                  <div className="flex flex-wrap gap-1">
                    {rotulosDosTipos(p.tipos_de_consultoria).map((r) => (
                      <Badge key={r} variant="outline" className="font-medium">{r}</Badge>
                    ))}
                    {!p.tipos_de_consultoria?.length && <span className="text-muted-foreground">—</span>}
                  </div>
                </Celula>
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
                {/* Posições fixas (auditoria, G1): Editar · Capacidade · "⋯"; a que não vale para a linha deixa o espaço. As raras
                    (Reenviar convite, Mover para a central, Desativar) ficam no "⋯", que só aparece quando há alguma, mas guarda o
                    lugar: assim a tabela cabe em 1440 px e a coluna fixa não cobre a ocupação. Nos desativados, só Reativar. */}
                <CelulaAcoes>
                  {p.ativo === false ? (
                    <AcaoDaLinha nome="Reativar" icone={UserCheck} visivel={podeDesativar(p)}
                      onClick={() => setConfirmando({ pessoa: p, acao: 'reativar' })} />
                  ) : (
                    <>
                      <AcaoDaLinha nome="Editar" icone={Pencil} visivel={podeEditar(p) || p.id === perfil.id} onClick={() => setEditando(p)} />
                      {comCapacidade && <AcaoDaLinha nome="Capacidade" icone={Gauge} visivel={podeCapacidade(p)} onClick={() => setCapacidade(p)} />}
                      <MaisAcoes pessoa={p} itens={[
                        p.convite_pendente && (!ehDono || podeEditar(p))
                          && { rotulo: 'Reenviar convite', icone: Send, aoEscolher: () => reenviar(p) },
                        podeMover(p) && { rotulo: 'Mover para a central', icone: Landmark, aoEscolher: () => setConfirmando({ pessoa: p, acao: 'mover' }) },
                        podeDesativar(p) && { rotulo: 'Desativar', icone: UserX, perigo: true, aoEscolher: () => setConfirmando({ pessoa: p, acao: 'desativar' }) },
                      ]} />
                    </>
                  )}
                </CelulaAcoes>
              </Linha>
            )
          })}
        </Tabela>
      )}
      {editando?.id === perfil.id && <MinhaFicha aoFechar={() => setEditando(null)} aoSalvo={recarregar} />}
      {editando && editando.id !== perfil.id && (
        <FichaDoConsultor key={editando.id} aberto pessoa={editando} perfilDeQuem={perfil} times={ehDono ? [] : times}
          podeReenviar={!ehDono || podeEditar(editando)} podeDesativar={podeDesativar(editando)}
          aoReenviar={() => reenviar(editando)} aoPedirAtivo={(acao) => setConfirmando({ pessoa: editando, acao })}
          aoPedirZerar2fa={({ exigida }) => setConfirmando({ pessoa: editando, acao: 'zerar_2fa', exigida })}
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
      {confirmando?.acao === 'zerar_2fa' && (
        <ConfirmarAcao aberto aoFechar={() => setConfirmando(null)}
          titulo={`Zerar a verificação em duas etapas de ${confirmando.pessoa.nome}?`}
          descricao={textoDoZerar(confirmando)}
          rotuloConfirmar="Zerar" aoConfirmar={() => zerarVerificacao(confirmando.pessoa)} />
      )}
      {confirmando && confirmando.acao !== 'zerar_2fa' && (
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
