// O tempo de cada tarefa do check-list (acréscimo de 18/11 (2)): a soma dos trechos que o banco conta
// (`tempo_segundos`) e, com o trecho aberto, o relógio correndo na tela.
import { useEffect, useState } from 'react'
import { formatarDuracao } from '@/lib/horas'
import { FUSO } from '@/lib/mes'

const dois = (n) => String(n).padStart(2, '0')

// Relógio: "05:12" ou, com hora, "3:05:09".
export function relogio(segundos) {
  const s = Math.max(0, Math.floor(segundos))
  const horas = Math.floor(s / 3600)
  const resto = `${dois(Math.floor(s / 60) % 60)}:${dois(s % 60)}`
  return horas ? `${horas}:${resto}` : resto
}

// Os minutos feitos: "menos de 1 min", "12 min" ou "1 h 05".
export const minutosFeitos = (segundos) => (segundos < 60 ? 'menos de 1 min' : formatarDuracao(segundos * 1000))

// Os segundos da tarefa agora: o que o banco contou na leitura (o trecho aberto até aquela hora) e, com o trecho aberto,
// o que passou desde a leitura (`lido_em`, no relógio deste computador: a diferença de relógio com o servidor não entra).
export function segundosDaTarefa(tarefa, agora) {
  const base = tarefa.tempo_segundos ?? 0
  if (!tarefa.trecho_aberto_desde || !tarefa.lido_em) return base
  return base + Math.max(0, Math.floor((agora - tarefa.lido_em) / 1000))
}

// "17/11/2026, 09:40" em São Paulo (comentários e histórico curto da tarefa).
const QUANDO = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' })
export const quandoEmSP = (instante) => QUANDO.format(new Date(instante))

// Um relógio só para a tela toda: num check-list de 500 tarefas, os relógios ligados (as em andamento) dividem um
// intervalo de 1 s, que existe só enquanto algum está ligado.
const ouvintes = new Set()
let intervalo = null

export function useAgora(ligado = true) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (!ligado) return undefined
    ouvintes.add(setAgora)
    intervalo ??= setInterval(() => {
      const instante = Date.now()
      for (const ouvir of ouvintes) ouvir(instante)
    }, 1000)
    return () => {
      ouvintes.delete(setAgora)
      if (ouvintes.size) return
      clearInterval(intervalo)
      intervalo = null
    }
  }, [ligado])
  return agora
}
