// O quadro nos textos da tela (avisos e títulos de janela): "quadro Sprint", ou só o nome quando ele já começa com a
// palavra "Quadro" ("Quadro de metas"), para não dizer "Quadro Quadro de metas". `OQuadro` começa com maiúscula (avisos).
export function oQuadro(nome) {
  const limpo = String(nome ?? '').trim()
  return /^quadro(?![\p{L}\p{N}])/iu.test(limpo) ? limpo : `quadro ${limpo}`
}

export function OQuadro(nome) {
  const texto = oQuadro(nome)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
