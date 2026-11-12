import { useEffect, useState } from 'react'
import { aplicarTema, guardarTema, lerTema } from './tema'

const PROXIMO = { claro: 'escuro', escuro: 'sistema', sistema: 'claro' }
export const NOME_DO_TEMA = { claro: 'Claro', escuro: 'Escuro', sistema: 'Sistema' }

export function useTema() {
  const [tema, setTema] = useState(lerTema)

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
  }

  return { tema, trocarTema }
}
