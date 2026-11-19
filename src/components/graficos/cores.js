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
  afazer: 'var(--input)',
  atrasada: 'var(--destructive-cheio)',
}

// Paleta de 9 cores de 19/11 (pedido do Diego): separa coisas, nunca estado. Ordem fixa das séries em todo gráfico;
// o grafite é do "Outros" e do que é neutro.
export const PALETA = ['azul', 'turquesa', 'violeta', 'mostarda', 'rosa', 'verde', 'laranja', 'indigo']
export const corDaPaleta = (nome, tom = 'forte') => `var(--cor-${nome}-${tom})`
export const corDaSerie = (i) => corDaPaleta(PALETA[i % PALETA.length])
export const COR_OUTROS = corDaPaleta('grafite')

export const corDe = (cor) => COR[cor] ?? cor
