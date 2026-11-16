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

const OBJETO_FICOU = 'O arquivo saiu da lista, mas a cópia guardada não foi apagada. Avise o suporte.'

const traduzir = (erro) => traduzirErroBanco(erro, { sobre: 'arquivo' })
const storage = () => supabase.storage.from(BUCKET)

// Sem autor visível (a pessoa foi apagada), o arquivo sem consultoria continua sendo da central.
const comAutor = ({ autor, ...arquivo }) => ({
  ...arquivo,
  autor: autor?.nome ?? (arquivo.consultoria_id ? null : 'Central'),
})

export async function listarArquivos(clienteId, { pagina = 1 } = {}) {
  const consulta = supabase
    .from('cliente_arquivos')
    .select(CAMPOS_DA_LISTA, { count: 'exact' })
    .eq('cliente_id', clienteId)
    .order('enviado_em', { ascending: false })
    .order('id')
  const resultado = await buscarPagina(consulta, pagina)
  return { ...resultado, itens: resultado.itens.map(comAutor) }
}

// Sobe o objeto e depois grava a linha; se a linha não grava, tira o objeto que subiu.
export async function enviarArquivo(clienteId, arquivo) {
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
  })
  if (erroLinha) {
    await storage().remove([caminho])
    return { erro: traduzir(erroLinha) }
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
