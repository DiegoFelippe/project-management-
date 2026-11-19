// O pedido à IA da consultoria tem um tempo máximo que vale até o fim da resposta: a IA que responde o cabeçalho e
// demora a mandar o corpo também é cortada (e o pedido, cancelado). Roda no `npm test` (projeto unidade).
import { describe, expect, it } from 'vitest'
import { criarIa } from './ia.ts'

const PEDIDO = { titulo: 'Kickoff', quando: '20/11/2026, das 14:00 às 15:00', duracao: '58 min', transcricao: 'Ana: Bom dia.' }

// IA falsa que responde 200 na hora e manda o corpo só depois de `demoraMs` (null: nunca), como um fetch de verdade: o
// corpo para de chegar quando o pedido é cancelado.
function iaQueDemora(demoraMs) {
  const chamadas = []
  async function buscar(url, init = {}) {
    chamadas.push(init.signal)
    let relogio
    const corpo = new ReadableStream({
      start(controle) {
        init.signal?.addEventListener('abort', () => {
          clearTimeout(relogio)
          controle.error(new DOMException('O pedido foi cancelado.', 'AbortError'))
        })
        if (demoraMs === null) return
        relogio = setTimeout(() => {
          const texto = JSON.stringify({ resumo: 'Resumo da reunião.', decisoes: [], proximos_passos: [] })
          controle.enqueue(new TextEncoder().encode(JSON.stringify({ content: [{ type: 'text', text: texto }] })))
          controle.close()
        }, demoraMs)
      },
    })
    return new Response(corpo, { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return { fetch: buscar, chamadas }
}

describe('IA da consultoria: tempo máximo', () => {
  it('o corpo da resposta também entra no tempo: passou do limite, o pedido é cancelado e o resumo falha', async () => {
    const ia = iaQueDemora(null)
    const resumir = criarIa({ fetch: ia.fetch, provedor: 'anthropic', modelo: 'claude-opus-5-5', chave: 'sk-falsa', limiteMs: 30 })
    await expect(resumir(PEDIDO)).rejects.toThrow()
    expect(ia.chamadas[0].aborted).toBe(true)
  })

  it('dentro do limite, o corpo chega e vira o resumo', async () => {
    const ia = iaQueDemora(5)
    const resumir = criarIa({ fetch: ia.fetch, provedor: 'anthropic', modelo: 'claude-opus-5-5', chave: 'sk-falsa', limiteMs: 1_000 })
    expect(await resumir(PEDIDO)).toEqual({ resumo: 'Resumo da reunião.', decisoes: [], proximosPassos: [] })
    expect(ia.chamadas[0].aborted).toBe(false)
  })
})
