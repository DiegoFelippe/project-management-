import { diaDaSemana, somarDias } from '@/lib/calendario'
import { hoje as hojeEmSP } from '@/lib/mes'

// Cores e selos do quadro (como no Kanban do Mochi), só pelos tokens do tema (cores vivas, 19/11; nem classe de cor do
// Tailwind nem hex). As classes ficam escritas por inteiro (o Tailwind só gera o que aparece no código).

// As 10 cores das colunas, na ordem que o banco guarda (quadro_colunas.cor, 0 a 9). paleta: a cor da paleta de 19/11 (nos
// gráficos, a faixa "Quadro do cliente" da aba Geral, e aqui); cheio: o contador e a amostra do seletor (o cheio com o
// "sobre", ≥ 4,5:1 em src/lib/contraste.test.js); corpo: o fundo da coluna, um véu do suave; ponto: a bolinha da cor
// automática no seletor. A paleta não tem vermelho (é de estado): nos gráficos o Vermelho vai no rosa; no quadro ele fica
// no vermelho de estado, para as 10 cores continuarem diferentes.
export const CORES_DAS_COLUNAS = [
  { nome: 'Cinza', paleta: 'grafite', cheio: 'bg-cor-grafite-cheio text-cor-grafite-sobre', corpo: 'bg-cor-grafite-suave/40 border-cor-grafite-suave', ponto: 'bg-cor-grafite-forte' },
  { nome: 'Índigo', paleta: 'indigo', cheio: 'bg-cor-indigo-cheio text-cor-indigo-sobre', corpo: 'bg-cor-indigo-suave/40 border-cor-indigo-suave', ponto: 'bg-cor-indigo-forte' },
  { nome: 'Azul', paleta: 'azul', cheio: 'bg-cor-azul-cheio text-cor-azul-sobre', corpo: 'bg-cor-azul-suave/40 border-cor-azul-suave', ponto: 'bg-cor-azul-forte' },
  { nome: 'Turquesa', paleta: 'turquesa', cheio: 'bg-cor-turquesa-cheio text-cor-turquesa-sobre', corpo: 'bg-cor-turquesa-suave/40 border-cor-turquesa-suave', ponto: 'bg-cor-turquesa-forte' },
  { nome: 'Verde', paleta: 'verde', cheio: 'bg-cor-verde-cheio text-cor-verde-sobre', corpo: 'bg-cor-verde-suave/40 border-cor-verde-suave', ponto: 'bg-cor-verde-forte' },
  { nome: 'Amarelo', paleta: 'mostarda', cheio: 'bg-cor-mostarda-cheio text-cor-mostarda-sobre', corpo: 'bg-cor-mostarda-suave/40 border-cor-mostarda-suave', ponto: 'bg-cor-mostarda-forte' },
  { nome: 'Laranja', paleta: 'laranja', cheio: 'bg-cor-laranja-cheio text-cor-laranja-sobre', corpo: 'bg-cor-laranja-suave/40 border-cor-laranja-suave', ponto: 'bg-cor-laranja-forte' },
  { nome: 'Vermelho', paleta: 'rosa', cheio: 'bg-destructive-soft text-destructive', corpo: 'bg-destructive-soft/40 border-destructive-soft', ponto: 'bg-destructive' },
  { nome: 'Rosa', paleta: 'rosa', cheio: 'bg-cor-rosa-cheio text-cor-rosa-sobre', corpo: 'bg-cor-rosa-suave/40 border-cor-rosa-suave', ponto: 'bg-cor-rosa-forte' },
  { nome: 'Roxo', paleta: 'violeta', cheio: 'bg-cor-violeta-cheio text-cor-violeta-sobre', corpo: 'bg-cor-violeta-suave/40 border-cor-violeta-suave', ponto: 'bg-cor-violeta-forte' },
]

// Coluna sem cor escolhida: a cor automática pela posição (cinza, índigo, verde, amarelo, vermelho, roxo, como no Mochi),
// no contador e no véu da coluna.
const AUTOMATICAS = [0, 1, 4, 5, 7, 9]
export const corDaColuna = (coluna, posicao) => coluna.cor ?? AUTOMATICAS[(posicao + 1) % AUTOMATICAS.length]

// Selo da prioridade, suave (fundo suave + texto escuro): baixa no verde, média no mostarda e alta no vermelho de estado.
export const PRIORIDADES = {
  baixa: { rotulo: 'Baixa', selo: 'bg-cor-verde-cheio text-cor-verde-sobre' },
  media: { rotulo: 'Média', selo: 'bg-cor-mostarda-cheio text-cor-mostarda-sobre' },
  alta: { rotulo: 'Alta', selo: 'bg-destructive-soft text-destructive' },
}
export const OPCOES_DE_PRIORIDADE = Object.entries(PRIORIDADES).map(([valor, p]) => ({ valor, rotulo: p.rotulo }))

export const OPCOES_DE_PRAZO = [
  { valor: 'atrasados', rotulo: 'Atrasados' },
  { valor: 'proximos_7_dias', rotulo: 'Próximos 7 dias' },
  { valor: 'sem_prazo', rotulo: 'Sem prazo' },
]

export const TONS_DO_PRAZO = {
  perigo: 'bg-destructive-soft text-destructive',
  aviso: 'bg-notice-soft text-notice',
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
