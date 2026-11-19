import { useEffect, useState } from 'react'
import { meuCheckinAberto } from '@/data/checkins'
import { aoMudarOCheckin } from '@/lib/checkinMudou'
import { veTudo } from '@/lib/papeis'

// O check-in aberto de quem está logado (ou null), para o selo da barra de cima (auditoria, G2). Relê ao trocar de tela e
// quando um check-in muda em qualquer parte do app (aoMudarOCheckin); enquanto relê, fica o que já estava. A central e o
// dono não fazem check-in: não lê.
export function useCheckinAberto(perfil, pathname) {
  const faz = Boolean(perfil?.id) && !veTudo(perfil)
  const [aberto, setAberto] = useState(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => aoMudarOCheckin(() => setVersao((v) => v + 1)), [])

  useEffect(() => {
    if (!faz) return undefined
    let ativo = true
    meuCheckinAberto(perfil.id).then((lido) => ativo && setAberto(lido), () => {})
    return () => {
      ativo = false
    }
  }, [faz, perfil?.id, pathname, versao])

  return faz ? aberto : null
}
