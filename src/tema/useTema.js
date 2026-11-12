import { useEffect, useState } from 'react'
import { EVENTO_TEMA, aplicarTema, guardarTema, lerTema } from './tema'

const PROXIMO = { claro: 'escuro', escuro: 'sistema', sistema: 'claro' }
export const NOME_DO_TEMA = { claro: 'Claro', escuro: 'Escuro', sistema: 'Sistema' }

// aoTrocar: chamado com o tema novo quando a pessoa clica (a barra de cima salva no perfil).
export function useTema({ aoTrocar } = {}) {
  const [tema, setTema] = useState(lerTema)

  useEffect(() => {
    const ouvir = (evento) => setTema(evento.detail)
    window.addEventListener(EVENTO_TEMA, ouvir)
    return () => window.removeEventListener(EVENTO_TEMA, ouvir)
  }, [])

  useEffect(() => {
    aplicarTema(tema)
    if (tema !== 'sistema') return
    // seguindo o sistema: acompanha quando o computador troca entre claro e escuro
    const consulta = window.matchMedia?.('(prefers-color-scheme: dark)')
    const aoMudar = () => aplicarTema('sistema')
    consulta?.addEventListener?.('change', aoMudar)
    return () => consulta?.removeEventListener?.('change', aoMudar)
  }, [tema])

  function trocarTema() {
    const novo = PROXIMO[tema]
    guardarTema(novo)
    aplicarTema(novo)
    setTema(novo)
    aoTrocar?.(novo)
  }

  return { tema, trocarTema }
}
