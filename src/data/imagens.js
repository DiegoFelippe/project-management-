// Foto das pessoas (bucket "fotos") e logo das consultorias (bucket "logos"). O arquivo vai para a pasta
// do dono (<id>/<uuid>.webp) e a coluna guarda o caminho; o banco e o Storage conferem quem pode.
import { traduzirErroBanco } from '@/lib/erros'
import { EXTENSAO, prepararImagem } from '@/lib/imagem'
import { supabase } from '@/lib/supabase'

const FOTO = { bucket: 'fotos', tabela: 'perfis', coluna: 'foto', recortar: true }
const LOGO = { bucket: 'logos', tabela: 'consultorias', coluna: 'logo', recortar: false, lado: 320 }

async function gravar({ tabela, coluna }, id, valor) {
  const { data, error } = await supabase.from(tabela).update({ [coluna]: valor }).eq('id', id).select('id')
  if (error) return traduzirErroBanco(error)
  if (!data.length) return traduzirErroBanco({ code: '42501' })
  return null
}

async function trocar(tipo, id, arquivo, atual) {
  let imagem
  try {
    imagem = await prepararImagem(arquivo, { recortar: tipo.recortar, lado: tipo.lado })
  } catch {
    return { erro: 'Não foi possível ler essa imagem. Tente outra.' }
  }
  const caminho = `${id}/${crypto.randomUUID()}.${EXTENSAO[imagem.type] ?? 'png'}`
  const { error } = await supabase.storage.from(tipo.bucket).upload(caminho, imagem, { contentType: imagem.type })
  if (error) return { erro: 'Não foi possível enviar a imagem. Tente de novo.' }
  const erro = await gravar(tipo, id, caminho)
  if (erro) {
    await supabase.storage.from(tipo.bucket).remove([caminho])
    return { erro }
  }
  if (atual) await supabase.storage.from(tipo.bucket).remove([atual])
  return { erro: null, caminho }
}

async function tirar(tipo, id, atual) {
  const erro = await gravar(tipo, id, null)
  if (erro) return { erro }
  if (atual) await supabase.storage.from(tipo.bucket).remove([atual])
  return { erro: null }
}

export const trocarFoto = (pessoaId, arquivo, atual) => trocar(FOTO, pessoaId, arquivo, atual)
export const tirarFoto = (pessoaId, atual) => tirar(FOTO, pessoaId, atual)
export const trocarLogo = (consultoriaId, arquivo, atual) => trocar(LOGO, consultoriaId, arquivo, atual)
export const tirarLogo = (consultoriaId, atual) => tirar(LOGO, consultoriaId, atual)
