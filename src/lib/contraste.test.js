import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CORES_DO_EVENTO } from '@/components/calendario/cores'
import { COR, PALETA } from '@/components/graficos/cores'
import { CORES_DO_AVATAR, TEXTO_ESCURO, corDoTextoSobre } from './cores'
import { CONTRASTE_MINIMO, contraste, misturar } from './contraste'

// Piso das marcas claras (com a tabela e a dica): abaixo disto a marca some no cartão (a folga âmbar, 1,67, é a menor).
const PISO_DA_MARCA_CLARA = 1.6

// Guarda do contraste (auditoria de 17/11, pedido do Diego): os pares de cores que a tela usa o dia todo seguram pelo
// menos 4,5:1 (WCAG AA, texto normal), no claro e no escuro. Os valores vêm do próprio src/index.css.
// Lê os --tokens de um seletor (#hex ou var(--outro)). O escuro herda o que não redefine, como no CSS (a classe .dark
// fica no mesmo <html> do :root), e o var() é resolvido no tema de quem o lê.
function tokens(css, seletor) {
  const valores = {}
  const blocos = css.matchAll(new RegExp(`(?:^|\\n)${seletor.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g'))
  for (const [, corpo] of blocos) {
    for (const [, nome, valor] of corpo.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6}|var\(--[\w-]+\))\s*;/g)) valores[nome] = valor
  }
  return valores
}

function resolver(crus) {
  const valor = (nome, visto = new Set()) => {
    const v = crus[nome]
    const ref = /^var\(--([\w-]+)\)$/.exec(v ?? '')
    if (!ref || visto.has(nome)) return v
    return valor(ref[1], new Set(visto).add(nome))
  }
  return Object.fromEntries(Object.keys(crus).map((nome) => [nome, valor(nome)]))
}

const CSS = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
const CLARO = tokens(CSS, ':root')
const TEMAS = { claro: resolver(CLARO), escuro: resolver({ ...CLARO, ...tokens(CSS, '.dark') }) }
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
    ['primary-texto', 'card', 'texto azul do realce no cartão'],
    ['primary-texto', 'background', 'texto azul do realce no painel'],
    ['primary-texto', 'accent', 'texto azul sobre o bg-accent'],
    ['domingo', 'card', 'domingo no Calendário'],
    ['sabado', 'card', 'sábado no Calendário'],
  ].map(([texto, fundo, onde]) => ({ texto: t[texto], fundo: t[fundo], onde: `${texto} sobre ${fundo} (${onde})` }))
    .concat([
      { texto: t.domingo, fundo: fimDeSemana, onde: 'domingo sobre a célula do fim de semana' },
      { texto: t.sabado, fundo: fimDeSemana, onde: 'sábado sobre a célula do fim de semana' },
      // Linha da tabela com o mouse: véu do --muted (40%) sobre o cartão (Tabela: hover:bg-muted/40; Tropical, 19/11). O link da linha fica no
      // primary-texto ao passar o mouse (o --primary do escuro dá 4,1:1 ali).
      { texto: t['muted-foreground'], fundo: misturar(t.muted, t.card, 0.4), onde: 'texto de apoio na linha da tabela com o mouse' },
      { texto: t['primary-texto'], fundo: misturar(t.muted, t.card, 0.4), onde: 'link da linha da tabela com o mouse' },
      { texto: t.domingo, fundo: t.accent, onde: 'domingo no dia escolhido' },
      { texto: t.sabado, fundo: t.accent, onde: 'sábado no dia escolhido' },
      // Azul-claro de realce (bg-primary/5…/20) sobre o cartão e o painel: "Hoje", opção escolhida, selos, números.
      ...[0.05, 0.1, 0.15, 0.2].flatMap((alfa) => [
        { texto: t['primary-texto'], fundo: misturar(t.primary, t.card, alfa), onde: `primary-texto sobre bg-primary/${alfa * 100} no cartão` },
        { texto: t['primary-texto'], fundo: misturar(t.primary, t.background, alfa), onde: `primary-texto sobre bg-primary/${alfa * 100} no painel` },
      ]),
    ])
}

describe('contraste dos tokens de src/index.css', () => {
  it('lê os tokens do claro e do escuro', () => {
    for (const t of Object.values(TEMAS)) {
      for (const nome of ['background', 'card', 'muted', 'muted-foreground', 'primary', 'primary-cheio', 'primary-texto', 'primary-foreground', 'domingo', 'sabado']) {
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

  // Gráficos (design 2026-11-17-graficos-do-inicio-e-do-cliente): cores só por --grafico-*, com valor próprio no escuro.
  // Tropical (Diego, 19/11): no escuro toda marca segura 3:1; no claro as marcas são tons frescos e claros (1,67 a 2,98:1)
  // e todo gráfico tem "Ver em tabela" e a dica (o método do dataviz aceita marca abaixo de 3:1 assim). Só o coral de "passou"
  // (3:1) e a referência (4,5:1) seguram o mínimo nos dois temas. Trilha, grade e a rampa da fila são fundo.
  const MARCAS = ['grafico-serie', 'grafico-acima', 'grafico-folga', 'grafico-ref']
  const TOKENS_DOS_GRAFICOS = [...MARCAS, 'grafico-grade', 'grafico-trilha', 'grafico-neutro', 'grafico-fila-1', 'grafico-fila-2', 'grafico-fila-3']
  it('os tokens dos gráficos existem no claro e no escuro (o escuro redefine cada um)', () => {
    const escuro = tokens(CSS, '.dark')
    for (const nome of TOKENS_DOS_GRAFICOS) {
      expect(TEMAS.claro[nome], nome).toMatch(/^#/)
      expect(escuro[nome], `${nome} no .dark`).toMatch(/^#/)
    }
    expect(CSS).toMatch(/--grafico-lavado:\s*rgb\(/)
    expect(CSS).toMatch(/\.dark \{[^}]*--grafico-lavado:\s*rgb\(/)
  })

  it.each(Object.keys(TEMAS))('no %s, as marcas dos gráficos seguram o mínimo sobre o cartão (escuro 3:1; claro: só acima 3:1 e referência 4,5:1)', (tema) => {
    const t = TEMAS[tema]
    const minimo = (nome) => (nome === 'grafico-ref' ? CONTRASTE_MINIMO : nome === 'grafico-acima' || tema === 'escuro' ? 3 : PISO_DA_MARCA_CLARA)
    const fracas = MARCAS.map((nome) => ({ nome, contraste: arredondar(contraste(t[nome], t.card)), minimo: minimo(nome) }))
      .filter((m) => !(m.contraste >= m.minimo))
    expect(fracas).toEqual([])
  })

  // Pontas das rampas dos mapas de calor (Início: lavanda; dias com check-in: ciano): a célula mais forte é marca, 3:1 nos dois temas.
  it.each(Object.keys(TEMAS))('no %s, as pontas das rampas do calor seguram 3:1 sobre o cartão', (tema) => {
    const fracas = ['grafico-calor-lilas', 'grafico-calor-ciano']
      .map((nome) => ({ nome, contraste: arredondar(contraste(TEMAS[tema][nome], TEMAS[tema].card)) }))
      .filter((m) => !(m.contraste >= 3))
    expect(fracas).toEqual([])
    expect(COR['calor-lilas']).toBe('var(--grafico-calor-lilas)')
    expect(COR['calor-ciano']).toBe('var(--grafico-calor-ciano)')
  })

  it('o lavado (área sob a linha) é a própria série com transparência, nos dois temas', () => {
    const lavado = (seletor) => new RegExp(`(?:^|\\n)${seletor.replace('.', '\\.')}\\s*\\{[^}]*--grafico-lavado:\\s*rgb\\((\\d+) (\\d+) (\\d+) \\/`)
      .exec(CSS).slice(1).map(Number)
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    expect(lavado(':root')).toEqual(rgb(TEMAS.claro['grafico-serie']))
    expect(lavado('.dark')).toEqual(rgb(TEMAS.escuro['grafico-serie']))
  })

  // As situações das tarefas (rosca e etapas do check-list, faixa Hoje): COR de graficos/cores.js são marcas com nome,
  // ícone e número ao lado: 3:1 no escuro; no claro o piso das marcas claras (Tropical, 19/11).
  it.each(Object.keys(TEMAS))('no %s, as marcas de estado dos gráficos (COR) seguram o mínimo sobre o cartão', (tema) => {
    const t = TEMAS[tema]
    const minimo = tema === 'escuro' ? 3 : PISO_DA_MARCA_CLARA
    const fracas = ['feita', 'nsa', 'andamento', 'pausada', 'afazer', 'atrasada']
      .map((estado) => ({ estado, contraste: arredondar(contraste(t[/^var\(--([\w-]+)\)$/.exec(COR[estado])[1]], t.card)) }))
      .filter((m) => !(m.contraste >= minimo))
    expect(fracas).toEqual([])
  })

  it('as situações usam as cores do Tropical: feita verde, atrasada coral, andamento azul, a fazer violeta, não se aplica grafite, pausada mostarda', () => {
    expect(COR).toMatchObject({
      feita: 'var(--positive-cheio)', atrasada: 'var(--grafico-acima)', andamento: 'var(--cor-azul-forte)',
      afazer: 'var(--cor-violeta-forte)', nsa: 'var(--cor-grafite-forte)', pausada: 'var(--cor-mostarda-forte)',
    })
  })

  it('a série segue a ordem validada no dataviz (Tropical), com a esmeralda por último', () => {
    expect(PALETA).toEqual(['azul', 'mostarda', 'rosa', 'laranja', 'turquesa', 'indigo', 'violeta', 'verde'])
  })

  it.each(Object.keys(TEMAS))('no %s, positivo e destrutivo como texto da variação dos cartões seguram 4,5:1 sobre o cartão', (tema) => {
    const t = TEMAS[tema]
    const fracas = ['positive', 'destructive', 'muted-foreground'].map((nome) => ({ nome, contraste: arredondar(contraste(t[nome], t.card)) }))
      .filter((m) => !(m.contraste >= CONTRASTE_MINIMO))
    expect(fracas).toEqual([])
  })

  it('no claro o azul cheio é o próprio --primary; no escuro, um azul que segura o branco (o --primary de lá não segura)', () => {
    expect(CLARO['primary-cheio']).toBe('var(--primary)')
    expect(contraste('#ffffff', TEMAS.escuro.primary)).toBeLessThan(CONTRASTE_MINIMO)
    expect(contraste('#ffffff', TEMAS.escuro['primary-cheio'])).toBeGreaterThanOrEqual(CONTRASTE_MINIMO)
  })

  it('o texto azul comum sobre o azul-claro de realce não segura 4,5:1 (por isso existe o --primary-texto)', () => {
    expect(contraste(TEMAS.claro.primary, misturar(TEMAS.claro.primary, TEMAS.claro.card, 0.1))).toBeLessThan(CONTRASTE_MINIMO)
    expect(contraste(TEMAS.escuro.primary, misturar(TEMAS.escuro.primary, TEMAS.escuro.card, 0.1))).toBeLessThan(CONTRASTE_MINIMO)
  })
})

// Paleta de 9 cores e estados em trios (design 2026-11-19-graficos-variados-e-paleta, pedido do Diego, 19/11).
const NOMES_DA_PALETA = ['azul', 'turquesa', 'violeta', 'mostarda', 'rosa', 'verde', 'laranja', 'indigo', 'grafite']

describe.each(Object.keys(TEMAS))('paleta e estados no %s', (tema) => {
  const t = TEMAS[tema]

  it('paleta: texto segura 4,5:1 sobre o cartão e sobre o suave; forte segura 3:1 sobre o cartão no escuro (no claro, o piso das marcas claras)', () => {
    const fracos = NOMES_DA_PALETA.flatMap((n) => [
      { onde: `${n} texto/cartão`, c: contraste(t[`cor-${n}-texto`], t.card), minimo: CONTRASTE_MINIMO },
      { onde: `${n} texto/suave`, c: contraste(t[`cor-${n}-texto`], t[`cor-${n}-suave`]), minimo: CONTRASTE_MINIMO },
      { onde: `${n} forte/cartão`, c: contraste(t[`cor-${n}-forte`], t.card), minimo: tema === 'escuro' ? 3 : PISO_DA_MARCA_CLARA },
    ]).filter((m) => !(arredondar(m.c) >= m.minimo)).map((m) => `${m.onde}: ${arredondar(m.c)}`)
    expect(fracos).toEqual([])
  })

  it('cheio da paleta (no Tropical, o cheio é o suave e o sobre é o texto escuro): o sobre segura 4,5:1 sobre o cheio', () => {
    const fracos = NOMES_DA_PALETA.map((n) => ({ onde: n, c: contraste(t[`cor-${n}-sobre`], t[`cor-${n}-cheio`]) }))
      .filter((m) => !(arredondar(m.c) >= CONTRASTE_MINIMO)).map((m) => `${m.onde}: ${arredondar(m.c)}`)
    expect(fracos).toEqual([])
  })

  it('o suave de cada cor e de cada estado se separa do cartão (≥ 1,7:1 no escuro; o Tropical dá 1,71 a 1,90)', () => {
    if (tema !== 'escuro') return
    const suaves = [...NOMES_DA_PALETA.map((n) => `cor-${n}-suave`), 'positive-soft', 'notice-soft', 'destructive-soft']
    const fracos = suaves.map((n) => ({ n, c: contraste(t[n], t.card) })).filter((m) => !(arredondar(m.c) >= 1.7)).map((m) => `${m.n}: ${arredondar(m.c)}`)
    expect(fracos).toEqual([])
  })

  it('estados: texto/cartão, texto/suave e sobre/cheio seguram 4,5:1', () => {
    const fracos = ['positive', 'notice', 'destructive'].flatMap((n) => [
      { onde: `${n} texto/cartão`, c: contraste(t[n], t.card) },
      { onde: `${n} texto/suave`, c: contraste(t[n], t[`${n}-soft`]) },
      { onde: `${n} sobre/cheio`, c: contraste(t[`sobre-${n}`], t[`${n}-cheio`]) },
    ]).filter((m) => !(arredondar(m.c) >= CONTRASTE_MINIMO)).map((m) => `${m.onde}: ${arredondar(m.c)}`)
    expect(fracos).toEqual([])
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

// Varredura das combinações que não seguram 4,5:1 num mesmo elemento: texto branco (text-primary-foreground ou text-white)
// sobre o bg-primary sólido (no escuro é o azul claro, 3,7:1; use bg-primary-cheio) e text-primary sobre o azul-claro de
// realce (bg-primary/N ou bg-accent; use text-primary-texto). Olha cada linha e cada cn(…) inteiro, mesmo quebrado em
// várias linhas. As variantes (hover:, aria-pressed:…) contam como a mesma classe.
function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.jsx?$/.test(nome) && !nome.includes('.test.') ? [caminho] : []
  })
}

const REGRAS = [
  { motivo: 'texto branco sobre bg-primary (use bg-primary-cheio)', fundo: (c) => c === 'bg-primary', texto: (c) => c === 'text-primary-foreground' || c === 'text-white' },
  { motivo: 'text-primary sobre azul-claro (use text-primary-texto)', fundo: (c) => /^bg-primary\/\d+$/.test(c) || c === 'bg-accent', texto: (c) => c === 'text-primary' },
  // Sobre o -cheio de estado e do azul (sólido, o botão), só o "sobre" (o texto de antes, feito para o suave, some no cheio). Olha cada
  // texto entre aspas: o ternário "ligado ? cheio + sobre : suave + texto" é o caso comum e está certo.
  { motivo: 'texto de suave sobre um cheio (use o sobre)', porTexto: true, fundo: (c) => /^bg-[\w-]+-cheio$/.test(c),
    texto: (c) => /^text-[\w-]+-texto$/.test(c) || /^text-(?:primary|positive|notice|destructive)$/.test(c) },
]

// Classes de cor de um trecho, sem as variantes: "hover:bg-primary/10" vira "bg-primary/10".
const classesDe = (trecho) => new Set([...trecho.matchAll(/(?<![\w-])(?:[\w-]+:)*((?:bg|text)-[\w/-]+)/g)].map((m) => m[1]))

const textosEntreAspas = (trecho) => [...trecho.matchAll(/(['"`])([^'"`]*)\1/g)].map((m) => m[2])

function problemas(trecho) {
  const junto = (parte) => {
    const classes = [...classesDe(parte)]
    return (r) => classes.some(r.fundo) && classes.some(r.texto)
  }
  const noTrecho = junto(trecho)
  const porTexto = textosEntreAspas(trecho).map(junto)
  return REGRAS.filter((r) => (r.porTexto ? porTexto.some((tem) => tem(r)) : noTrecho(r))).map((r) => r.motivo)
}

// Cada cn(…) com os parênteses equilibrados, e a linha onde começa.
function chamadasDeCn(codigo) {
  const achadas = []
  for (const m of codigo.matchAll(/(?<![\w.])cn\(/g)) {
    let profundidade = 0
    for (let i = m.index + 2; i < codigo.length; i++) {
      if (codigo[i] === '(') profundidade += 1
      else if (codigo[i] === ')' && --profundidade === 0) {
        achadas.push({ trecho: codigo.slice(m.index, i + 1), linha: codigo.slice(0, m.index).split('\n').length })
        break
      }
    }
  }
  return achadas
}

function varrer(codigo) {
  const achados = new Set()
  codigo.split('\n').forEach((linha, i) => problemas(linha).forEach((p) => achados.add(`${i + 1}: ${p}`)))
  for (const { trecho, linha } of chamadasDeCn(codigo)) problemas(trecho).forEach((p) => achados.add(`${linha}: ${p}`))
  return [...achados]
}

describe('varredura das combinações sem contraste', () => {
  it('pega texto branco no bg-primary e text-primary no azul-claro, na mesma linha, em cn() quebrado e com variantes', () => {
    expect(varrer("'bg-primary text-primary-foreground'")).toHaveLength(1)
    expect(varrer("'text-white hover:bg-primary'")).toHaveLength(1)
    expect(varrer("className={cn('grid size-8 rounded-lg',\n  ligada ? 'bg-primary text-white' : 'bg-muted')}")).toHaveLength(2)
    expect(varrer("cn('px-2',\n  marcada && 'bg-primary/10',\n  marcada ? 'text-primary' : 'text-foreground')")).toEqual(['1: text-primary sobre azul-claro (use text-primary-texto)'])
    expect(varrer("'aria-pressed:bg-primary/10 aria-pressed:text-primary'")).toHaveLength(1)
    expect(varrer("'bg-accent text-primary'")).toHaveLength(1)
    expect(varrer("'bg-primary-cheio text-primary-texto'")).toEqual(['1: texto de suave sobre um cheio (use o sobre)'])
    expect(varrer("'bg-cor-azul-cheio text-cor-azul-texto'")).toHaveLength(1)
    expect(varrer("'bg-destructive-cheio text-destructive'")).toHaveLength(1)
  })

  it('o ternário cheio + sobre / suave + texto passa (cada texto entre aspas conta sozinho)', () => {
    expect(varrer("cn('px-2', ligada ? 'bg-primary-cheio text-primary-foreground' : 'bg-primary/10 text-primary-texto')")).toEqual([])
  })

  it('deixa passar o azul cheio, o texto de realce, as barras e o texto azul sem fundo', () => {
    for (const bom of ["'bg-primary-cheio text-primary-foreground'", "'bg-primary/10 text-primary-texto'", "'h-full rounded-full bg-primary'",
      "'text-primary underline'", "'bg-primary/10 text-primary-foreground'", "'bg-accent text-accent-foreground'",
      "'bg-cor-azul-cheio text-cor-azul-sobre'", "'bg-notice-cheio text-sobre-notice'"]) {
      expect(varrer(bom), bom).toEqual([])
    }
  })

  it('nenhuma tela usa essas combinações', () => {
    const achados = []
    for (const arquivo of arquivos(join(process.cwd(), 'src'))) {
      const codigo = readFileSync(arquivo, 'utf8')
      achados.push(...varrer(codigo).map((a) => `${arquivo.split('/src/')[1]}:${a}`))
    }
    expect(achados).toEqual([])
  })
})
