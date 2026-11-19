import { Ban, Check, Circle, Pause, Play, TriangleAlert } from 'lucide-react'
import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import Rosca from '@/components/graficos/Rosca'
import { fraseDasTarefas, porcentoResolvido } from '@/lib/frasesDosGraficos'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const plural = (n, um, varios) => `${INTEIRO.format(n)} ${n === 1 ? um : varios}`
// As seis situações (as partes somam o total), cada uma com a cor e o ícone do estado (os do Fluxograma).
const SITUACOES = [
  { chave: 'feitas', nome: 'Feitas', cor: 'feita', icone: Check },
  { chave: 'nao_se_aplica', nome: 'Não se aplicam', cor: 'nsa', icone: Ban },
  { chave: 'andamento', nome: 'Em andamento', cor: 'andamento', icone: Play },
  { chave: 'pausadas', nome: 'Pausadas', cor: 'pausada', icone: Pause },
  { chave: 'a_fazer', nome: 'A fazer no prazo', cor: 'afazer', icone: Circle },
  { chave: 'atrasadas', nome: 'Atrasadas', cor: 'atrasada', icone: TriangleAlert },
]
const ROTULO = 'Tarefas dos check-lists por situação'

// Check-lists dos clientes (Início, todos; pedido do Diego, 19/11): rosca com as tarefas dos check-lists ativos por
// situação, hoje (não segue o período: tarefas_por_situacao), e o % resolvido (feitas + não se aplica) no meio.
export default function TarefasDosChecklists({ dados, recorte, erro = false, atualizando = false, aoTentarDeNovo }) {
  const consultor = recorte === 'pessoa'
  const titulo = consultor ? 'Check-lists dos meus clientes' : 'Check-lists dos clientes'
  const subtitulo = `Situação de hoje${dados ? ` · ${plural(dados.checklists ?? 0, 'check-list ativo', 'check-lists ativos')}` : ''}`
  if (erro || !dados) {
    return <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} estado={erro ? 'erro' : 'carregando'} altura={160}
      erro="Não foi possível carregar as tarefas dos check-lists." aoTentarDeNovo={aoTentarDeNovo} />
  }

  // `a_fazer` é o resto dos contadores do banco: negativo (contador velho) conta 0, nunca um arco ao contrário.
  const partes = SITUACOES.map((s) => ({ nome: s.nome, valor: Math.max(0, dados[s.chave] ?? 0), cor: s.cor, icone: s.icone }))
  const total = partes.reduce((soma, p) => soma + p.valor, 0)
  const vazio = !dados.checklists ? (consultor ? 'Nenhum cliente seu com check-list ativo.' : 'Nenhum check-list ativo.')
    : 'Os check-lists ativos ainda não têm tarefas.'

  return (
    <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} leitura={total ? fraseDasTarefas(dados) : null} atualizando={atualizando}
      estado={total ? 'pronto' : 'vazio'} vazio={vazio}
      tabela={{
        rotulo: ROTULO,
        colunas: ['Situação', 'Tarefas', '%'],
        linhas: partes.map((p) => [p.nome, INTEIRO.format(p.valor), `${total ? Math.round((p.valor / total) * 100) : 0}%`]),
      }}>
      <Rosca rotulo={ROTULO} partes={partes} centro={{ valor: total ? porcentoResolvido(dados) : '0%', rotulo: 'resolvidas' }} />
    </CartaoDeGrafico>
  )
}
