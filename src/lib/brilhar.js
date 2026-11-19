// O que acabou de mudar brilha uma vez (Névoa, pedido do Diego, 19/11): põe .mudou (index.css) e tira depois de 1,6 s.
// Com "reduzir movimento" não faz nada. Só nunca ao carregar: quem chama é a ação que acabou de gravar.
const DURACAO = 1600
const temporizadores = new WeakMap()

export function brilhar(elemento) {
  if (!elemento || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  clearTimeout(temporizadores.get(elemento))
  elemento.classList.remove('mudou')
  void elemento.offsetWidth // reinicia a animação se brilhou há pouco
  elemento.classList.add('mudou')
  temporizadores.set(elemento, setTimeout(() => elemento.classList.remove('mudou'), DURACAO))
}

// O elemento marcado com data-brilho="<id>" (a linha, o cartão ou a tarefa que mudou).
export const brilharPorMarca = (id) => brilhar(document.querySelector(`[data-brilho="${CSS.escape(String(id))}"]`))
