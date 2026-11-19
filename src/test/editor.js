import { fireEvent } from '@testing-library/react'

// Ajudantes de teste para o editor de texto (TipTap/ProseMirror) no navegador simulado (jsdom).

// O jsdom não mede nada: o ProseMirror pede retângulos ao rolar até o cursor e ao achar posições. Zeros bastam.
export function prepararEditor() {
  const vazio = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
  if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => []
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => vazio
  if (!document.elementFromPoint) document.elementFromPoint = () => null
}

// Cola no editor como o navegador faria: o HTML e o texto da área de transferência e, se houver, arquivos.
export function colar(alvo, { html = '', texto = '', arquivos = [] } = {}) {
  const dados = { 'text/html': html, 'text/plain': texto }
  const evento = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(evento, 'clipboardData', {
    value: {
      getData: (tipo) => dados[tipo] ?? '',
      types: [...Object.keys(dados).filter((t) => dados[t]), ...(arquivos.length ? ['Files'] : [])],
      files: arquivos,
      items: arquivos.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    },
  })
  fireEvent(alvo, evento)
  return evento
}
