// Cores do Calendário. Desde a auditoria de 17/11 (M2), o tipo manda no visual do chip (reunião com cliente, compromisso,
// ausência listrada, feriado), igual à legenda, e a cor escolhida (do evento, ou do consultor na visão de várias pessoas)
// vira a bolinha no começo do chip. A ordem das cores do evento não muda (o banco guarda o número, 0 a 7).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONTRASTE_MINIMO, contraste } from '@/lib/contraste'
import { CORES_DO_EVENTO, TIPOS, classeDoChip, corDoChip, corDoEvento, tipoDoItem } from './cores'

describe('cores do evento', () => {
  it('a ordem das cores fica (o banco guarda o número)', () => {
    expect(CORES_DO_EVENTO.map((c) => c.nome)).toEqual(['Azul', 'Âmbar', 'Verde', 'Vermelho', 'Violeta', 'Turquesa', 'Laranja', 'Rosa'])
    expect(corDoEvento(9)).toBe(CORES_DO_EVENTO[0].valor)
  })

  it('a bolinha: a cor do evento na agenda de uma pessoa; a do consultor na visão de várias', () => {
    const evento = { cor: 2, consultor: { id: 'p1', cor: '#ca8a04' } }
    expect(corDoChip(evento, false)).toBe('#047857')
    expect(corDoChip(evento, true)).toBe('#ca8a04')
  })
})

describe('o tipo manda no chip (auditoria, M2)', () => {
  const reuniao = { tipo: 'evento', id: 'e1', evento: { id: 'e1', cliente_id: 'k1', cor: 1 } }
  const compromisso = { tipo: 'evento', id: 'e2', evento: { id: 'e2', cliente_id: null, cor: 1 } }
  const ausencia = { tipo: 'ausencia', id: 'a1', ausencia: {} }
  const feriado = { tipo: 'feriado', id: '2026-11-20', nome: 'Consciência Negra' }

  it('evento com cliente é reunião; sem cliente, compromisso', () => {
    expect([reuniao, compromisso, ausencia, feriado].map(tipoDoItem)).toEqual(['reuniao', 'compromisso', 'ausencia', 'feriado'])
  })

  it('cada tipo tem o seu fundo e texto; a ausência é listrada; a cor escolhida não pinta o chip', () => {
    expect(classeDoChip(reuniao)).toContain('bg-evento-reuniao')
    expect(classeDoChip(reuniao)).toContain('text-evento-reuniao-texto')
    expect(classeDoChip(compromisso)).toContain('bg-evento-compromisso')
    expect(classeDoChip(ausencia)).toContain('bg-evento-ausencia')
    expect(classeDoChip(ausencia)).toContain('listras-de-ausencia')
    expect(classeDoChip(feriado)).toContain('bg-evento-feriado')
    expect(classeDoChip({ ...reuniao, evento: { ...reuniao.evento, cor: 5 } })).toBe(classeDoChip(reuniao))
  })

  it('a legenda (e o "Mostrar") usa a amostra do mesmo tipo do chip', () => {
    const doTipo = { reunioes: reuniao, compromissos: compromisso, ausencias: ausencia, feriados: feriado }
    for (const t of TIPOS) {
      const fundo = classeDoChip(doTipo[t.chave]).split(' ').find((c) => c.startsWith('bg-evento-'))
      expect(t.amostra, t.chave).toContain(fundo)
    }
    expect(TIPOS.find((t) => t.chave === 'ausencias').amostra).toContain('listras-de-ausencia')
  })
})

// Os tokens dos chips em src/index.css seguram 4,5:1 nos dois temas (texto do tipo sobre o fundo do tipo; na ausência,
// também sobre a listra mais escura).
function tokens(css, seletor) {
  const valores = {}
  for (const [, corpo] of css.matchAll(new RegExp(`(?:^|\\n)${seletor.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g'))) {
    for (const [, nome, valor] of corpo.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) valores[nome] = valor
  }
  return valores
}
const CSS = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

describe.each([['claro', ':root'], ['escuro', '.dark']])('contraste dos chips no %s', (_tema, seletor) => {
  const t = tokens(CSS, seletor)
  it.each([
    ['evento-reuniao-texto', 'evento-reuniao'],
    ['evento-compromisso-texto', 'evento-compromisso'],
    ['evento-ausencia-texto', 'evento-ausencia'],
    ['evento-ausencia-texto', 'evento-ausencia-listra'],
    ['evento-feriado-texto', 'evento-feriado'],
  ])('%s sobre %s: 4,5:1', (texto, fundo) => {
    expect(t[texto], texto).toMatch(/^#/)
    expect(t[fundo], fundo).toMatch(/^#/)
    expect(contraste(t[texto], t[fundo])).toBeGreaterThanOrEqual(CONTRASTE_MINIMO)
  })
})
