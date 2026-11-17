// Cor fixa por pessoa (fundo das iniciais quando não há foto).
const CORES = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#475569', '#ca8a04']

export function corDe(chave = '') {
  let soma = 0
  for (const letra of chave) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0
  return CORES[soma % CORES.length]
}
