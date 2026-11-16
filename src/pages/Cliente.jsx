import { ArrowLeft } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { GraficoCarregando } from '@/components/comum/Carregando'
import Cabecalho from '@/components/comum/Cabecalho'
import AgendaDoCliente from '@/components/clientes/AgendaDoCliente'
import AbasDoCliente from '@/components/clientes/AbasDoCliente'
import ArquivosDoCliente from '@/components/clientes/ArquivosDoCliente'
import { AcoesDaLinha } from '@/components/clientes/AcoesDoCliente'
import { useAcoesDoCliente } from '@/components/clientes/useAcoesDoCliente'
import CheckinsDoCliente from '@/components/clientes/CheckinsDoCliente'
import GraficosDoCliente from '@/components/clientes/GraficosDoCliente'
import HistoricoDoCliente from '@/components/clientes/HistoricoDoCliente'
import { Badge } from '@/components/ui/badge'
import { buscarCliente } from '@/data/clientes'
import { meuCheckinAberto } from '@/data/checkins'
import { formatarCnpj } from '@/lib/cnpj'
import { formatarHoras } from '@/lib/horas'
import { veTudo } from '@/lib/papeis'

const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

function situacaoDe(c) {
  if (c.arquivado) return 'Arquivado'
  if (!c.consultoria_id) return 'Aguardando distribuição'
  if (!c.consultor_id) return 'Aguardando consultor'
  return 'Em atendimento'
}

// A aba da lista em que o cliente estaria: define quais ações da linha valem para ele.
function abaDoCliente(c, central) {
  if (c.arquivado) return 'arquivados'
  if (!c.consultoria_id) return 'distribuir'
  if (central) return 'nas_consultorias'
  return c.consultor_id ? 'atendimento' : 'aguardando'
}

function Campo({ rotulo, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium">{children || '—'}</dd>
    </div>
  )
}

function Bloco({ titulo, children }) {
  return (
    <section aria-label={titulo} className="card p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{titulo}</h2>
      <dl className="grid gap-3">{children}</dl>
    </section>
  )
}

// Página do cliente: dados, previsão x realizado, check-ins e histórico. O banco decide quem enxerga o quê.
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

  const voltar = (
    <Link to="/clientes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Clientes
    </Link>
  )
  if (erro) return <>{voltar}<p role="alert" className="text-sm text-destructive">{erro}</p></>
  if (cliente === undefined) return <>{voltar}<GraficoCarregando texto="Carregando o cliente…" className="py-12" /></>
  if (cliente === null) return <>{voltar}<p className="text-sm text-muted-foreground">Cliente não encontrado.</p></>

  const souConsultor = !central && cliente.consultor_id === perfil.id && !cliente.arquivado
  const aba = abaDoCliente(cliente, central)
  const acoes = { cliente, central, gestao, aberto, idDoAviso, abrir, aoMudar: recarregar }
  const passou = cliente.realizado_no_mes > cliente.horas_mes

  // Para uma aba nova (ex.: Agenda), basta uma linha aqui, na ordem em que ela aparece.
  const abas = [
    {
      id: 'geral',
      rotulo: 'Geral',
      conteudo: (
      <>
        <section aria-label="Resumo" className="mb-4 flex flex-wrap gap-x-8 gap-y-2 card p-4">
          <dl className="contents">
            <Campo rotulo="Situação">{situacaoDe(cliente)}</Campo>
            <Campo rotulo="Consultoria">{cliente.consultoria?.nome}</Campo>
            <Campo rotulo="Consultor">
              {cliente.consultor && (
                <>
                  {cliente.consultor.nome}
                  {cliente.consultor.ativo === false && <span className="ml-1 text-xs">(desativado)</span>}
                </>
              )}
            </Campo>
          </dl>
        </section>
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Bloco titulo="Empresa">
            <Campo rotulo="CNPJ">{cliente.cnpj && formatarCnpj(cliente.cnpj)}</Campo>
            <Campo rotulo="Cidade">{cliente.cidade && `${cliente.cidade}${cliente.uf ? `/${cliente.uf}` : ''}`}</Campo>
            <Campo rotulo="Observações">{cliente.observacoes}</Campo>
          </Bloco>
          <Bloco titulo="Contato">
            <Campo rotulo="Nome">{cliente.contato_nome}</Campo>
            <Campo rotulo="Telefone">{cliente.contato_telefone}</Campo>
            <Campo rotulo="E-mail">{cliente.contato_email}</Campo>
          </Bloco>
          <Bloco titulo="Previsão no mês">
            <Campo rotulo="Realizado de previsto">
              <span className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums">{`${formatarHoras(cliente.realizado_no_mes)} de ${formatarHoras(cliente.horas_mes)}`}</span>
                {passou && <Badge variant="notice">Passou da previsão</Badge>}
              </span>
            </Campo>
          </Bloco>
        </div>
        <GraficosDoCliente cliente={cliente} versao={versao} />
      </>
      ),
    },
    { id: 'agenda', rotulo: 'Agenda', conteudo: <AgendaDoCliente clienteId={cliente.id} versao={versao} /> },
    { id: 'checkins', rotulo: 'Check-ins', conteudo: <CheckinsDoCliente cliente={cliente} perfil={perfil} versao={versao} aoMudar={recarregar} /> },
    { id: 'arquivos', rotulo: 'Arquivos', conteudo: <ArquivosDoCliente cliente={cliente} perfil={perfil} /> },
    { id: 'historico', rotulo: 'Histórico', conteudo: <HistoricoDoCliente clienteId={cliente.id} versao={versao} /> },
  ]

  return (
    <>
      {voltar}
      <Cabecalho titulo={cliente.nome} descricao={cliente.razao_social}>
        {souConsultor && <AcoesDaLinha {...acoes} aba="meus" />}
        {(central || (gestao && !cliente.arquivado)) && <AcoesDaLinha {...acoes} aba={aba} />}
      </Cabecalho>
      {aberto && souConsultor && aberto.cliente_id !== cliente.id && (
        <p id={idDoAviso} className="mb-3 text-sm text-muted-foreground">
          Você está com check-in aberto em {aberto.cliente?.nome ?? 'outro cliente'} desde {HORA.format(new Date(aberto.inicio))}.
          {' '}Faça o check-out para começar outro.
        </p>
      )}
      <AbasDoCliente abas={abas} />
      {janelas}
    </>
  )
}
