import { afterEach, describe, expect, it } from 'vitest'
import { medirAltura } from './alturaDoQuadro'

// O jsdom não tem leiaute: monta <main> › conteúdo (margem de 24 px) › faixa com as medidas dadas.
function montar({ alturaDaPagina, topo, alturaDaFaixa = 500, margem = 24 }) {
  const pagina = document.createElement('main')
  const conteudo = document.createElement('div')
  conteudo.style.paddingTop = `${margem}px`
  const faixa = document.createElement('div')
  conteudo.append(faixa)
  pagina.append(conteudo)
  document.body.append(pagina)
  const definir = (el, campos) => {
    for (const [campo, valor] of Object.entries(campos)) Object.defineProperty(el, campo, { configurable: true, value: valor })
  }
  definir(pagina, { clientHeight: alturaDaPagina })
  definir(conteudo, { offsetTop: 0, offsetHeight: topo + alturaDaFaixa + margem, offsetParent: pagina })
  definir(faixa, { offsetTop: topo, offsetHeight: alturaDaFaixa, offsetParent: pagina })
  return faixa
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('altura da faixa das colunas', () => {
  it('vai até o fim da tela: o que sobra do <main> abaixo da faixa, menos a margem de baixo (a página não rola)', () => {
    expect(medirAltura(montar({ alturaDaPagina: 840, topo: 400 }))).toBe(416)
    // A altura atual da faixa não entra na conta.
    expect(medirAltura(montar({ alturaDaPagina: 840, topo: 400, alturaDaFaixa: 2000 }))).toBe(416)
  })

  it('sobrando pouco (celular, tela baixa), fica com a altura visível do <main> sem as margens: a página rola até ela', () => {
    expect(medirAltura(montar({ alturaDaPagina: 780, topo: 600 }))).toBe(732)
  })

  it('fora do <main> (ou sem leiaute) não mede: a faixa fica com a altura dos cartões', () => {
    expect(medirAltura(document.createElement('div'))).toBeNull()
    expect(medirAltura(montar({ alturaDaPagina: 0, topo: 0 }))).toBeNull()
  })
})
