import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CORES_DO_EVENTO } from '@/components/calendario/cores'
import { CORES_DO_AVATAR, TEXTO_ESCURO, corDoTextoSobre } from './cores'
import { CONTRASTE_MINIMO, contraste, misturar } from './contraste'

// Guarda do contraste (auditoria de 17/11, pedido do Diego): os pares de cores que a tela usa o dia todo seguram pelo
// menos 4,5:1 (WCAG AA, texto normal), no claro e no escuro. Os valores vêm do próprio src/index.css.
function tokens(css, seletor) {
  const valores = {}
  const blocos = css.matchAll(new RegExp(`(?:^|\\n)${seletor.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g'))
  for (const [, corpo] of blocos) {
    for (const [, nome, valor] of corpo.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) valores[nome] = valor
  }
  return valores
}

const CSS = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
const TEMAS = { claro: tokens(CSS, ':root'), escuro: tokens(CSS, '.dark') }
const arredondar = (n) => Math.round(n * 100) / 100

// [texto, fundo, onde aparece]. Os fundos com opacidade são misturados sobre o cartão, como na tela.
function pares(t) {
  const fimDeSemana = misturar(t.muted, t.card, 0.4) // bg-muted/40 das células de sábado e domingo no Calendário
  return [
    ['muted-foreground', 'background', 'subtítulo da página e "← Voltar"'],
    ['muted-foreground', 'painel', 'texto de apoio no painel'],
    ['muted-foreground', 'card', 'texto de apoio no cartão'],
    ['muted-foreground', 'muted', 'aba inativa (AbasSegmentadas)'],
    ['muted-foreground', 'moldura', 'rótulos do trilho'],
    ['foreground', 'background', 'texto'],
    ['primary-foreground', 'primary-cheio', 'botão principal cheio'],
    ['primary', 'card', 'link e texto azul no cartão'],
    ['primary', 'background', 'link e texto azul no painel'],
    ['domingo', 'card', 'domingo no Calendário'],
    ['sabado', 'card', 'sábado no Calendário'],
  ].map(([texto, fundo, onde]) => ({ texto: t[texto], fundo: t[fundo], onde: `${texto} sobre ${fundo} (${onde})` }))
    .concat([
      { texto: t.domingo, fundo: fimDeSemana, onde: 'domingo sobre a célula do fim de semana' },
      { texto: t.sabado, fundo: fimDeSemana, onde: 'sábado sobre a célula do fim de semana' },
      { texto: t.domingo, fundo: t.accent, onde: 'domingo no dia escolhido' },
      { texto: t.sabado, fundo: t.accent, onde: 'sábado no dia escolhido' },
    ])
}

describe('contraste dos tokens de src/index.css', () => {
  it('lê os tokens do claro e do escuro', () => {
    for (const t of Object.values(TEMAS)) {
      for (const nome of ['background', 'card', 'muted', 'muted-foreground', 'primary', 'primary-cheio', 'primary-foreground', 'domingo', 'sabado']) {
        expect(t[nome], nome).toMatch(/^#/)
      }
    }
  })

  it.each(Object.keys(TEMAS))('no %s, os pares do dia a dia seguram 4,5:1', (tema) => {
    const fracos = pares(TEMAS[tema])
      .map((p) => ({ onde: p.onde, contraste: arredondar(contraste(p.texto, p.fundo)) }))
      .filter((p) => !(p.contraste >= CONTRASTE_MINIMO))
    expect(fracos).toEqual([])
  })

  it('o botão cheio usa o azul da consultoria nos dois temas (#2563eb, branco a 5,2:1)', () => {
    expect(TEMAS.claro['primary-cheio']).toBe('#2563eb')
    expect(TEMAS.escuro['primary-cheio']).toBe('#2563eb')
    expect(arredondar(contraste('#ffffff', TEMAS.escuro['primary-cheio']))).toBeGreaterThanOrEqual(5.1)
  })
})

describe('texto sobre a cor da pessoa ou do evento', () => {
  it('toda cor do avatar tem texto com pelo menos 4,5:1; branco onde o branco segura', () => {
    const fracas = CORES_DO_AVATAR
      .map((c) => ({ nome: c.nome, contraste: arredondar(contraste(corDoTextoSobre(c.valor), c.valor)) }))
      .filter((c) => c.contraste < CONTRASTE_MINIMO)
    expect(fracas).toEqual([])
    expect(corDoTextoSobre('#2563eb')).toBe('#ffffff')
    expect(corDoTextoSobre('#475569')).toBe('#ffffff')
  })

  it('o mostarda leva texto escuro (o branco fica em 2,9:1)', () => {
    expect(corDoTextoSobre('#ca8a04')).toBe(TEXTO_ESCURO)
    expect(arredondar(contraste('#ffffff', '#ca8a04'))).toBeLessThan(3)
    expect(contraste(TEXTO_ESCURO, '#ca8a04')).toBeGreaterThan(6)
  })

  it('as cores do evento seguram 4,5:1 com o texto escolhido', () => {
    for (const c of CORES_DO_EVENTO) expect(contraste(corDoTextoSobre(c.valor), c.valor), c.nome).toBeGreaterThanOrEqual(CONTRASTE_MINIMO)
  })

  it('cor fora do formato #rrggbb fica com o branco', () => {
    expect(corDoTextoSobre(undefined)).toBe('#ffffff')
    expect(corDoTextoSobre('azul')).toBe('#ffffff')
  })
})

// Varredura: texto branco (text-primary-foreground) sobre o azul cheio usa bg-primary-cheio. O bg-primary no escuro é o
// azul claro (#3b82f6), que fica em 3,7:1 com o branco; ele continua para barras, bolinhas e texto azul.
function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.jsx?$/.test(nome) && !nome.includes('.test.') ? [caminho] : []
  })
}

const AZUL_CLARO_COM_BRANCO = /(?<![\w-])bg-primary(?![\w/-]).*text-primary-foreground|text-primary-foreground.*(?<![\w-])bg-primary(?![\w/-])/

describe('varredura do azul cheio', () => {
  it('a regra pega bg-primary com texto branco e deixa passar o cheio, a opacidade e as barras', () => {
    expect(AZUL_CLARO_COM_BRANCO.test("'bg-primary text-primary-foreground'")).toBe(true)
    expect(AZUL_CLARO_COM_BRANCO.test("'text-primary-foreground hover:bg-primary'")).toBe(true)
    expect(AZUL_CLARO_COM_BRANCO.test("'bg-primary-cheio text-primary-foreground'")).toBe(false)
    expect(AZUL_CLARO_COM_BRANCO.test("'bg-primary/10 text-primary'")).toBe(false)
    expect(AZUL_CLARO_COM_BRANCO.test("'h-full rounded-full bg-primary'")).toBe(false)
  })

  it('nenhuma tela põe texto branco sobre o bg-primary', () => {
    const achados = []
    for (const arquivo of arquivos(join(process.cwd(), 'src'))) {
      readFileSync(arquivo, 'utf8').split('\n').forEach((linha, i) => {
        if (AZUL_CLARO_COM_BRANCO.test(linha)) achados.push(`${arquivo.split('/src/')[1]}:${i + 1}`)
      })
    }
    expect(achados).toEqual([])
  })
})
