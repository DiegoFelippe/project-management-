import { useEffect, useState } from 'react'
import { contarClientesAtivos } from '@/data/clientes'

// Quantos clientes ativos uma ação vai afetar, contados no banco, para a confirmação dizer.
// filtro: { consultoriaId } | { consultorId } | null (nada a contar). Devolve null enquanto conta ou se a
// contagem falhar (a confirmação usa então um texto sem número).
export function useClientesAtivos(filtro) {
  const chave = filtro ? JSON.stringify(filtro) : null
  const [contagem, setContagem] = useState({ chave: null, total: null })

  useEffect(() => {
    if (!chave) return undefined
    let ativo = true
    contarClientesAtivos(JSON.parse(chave))
      .then((total) => ativo && setContagem({ chave, total }))
      .catch(() => {})
    return () => {
      ativo = false
    }
  }, [chave])

  return contagem.chave === chave ? contagem.total : null
}

// "3 clientes ativos voltam …" / "1 cliente ativo volta …"; sem contagem, o texto geral; com 0, nada.
export function frase(total, { um, varios, semNumero }) {
  if (total === null) return semNumero
  if (total === 0) return ''
  return total === 1 ? um : varios.replace('{n}', total.toLocaleString('pt-BR'))
}

// Junta as frases da confirmação, pulando as vazias.
export const juntar = (...frases) => frases.filter(Boolean).join(' ')
