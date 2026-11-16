import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { listarAusencias } from '@/data/capacidade'
import { trocarFoto } from '@/data/imagens'
import { atualizarMeuContato, gerenciarAcesso } from '@/data/usuarios'
import { escolherNoSeletor } from '@/test/campos'
import MeuPerfil from './MeuPerfil'

vi.mock('@/data/usuarios', () => ({ gerenciarAcesso: vi.fn(), atualizarMeuContato: vi.fn() }))
vi.mock('@/data/capacidade', () => ({ listarAusencias: vi.fn() }))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn(), tirarFoto: vi.fn() }))

const perfil = {
  id: 'me', nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'admin', consultoria: { nome: 'Acme' },
  telefone: '(11) 97777-0000', cidade: 'Santos', uf: 'SP', cargo: 'Consultor sênior', data_entrada: '2026-01-10', carga_semanal: 40,
}
let recarregarPerfil, definirSenha, aoFechar

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null })
  vi.mocked(trocarFoto).mockResolvedValue({ erro: null })
  vi.mocked(atualizarMeuContato).mockResolvedValue({ erro: null })
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

  it('mostra telefone, cidade e UF para editar; cargo, entrada e carga só para ler', () => {
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 97777-0000')
    expect(screen.getByLabelText('Cidade')).toHaveValue('Santos')
    expect(screen.getByLabelText('UF')).toHaveTextContent('SP')
    expect(within(screen.getByRole('dialog')).getByText('Consultor sênior')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('10/01/2026')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('40 h por semana')).toBeInTheDocument()
    expect(screen.queryByLabelText('Cargo')).not.toBeInTheDocument()
  })

  it('Salvar contato grava telefone, cidade e UF e atualiza quem está usando', async () => {
    await userEvent.clear(screen.getByLabelText('Telefone'))
    await userEvent.type(screen.getByLabelText('Telefone'), '(13) 3333-4444')
    await userEvent.clear(screen.getByLabelText('Cidade'))
    await escolherNoSeletor(userEvent, 'UF', 'RJ')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(atualizarMeuContato).toHaveBeenCalledWith({ telefone: '(13) 3333-4444', cidade: '', uf: 'RJ' })
    await waitFor(() => expect(recarregarPerfil).toHaveBeenCalled())
    expect(aoFechar).not.toHaveBeenCalled()
  })

  it('erro ao salvar o contato aparece na janela', async () => {
    vi.mocked(atualizarMeuContato).mockResolvedValue({ erro: 'Você não tem permissão para isso.' })
    await userEvent.type(screen.getByLabelText('Telefone'), '9')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(await screen.findByText('Você não tem permissão para isso.')).toBeInTheDocument()
    expect(recarregarPerfil).not.toHaveBeenCalled()
  })

  it('o Salvar de baixo também grava o contato que mudou, e só ele', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(atualizarMeuContato).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Telefone'), '9')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(atualizarMeuContato).toHaveBeenCalledWith({ telefone: '(11) 97777-00009', cidade: 'Santos', uf: 'SP' })
  })
})
