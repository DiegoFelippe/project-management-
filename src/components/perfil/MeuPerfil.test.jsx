import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { listarAusencias } from '@/data/capacidade'
import { trocarFoto } from '@/data/imagens'
import { gerenciarAcesso } from '@/data/usuarios'
import MeuPerfil from './MeuPerfil'

vi.mock('@/data/usuarios', () => ({ gerenciarAcesso: vi.fn() }))
vi.mock('@/data/capacidade', () => ({ listarAusencias: vi.fn() }))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn(), tirarFoto: vi.fn() }))

const perfil = { id: 'me', nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'admin', consultoria: { nome: 'Acme' } }
let recarregarPerfil, definirSenha, aoFechar

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null })
  vi.mocked(trocarFoto).mockResolvedValue({ erro: null })
  vi.mocked(listarAusencias).mockResolvedValue({ itens: [{ id: 'a1', perfil_id: 'me', de: '2026-12-20', ate: '2027-01-05', motivo: 'Férias' }], total: 1 })
  recarregarPerfil = vi.fn().mockResolvedValue(undefined)
  definirSenha = vi.fn().mockResolvedValue({ erro: null })
  aoFechar = vi.fn()
  render(
    <AuthContext.Provider value={{ perfil, recarregarPerfil, definirSenha }}>
      <MeuPerfil aberto aoFechar={aoFechar} />
    </AuthContext.Provider>,
  )
})

describe('Meu perfil', () => {
  it('abre com os dados de quem está usando; e-mail e papel não mudam', () => {
    const janela = screen.getByRole('dialog', { name: 'Meu perfil' })
    expect(within(janela).getByLabelText('Nome')).toHaveValue('Diego Felippe')
    expect(within(janela).getByLabelText('E-mail')).toBeDisabled()
    expect(within(janela).getByText(/Administrador · Acme/)).toBeInTheDocument()
  })

  it('muda o próprio nome e a foto, e atualiza quem está usando', async () => {
    await userEvent.clear(screen.getByLabelText('Nome'))
    await userEvent.type(screen.getByLabelText('Nome'), 'Diego F.')
    const arquivo = new File(['x'], 'eu.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(gerenciarAcesso).toHaveBeenCalledWith('editar', 'me', { nome: 'Diego F.' })
    expect(trocarFoto).toHaveBeenCalledWith('me', arquivo, undefined)
    expect(recarregarPerfil).toHaveBeenCalled()
    expect(aoFechar).toHaveBeenCalled()
  })

  it('troca a senha quando as duas são iguais', async () => {
    await userEvent.type(screen.getByLabelText('Senha nova'), 'senha-nova-1')
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'senha-outra')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('As senhas não são iguais.')
    expect(definirSenha).not.toHaveBeenCalled()
    await userEvent.clear(screen.getByLabelText('Repita a senha nova'))
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'senha-nova-1')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(definirSenha).toHaveBeenCalledWith('senha-nova-1')
    expect(gerenciarAcesso).not.toHaveBeenCalled()
  })

  it('mostra as minhas ausências, só para leitura', async () => {
    expect(await screen.findByText('Minhas ausências')).toBeInTheDocument()
    expect(listarAusencias).toHaveBeenCalledWith('me', { pagina: 1 })
    const tabela = await screen.findByRole('table', { name: 'Ausências' })
    expect(within(tabela).getByText('20/12/2026')).toBeInTheDocument()
    expect(within(tabela).getByText('Férias')).toBeInTheDocument()
    expect(within(tabela).queryByRole('button')).toBeNull()
  })
})
