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

// Quadro do cliente (bucket "quadros", o mesmo limite de 25 MB): o anexo do cartão em <cliente>/<cartao>/<uuid>-<nome>
// e a imagem da descrição em <cliente>/<cartao>/imagens/<uuid>.<ext>. O banco confere as duas formas.
export function caminhoDoAnexo(clienteId, cartaoId, nome, id = crypto.randomUUID()) {
  return `${clienteId}/${cartaoId}/${id}-${nomeNoStorage(nome)}`
}

// Imagens que a descrição aceita (o banco também recusa outra extensão; SVG fica de fora).
export const TIPOS_DE_IMAGEM = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

// O tipo é uma das imagens aceitas? Só as chaves da lista (Object.hasOwn: "constructor", "toString" etc. não contam).
export const imagemAceita = (tipo) => typeof tipo === 'string' && Object.hasOwn(TIPOS_DE_IMAGEM, tipo)

// null quando o tipo não é uma das imagens aceitas.
export function caminhoDaImagem(clienteId, cartaoId, tipo, id = crypto.randomUUID()) {
  return imagemAceita(tipo) ? `${clienteId}/${cartaoId}/imagens/${id}.${TIPOS_DE_IMAGEM[tipo]}` : null
}

const DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

// Tamanho para mostrar na lista: "512 B", "1,5 KB", "25 MB".
export function formatarTamanho(bytes) {
  if (bytes >= 1048576) return `${DECIMAL.format(bytes / 1048576)} MB`
  if (bytes >= 1024) return `${DECIMAL.format(bytes / 1024)} KB`
  return `${bytes} B`
}

// Nome que aparece na lista: o original, sem espaços nas pontas, com até 200 caracteres (contados como o banco).
export function nomeParaMostrar(nome) {
  const limpo = String(nome ?? '').trim()
  return limpo ? Array.from(limpo).slice(0, MAXIMO_PARA_MOSTRAR).join('') : 'arquivo'
}

// O Storage lista e tira até 1000 objetos por pedido.
const POR_PEDIDO_NO_STORAGE = 1000
const PASTA_FICOU = 'Os arquivos guardados do cliente não foram apagados. Avise o suporte.'

// Caminhos dos objetos na pasta do cliente (todas as páginas), só os que quem pergunta enxerga. `bucket` é
// supabase.storage.from('arquivos') de quem pergunta. Subpastas (id nulo) ficam de fora.
export async function caminhosNaPasta(bucket, clienteId) {
  const caminhos = []
  for (let inicio = 0; ; inicio += POR_PEDIDO_NO_STORAGE) {
    const { data, error } = await bucket.list(clienteId, { limit: POR_PEDIDO_NO_STORAGE, offset: inicio })
    if (error) return { caminhos, error }
    caminhos.push(...data.filter((objeto) => objeto.id).map((objeto) => `${clienteId}/${objeto.name}`))
    if (data.length < POR_PEDIDO_NO_STORAGE) return { caminhos, error: null }
  }
}

// Tira da pasta do cliente o que quem pergunta pode tirar: depois de apagar o cliente, a central tira tudo.
// Com o cliente ainda lá, o objeto que tem linha não sai (o banco recusa) e nada se perde.
export async function limparPasta(bucket, clienteId) {
  if (!clienteId) return { erro: null }
  const { caminhos, error } = await caminhosNaPasta(bucket, clienteId)
  if (error) return { erro: PASTA_FICOU }
  for (let inicio = 0; inicio < caminhos.length; inicio += POR_PEDIDO_NO_STORAGE) {
    const { error: erroAoTirar } = await bucket.remove(caminhos.slice(inicio, inicio + POR_PEDIDO_NO_STORAGE))
    if (erroAoTirar) return { erro: PASTA_FICOU }
  }
  return { erro: null }
}
