import { Plus } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { GraficoCarregando } from '@/components/comum/Carregando'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import BarraDeFiltros, { AcaoPrincipal, CampoBusca } from '@/components/comum/BarraDeFiltros'
import Cabecalho from '@/components/comum/Cabecalho'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { AcoesDaLinha } from '@/components/clientes/AcoesDoCliente'
import { useAcoesDoCliente } from '@/components/clientes/useAcoesDoCliente'
import FiltroConsultor from '@/components/clientes/FiltroConsultor'
import MeusCheckins from '@/components/clientes/MeusCheckins'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listarClientes } from '@/data/clientes'
import { meuCheckinAberto } from '@/data/checkins'
import { formatarCnpj } from '@/lib/cnpj'
import { formatarHoras } from '@/lib/horas'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'

// Abas por papel. Quem atende (pessoa, gestor e admin) também tem Meus clientes e Meus check-ins;
// a central e o dono nunca fazem check-in.
const ABAS_DA_CENTRAL = [
  { valor: 'distribuir', rotulo: 'A distribuir' }, { valor: 'nas_consultorias', rotulo: 'Nas consultorias' },
  { valor: 'arquivados', rotulo: 'Arquivados' },
]
const ABAS_DO_CONSULTOR = [{ valor: 'meus', rotulo: 'Meus clientes' }, { valor: 'checkins', rotulo: 'Meus check-ins' }]
const ABAS_DA_CONSULTORIA = [
  { valor: 'aguardando', rotulo: 'Aguardando consultor' }, { valor: 'atendimento', rotulo: 'Em atendimento' }, ...ABAS_DO_CONSULTOR,
]
const ABAS_DA_PESSOA = ABAS_DO_CONSULTOR

const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

function abasDoPapel(perfil) {
  if (veTudo(perfil)) return ABAS_DA_CENTRAL
  if (perfil.papel === 'pessoa') return ABAS_DA_PESSOA
  return ABAS_DA_CONSULTORIA
}

const VAZIO = {
  distribuir: 'Nenhum cliente esperando distribuição.',
  nas_consultorias: 'Nenhum cliente nas consultorias ainda.',
  arquivados: 'Nenhum cliente arquivado.',
  aguardando: 'Nenhum cliente aguardando consultor.',
  atendimento: 'Nenhum cliente em atendimento.',
  meus: 'Você ainda não tem clientes.',
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
  const abas = abasDoPapel(perfil)
  const [aba, setAba] = useState(abas[0].valor)
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [consultoriaId, setConsultoriaId] = useState('')
  const [consultor, setConsultor] = useState({ valor: '', nome: null }) // '' = todos, 'sem' ou o id
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [versao, setVersao] = useState(0)
  const [aberto, setAberto] = useState(null) // meu check-in aberto
  const idDoAviso = useId()
  const consultorQueAtende = !central
  const emCheckins = aba === 'checkins'
  // O filtro de consultor só faz sentido onde já há consultor (e não nas listas só minhas).
  const mostraFiltroConsultor = perfil.papel !== 'pessoa' && !['distribuir', 'aguardando', 'meus', 'checkins'].includes(aba)
  // Em atendimento todo cliente tem consultor: lá não existe "Sem consultor".
  const semConsultorVale = aba !== 'atendimento'
  const consultorFiltrado = mostraFiltroConsultor && (semConsultorVale || consultor.valor !== 'sem') ? consultor.valor : ''
  const recarregar = () => setVersao((v) => v + 1)
  const { abrir, janelas } = useAcoesDoCliente({ aoMudar: recarregar })

  // Uma página por vez, filtrada e paginada no banco (regra "Escala" no CLAUDE.md).
  useEffect(() => {
    if (emCheckins) return undefined
    let ativo = true
    listarClientes({
      aba,
      busca: buscaAtrasada || undefined,
      consultoriaId: consultoriaId || undefined,
      consultorId: aba === 'meus' ? perfil.id : consultorFiltrado || undefined,
      pagina,
    })
      .then((r) => {
        if (!ativo) return
        if (r.foraDaFaixa && pagina > 1) return setPagina(1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os clientes.'))
    return () => {
      ativo = false
    }
  }, [aba, emCheckins, buscaAtrasada, consultoriaId, consultorFiltrado, pagina, versao, perfil.id])

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

  // Qualquer mudança de filtro volta para a página 1.
  const filtros = `${aba}|${buscaAtrasada}|${consultoriaId}|${consultorFiltrado}`
  const [filtrosAnteriores, setFiltrosAnteriores] = useState(filtros)
  if (filtros !== filtrosAnteriores) {
    setFiltrosAnteriores(filtros)
    setPagina(1)
  }

  const clientes = resultado?.itens ?? null
  const total = resultado?.total ?? 0

  return (
    <>
      <Cabecalho titulo="Clientes"
        descricao={resultado && !emCheckins ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'cliente' : 'clientes'}` : null} />
      <BarraDeFiltros>
        {abas.length > 1 && <AbasSegmentadas rotulo="Mostrar" abas={abas} valor={aba} aoMudar={setAba} />}
        {!emCheckins && (
          <CampoBusca rotulo="Buscar clientes" placeholder="Buscar por nome, cidade ou CNPJ" valor={busca} aoMudar={setBusca} />
        )}
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
      {aba === 'meus' && aberto && clientes?.some((c) => c.id !== aberto.cliente_id) && (
        <p id={idDoAviso} className="mb-3 text-sm text-muted-foreground">
          Você está com check-in aberto em {aberto.cliente?.nome ?? 'outro cliente'} desde {HORA.format(new Date(aberto.inicio))}.
          {' '}Faça o check-out para começar outro.
        </p>
      )}
      {emCheckins && <MeusCheckins consultorId={perfil.id} consultoriaId={perfil.consultoria_id} aoMudar={recarregar} />}
      {!emCheckins && erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!emCheckins && !erro && clientes === null && <GraficoCarregando texto="Carregando os clientes…" className="py-12" />}
      {!emCheckins && clientes?.length === 0 && <ListaVazia>{buscaAtrasada ? 'Nenhum cliente encontrado.' : VAZIO[aba]}</ListaVazia>}
      {!emCheckins && clientes?.length > 0 && (
        <Tabela rotulo="Clientes" colunas={['Cliente', 'CNPJ', 'Cidade', 'Previsão', 'Consultoria', 'Consultor']}
          paginacao={{ pagina, total, aoMudar: setPagina }}>
          {clientes.map((c) => (
            <Linha key={c.id}>
              <Celula>
                <p className="flex items-center gap-2 font-semibold">
                  <Link to={`/clientes/${c.id}`} className="hover:underline">{c.nome}</Link>
                  {aba === 'aguardando' && <Badge variant="notice">Novo</Badge>}
                </p>
                {c.razao_social && <p className="truncate text-xs text-muted-foreground">{c.razao_social}</p>}
              </Celula>
              <Celula className="tabular-nums text-muted-foreground">{c.cnpj ? formatarCnpj(c.cnpj) : '—'}</Celula>
              <Celula className="text-muted-foreground">{c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ''}` : '—'}</Celula>
              <Celula><Previsao cliente={c} comRealizado={aba === 'meus'} /></Celula>
              <Celula className="text-muted-foreground">{c.consultoria?.nome ?? '—'}</Celula>
              <Celula className="text-muted-foreground">
                {c.consultor ? (
                  <>
                    {c.consultor.nome}
                    {c.consultor.ativo === false && <span className="ml-1 text-xs">(desativado)</span>}
                  </>
                ) : '—'}
              </Celula>
              <CelulaAcoes><AcoesDaLinha cliente={c} aba={aba} central={central} gestao={gestao} aberto={aberto} idDoAviso={idDoAviso} abrir={abrir} aoMudar={recarregar} /></CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
      {janelas}
    </>
  )
}
