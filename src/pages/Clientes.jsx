import { Archive, Building2, CalendarX, Eye, Hourglass, Plus, RadioTower, Timer, TrendingUp, Users } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { GraficoCarregando } from '@/components/comum/Carregando'
import Seletor from '@/components/campos/Seletor'
import BarraDeFiltros, { AcaoPrincipal, CampoBusca } from '@/components/comum/BarraDeFiltros'
import Cabecalho from '@/components/comum/Cabecalho'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { AcoesDaLinha } from '@/components/clientes/AcoesDoCliente'
import { useAcoesDoCliente } from '@/components/clientes/useAcoesDoCliente'
import FiltroConsultor from '@/components/clientes/FiltroConsultor'
import { abaDoCliente } from '@/components/clientes/rotulos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { listarClientes } from '@/data/clientes'
import { meuCheckinAberto } from '@/data/checkins'
import { indicadoresDeClientes } from '@/data/indicadores'
import { formatarCnpj } from '@/lib/cnpj'
import { formatarHoras } from '@/lib/horas'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'
import { useLeitura } from '@/lib/useLeitura'
import { useListaPaginada } from '@/lib/useListaPaginada'

// Situação (filtro) por papel. A central e o dono veem tudo e começam pelo que espera a central; admin e gestor
// começam pelo que está em atendimento. A pessoa não tem filtro: só vê os clientes dela.
const SITUACOES_DA_CENTRAL = [
  { valor: 'todas', rotulo: 'Todas' }, { valor: 'distribuir', rotulo: 'Aguardando consultoria' },
  { valor: 'aguardando', rotulo: 'Aguardando consultor' }, { valor: 'atendimento', rotulo: 'Em atendimento' },
  { valor: 'arquivados', rotulo: 'Arquivados' },
]
const SITUACOES_DA_CONSULTORIA = [
  { valor: 'todas', rotulo: 'Todas' }, { valor: 'aguardando', rotulo: 'Aguardando consultor' },
  { valor: 'atendimento', rotulo: 'Em atendimento' },
]

const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

const VAZIO = {
  distribuir: 'Nenhum cliente aguardando consultoria.',
  todas: 'Nenhum cliente cadastrado.',
  arquivados: 'Nenhum cliente arquivado.',
  aguardando: 'Nenhum cliente aguardando consultor.',
  atendimento: 'Nenhum cliente em atendimento.',
  meus: 'Você ainda não tem clientes.',
}

// Com algo na busca, a situação de cada linha aparece numa coluna (a busca passa por cima da situação escolhida: U1).
const SITUACAO_DA_LINHA = {
  distribuir: { rotulo: 'Aguardando consultoria', variante: 'notice' },
  aguardando: { rotulo: 'Aguardando consultor', variante: 'notice' },
  atendimento: { rotulo: 'Em atendimento', variante: 'positive' },
  arquivados: { rotulo: 'Arquivado', variante: 'secondary' },
}

const quantos = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

// Lista vazia sem busca (auditoria, M1): o texto diz o próximo passo e `destino` é a situação que tem clientes (o "Ver"
// troca para ela). Os números são os dos cartões (contados no banco, no mesmo recorte de consultoria e consultor).
function vazioDaSituacao(aba, n, central) {
  if (central && aba === 'distribuir') {
    if (n?.aguardando_consultor > 0) {
      return { texto: `Nada para mandar agora. ${quantos(n.aguardando_consultor, 'cliente aguarda', 'clientes aguardam')} consultor nas consultorias.`, destino: 'aguardando' }
    }
    if (n?.em_atendimento > 0) {
      return { texto: `Nada para mandar agora. ${quantos(n.em_atendimento, 'cliente está', 'clientes estão')} em atendimento.`, destino: 'atendimento' }
    }
    return { texto: 'Nada para mandar agora.' }
  }
  if (!central && aba === 'atendimento' && n?.aguardando_consultor > 0) {
    return { texto: `${VAZIO.atendimento} ${quantos(n.aguardando_consultor, 'cliente aguarda', 'clientes aguardam')} consultor.`, destino: 'aguardando' }
  }
  if (!central && aba === 'aguardando' && n?.em_atendimento > 0) {
    return { texto: `${VAZIO.aguardando} ${quantos(n.em_atendimento, 'cliente está', 'clientes estão')} em atendimento.`, destino: 'atendimento' }
  }
  return { texto: VAZIO[aba] }
}

// Números dos cartões (contados no banco, no recorte de quem vê): seguem a consultoria e o consultor do filtro; a
// situação e a busca não mudam os cartões (eles mostram justamente a divisão por situação).
const lerNumeros = ({ consultoriaId, consultorId }) => indicadoresDeClientes({ consultoriaId, consultorId })

// Os 4 cartões de cada papel: central e dono, a fila e as situações; administrador e gestor, a consultoria; o
// consultor, os clientes dele.
function cartoesDoPapel(papel, n) {
  const passaram = { chave: 'passaram', rotulo: 'Passaram da previsão no mês', icone: TrendingUp, tom: 'perigo',
    valor: n?.passaram_da_previsao, destaque: n?.passaram_da_previsao > 0 ? 'perigo' : null }
  const parados = { chave: 'parados', rotulo: 'Sem check-in há 30 dias', icone: CalendarX, tom: 'aviso',
    valor: n?.sem_checkin_30_dias, destaque: n?.sem_checkin_30_dias > 0 ? 'atencao' : null }
  const aguardando = { chave: 'aguardando', rotulo: 'Aguardando consultor', icone: Hourglass, tom: 'aviso', valor: n?.aguardando_consultor }
  const atendimento = { chave: 'atendimento', rotulo: 'Em atendimento', icone: RadioTower, tom: 'positivo', valor: n?.em_atendimento }
  if (papel === 'central') {
    return [
      { chave: 'distribuir', rotulo: 'Aguardando consultoria', icone: Building2, valor: n?.aguardando_consultoria },
      aguardando, atendimento,
      { chave: 'arquivados', rotulo: 'Arquivados', icone: Archive, tom: 'neutro', valor: n?.arquivados },
    ]
  }
  if (papel === 'gestao') return [aguardando, atendimento, passaram, parados]
  return [
    { chave: 'meus', rotulo: 'Meus clientes', icone: Users, valor: n?.meus_clientes },
    passaram,
    { chave: 'horas', rotulo: 'Horas no mês', icone: Timer, tom: 'ceu', valor: n ? formatarHoras(n.horas_no_mes) : null },
    parados,
  ]
}

function Previsao({ cliente, comRealizado }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums">
        {comRealizado ? `${formatarHoras(cliente.realizado_no_mes)} de ${formatarHoras(cliente.horas_mes)}` : formatarHoras(cliente.horas_mes)}
      </span>
      {cliente.realizado_no_mes > cliente.horas_mes && <Badge variant="notice">Passou da previsão</Badge>}
    </div>
  )
}

export default function Clientes() {
  const { perfil } = useAuth()
  const central = veTudo(perfil)
  const gestao = !central && perfil.papel !== 'pessoa'
  const doConsultor = perfil.papel === 'pessoa' // só vê os clientes dele: sem filtro de situação
  const situacoes = central ? SITUACOES_DA_CENTRAL : SITUACOES_DA_CONSULTORIA
  const [situacao, setSituacao] = useState(doConsultor ? 'meus' : central ? 'distribuir' : 'atendimento')
  const aba = situacao
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [consultoriaId, setConsultoriaId] = useState('')
  const [consultor, setConsultor] = useState({ valor: '', nome: null }) // '' = todos, 'sem' ou o id
  const [versao, setVersao] = useState(0)
  const [aberto, setAberto] = useState(null) // meu check-in aberto
  const idDoAviso = useId()
  const consultorQueAtende = !central
  // O filtro de consultor só faz sentido onde já há consultor (e não nas listas só minhas).
  const mostraFiltroConsultor = !doConsultor && !['distribuir', 'aguardando'].includes(aba)
  // Em atendimento todo cliente tem consultor: lá não existe "Sem consultor".
  const semConsultorVale = aba !== 'atendimento'
  const consultorFiltrado = mostraFiltroConsultor && (semConsultorVale || consultor.valor !== 'sem') ? consultor.valor : ''
  const recarregar = () => setVersao((v) => v + 1)
  const { abrir, janelas } = useAcoesDoCliente({ aoMudar: recarregar })
  const numeros = useLeitura(lerNumeros, {
    consultoriaId: consultoriaId || undefined, consultorId: consultorFiltrado || undefined, versao,
  }).dados

  // Com algo na busca, a lista procura em todas as situações (usabilidade, U1): a central em todas, até nos arquivados; a
  // gestão em Todas (as da consultoria). O consultor não tem situação: a busca continua nos clientes dele.
  const buscando = Boolean(buscaAtrasada) && !doConsultor
  // Uma página por vez, filtrada e paginada no banco (regra "Escala" no CLAUDE.md); mudar um filtro volta para a página 1.
  const { resultado, total, erro: falhou, paginacao } = useListaPaginada(listarClientes, {
    aba: buscando ? (central ? 'qualquer' : 'todas') : aba,
    busca: buscaAtrasada || undefined,
    consultoriaId: consultoriaId || undefined,
    consultorId: aba === 'meus' ? perfil.id : consultorFiltrado || undefined,
  }, { versao })
  const erro = falhou ? 'Não foi possível carregar os clientes.' : null

  // O check-in que ficou aberto (no máximo um); recarregado depois de cada check-in, check-out ou lançamento.
  useEffect(() => {
    if (!consultorQueAtende) return undefined
    let ativo = true
    meuCheckinAberto(perfil.id)
      .then((r) => ativo && setAberto(r))
      .catch(() => {})
    return () => {
      ativo = false
    }
  }, [consultorQueAtende, perfil.id, versao])

  // As ações vêm da situação do próprio cliente (não do filtro). Quem atende ainda faz check-in e lança horas
  // nos clientes dele; a gestão também escolhe/troca consultor e ajusta a previsão.
  const acoesDoCliente = (cliente) => {
    const comuns = { cliente, central, gestao, aberto, idDoAviso, abrir, aoMudar: recarregar }
    const meu = doConsultor || (!central && cliente.consultor_id === perfil.id)
    return (
      <>
        {meu && <AcoesDaLinha {...comuns} aba="meus" />}
        {!doConsultor && <AcoesDaLinha {...comuns} aba={abaDoCliente(cliente, central)} />}
      </>
    )
  }

  const clientes = resultado?.itens ?? null
  const vazio = vazioDaSituacao(aba, numeros, central)

  return (
    <>
      <Cabecalho titulo="Clientes"
        descricao={resultado ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'cliente' : 'clientes'}` : null} />
      <BarraDeFiltros>
        {!doConsultor && (
          <div className="flex items-center gap-2">
            <Label htmlFor="filtro-situacao" className="shrink-0 text-muted-foreground">Situação</Label>
            <div className="w-52">
              <Seletor id="filtro-situacao" tamanho="sm" valor={situacao} aoMudar={setSituacao} opcoes={situacoes.map((o) => ({ valor: o.valor, rotulo: o.rotulo }))} />
            </div>
          </div>
        )}
        <CampoBusca rotulo="Buscar clientes" placeholder="Buscar por nome, cidade ou CNPJ" valor={busca} aoMudar={setBusca} />
        {central && (
          <FiltroConsultoria valor={consultoriaId} aoMudar={(id) => { setConsultoriaId(id); setConsultor({ valor: '', nome: null }) }} />
        )}
        {mostraFiltroConsultor && (
          <FiltroConsultor valor={consultorFiltrado} nome={consultor.nome} comSemConsultor={semConsultorVale}
            consultoriaId={central ? (consultoriaId || null) : perfil.consultoria_id} aoMudar={(valor, nome) => setConsultor({ valor, nome })} />
        )}
        {central && (
          <AcaoPrincipal>
            <Button onClick={() => abrir('formulario')}>
              <Plus /> Novo cliente
            </Button>
          </AcaoPrincipal>
        )}
      </BarraDeFiltros>
      <CartoesDeNumeros rotulo="Indicadores dos clientes"
        cartoes={cartoesDoPapel(central ? 'central' : doConsultor ? 'consultor' : 'gestao', numeros)} />
      {!central && aberto && clientes?.some((c) => c.id !== aberto.cliente_id && (doConsultor || c.consultor_id === perfil.id)) && (
        <p id={idDoAviso} className="mb-3 text-corpo text-muted-foreground">
          Você está com check-in aberto em {aberto.cliente?.nome ?? 'outro cliente'} desde {HORA.format(new Date(aberto.inicio))}.
          {' '}Faça o check-out para começar outro.
        </p>
      )}
      {/* A região de aviso fica sempre na página e só o texto muda: o leitor de tela anuncia quando a busca começa. */}
      <p role="status" className={buscando ? 'mb-3 text-corpo text-muted-foreground' : 'sr-only'}>
        {buscando ? 'Buscando em todas as situações.' : ''}
      </p>
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && clientes === null && <GraficoCarregando texto="Carregando os clientes…" className="py-12" />}
      {clientes?.length === 0 && buscaAtrasada && <ListaVazia>Nenhum cliente encontrado.</ListaVazia>}
      {clientes?.length === 0 && !buscaAtrasada && (
        <ListaVazia>
          <p>{vazio.texto}</p>
          {(vazio.destino || central) && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {vazio.destino && <Button onClick={() => setSituacao(vazio.destino)}><Eye /> Ver</Button>}
              {central && <Button variant="outline" onClick={() => abrir('formulario')}><Plus /> Novo cliente</Button>}
            </div>
          )}
        </ListaVazia>
      )}
      {clientes?.length > 0 && (
        <Tabela rotulo="Clientes" paginacao={paginacao}
          colunas={['Cliente', ...(buscando ? ['Situação'] : []), 'CNPJ', 'Cidade', 'Previsão', 'Consultoria', 'Consultor']}>
          {clientes.map((c) => (
            <Linha key={c.id}>
              <Celula>
                <p className="flex items-center gap-2 font-semibold">
                  <Link to={`/clientes/${c.id}`} className="hover:underline">{c.nome}</Link>
                  {!buscando && !c.arquivado && c.consultoria_id && !c.consultor_id && <Badge variant="notice">Novo</Badge>}
                </p>
                {c.razao_social && <p className="truncate text-rotulo text-muted-foreground">{c.razao_social}</p>}
              </Celula>
              {buscando && (
                <Celula>
                  <Badge variant={SITUACAO_DA_LINHA[abaDoCliente(c, false)].variante}>{SITUACAO_DA_LINHA[abaDoCliente(c, false)].rotulo}</Badge>
                </Celula>
              )}
              <Celula className="whitespace-nowrap tabular-nums text-muted-foreground">{c.cnpj ? formatarCnpj(c.cnpj) : '—'}</Celula>
              <Celula className="text-muted-foreground">{c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ''}` : '—'}</Celula>
              <Celula><Previsao cliente={c} comRealizado={doConsultor} /></Celula>
              <Celula className="text-muted-foreground">{c.consultoria?.nome ?? '—'}</Celula>
              <Celula className="text-muted-foreground">
                {c.consultor ? (
                  <>
                    {c.consultor.nome}
                    {c.consultor.ativo === false && <span className="ml-1 text-rotulo">(desativado)</span>}
                  </>
                ) : '—'}
              </Celula>
              <CelulaAcoes>{acoesDoCliente(c)}</CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
      {janelas}
    </>
  )
}
