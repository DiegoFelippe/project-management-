import { useState } from 'react'

// A janela mudou desde que abriu? (usabilidade, U4: a JanelaFormulario pergunta antes de descartar). Compara os valores
// de agora com os do primeiro desenho (por JSON: listas e objetos simples; um arquivo escolhido conta como mudança).
// Janelas que voltam ao estado inicial ao fechar (Nova consultoria) continuam certas: o inicial é o vazio.
export function useAlterado(valores) {
  const [inicial] = useState(() => JSON.stringify(valores))
  return JSON.stringify(valores) !== inicial
}
