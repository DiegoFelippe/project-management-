// Contraste entre duas cores pela fórmula do WCAG 2.x (o mesmo cálculo do axe). Serve para escolher a cor do texto
// sobre uma cor que a pessoa escolhe (avatar, evento) e para os testes que guardam o mínimo de 4,5:1 dos tokens de
// src/index.css (auditoria de 17/11, pedido do Diego).
export const CONTRASTE_MINIMO = 4.5

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export const ehHex = (cor) => typeof cor === 'string' && HEX.test(cor)

function canais(hex) {
  const cheio = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex
  return [1, 3, 5].map((i) => parseInt(cheio.slice(i, i + 2), 16))
}

// Luminância relativa de uma cor #rgb ou #rrggbb.
export function luminancia(hex) {
  const [r, g, b] = canais(hex).map((c) => c / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Razão de contraste (1 a 21), na ordem que for.
export function contraste(a, b) {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (clara + 0.05) / (escura + 0.05)
}

// A cor `frente` com opacidade `alfa` (0 a 1) pintada sobre `fundo`, em #rrggbb (ex.: bg-muted/40 sobre o cartão).
export function misturar(frente, fundo, alfa) {
  const [a, b] = [canais(frente), canais(fundo)]
  return `#${a.map((c, i) => Math.round(c * alfa + b[i] * (1 - alfa)).toString(16).padStart(2, '0')).join('')}`
}
