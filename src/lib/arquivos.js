// Arquivos do cliente: o limite e o caminho no Storage (bucket "arquivos"). O banco confere o mesmo formato em
// cliente_arquivos.caminho; os testes de integração usam estas mesmas funções.

// 25 MB: o limite do bucket "arquivos" e de cliente_arquivos.tamanho.
export const TAMANHO_MAXIMO_ARQUIVO = 26214400

const MAXIMO_NO_STORAGE = 120
const MAXIMO_PARA_MOSTRAR = 200

// Nome do objeto no Storage: sem acento, só letras, números, ".", "-" e "_" (o resto vira "_"), até 120
// caracteres, guardando a extensão quando o nome é cortado.
export function nomeNoStorage(nome) {
  const limpo = String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
  if (!limpo) return 'arquivo'
  if (limpo.length <= MAXIMO_NO_STORAGE) return limpo
  const extensao = limpo.match(/\.[A-Za-z0-9]{1,10}$/)?.[0] ?? ''
  return limpo.slice(0, MAXIMO_NO_STORAGE - extensao.length) + extensao
}

// <cliente>/<uuid>-<nome>: a pasta do cliente e um nome que não se repete.
export function caminhoDoArquivo(clienteId, nome, id = crypto.randomUUID()) {
  return `${clienteId}/${id}-${nomeNoStorage(nome)}`
}

// Nome que aparece na lista: o original, sem espaços nas pontas, com até 200 caracteres (contados como o banco).
export function nomeParaMostrar(nome) {
  const limpo = String(nome ?? '').trim()
  return limpo ? Array.from(limpo).slice(0, MAXIMO_PARA_MOSTRAR).join('') : 'arquivo'
}
