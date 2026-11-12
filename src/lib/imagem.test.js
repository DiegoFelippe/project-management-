import { describe, expect, it } from 'vitest'
import { TAMANHO_MAXIMO, urlPublica, validarImagem } from './imagem'

describe('imagem', () => {
  it('monta o endereço público do arquivo no Storage', () => {
    expect(urlPublica('fotos', 'p1/abc.webp')).toBe(`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/fotos/p1/abc.webp`)
    expect(urlPublica('fotos', null)).toBeNull()
  })

  it('aceita PNG, JPG e WebP até 10 MB', () => {
    expect(validarImagem(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull()
    expect(validarImagem(new File(['x'], 'a.txt', { type: 'text/plain' }))).toBe('Escolha uma imagem PNG, JPG ou WebP.')
    const grande = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    Object.defineProperty(grande, 'size', { value: TAMANHO_MAXIMO + 1 })
    expect(validarImagem(grande)).toBe('A imagem pode ter até 10 MB.')
  })
})
