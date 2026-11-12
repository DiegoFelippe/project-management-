import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { act, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import BarraTopo from '@/components/shell/BarraTopo'
import { manifesto } from './manifesto'
import { useInstalar } from './useInstalar'

function eventoDeInstalar() {
  const evento = new Event('beforeinstallprompt', { cancelable: true })
  evento.prompt = vi.fn().mockResolvedValue(undefined)
  evento.userChoice = Promise.resolve({ outcome: 'accepted' })
  return evento
}

describe('manifesto do app', () => {
  it('tem o nome, as cores e abre como aplicativo', () => {
    expect(manifesto).toMatchObject({
      name: 'IXC Consult',
      short_name: 'IXC Consult',
      lang: 'pt-BR',
      start_url: '/',
      display: 'standalone',
      theme_color: '#ffffff',
      background_color: '#ffffff',
    })
  })

  it('instalado, abre sem a barra de título (só os botões da janela sobre o app)', () => {
    expect(manifesto.display_override).toEqual(['window-controls-overlay'])
  })

  it('usa a logo como ícone, inclusive o adaptável, e os arquivos existem', () => {
    const tamanhos = manifesto.icons.map((i) => i.sizes)
    expect(tamanhos).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(manifesto.icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const icone of manifesto.icons) {
      expect(existsSync(join(process.cwd(), 'public', icone.src))).toBe(true)
    }
  })
})

describe('instalar o app', () => {
  it('só oferece depois que o navegador permite, e chama a janela de instalar', async () => {
    const { result } = renderHook(() => useInstalar())
    expect(result.current.podeInstalar).toBe(false)
    const evento = eventoDeInstalar()
    act(() => {
      window.dispatchEvent(evento)
    })
    expect(result.current.podeInstalar).toBe(true)
    await act(() => result.current.instalar())
    expect(evento.prompt).toHaveBeenCalled()
    expect(result.current.podeInstalar).toBe(false)
  })

  it('a barra de cima mostra "Instalar app" quando dá para instalar', () => {
    const perfil = { papel: 'gestor', consultoria: { nome: 'Consultoria Exemplo' } }
    render(
      <AuthContext.Provider value={{ perfil }}>
        <MemoryRouter>
          <BarraTopo aoAbrirMenu={() => {}} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(screen.queryByRole('button', { name: /Instalar app/ })).not.toBeInTheDocument()
    act(() => {
      window.dispatchEvent(eventoDeInstalar())
    })
    expect(screen.getByRole('button', { name: /Instalar app/ })).toBeInTheDocument()
  })
})
