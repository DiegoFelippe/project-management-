// Cor do avatar (fundo das iniciais quando não há foto). A paleta é a mesma do check de perfis.cor no banco.
export const CORES_DO_AVATAR = [
  { valor: '#2563eb', nome: 'Azul' },
  { valor: '#0891b2', nome: 'Turquesa' },
  { valor: '#7c3aed', nome: 'Violeta' },
  { valor: '#db2777', nome: 'Rosa' },
  { valor: '#ea580c', nome: 'Laranja' },
  { valor: '#16a34a', nome: 'Verde' },
  { valor: '#475569', nome: 'Grafite' },
  { valor: '#ca8a04', nome: 'Mostarda' },
]

const CORES = CORES_DO_AVATAR.map((c) => c.valor)

// Cor automática por pessoa, quando ela não escolheu uma.
export function corDe(chave = '') {
  let soma = 0
  for (const letra of chave) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0
  return CORES[soma % CORES.length]
}

// A cor escolhida (perfis.cor) ou a automática.
export function corDaPessoa(pessoa) {
  return pessoa?.cor || corDe(pessoa?.id)
}
