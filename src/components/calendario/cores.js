// Cores do Calendário. O tipo manda no visual do chip (reunião com cliente, compromisso, ausência listrada, feriado),
// igual à legenda; a cor escolhida (a do evento, ou a do consultor na visão de mais de uma pessoa) vira a bolinha no
// começo do chip (auditoria de 17/11, M2, pedido do Diego). Fundo e texto de cada tipo são tokens de src/index.css
// (--evento-*), com 4,5:1 nos dois temas (cores.test.js confere).
// As 8 cores do evento são as do Hub; o banco guarda o número (agenda_eventos.cor, 0 a 7): a ordem não muda.
import { corDaPessoa } from '@/lib/cores'
import { cn } from '@/lib/utils'

export const CORES_DO_EVENTO = [
  { valor: '#2563eb', nome: 'Azul' },
  { valor: '#b45309', nome: 'Âmbar' },
  { valor: '#047857', nome: 'Verde' },
  { valor: '#dc2626', nome: 'Vermelho' },
  { valor: '#7c3aed', nome: 'Violeta' },
  { valor: '#0e7490', nome: 'Turquesa' },
  { valor: '#c2410c', nome: 'Laranja' },
  { valor: '#db2777', nome: 'Rosa' },
]

export const corDoEvento = (indice) => (CORES_DO_EVENTO[indice] ?? CORES_DO_EVENTO[0]).valor

// A cor da bolinha do chip: na visão de mais de uma pessoa (gestão e central sem filtro de consultor), a do consultor;
// na visão de uma pessoa, a escolhida no evento (design, "Quem vê o quê").
export const corDoChip = (evento, deVariasPessoas) =>
  (deVariasPessoas ? corDaPessoa(evento.consultor ?? { id: evento.consultor_id }) : corDoEvento(evento.cor))

// O tipo do item do calendário: evento com cliente é reunião; sem cliente, compromisso (o mesmo recorte do "Mostrar").
export const tipoDoItem = (item) => (item.tipo !== 'evento' ? item.tipo : item.evento.cliente_id ? 'reuniao' : 'compromisso')

// Fundo e texto do chip de cada tipo; `forte` é a faixa do mês no celular (onde o chip vira uma linha de cor).
export const VISUAL_DO_TIPO = {
  reuniao: { chip: 'bg-evento-reuniao text-evento-reuniao-texto', forte: 'bg-primary' },
  compromisso: { chip: 'bg-evento-compromisso text-evento-compromisso-texto', forte: 'bg-slate-500' },
  ausencia: { chip: 'bg-evento-ausencia text-evento-ausencia-texto listras-de-ausencia', forte: 'bg-amber-500' },
  feriado: { chip: 'bg-evento-feriado text-evento-feriado-texto', forte: 'bg-rose-500' },
}

export const classeDoChip = (item) => VISUAL_DO_TIPO[tipoDoItem(item)].chip
export const faixaDoChip = (item) => VISUAL_DO_TIPO[tipoDoItem(item)].forte

// Amostra do tipo (legenda do mês e o "Mostrar"): um chip pequeno, com a borda que o separa do cartão.
const amostra = (tipo) => cn('h-3 w-4 shrink-0 rounded-[4px] ring-1 ring-inset ring-foreground/15', VISUAL_DO_TIPO[tipo].chip)

// O que a barra deixa mostrar ou esconder, com a amostra de cada um (a mesma dos chips).
export const TIPOS = [
  { chave: 'reunioes', rotulo: 'Reuniões com cliente', amostra: amostra('reuniao') },
  { chave: 'compromissos', rotulo: 'Compromissos', amostra: amostra('compromisso') },
  { chave: 'ausencias', rotulo: 'Ausências', amostra: amostra('ausencia') },
  { chave: 'feriados', rotulo: 'Feriados', amostra: amostra('feriado') },
]

export const TUDO = Object.fromEntries(TIPOS.map((t) => [t.chave, true]))

// Bolinha da ausência e do feriado nas listas da visão Agenda (a do evento é a cor dele).
export const BOLINHA = { ausencia: 'bg-amber-500', feriado: 'bg-rose-500' }
