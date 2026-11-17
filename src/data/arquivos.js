// Arquivos do cliente: o objeto fica no Storage (bucket privado "arquivos", pasta do cliente) e a linha em
// cliente_arquivos. O banco e o Storage conferem quem envia, quem vê e quem apaga.
import { caminhoDoArquivo, limparPasta, nomeParaMostrar, TAMANHO_MAXIMO_ARQUIVO } from '@/lib/arquivos'
import { ARQUIVO_GRANDE_DEMAIS, traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import { buscarPagina } from './paginar'

const BUCKET = 'arquivos'

// O nome de quem enviou vem de autor_do_arquivo (o gestor e o consultor não enxergam todos em perfis; a
// consultoria vê a central como "Central"). caminho é o que o Baixar e o Apagar usam.
const CAMPOS_DA_LISTA =
  'id, nome, tamanho, tipo, enviado_em, enviado_por, consultoria_id, caminho, autor:autor_do_arquivo(nome)'

// Pastas do cliente: quem criou vem de criada_por (a tela confere quem renomeia e apaga); `arquivos(count)` é
// quantos arquivos a pasta tem (os que a pessoa vê), para a confirmação de apagar.
const CAMPOS_DA_PASTA = 'id, nome, evento_id, consultoria_id, criada_por, criada_em, arquivos:cliente_arquivos(count)'

const OBJETO_FICOU = 'O arquivo saiu da lista, mas a cópia guardada não foi apagada. Avise o suporte.'

const traduzir = (erro) => traduzirErroBanco(erro, { sobre: 'arquivo' })
// Nome repetido no mesmo cliente é o único conflito de uma pasta.
const traduzirPasta = (erro) => (erro?.code === '23505' ? 'Já existe uma pasta com esse nome neste cliente.' : traduzir(erro))
const storage = () => supabase.storage.from(BUCKET)

// Sem autor visível (a pessoa foi apagada), o arquivo sem consultoria continua sendo da central.
const comAutor = ({ autor, ...arquivo }) => ({
  ...arquivo,
  autor: autor?.nome ?? (arquivo.consultoria_id ? null : 'Central'),
})

// Sem `pastaId`, os arquivos soltos (que não estão em pasta); com ele, os da pasta.
export async function listarArquivos(clienteId, { pastaId = null, pagina = 1 } = {}) {
  let consulta = supabase
    .from('cliente_arquivos')
    .select(CAMPOS_DA_LISTA, { count: 'exact' })
    .eq('cliente_id', clienteId)
  consulta = (pastaId ? consulta.eq('pasta_id', pastaId) : consulta.is('pasta_id', null))
    .order('enviado_em', { ascending: false })
    .order('id')
  const resultado = await buscarPagina(consulta, pagina)
  return { ...resultado, itens: resultado.itens.map(comAutor) }
}

// Sobe o objeto e depois grava a linha; se a linha não grava, tira o objeto que subiu.
export async function enviarArquivo(clienteId, arquivo, { pastaId = null } = {}) {
  if (!arquivo?.size) return { erro: 'O arquivo está vazio.' }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) return { erro: ARQUIVO_GRANDE_DEMAIS }
  const caminho = caminhoDoArquivo(clienteId, arquivo.name)
  const tipo = arquivo.type || null
  const { error } = await storage().upload(caminho, arquivo, { contentType: tipo ?? 'application/octet-stream' })
  if (error) return { erro: traduzir(error) }
  const { error: erroLinha } = await supabase.from('cliente_arquivos').insert({
    cliente_id: clienteId,
    caminho,
    nome: nomeParaMostrar(arquivo.name),
    tamanho: arquivo.size,
    tipo,
    pasta_id: pastaId,
  })
  if (erroLinha) {
    await storage().remove([caminho])
    return { erro: traduzir(erroLinha) }
  }
  return { erro: null }
}

// Pastas do cliente, da mais nova para a mais antiga, 15 por página: { itens, total }. Cada item traz
// `arquivos` (quantos arquivos tem) e `bloqueados` (quantos deles a pessoa não apagaria).
export async function listarPastas(clienteId, { pagina = 1 } = {}) {
  const consulta = supabase
    .from('cliente_pastas')
    .select(CAMPOS_DA_PASTA, { count: 'exact' })
    .eq('cliente_id', clienteId)
    .order('criada_em', { ascending: false })
    .order('id')
  const resultado = await buscarPagina(consulta, pagina)
  // Quantos arquivos de cada pasta a pessoa não apagaria (o banco recusa apagar a pasta com eles): uma chamada
  // para a página inteira.
  const bloqueados = new Map()
  if (resultado.itens.length) {
    const { data, error } = await supabase.rpc('arquivos_que_nao_apago', { p_pastas: resultado.itens.map((p) => p.id) })
    if (error) throw error
    for (const linha of data ?? []) bloqueados.set(linha.pasta_id, Number(linha.quantos))
  }
  return {
    ...resultado,
    itens: resultado.itens.map(({ arquivos, ...pasta }) => ({
      ...pasta, arquivos: arquivos?.[0]?.count ?? 0, bloqueados: bloqueados.get(pasta.id) ?? 0,
    })),
  }
}

// Uma pasta pelo id (a pasta da reunião, aberta pelo link do Calendário): { id, nome, cliente_id } ou null quando a
// pessoa não a vê.
export async function buscarPasta(id) {
  const { data, error } = await supabase.from('cliente_pastas').select('id, nome, cliente_id').eq('id', id).maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function criarPasta(clienteId, nome) {
  const { error } = await supabase.from('cliente_pastas').insert({ cliente_id: clienteId, nome: nome.trim() })
  return { erro: error ? traduzirPasta(error) : null }
}

// O banco decide quem renomeia: sem permissão, nenhuma linha muda.
export async function renomearPasta(id, nome) {
  const { data, error } = await supabase.from('cliente_pastas').update({ nome: nome.trim() }).eq('id', id).select('id')
  if (error) return { erro: traduzirPasta(error) }
  if (!data?.length) return { erro: traduzir({ code: '42501' }) }
  return { erro: null }
}

const POR_LOTE = 1000

// Apaga a pasta (o banco decide quem pode) e, com ela, as linhas dos arquivos dela; depois tira do Storage os
// objetos que eram dessas linhas, pelo mesmo caminho de apagarArquivo. Se algum objeto não sair, a pasta
// continua apagada e vem um aviso.
export async function apagarPasta(pasta) {
  const caminhos = []
  for (let de = 0; ; de += POR_LOTE) {
    const { data, error } = await supabase.from('cliente_arquivos').select('caminho').eq('pasta_id', pasta.id)
      .order('id').range(de, de + POR_LOTE - 1)
    if (error) return { erro: traduzir(error) }
    caminhos.push(...data.map((a) => a.caminho))
    if (data.length < POR_LOTE) break
  }
  const { data, error } = await supabase.from('cliente_pastas').delete().eq('id', pasta.id).select('id')
  if (error) return { erro: traduzir(error) }
  if (!data?.length) return { erro: traduzir({ code: '42501' }) }
  for (let de = 0; de < caminhos.length; de += POR_LOTE) {
    const lote = caminhos.slice(de, de + POR_LOTE)
    const { data: tirados, error: erroObjeto } = await storage().remove(lote)
    if (erroObjeto || (tirados?.length ?? 0) < lote.length) return { erro: null, aviso: OBJETO_FICOU }
  }
  return { erro: null }
}

// Link temporário (60 s) que baixa o arquivo com o nome original.
export async function linkParaBaixar(arquivo) {
  const { data, error } = await storage().createSignedUrl(arquivo.caminho, 60, { download: arquivo.nome })
  if (error) return { erro: traduzir(error) }
  return { url: data.signedUrl }
}

// Apaga a linha (o banco decide quem pode) e depois o objeto guardado nela. Se o objeto não sair, a linha
// continua apagada (o arquivo some da lista e ninguém mais o baixa) e vem um aviso.
export async function apagarArquivo(arquivo) {
  const { data, error } = await supabase.from('cliente_arquivos').delete().eq('id', arquivo.id).select('caminho')
  if (error) return { erro: traduzir(error) }
  if (!data?.length) return { erro: traduzir({ code: '42501' }) }
  const { data: tirados, error: erroObjeto } = await storage().remove([data[0].caminho])
  if (erroObjeto || !tirados?.length) return { erro: null, aviso: OBJETO_FICOU }
  return { erro: null }
}

// Logo depois de apagar o cliente (o banco só apaga cliente sem arquivos): tira da pasta dele os objetos que
// ficaram sem linha (quando tirar o objeto falhou). Com o cliente ainda lá, não tira o que tem linha.
export const limparPastaDoCliente = (clienteId) => limparPasta(storage(), clienteId)
