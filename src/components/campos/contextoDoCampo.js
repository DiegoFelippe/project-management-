import { createContext, useContext } from 'react'

// O que o Campo (rótulo + campo + dica + erro) passa ao campo de dentro: se está com erro e quem o descreve.
export const ContextoDoCampo = createContext(null)

// Junta ids de aria-describedby (sem vazios nem repetidos); sem nenhum, undefined.
export function juntarIds(...listas) {
  const ids = [...new Set(listas.flatMap((l) => String(l ?? '').split(' ')).filter(Boolean))]
  return ids.length ? ids.join(' ') : undefined
}

// Para os campos de src/components/campos/ e os da ui (Input, Textarea): só o campo que o rótulo nomeia (o mesmo `id`)
// fica marcado, nunca outro campo dentro do mesmo bloco (a busca do Seletor, o "Digitar horário" do CampoHora).
// Devolve { invalido, descritoPor } (vazio fora de um Campo).
export function useCampo(id) {
  const campo = useContext(ContextoDoCampo)
  if (!campo || id == null || campo.id !== id) return {}
  return { invalido: campo.invalido, descritoPor: campo.descritoPor }
}
