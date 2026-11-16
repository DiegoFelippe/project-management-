// CNPJ (numérico ou alfanumérico). Mesmo cálculo de private.cnpj_valido no banco.
const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

export function normalizarCnpj(texto) {
  return String(texto ?? '')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase()
}

export function formatarCnpj(normalizado) {
  const t = normalizarCnpj(normalizado)
  if (t.length !== 14) return t
  return `${t.slice(0, 2)}.${t.slice(2, 5)}.${t.slice(5, 8)}/${t.slice(8, 12)}-${t.slice(12)}`
}

function digito(valores, pesos) {
  const soma = pesos.reduce((acc, peso, i) => acc + valores[i] * peso, 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function cnpjValido(texto) {
  const t = normalizarCnpj(texto)
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(t)) return false
  const valores = [...t].map((c) => c.charCodeAt(0) - 48)
  if (digito(valores, PESOS_1) !== valores[12]) return false
  return digito(valores, PESOS_2) === valores[13]
}
