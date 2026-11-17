import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { gerenciarAcesso } from '@/data/usuarios'
import { cancelarCadastro, concluirCadastro, desativarVerificacao, iniciarCadastro } from '@/data/verificacao'
import MeuPerfil from './MeuPerfil'

vi.mock('@/data/usuarios', () => ({ gerenciarAcesso: vi.fn(), atualizarMeuContato: vi.fn() }))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn(), tirarFoto: vi.fn(), mudarCor: vi.fn() }))
vi.mock('@/data/verificacao', () => ({
  iniciarCadastro: vi.fn(), concluirCadastro: vi.fn(), cancelarCadastro: vi.fn(), desativarVerificacao: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const BASE = { id: 'me', nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'admin', consultoria: { nome: 'Acme' } }
let recarregarPerfil

function montar(perfil = {}) {
  recarregarPerfil = vi.fn().mockResolvedValue(undefined)
  render(
    <AuthContext.Provider value={{ perfil: { ...BASE, ...perfil }, recarregarPerfil, definirSenha: vi.fn() }}>
      <MeuPerfil aberto aoFechar={vi.fn()} />
    </AuthContext.Provider>,
  )
  return screen.getByRole('region', { name: 'Verificação em duas etapas' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(iniciarCadastro).mockResolvedValue({
    erro: null, fatorId: 'f2', qr: 'data:image/svg+xml;utf-8,<svg/>', segredo: 'ABCDEFGHIJKLMNOP', uri: 'otpauth://totp/x',
  })
  vi.mocked(concluirCadastro).mockResolvedValue({ erro: null })
  vi.mocked(desativarVerificacao).mockResolvedValue({ erro: null })
})

describe('Meu perfil: ativar a verificação em duas etapas', () => {
  it('desligada: Ativar mostra o QR code, a chave para copiar e pede o código de 6 dígitos', async () => {
    const usuario = userEvent.setup()
    const escrever = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const secao = montar()
    expect(within(secao).getByText('Desligada')).toBeInTheDocument()
    await usuario.click(within(secao).getByRole('button', { name: /Ativar/ }))
    expect(iniciarCadastro).toHaveBeenCalledTimes(1)
    expect(await within(secao).findByRole('img', { name: /QR code/ })).toHaveAttribute('src', 'data:image/svg+xml;utf-8,<svg/>')
    expect(within(secao).getByText('ABCD EFGH IJKL MNOP')).toBeInTheDocument()
    await usuario.click(within(secao).getByRole('button', { name: /Copiar a chave/ }))
    expect(escrever).toHaveBeenCalledWith('ABCDEFGHIJKLMNOP')
    expect(await within(secao).findByText('Chave copiada.')).toBeInTheDocument()

    await usuario.type(within(secao).getByLabelText('Código do app'), '12a3456')
    expect(within(secao).getByLabelText('Código do app')).toHaveValue('123456')
    await usuario.click(within(secao).getByRole('button', { name: 'Confirmar e ativar' }))
    expect(concluirCadastro).toHaveBeenCalledWith('f2', '123456')
    await waitFor(() => expect(recarregarPerfil).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Verificação em duas etapas ativada.')
    expect(gerenciarAcesso).not.toHaveBeenCalled()
  })

  it('código com menos de 6 dígitos não vai; código errado mostra o motivo e não ativa', async () => {
    vi.mocked(concluirCadastro).mockResolvedValue({ erro: 'Código incorreto ou vencido. Confira o app e tente de novo.' })
    const secao = montar()
    await userEvent.click(within(secao).getByRole('button', { name: /Ativar/ }))
    await userEvent.type(await within(secao).findByLabelText('Código do app'), '123')
    await userEvent.click(within(secao).getByRole('button', { name: 'Confirmar e ativar' }))
    expect(concluirCadastro).not.toHaveBeenCalled()
    expect(within(secao).getByRole('alert')).toHaveTextContent('Digite os 6 dígitos que aparecem no app.')
    await userEvent.type(within(secao).getByLabelText('Código do app'), '456')
    await userEvent.click(within(secao).getByRole('button', { name: 'Confirmar e ativar' }))
    expect(await within(secao).findByText(/Código incorreto/)).toBeInTheDocument()
    expect(recarregarPerfil).not.toHaveBeenCalled()
  })

  it('Enter no código confirma o código, não salva o perfil', async () => {
    const secao = montar()
    await userEvent.click(within(secao).getByRole('button', { name: /Ativar/ }))
    await userEvent.type(await within(secao).findByLabelText('Código do app'), '123456{Enter}')
    expect(concluirCadastro).toHaveBeenCalledWith('f2', '123456')
    expect(gerenciarAcesso).not.toHaveBeenCalled()
  })

  it('Cancelar tira o cadastro começado e volta para Ativar', async () => {
    const secao = montar()
    await userEvent.click(within(secao).getByRole('button', { name: /Ativar/ }))
    await within(secao).findByRole('img', { name: /QR code/ })
    await userEvent.click(within(secao).getByRole('button', { name: 'Cancelar ativação' }))
    expect(cancelarCadastro).toHaveBeenCalledWith('f2')
    expect(within(secao).getByRole('button', { name: /Ativar/ })).toBeInTheDocument()
  })
})

describe('Meu perfil: desativar a verificação em duas etapas', () => {
  it('ativa: mostra desde quando; Desativar pede um código atual', async () => {
    const secao = montar({ verificacao_desde: '2026-11-10T15:00:00Z' })
    expect(within(secao).getByText('Ativa desde 10/11/2026')).toBeInTheDocument()
    await userEvent.click(within(secao).getByRole('button', { name: /Desativar/ }))
    await userEvent.type(within(secao).getByLabelText('Código atual do app'), '654321')
    await userEvent.click(within(secao).getByRole('button', { name: 'Desativar verificação' }))
    expect(desativarVerificacao).toHaveBeenCalledWith('654321')
    await waitFor(() => expect(recarregarPerfil).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Verificação em duas etapas desativada.')
  })

  it('exigida pela consultoria: não deixa desativar e diz por quê', () => {
    const secao = montar({ verificacao_desde: '2026-11-10T15:00:00Z', exige_2fa: true })
    expect(within(secao).queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
    expect(within(secao).getByText(/exigida para o seu acesso/)).toBeInTheDocument()
  })
})
