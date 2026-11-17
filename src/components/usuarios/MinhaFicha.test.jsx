import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { definirCarga } from '@/data/capacidade'
import { mudarCor, tirarFoto, trocarFoto } from '@/data/imagens'
import { atualizarMeuContato, gerenciarAcesso } from '@/data/usuarios'
import { cancelarCadastro, concluirCadastro, desativarVerificacao, iniciarCadastro } from '@/data/verificacao'
import MinhaFicha from './MinhaFicha'

vi.mock('@/data/usuarios', () => ({ gerenciarAcesso: vi.fn(), atualizarMeuContato: vi.fn() }))
vi.mock('@/data/capacidade', () => ({ listarAusencias: vi.fn(), definirCarga: vi.fn() }))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn(), tirarFoto: vi.fn(), mudarCor: vi.fn() }))
vi.mock('@/data/verificacao', () => ({
  iniciarCadastro: vi.fn(), concluirCadastro: vi.fn(), cancelarCadastro: vi.fn(), desativarVerificacao: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const PERFIL = {
  id: 'me', nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'admin', consultoria_id: 'c1', consultoria: { nome: 'Acme' },
  telefone: '(11) 97777-0000', cidade: 'Santos', uf: 'SP', cargo: 'Consultor sênior', data_entrada: '2026-01-10', carga_semanal: 40,
  tipos_de_consultoria: ['gestao'], exige_2fa: false, verificacao_desde: null,
}
let recarregarPerfil, definirSenha, aoFechar, aoSalvo

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null })
  vi.mocked(atualizarMeuContato).mockResolvedValue({ erro: null })
  vi.mocked(trocarFoto).mockResolvedValue({ erro: null })
  vi.mocked(tirarFoto).mockResolvedValue({ erro: null })
  vi.mocked(mudarCor).mockResolvedValue({ erro: null })
  vi.mocked(iniciarCadastro).mockResolvedValue({
    erro: null, fatorId: 'f2', qr: 'data:image/svg+xml;utf-8,<svg/>', segredo: 'ABCDEFGHIJKLMNOP', uri: 'otpauth://totp/x',
  })
  vi.mocked(concluirCadastro).mockResolvedValue({ erro: null })
  vi.mocked(desativarVerificacao).mockResolvedValue({ erro: null })
})

function montar(perfil = {}) {
  recarregarPerfil = vi.fn().mockResolvedValue(undefined)
  definirSenha = vi.fn().mockResolvedValue({ erro: null })
  aoFechar = vi.fn()
  aoSalvo = vi.fn()
  render(
    <AuthContext.Provider value={{ perfil: { ...PERFIL, ...perfil }, recarregarPerfil, definirSenha }}>
      <MinhaFicha aoFechar={aoFechar} aoSalvo={aoSalvo} />
    </AuthContext.Provider>,
  )
}

const salvar = () => userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

describe('Meu perfil (a ficha de Usuários no modo próprio): gravar', () => {
  it('abre a ficha de quem está usando, com o título Meu perfil', () => {
    montar()
    const janela = screen.getByRole('dialog', { name: 'Meu perfil' })
    expect(within(janela).getByLabelText('Nome')).toHaveValue('Diego Felippe')
    expect(within(janela).getByLabelText('E-mail')).toHaveValue('diego@exemplo.test')
    expect(within(janela).getByLabelText('E-mail')).toBeDisabled()
  })

  it('grava cada coisa pelo caminho dela (nome, contato, foto e senha) e atualiza quem está usando', async () => {
    montar()
    await userEvent.clear(screen.getByLabelText('Nome'))
    await userEvent.type(screen.getByLabelText('Nome'), 'Diego F.')
    await userEvent.type(screen.getByLabelText('Telefone'), '9')
    const arquivo = new File(['x'], 'eu.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    await userEvent.click(screen.getByRole('tab', { name: 'Acesso' }))
    await userEvent.type(screen.getByLabelText('Senha nova'), 'Senha-nova-1!')
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'Senha-nova-1!')
    await salvar()
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
    expect(gerenciarAcesso).toHaveBeenCalledTimes(1)
    expect(gerenciarAcesso).toHaveBeenCalledWith('editar', 'me', { nome: 'Diego F.' })
    expect(atualizarMeuContato).toHaveBeenCalledWith({ telefone: '(11) 97777-00009', cidade: 'Santos', uf: 'SP' })
    expect(trocarFoto).toHaveBeenCalledWith('me', arquivo, undefined)
    expect(definirSenha).toHaveBeenCalledWith('Senha-nova-1!')
    expect(definirCarga).not.toHaveBeenCalled()
    expect(mudarCor).not.toHaveBeenCalled()
    expect(recarregarPerfil).toHaveBeenCalled()
    expect(aoSalvo).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Perfil atualizado.')
  })

  it('a cor do avatar vai por mudarCor; sem mexer em nada, nada é gravado', async () => {
    montar()
    await salvar()
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
    for (const gravar of [gerenciarAcesso, atualizarMeuContato, trocarFoto, tirarFoto, mudarCor]) expect(gravar).not.toHaveBeenCalled()
    expect(definirSenha).not.toHaveBeenCalled()
  })

  it('a cor escolhida é gravada para quem está usando', async () => {
    montar()
    await userEvent.click(screen.getByRole('radio', { name: 'Rosa' }))
    expect(screen.getByText('DF')).toHaveStyle({ backgroundColor: '#db2777' })
    await salvar()
    await waitFor(() => expect(mudarCor).toHaveBeenCalledWith('me', '#db2777'))
    expect(gerenciarAcesso).not.toHaveBeenCalled()
  })

  it('o erro de um passo aparece na ficha, que fica aberta', async () => {
    vi.mocked(atualizarMeuContato).mockResolvedValue({ erro: 'Você não tem permissão para isso.' })
    montar()
    await userEvent.type(screen.getByLabelText('Telefone'), '9')
    await salvar()
    expect(await screen.findByText('Você não tem permissão para isso.')).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(recarregarPerfil).not.toHaveBeenCalled()
  })
})

// Gravação pela metade: cada passo vai num caminho (Edge Function, função do banco, Storage, Auth). Se um falha
// depois de outros terem ido, a tela diz o que foi salvo e o que não, recarrega quem está usando e, ao tentar de
// novo, não manda outra vez o que já foi.
describe('Meu perfil: quando só parte é salva', () => {
  const MESMA = 'A senha nova precisa ser diferente da atual.'

  async function digitarSenha(senha) {
    await userEvent.click(screen.getByRole('tab', { name: /^Acesso/ }))
    await userEvent.clear(screen.getByLabelText('Senha nova'))
    await userEvent.type(screen.getByLabelText('Senha nova'), senha)
    await userEvent.clear(screen.getByLabelText('Repita a senha nova'))
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), senha)
  }

  it('nome e foto vão, a senha é recusada: diz o que foi salvo, recarrega, fica aberta e marca a senha', async () => {
    montar()
    definirSenha.mockResolvedValueOnce({ erro: MESMA })
    await userEvent.clear(screen.getByLabelText('Nome'))
    await userEvent.type(screen.getByLabelText('Nome'), 'Diego F.')
    const arquivo = new File(['x'], 'eu.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    await digitarSenha('Senha-atual-1!')
    await salvar()
    expect(await screen.findByText(`Nome e foto salvos. A senha não mudou: ${MESMA}`)).toBeInTheDocument()
    expect(recarregarPerfil).toHaveBeenCalled()
    expect(aoSalvo).toHaveBeenCalled()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Acesso, tem erro' })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('tabpanel', { name: /^Acesso/ })).getByText(MESMA)).toBeInTheDocument()

    await digitarSenha('Outra-senha-2!')
    await salvar()
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
    expect(gerenciarAcesso).toHaveBeenCalledTimes(1)
    expect(trocarFoto).toHaveBeenCalledTimes(1)
    expect(definirSenha).toHaveBeenLastCalledWith('Outra-senha-2!')
    expect(toast.success).toHaveBeenCalledWith('Perfil atualizado.')
  })

  it('só a senha muda e é recusada: nada foi salvo, não recarrega, e o motivo aparece no aviso e no campo', async () => {
    montar()
    definirSenha.mockResolvedValueOnce({ erro: MESMA })
    await digitarSenha('Senha-atual-1!')
    await salvar()
    expect(await screen.findAllByText(MESMA)).toHaveLength(2)
    expect(recarregarPerfil).not.toHaveBeenCalled()
    expect(aoSalvo).not.toHaveBeenCalled()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Acesso, tem erro' })).toBeInTheDocument()
  })

  it('o contato vai e a foto falha: diz o que falta salvar e, de novo, manda só a foto e a senha', async () => {
    montar()
    vi.mocked(trocarFoto).mockResolvedValueOnce({ erro: 'Não foi possível enviar a imagem. Tente de novo.' })
    await userEvent.type(screen.getByLabelText('Telefone'), '9')
    const arquivo = new File(['x'], 'eu.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    await digitarSenha('Senha-nova-1!')
    await salvar()
    expect(await screen.findByText('Contato salvo. A foto não mudou: Não foi possível enviar a imagem. Tente de novo. Falta salvar a senha.'))
      .toBeInTheDocument()
    expect(definirSenha).not.toHaveBeenCalled()
    expect(recarregarPerfil).toHaveBeenCalled()
    expect(screen.queryByRole('tab', { name: /tem erro/ })).not.toBeInTheDocument()

    await salvar()
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
    expect(atualizarMeuContato).toHaveBeenCalledTimes(1)
    expect(trocarFoto).toHaveBeenCalledTimes(2)
    expect(definirSenha).toHaveBeenCalledWith('Senha-nova-1!')
  })

  it('tirar a foto no modo próprio apaga a foto atual da própria pessoa', async () => {
    montar({ foto: 'me/antiga.webp' })
    await userEvent.click(screen.getByRole('button', { name: 'Tirar foto' }))
    await salvar()
    await waitFor(() => expect(tirarFoto).toHaveBeenCalledWith('me', 'me/antiga.webp'))
    expect(trocarFoto).not.toHaveBeenCalled()
    expect(aoFechar).toHaveBeenCalled()
  })
})

// A verificação em duas etapas da própria pessoa (antes no Meu perfil separado), agora na aba Acesso da ficha.
async function abrirVerificacao(perfil) {
  montar(perfil)
  await userEvent.click(screen.getByRole('tab', { name: 'Acesso' }))
  return screen.getByRole('region', { name: 'Verificação em duas etapas' })
}

describe('Meu perfil: ativar a verificação em duas etapas (aba Acesso)', () => {
  it('desligada: Ativar mostra o QR code, a chave para copiar e pede o código de 6 dígitos', async () => {
    const usuario = userEvent.setup()
    const escrever = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const secao = await abrirVerificacao()
    expect(within(secao).getByText('Desligada')).toBeInTheDocument()
    await usuario.click(within(secao).getByRole('button', { name: /Ativar/ }))
    expect(iniciarCadastro).toHaveBeenCalledTimes(1)
    expect(await within(secao).findByRole('img', { name: /QR code/ })).toHaveAttribute('src', 'data:image/svg+xml;utf-8,<svg/>')
    // A ativação abre dentro do mesmo cartão da chave e da situação (a seção tem um cartão só).
    expect(within(secao).getByRole('switch', { name: /Exigir verificação/ }).closest('[data-slot="cartao-secao"]'))
      .toContainElement(within(secao).getByRole('img', { name: /QR code/ }))
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
    const secao = await abrirVerificacao()
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

  it('Enter no código confirma o código, não salva a ficha', async () => {
    const secao = await abrirVerificacao()
    await userEvent.click(within(secao).getByRole('button', { name: /Ativar/ }))
    await userEvent.type(await within(secao).findByLabelText('Código do app'), '123456{Enter}')
    expect(concluirCadastro).toHaveBeenCalledWith('f2', '123456')
    expect(gerenciarAcesso).not.toHaveBeenCalled()
    expect(aoFechar).not.toHaveBeenCalled()
  })

  it('Cancelar tira o cadastro começado e volta para Ativar', async () => {
    const secao = await abrirVerificacao()
    await userEvent.click(within(secao).getByRole('button', { name: /Ativar/ }))
    await within(secao).findByRole('img', { name: /QR code/ })
    await userEvent.click(within(secao).getByRole('button', { name: 'Cancelar ativação' }))
    expect(cancelarCadastro).toHaveBeenCalledWith('f2')
    expect(within(secao).getByRole('button', { name: /Ativar/ })).toBeInTheDocument()
  })
})

describe('Meu perfil: desativar a verificação em duas etapas (aba Acesso)', () => {
  it('ativa: mostra desde quando; Desativar pede um código atual', async () => {
    const secao = await abrirVerificacao({ verificacao_desde: '2026-11-10T15:00:00Z' })
    expect(within(secao).getByText('Ativa desde 10/11/2026')).toBeInTheDocument()
    await userEvent.click(within(secao).getByRole('button', { name: /Desativar/ }))
    await userEvent.type(within(secao).getByLabelText('Código atual do app'), '654321')
    await userEvent.click(within(secao).getByRole('button', { name: 'Desativar verificação' }))
    expect(desativarVerificacao).toHaveBeenCalledWith('654321')
    await waitFor(() => expect(recarregarPerfil).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Verificação em duas etapas desativada.')
  })

  it('exigida pela administração: não deixa desativar e diz por quê', async () => {
    const secao = await abrirVerificacao({ verificacao_desde: '2026-11-10T15:00:00Z', exige_2fa: true })
    expect(within(secao).queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
    expect(within(secao).getByText(/exigida para o seu acesso/)).toBeInTheDocument()
  })
})
