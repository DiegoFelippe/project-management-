import { diaDaSemana, somarDias } from '@/lib/calendario'
import { hoje as hojeEmSP } from '@/lib/mes'

// Cores e selos do quadro (como no Kanban do Mochi). As classes ficam escritas por inteiro (o Tailwind só gera o que
// aparece no código).

// As 10 cores das colunas, na ordem que o banco guarda (quadro_colunas.cor, 0 a 9). ponto: a bolinha da cor automática;
// tom: o contador sobre a coluna sem cor escolhida (texto no tom 700: 4,5:1 sobre o tom 50); solido: a cor (#hex) da
// amostra do seletor e do contador com cor escolhida, com o texto pelo corDoTextoSobre (4,5:1; índigo e roxo no tom 600,
// onde nem o branco nem o escuro seguravam o 500); corpo: o fundo da coluna. Auditoria de 17/11.
export const CORES_DAS_COLUNAS = [
  { nome: 'Cinza', ponto: 'bg-slate-400', tom: 'bg-slate-100 text-slate-700 dark:bg-white/[0.07] dark:text-slate-300', solido: '#64748b', corpo: 'bg-slate-300/40 border-slate-300/80 dark:bg-slate-400/[0.09] dark:border-slate-400/20' },
  { nome: 'Índigo', ponto: 'bg-indigo-500', tom: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300', solido: '#4f46e5', corpo: 'bg-indigo-100/70 border-indigo-200 dark:bg-indigo-500/[0.09] dark:border-indigo-400/20' },
  { nome: 'Azul', ponto: 'bg-sky-500', tom: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', solido: '#0ea5e9', corpo: 'bg-sky-100/70 border-sky-200 dark:bg-sky-500/[0.09] dark:border-sky-400/20' },
  { nome: 'Turquesa', ponto: 'bg-teal-500', tom: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300', solido: '#14b8a6', corpo: 'bg-teal-100/70 border-teal-200 dark:bg-teal-500/[0.09] dark:border-teal-400/20' },
  { nome: 'Verde', ponto: 'bg-emerald-500', tom: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', solido: '#10b981', corpo: 'bg-emerald-100/70 border-emerald-200 dark:bg-emerald-500/[0.09] dark:border-emerald-400/20' },
  { nome: 'Amarelo', ponto: 'bg-amber-500', tom: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', solido: '#f59e0b', corpo: 'bg-amber-100/70 border-amber-200 dark:bg-amber-500/[0.09] dark:border-amber-400/20' },
  { nome: 'Laranja', ponto: 'bg-orange-500', tom: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', solido: '#f97316', corpo: 'bg-orange-100/70 border-orange-200 dark:bg-orange-500/[0.09] dark:border-orange-400/20' },
  { nome: 'Vermelho', ponto: 'bg-rose-500', tom: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', solido: '#f43f5e', corpo: 'bg-rose-100/70 border-rose-200 dark:bg-rose-500/[0.09] dark:border-rose-400/20' },
  { nome: 'Rosa', ponto: 'bg-pink-500', tom: 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300', solido: '#ec4899', corpo: 'bg-pink-100/70 border-pink-200 dark:bg-pink-500/[0.09] dark:border-pink-400/20' },
  { nome: 'Roxo', ponto: 'bg-violet-500', tom: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', solido: '#7c3aed', corpo: 'bg-violet-100/70 border-violet-200 dark:bg-violet-500/[0.09] dark:border-violet-400/20' },
]

// Coluna sem cor escolhida: a cor automática pela posição (cinza, índigo, verde, amarelo, vermelho, roxo, como no Mochi).
const AUTOMATICAS = [0, 1, 4, 5, 7, 9]
export const corDaColuna = (coluna, posicao) => coluna.cor ?? AUTOMATICAS[(posicao + 1) % AUTOMATICAS.length]

// Fundo de coluna sem cor escolhida (a automática só pinta o contador).
export const CORPO_NEUTRO = 'bg-muted/60 border-border/70'

export const PRIORIDADES = {
  baixa: { rotulo: 'Baixa', selo: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', ponto: 'bg-emerald-500' },
  media: { rotulo: 'Média', selo: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', ponto: 'bg-amber-500' },
  alta: { rotulo: 'Alta', selo: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', ponto: 'bg-rose-500' },
}
export const OPCOES_DE_PRIORIDADE = Object.entries(PRIORIDADES).map(([valor, p]) => ({ valor, rotulo: p.rotulo }))

export const OPCOES_DE_PRAZO = [
  { valor: 'atrasados', rotulo: 'Atrasados' },
  { valor: 'proximos_7_dias', rotulo: 'Próximos 7 dias' },
  { valor: 'sem_prazo', rotulo: 'Sem prazo' },
]

export const TONS_DO_PRAZO = {
  perigo: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  aviso: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  neutro: 'bg-muted text-muted-foreground',
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIA_MS = 86_400_000
const dias = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS)

// "25 nov" (com o ano quando não é o de hoje).
function dataCurta(dia, hoje) {
  const [ano, mes, d] = dia.split('-')
  return `${d} ${MESES[Number(mes) - 1]}${ano === hoje.slice(0, 4) ? '' : ` ${ano}`}`
}

// Selo do prazo do cartão ('yyyy-MM-dd'; hoje = o dia em São Paulo, como o banco conta): "Atrasado há N dias", "Hoje",
// "Amanhã" ou a data. Na coluna de concluídos o prazo não conta como atrasado (só a data, com o check). null sem prazo.
export function seloDoPrazo(prazo, hoje, concluidos = false) {
  if (!prazo) return null
  if (concluidos) return { texto: dataCurta(prazo, hoje), tom: 'neutro', concluido: true, titulo: `Prazo: ${dataCurta(prazo, hoje)} (coluna de concluídos)` }
  const faltam = dias(hoje, prazo)
  if (faltam < 0) {
    const texto = `Atrasado há ${-faltam} ${faltam === -1 ? 'dia' : 'dias'}`
    return { texto, tom: 'perigo', titulo: texto }
  }
  if (faltam === 0) return { texto: 'Hoje', tom: 'aviso', titulo: 'Vence hoje' }
  if (faltam === 1) return { texto: 'Amanhã', tom: 'aviso', titulo: 'Vence amanhã' }
  return { texto: dataCurta(prazo, hoje), tom: 'neutro', titulo: `Prazo: ${dataCurta(prazo, hoje)}` }
}

// Atalhos do prazo além do "Hoje" do calendário, como no Mochi: amanhã e a próxima sexta (o dia em São Paulo; numa sexta,
// a da semana que vem). Usados no "Novo cartão" e na janela do cartão.
export function atalhosDoPrazo(dia = hojeEmSP()) {
  const ateSexta = (5 - diaDaSemana(dia) + 7) % 7 || 7
  return [{ rotulo: 'Amanhã', valor: somarDias(dia, 1) }, { rotulo: 'Sexta', valor: somarDias(dia, ateSexta) }]
}
