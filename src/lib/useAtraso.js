import { useEffect, useState } from 'react'

// Devolve o valor só depois de `ms` sem mudar (busca que espera a pessoa parar de digitar).
export function useAtraso(valor, ms = 300) {
  const [atrasado, setAtrasado] = useState(valor)
  useEffect(() => {
    const espera = setTimeout(() => setAtrasado(valor), ms)
    return () => clearTimeout(espera)
  }, [valor, ms])
  return atrasado
}
