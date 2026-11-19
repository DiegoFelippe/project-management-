import { Ban, Check, Circle, Pause, Play, TriangleAlert } from 'lucide-react'

// Cores dos gráficos: só os tokens --grafico-* de src/index.css (claro e escuro), nunca hex no componente. Quem monta
// legenda e dica pode passar o nome curto ('serie', 'acima', 'ref'…) ou qualquer valor de CSS (ex.: 'var(--muted)').
export const COR = {
  serie: 'var(--grafico-serie)',
  lavado: 'var(--grafico-lavado)',
  acima: 'var(--grafico-acima)',
  folga: 'var(--grafico-folga)',
  ref: 'var(--grafico-ref)',
  grade: 'var(--grafico-grade)',
  trilha: 'var(--grafico-trilha)',
  neutro: 'var(--grafico-neutro)',
  'fila-1': 'var(--grafico-fila-1)',
  'fila-2': 'var(--grafico-fila-2)',
  'fila-3': 'var(--grafico-fila-3)',
  // Situações da rosca e das etapas do check-list (estado em verde/vermelho; o resto, da paleta).
  feita: 'var(--positive-cheio)',
  nsa: 'var(--cor-grafite-forte)',
  andamento: 'var(--cor-azul-forte)',
  pausada: 'var(--cor-mostarda-forte)',
  afazer: 'var(--cor-violeta-forte)', // a fazer no prazo: --input (1,5:1) não segurava 3:1 como marca
  atrasada: 'var(--destructive-cheio)',
}

// Paleta de 9 cores de 19/11 (pedido do Diego): separa coisas, nunca estado. Ordem fixa das séries em todo gráfico;
// o grafite é do "Outros" e do que é neutro.
export const PALETA = ['azul', 'turquesa', 'violeta', 'mostarda', 'rosa', 'verde', 'laranja', 'indigo']
export const corDaPaleta = (nome, tom = 'forte') => `var(--cor-${nome}-${tom})`
export const corDaSerie = (i) => corDaPaleta(PALETA[i % PALETA.length])
export const COR_OUTROS = corDaPaleta('grafite')

export const corDe = (cor) => COR[cor] ?? cor

// As seis situações das tarefas (as partes somam o total: rosca dos check-lists do Início e etapas do check-list do
// cliente), cada uma com a cor de COR e o ícone do estado (os do Fluxograma: estado sempre com ícone e palavra). As
// chaves são as de tarefas_por_situacao; as etapas de hoje_do_cliente usam as mesmas.
export const SITUACOES = [
  { chave: 'feitas', nome: 'Feitas', cor: 'feita', icone: Check },
  { chave: 'nao_se_aplica', nome: 'Não se aplicam', cor: 'nsa', icone: Ban },
  { chave: 'andamento', nome: 'Em andamento', cor: 'andamento', icone: Play },
  { chave: 'pausadas', nome: 'Pausadas', cor: 'pausada', icone: Pause },
  { chave: 'a_fazer', nome: 'A fazer no prazo', cor: 'afazer', icone: Circle },
  { chave: 'atrasadas', nome: 'Atrasadas', cor: 'atrasada', icone: TriangleAlert },
]
