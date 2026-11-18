import { useState } from 'react'
import { CalendarClock, ExternalLink, Gauge, ListChecks, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import FiltroConsultor from '@/components/clientes/FiltroConsultor'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import Avatar from '@/components/comum/Avatar'
import BarraDeFiltros, { CampoBusca } from '@/components/comum/BarraDeFiltros'
import { GraficoCarregando } from '@/components/comum/Carregando'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { AcaoDaLinha, Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { listarAndamento } from '@/data/checklists'
import { indicadoresDeCheckins } from '@/data/indicadores'
import { hoje } from '@/lib/mes'
import { plural } from '@/lib/nomes'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'
import { useLeitura } from '@/lib/useLeitura'
import { useListaPaginada } from '@/lib/useListaPaginada'
import { cn } from '@/lib/utils'
import { BarraDeProgresso } from './CartaoDoModelo'
import JanelaAplicarModelo from './JanelaAplicarModelo'
import { naoSeAplicaEmPalavras, quandoVence } from './situacao'

const SITUACOES = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'com_atraso', rotulo: 'Com atraso' },
  { valor: 'sem_modelo', rotulo: 'Sem modelo' },
]
const VAZIO = {
  com_atraso: 'Nenhum cliente com tarefa atrasada.',
  sem_modelo: 'Todos os clientes já têm um modelo de check-in.',
}
const numero = (n) => n.toLocaleString('pt-BR')
const daAbaCheckins = (cliente) => `/clientes/${cliente.id}?aba=checkins`

// Números dos cartões (contados no banco, no recorte de quem vê): seguem a consultoria e o consultor do filtro; a
// situação e a busca não mudam os cartões.
const lerNumeros = ({ consultoriaId, consultorId }) => indicadoresDeCheckins({ consultoriaId, consultorId })

function cartoes(n) {
  return [
    { chave: 'com_modelo', rotulo: 'Clientes com modelo', icone: ListChecks, valor: n?.com_modelo,
      detalhe: n ? `de ${plural(n.clientes, 'cliente', 'clientes')}` : null },
    { chave: 'progresso', rotulo: 'Progresso médio', icone: Gauge, tom: 'positivo',
      valor: n ? (n.progresso_medio === null ? '—' : `${n.progresso_medio}%`) : null },
    { chave: 'atrasadas', rotulo: 'Tarefas atrasadas', icone: TriangleAlert, tom: 'perigo', valor: n?.atrasadas,
      destaque: n?.atrasadas > 0 ? 'perigo' : null },
    { chave: 'vencem', rotulo: 'Vencem em 7 dias', icone: CalendarClock, tom: 'aviso', valor: n?.vencem_7_dias },
  ]
}

function Consultor({ linha, comConsultoria }) {
  const { consultor, consultoria } = linha
  return (
    <>
      {consultor ? (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <Avatar pessoa={consultor} />
          <span>{consultor.nome ?? '—'}</span>
        </span>
      ) : <span className="text-muted-foreground whitespace-nowrap">Aguardando consultor</span>}
      {comConsultoria && consultoria && <p className="text-muted-foreground mt-0.5 text-rotulo">{consultoria.nome}</p>}
    </>
  )
}

// O progresso conta as resolvidas (feitas e as que não se aplicam, como o pct do banco); as que não se aplicam aparecem
// embaixo, à parte.
function Progresso({ cliente, checklist }) {
  const naoSeAplica = checklist.nao_se_aplica ?? 0
  return (
    <div className="min-w-32">
      <p className="tabular-nums whitespace-nowrap">
        {checklist.pct}% · {numero(checklist.feitas + naoSeAplica)} de {numero(checklist.tarefas)}
      </p>
      <BarraDeProgresso pct={checklist.pct} rotulo={`Progresso de ${cliente.nome}`} className="mt-1.5" />
      {naoSeAplica > 0 && (
        <p className="text-muted-foreground mt-1 text-legenda tabular-nums whitespace-nowrap">
          {naoSeAplicaEmPalavras(naoSeAplica)}
        </p>
      )}
    </div>
  )
}

function ProximaTarefa({ proxima, diaDeHoje }) {
  if (!proxima) return <span className="text-positive font-medium">Tudo feito</span>
  const venceu = proxima.vence_em < diaDeHoje
  return (
    <>
      <p className="line-clamp-2 max-w-64 min-w-40">{proxima.titulo}</p>
      <p className={cn('text-rotulo tabular-nums', venceu ? 'text-destructive font-medium' : 'text-muted-foreground')}>
        {quandoVence(proxima.vence_em, diaDeHoje)}
      </p>
    </>
  )
}

// A aba Andamento de Check-ins (molde de tela nova): barra de filtros (Todos / Com atraso / Sem modelo, busca no cliente
// ou no modelo, Consultoria para a Central e Consultor para a Central e a gestão) → cartões de números → tabela
// "Andamento dos clientes" (15 por página, do banco: o mais atrasado primeiro e os sem modelo no fim). Cada linha abre a
// aba Check-ins do cliente; quem aplica (a Central e a gestão, pode_aplicar do banco) aplica o modelo nos sem modelo,
// com a mesma janela da aba do cliente. O consultor vê só os clientes dele: é a lista "o que eu tenho para fazer".
export default function AndamentoDosClientes({ perfil }) {
  const central = veTudo(perfil)
  const doConsultor = !central && !['admin', 'gestor'].includes(perfil.papel)
  const [situacao, setSituacao] = useState('todos')
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [consultoriaId, setConsultoriaId] = useState('')
  const [consultor, setConsultor] = useState({ valor: '', nome: null })
  const [versao, setVersao] = useState(0)
  const [aplicarEm, setAplicarEm] = useState(null)
  const diaDeHoje = hoje()
  const recarregar = () => setVersao((v) => v + 1)
  const filtroDaCentral = central && consultoriaId ? consultoriaId : undefined
  const filtroDoConsultor = !doConsultor && consultor.valor ? consultor.valor : undefined
  const numeros = useLeitura(lerNumeros, { consultoriaId: filtroDaCentral, consultorId: filtroDoConsultor, versao }).dados

  // Uma página por vez, filtrada, ordenada e contada no banco (regra "Escala" do CLAUDE.md).
  const { itens: linhas, erro: falhou, paginacao } = useListaPaginada(listarAndamento,
    { situacao, busca: buscaAtrasada || undefined, consultoriaId: filtroDaCentral, consultorId: filtroDoConsultor }, { versao })
  const erro = falhou ? 'Não foi possível carregar o andamento.' : null
  const filtrando = Boolean(buscaAtrasada || filtroDaCentral || filtroDoConsultor)
  const vazio = filtrando ? 'Nenhum cliente encontrado.'
    : VAZIO[situacao] ?? (doConsultor ? 'Você ainda não tem clientes.' : 'Nenhum cliente em atendimento ainda.')

  return (
    <>
      <BarraDeFiltros>
        <AbasSegmentadas rotulo="Situação" abas={SITUACOES} valor={situacao} aoMudar={setSituacao} />
        <CampoBusca rotulo="Buscar clientes ou modelos" placeholder="Buscar cliente ou modelo" valor={busca}
          aoMudar={setBusca} />
        {central && (
          <FiltroConsultoria valor={consultoriaId}
            aoMudar={(id) => { setConsultoriaId(id); setConsultor({ valor: '', nome: null }) }} />
        )}
        {!doConsultor && (
          <FiltroConsultor valor={consultor.valor} nome={consultor.nome} comSemConsultor={false}
            consultoriaId={central ? (consultoriaId || null) : perfil.consultoria_id}
            aoMudar={(valor, nome) => setConsultor({ valor, nome })} />
        )}
      </BarraDeFiltros>
      <CartoesDeNumeros rotulo="Indicadores do andamento" cartoes={cartoes(numeros)} />
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && linhas === null && <GraficoCarregando texto="Carregando o andamento…" className="py-12" />}
      {!erro && linhas?.length === 0 && <ListaVazia>{vazio}</ListaVazia>}
      {!erro && linhas?.length > 0 && (
        <Tabela rotulo="Andamento dos clientes" larguraMinima={1040} paginacao={paginacao}
          colunas={['Cliente', 'Consultor', 'Modelo', 'Progresso', 'Atrasadas', 'Próxima tarefa']}>
          {linhas.map((l) => {
            const { cliente, checklist } = l
            return (
              <Linha key={cliente.id}>
                <Celula className="max-w-72 min-w-48">
                  <Link to={daAbaCheckins(cliente)} className="font-semibold hover:underline">{cliente.nome}</Link>
                  {cliente.cidade && (
                    <p className="text-muted-foreground text-rotulo">{cliente.cidade}{cliente.uf ? `/${cliente.uf}` : ''}</p>
                  )}
                </Celula>
                <Celula><Consultor linha={l} comConsultoria={central} /></Celula>
                <Celula className="max-w-56">
                  {checklist ? <span className="line-clamp-2">{checklist.modelo_nome}</span>
                    : <span className="text-muted-foreground whitespace-nowrap">Sem modelo</span>}
                </Celula>
                <Celula>{checklist ? <Progresso cliente={cliente} checklist={checklist} /> : '—'}</Celula>
                <Celula className="tabular-nums">
                  {!checklist ? '—'
                    : checklist.atrasadas > 0
                      ? <span className="text-destructive font-semibold">{numero(checklist.atrasadas)}</span>
                      : <span className="text-muted-foreground">0</span>}
                </Celula>
                <Celula>{checklist ? <ProximaTarefa proxima={checklist.proxima} diaDeHoje={diaDeHoje} /> : '—'}</Celula>
                {/* Posições fixas (auditoria, G1): Aplicar modelo (só nos sem modelo, para quem aplica) · Abrir. */}
                <CelulaAcoes>
                  {!doConsultor && (
                    <AcaoDaLinha nome="Aplicar modelo" icone={ListChecks} visivel={!checklist && Boolean(l.pode_aplicar)}
                      onClick={() => setAplicarEm(l)} />
                  )}
                  <AcaoDaLinha nome="Abrir" icone={ExternalLink} para={daAbaCheckins(cliente)} />
                </CelulaAcoes>
              </Linha>
            )
          })}
        </Tabela>
      )}

      {aplicarEm && (
        <JanelaAplicarModelo cliente={{ ...aplicarEm.cliente, consultor: aplicarEm.consultor }}
          aoFechar={() => setAplicarEm(null)}
          aoAplicar={({ modelo }) => {
            toast.success(`"${modelo.nome}" aplicado em ${aplicarEm.cliente.nome}.`)
            recarregar()
          }} />
      )}
    </>
  )
}
