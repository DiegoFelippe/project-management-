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
}

export const corDe = (cor) => COR[cor] ?? cor
