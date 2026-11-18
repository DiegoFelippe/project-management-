// O chip do evento tem texto branco sobre a cor escolhida: toda cor da lista precisa de contraste de pelo menos 4,5:1
// com o branco (WCAG AA para texto pequeno). A ordem das cores não muda (o banco guarda o número, 0 a 7).
import { describe, expect, it } from 'vitest'
import { TEXTO_ESCURO } from '@/lib/cores'
import { CORES_DO_EVENTO, corDoEvento, estiloDoChip } from './cores'

// Luminância relativa (WCAG 2.x) de uma cor #rrggbb.
function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrasteComBranco = (hex) => 1.05 / (luminancia(hex) + 0.05)

describe('cores do evento', () => {
  it('o texto branco do chip tem contraste de pelo menos 4,5:1 em todas as cores', () => {
    const fracas = CORES_DO_EVENTO
      .map((cor) => ({ ...cor, contraste: Math.round(contrasteComBranco(cor.valor) * 100) / 100 }))
      .filter((cor) => cor.contraste < 4.5)
    expect(fracas).toEqual([])
  })

  it('a ordem das cores fica (o banco guarda o número)', () => {
    expect(CORES_DO_EVENTO.map((c) => c.nome)).toEqual(['Azul', 'Âmbar', 'Verde', 'Vermelho', 'Violeta', 'Turquesa', 'Laranja', 'Rosa'])
    expect(corDoEvento(9)).toBe(CORES_DO_EVENTO[0].valor)
  })
})

describe('estilo do chip', () => {
  it('na visão de várias pessoas, a cor do consultor; no mostarda, o texto fica escuro (auditoria, 17/11)', () => {
    const evento = { cor: 0, consultor: { id: 'p1', cor: '#ca8a04' } }
    expect(estiloDoChip(evento, true)).toEqual({ backgroundColor: '#ca8a04', color: TEXTO_ESCURO })
    expect(estiloDoChip(evento, false)).toEqual({ backgroundColor: '#2563eb', color: '#ffffff' })
  })
})
