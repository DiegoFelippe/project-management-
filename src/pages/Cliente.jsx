import { useEffect, useId, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { GraficoCarregando } from '@/components/comum/Carregando'
import BarraDeFiltros from '@/components/comum/BarraDeFiltros'
import Cabecalho, { Voltar } from '@/components/comum/Cabecalho'
import CalendarioDaAgenda from '@/components/calendario/CalendarioDaAgenda'
import ChecklistDoCliente from '@/components/checkins/ChecklistDoCliente'
import AbasDoCliente from '@/components/clientes/AbasDoCliente'
import ArquivosDoCliente from '@/components/clientes/ArquivosDoCliente'
import { AcoesDaLinha } from '@/components/clientes/AcoesDoCliente'
import { abaDoCliente } from '@/components/clientes/rotulos'
import { useAcoesDoCliente } from '@/components/clientes/useAcoesDoCliente'
import CheckinsDoCliente from '@/components/clientes/CheckinsDoCliente'
import FichaDoCliente from '@/components/clientes/FichaDoCliente'
import GraficosDoCliente from '@/components/clientes/GraficosDoCliente'
import HojeDoCliente from '@/components/clientes/HojeDoCliente'
import HistoricoDoCliente from '@/components/clientes/HistoricoDoCliente'
import FiltroDePeriodo from '@/components/inicio/FiltroDePeriodo'
import { useLeituraDoBloco } from '@/components/inicio/useLeituraDoBloco'
import QuadroDoCliente from '@/components/quadro/QuadroDoCliente'
import { buscarCliente, hojeDoCliente } from '@/data/clientes'
import { meuCheckinAberto } from '@/data/checkins'
import { hoje as hojeEmSP, mesAtual } from '@/lib/mes'
import { veTudo } from '@/lib/papeis'
import { lerPeriodo, paraEndereco, periodoAoTrocar, validarPeriodo } from '@/lib/periodo'

const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

// A faixa "Hoje" numa leitura só (hoje_do_cliente), que a página reparte: os 5 cartões e os gráficos de hoje (check-list
// por etapa, onde foi o tempo e o quadro, pelo id dele; pedido do Diego, 19/11). Estável para o useLeitura.
const lerHoje = ({ id }) => hojeDoCliente(id)
const CHAVES_DO_PERIODO = ['periodo', 'mes', 'de', 'ate']

// Aba Geral: ficha compacta → barra de filtros (o período, como no Início) → Hoje (não segue o período) → os gráficos do
// período (pedido do Diego, 19/11). O período fica no endereço, ao lado da aba; o Mês vai do mês do cadastro do cliente
// até o atual. Só a aba aberta monta, então só ela lê.
function GeralDoCliente({ cliente, versao, podeAplicar }) {
  const [parametros, setParametros] = useSearchParams()
  const hoje = hojeEmSP()
  const periodo = lerPeriodo(parametros, hoje)
  const erroDoPeriodo = periodo.tipo === 'mes' ? null : validarPeriodo(periodo.de, periodo.ate, hoje)
  const [tentativa, setTentativa] = useState(0)
  const leituraDeHoje = useLeituraDoBloco(lerHoje, { id: cliente.id, versao, tentativa })
  const relerHoje = () => setTentativa((t) => t + 1)

  function irPara(novo) {
    setParametros((antes) => {
      const proximos = new URLSearchParams(antes)
      for (const chave of CHAVES_DO_PERIODO) proximos.delete(chave)
      for (const [chave, valor] of Object.entries(paraEndereco({ ...periodo, ...novo }))) proximos.set(chave, valor)
      return proximos
    }, { replace: true })
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <FichaDoCliente cliente={cliente} />
      <BarraDeFiltros className="mb-0">
        <FiltroDePeriodo periodo={periodo} hoje={hoje} erro={erroDoPeriodo}
          minimo={cliente.criado_em ? mesAtual(new Date(cliente.criado_em)) : undefined} maximo={mesAtual()}
          aoTrocarTipo={(tipo) => irPara(periodoAoTrocar(periodo, tipo, hoje))}
          aoMudarMes={(mes) => irPara({ mes })}
          aoMudarDatas={(datas) => irPara(datas)} />
      </BarraDeFiltros>
      <HojeDoCliente hoje={leituraDeHoje.dados} erro={leituraDeHoje.erro} atualizando={leituraDeHoje.atualizando} podeAplicar={podeAplicar}
        aoTentarDeNovo={relerHoje} />
      {erroDoPeriodo
        ? <p className="card p-4 text-corpo text-muted-foreground">Ajuste as datas na barra de filtros para ver os gráficos.</p>
        : <GraficosDoCliente key={cliente.id} cliente={cliente} periodo={periodo} versao={versao} hoje={leituraDeHoje} aoRelerHoje={relerHoje} />}
    </div>
  )
}

// Página do cliente: a aba Geral (ficha, período, Hoje e gráficos), quadro, agenda, check-ins, arquivos e histórico. O banco decide
// quem enxerga o quê.
export default function Cliente() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const central = veTudo(perfil)
  const gestao = !central && perfil.papel !== 'pessoa'
  const [cliente, setCliente] = useState(undefined) // undefined = carregando; null = não achou
  const [erro, setErro] = useState(null)
  const [aberto, setAberto] = useState(null)
  const [versao, setVersao] = useState(0)
  const idDoAviso = useId()
  const recarregar = () => setVersao((v) => v + 1)
  const { abrir, janelas } = useAcoesDoCliente({ aoMudar: recarregar, aoApagar: () => navigate('/clientes') })

  useEffect(() => {
    let ativo = true
    buscarCliente(id)
      .then((c) => {
        if (!ativo) return
        setCliente(c)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar o cliente.'))
    return () => {
      ativo = false
    }
  }, [id, versao])

  useEffect(() => {
    if (central) return undefined
    let ativo = true
    meuCheckinAberto(perfil.id)
      .then((r) => ativo && setAberto(r))
      .catch(() => {})
    return () => {
      ativo = false
    }
  }, [central, perfil.id, versao])

  const voltar = <Voltar para="/clientes">Clientes</Voltar>
  if (erro) return <>{voltar}<p role="alert" className="text-corpo text-destructive">{erro}</p></>
  if (cliente === undefined) return <>{voltar}<GraficoCarregando texto="Carregando o cliente…" className="py-12" /></>
  if (cliente === null) return <>{voltar}<p className="text-corpo text-muted-foreground">Cliente não encontrado.</p></>

  const souConsultor = !central && cliente.consultor_id === perfil.id && !cliente.arquivado
  const aba = abaDoCliente(cliente, central)
  const acoes = { cliente, central, gestao, aberto, idDoAviso, abrir, aoMudar: recarregar }

  // Para uma aba nova (ex.: Agenda), basta uma linha aqui, na ordem em que ela aparece.
  const abas = [
    {
      id: 'geral',
      rotulo: 'Geral',
      conteudo: (
        <GeralDoCliente cliente={cliente} versao={versao}
          podeAplicar={(central || gestao) && Boolean(cliente.consultoria_id) && !cliente.arquivado} />
      ),
    },
    // O quadro Kanban do cliente na consultoria que o atende (a central escolhe o de uma consultoria anterior).
    { id: 'quadro', rotulo: 'Quadro', conteudo: <QuadroDoCliente key={cliente.id} cliente={cliente} perfil={perfil} /> },
    // O calendário do menu, só com os compromissos deste cliente (check-ins e histórico têm as abas deles).
    { id: 'agenda', rotulo: 'Agenda', conteudo: <CalendarioDaAgenda key={cliente.id} cliente={cliente} /> },
    // O check-list do modelo aplicado (Lista | Fluxograma | Check-ins, a sessão aberta). A tabela de check-ins vai para o
    // check-list: com modelo, é a visão Check-ins; sem modelo, fica embaixo das caixas, como antes.
    {
      id: 'checkins',
      rotulo: 'Check-ins',
      conteudo: (
        <ChecklistDoCliente key={cliente.id} cliente={cliente} perfil={perfil} versao={versao} aoMudar={recarregar}
          checkinAberto={aberto}
          checkins={<CheckinsDoCliente cliente={cliente} perfil={perfil} versao={versao} aoMudar={recarregar} />} />
      ),
    },
    { id: 'arquivos', rotulo: 'Arquivos', conteudo: <ArquivosDoCliente cliente={cliente} perfil={perfil} /> },
    { id: 'historico', rotulo: 'Histórico', conteudo: <HistoricoDoCliente clienteId={cliente.id} versao={versao} /> },
  ]

  return (
    <>
      <Cabecalho voltarPara={{ caminho: '/clientes', rotulo: 'Clientes' }} titulo={cliente.nome} descricao={cliente.razao_social} />
      {aberto && souConsultor && aberto.cliente_id !== cliente.id && (
        <p id={idDoAviso} className="mb-3 text-corpo text-muted-foreground">
          Você está com check-in aberto em {aberto.cliente?.nome ?? 'outro cliente'} desde {HORA.format(new Date(aberto.inicio))}.
          {' '}Faça o check-out para começar outro.
        </p>
      )}
      {/* O título fica sozinho; abas e ações ficam numa barra no estilo da de filtros (pedido do Diego, 17/11). */}
      <AbasDoCliente abas={abas} barra="Abas e ações do cliente" acoes={(
        <>
          {souConsultor && <AcoesDaLinha {...acoes} aba="meus" noCabecalho />}
          {(central || (gestao && !cliente.arquivado)) && <AcoesDaLinha {...acoes} aba={aba} noCabecalho />}
        </>
      )} />
      {janelas}
    </>
  )
}
