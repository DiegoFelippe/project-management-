// Fotos e logos: validação, redução no navegador (antes de enviar) e endereço público no Storage.
export const TAMANHO_MAXIMO = 10 * 1024 * 1024
export const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp']
export const EXTENSAO = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }

export function validarImagem(arquivo) {
  if (!TIPOS_ACEITOS.includes(arquivo?.type)) return 'Escolha uma imagem PNG, JPG ou WebP.'
  if (arquivo.size > TAMANHO_MAXIMO) return 'A imagem pode ter até 10 MB.'
  return null
}

export function urlPublica(bucket, caminho) {
  if (!caminho) return null
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${bucket}/${caminho}`
}

// Foto: recorta o centro num quadrado. Logo: cabe inteira, sem recortar (fundo transparente fica).
// Sai em WebP (ou PNG, no navegador que não gera WebP), pequena o bastante para listas grandes.
export async function prepararImagem(arquivo, { lado = 256, recortar = true } = {}) {
  const bitmap = await createImageBitmap(arquivo)
  let [sx, sy, sw, sh] = [0, 0, bitmap.width, bitmap.height]
  let dw
  let dh
  if (recortar) {
    const menor = Math.min(sw, sh)
    sx = (sw - menor) / 2
    sy = (sh - menor) / 2
    sw = sh = menor
    dw = dh = Math.min(lado, menor)
  } else {
    const escala = Math.min(1, lado / Math.max(sw, sh))
    dw = Math.round(sw * escala)
    dh = Math.round(sh * escala)
  }
  const tela = document.createElement('canvas')
  tela.width = dw
  tela.height = dh
  const contexto = tela.getContext('2d')
  contexto.imageSmoothingQuality = 'high'
  contexto.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh)
  bitmap.close?.()
  const imagem = await new Promise((pronto) => tela.toBlob(pronto, 'image/webp', 0.88))
  if (!imagem) throw new Error('imagem_invalida')
  return imagem
}
