import { useLayoutEffect, useState } from 'react'

// Abaixo disso o quadro fica baixo demais para trabalhar: ele ganha a altura da tela inteira e a página rola até ele.
const MINIMA = 360

// Altura da faixa das colunas (decisão do Diego, 17/11: o quadro ocupa o resto da tela e cada coluna rola sozinha, como
// no Trello). É o que sobra do <main> abaixo do topo da faixa, menos a margem de baixo da página: o quadro termina no fim
// da tela e a página não precisa rolar. Quando sobra pouco (tela baixa, celular, com a barra de filtros em várias linhas),
// a faixa fica com a altura visível do <main> (sem as margens): a página rola até o quadro, que então enche a tela.
// Conta pelo leiaute (offsetTop), não pela posição na tela: não muda com a rolagem nem com a animação de entrada.
// Nulo fora do <main> (ou sem leiaute, como nos testes): a faixa fica com a altura dos cartões.
export function medirAltura(no, { minima = MINIMA } = {}) {
  const pagina = no?.closest('main')
  const conteudo = pagina?.firstElementChild
  if (!pagina || !conteudo || !pagina.clientHeight) return null
  let topo = 0
  let n = no
  while (n && n !== pagina) {
    topo += n.offsetTop
    n = n.offsetParent
  }
  if (n !== pagina) return null
  // O que vem depois da faixa dentro da página (a margem de baixo).
  const depois = Math.max(0, conteudo.offsetTop + conteudo.offsetHeight - topo - no.offsetHeight)
  const sobra = pagina.clientHeight - topo - depois
  if (sobra >= minima) return Math.floor(sobra)
  const acima = Number.parseFloat(getComputedStyle(conteudo).paddingTop) || 0
  return Math.floor(Math.max(240, pagina.clientHeight - acima - depois))
}

// Mede a faixa (`ref`) quando ela aparece (`ativo`) e de novo quando a página ou o que fica acima dela muda de tamanho
// (janela, barra de filtros quebrando linha, aviso que aparece).
export function useAlturaDoQuadro(ref, ativo) {
  const [altura, setAltura] = useState(null)
  useLayoutEffect(() => {
    const no = ref.current
    if (!ativo || !no) return undefined
    const medir = () => setAltura(medirAltura(no))
    medir()
    const pagina = no.closest('main')
    let quadro = 0
    const depois = () => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(medir)
    }
    const observador = typeof ResizeObserver === 'function' && pagina ? new ResizeObserver(depois) : null
    observador?.observe(pagina)
    if (pagina?.firstElementChild) observador?.observe(pagina.firstElementChild)
    window.addEventListener('resize', depois)
    return () => {
      cancelAnimationFrame(quadro)
      observador?.disconnect()
      window.removeEventListener('resize', depois)
    }
  }, [ref, ativo])
  return ativo ? altura : null
}
