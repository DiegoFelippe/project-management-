// Cores do Calendário. As 8 cores do evento são as do Hub em tons que seguram texto branco com contraste de pelo menos
// 4,5:1 (âmbar, verde, turquesa e laranja no tom 700 do Tailwind; o azul é o --primary da consultoria; cores.test.js
// confere). O banco guarda o número (agenda_eventos.cor, 0 a 7): a ordem não muda.
import { corDaPessoa, corDoTextoSobre } from '@/lib/cores'

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

// Na visão de mais de uma pessoa (gestão e central sem filtro de consultor), o chip tem a cor do consultor; na visão
// privada, a cor escolhida no evento (design, "Quem vê o quê").
export const corDoChip = (evento, deVariasPessoas) =>
  (deVariasPessoas ? corDaPessoa(evento.consultor ?? { id: evento.consultor_id }) : corDoEvento(evento.cor))

// Fundo e texto do chip: a cor do consultor pode ser clara (mostarda, verde...), e aí o texto fica escuro (4,5:1).
export function estiloDoChip(evento, deVariasPessoas) {
  const fundo = corDoChip(evento, deVariasPessoas)
  return { backgroundColor: fundo, color: corDoTextoSobre(fundo) }
}

// O que a barra deixa mostrar ou esconder, com a bolinha de cada um (a mesma da legenda e dos chips).
export const TIPOS = [
  { chave: 'reunioes', rotulo: 'Reuniões com cliente', bolinha: 'bg-primary' },
  { chave: 'compromissos', rotulo: 'Compromissos', bolinha: 'bg-slate-500' },
  { chave: 'ausencias', rotulo: 'Ausências', bolinha: 'bg-amber-500' },
  { chave: 'feriados', rotulo: 'Feriados', bolinha: 'bg-rose-500' },
]

export const TUDO = Object.fromEntries(TIPOS.map((t) => [t.chave, true]))

// Chips de ausência e feriado: fundo suave, como no Hub.
export const ESTILO_DO_CHIP = {
  ausencia: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  feriado: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
}

// Bolinha da ausência e do feriado nas listas (a do evento é a cor dele).
export const BOLINHA = { ausencia: 'bg-amber-500', feriado: 'bg-rose-500' }
