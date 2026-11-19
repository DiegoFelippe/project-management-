const FOLGA = 8
export const JANELA = '[data-slot="dialog-content"], [data-slot="janela-formulario"]'

// Posição da lista sobre o campo. Vira para cima e limita a altura pelo espaço da TELA (a lista pode sair da
// janela); só as coordenadas são convertidas para a janela quando ela tem transform (o fixed fica relativo a ela).
export function calcular(ancora, janela, largura, altura, alargar) {
  const r = ancora.getBoundingClientRect()
  const tela = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  const estilo = janela ? getComputedStyle(janela) : null
  const relativo = !!estilo && [estilo.transform, estilo.translate, estilo.scale, estilo.filter].some((v) => v && v !== 'none')
  const base = relativo ? janela.getBoundingClientRect() : tela
  const limite = tela // a lista pode sair da janela: vira e encolhe pelo espaço da tela
  const largo = alargar ? Math.max(r.width, largura) : largura
  const abaixo = limite.bottom - r.bottom - FOLGA
  const acima = r.top - limite.top - FOLGA
  const paraCima = abaixo < altura && acima > abaixo
  const esquerda = Math.min(Math.max(limite.left + FOLGA, r.left), Math.max(limite.left + FOLGA, limite.right - largo - FOLGA))
  return {
    width: largo,
    left: esquerda - base.left,
    maxHeight: Math.max(120, paraCima ? acima : abaixo),
    ...(paraCima ? { bottom: base.bottom - r.top + 4 } : { top: r.bottom - base.top + 4 }),
  }
}
