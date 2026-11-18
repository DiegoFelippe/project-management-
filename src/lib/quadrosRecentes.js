// O último quadro aberto e os recentes de cada pessoa, no navegador (localStorage, chave ixc.quadros.<perfilId>), só
// ids: nunca nome nem outro dado do quadro. A tela confere sempre no banco (quadroPorId, quadrosPorIds) antes de mostrar
// qualquer coisa e tira daqui o que não voltou (sumiu, foi arquivado, é de cliente ou de outra pessoa). Sem
// armazenamento (aba anônima, bloqueado), a memória fica vazia e nada quebra.

export const RECENTES_GUARDADOS = 8

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ehUuid = (valor) => typeof valor === 'string' && UUID.test(valor)
const chave = (perfilId) => `ixc.quadros.${perfilId}`
const vazia = () => ({ ultimo: null, recentes: [] })

// { ultimo, recentes }: só uuids, sem repetir, até 8 recentes (o mais novo primeiro).
export function lerMemoria(perfilId) {
  if (!ehUuid(perfilId)) return vazia()
  try {
    const guardada = JSON.parse(localStorage.getItem(chave(perfilId)) ?? 'null')
    if (!guardada || typeof guardada !== 'object' || Array.isArray(guardada)) return vazia()
    const recentes = Array.isArray(guardada.recentes) ? guardada.recentes.filter(ehUuid) : []
    return {
      ultimo: ehUuid(guardada.ultimo) ? guardada.ultimo : null,
      recentes: [...new Set(recentes)].slice(0, RECENTES_GUARDADOS),
    }
  } catch {
    return vazia()
  }
}

function guardar(perfilId, memoria) {
  try {
    localStorage.setItem(chave(perfilId), JSON.stringify(memoria))
  } catch {
    // navegador sem armazenamento: vale só nesta visita
  }
  return memoria
}

// O quadro aberto vira o último e vai para a frente dos recentes. Devolve a memória nova.
export function lembrarQuadro(perfilId, quadroId) {
  if (!ehUuid(perfilId) || !ehUuid(quadroId)) return lerMemoria(perfilId)
  const { recentes } = lerMemoria(perfilId)
  return guardar(perfilId, {
    ultimo: quadroId,
    recentes: [quadroId, ...recentes.filter((id) => id !== quadroId)].slice(0, RECENTES_GUARDADOS),
  })
}

// O quadro que o banco não devolveu sai dos recentes (e do último). Devolve a memória nova.
export function esquecerQuadro(perfilId, quadroId) {
  if (!ehUuid(perfilId)) return vazia()
  const { ultimo, recentes } = lerMemoria(perfilId)
  return guardar(perfilId, {
    ultimo: ultimo === quadroId ? null : ultimo,
    recentes: recentes.filter((id) => id !== quadroId),
  })
}
