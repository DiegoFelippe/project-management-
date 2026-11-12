import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  desconectarIntegracao,
  iniciarGoogle,
  listarIntegracoes,
  salvarIntegracao,
  testarIntegracao,
} from '@/data/integracoes'
import { renderizarTela } from '@/test/renderizar'
import Integracoes from './Integracoes'

vi.mock('@/data/integracoes', () => ({
  listarIntegracoes: vi.fn(), salvarIntegracao: vi.fn(), testarIntegracao: vi.fn(),
  desconectarIntegracao: vi.fn(), iniciarGoogle: vi.fn(),
}))
vi.mock('@/data/consultorias', () => ({ listarNomesDeConsultorias: vi.fn().mockResolvedValue([{ id: 'c1', nome: 'Acme' }]) }))

const admin = { id: 'a1', papel: 'admin', consultoria_id: 'c1' }
const SMTP = {
  id: 'i1', consultoria_id: 'c1', tipo: 'smtp', situacao: 'conectada', ultimo_erro: null, ultimo_teste_em: '2026-11-12T16:00:00Z',
  config: { host: 'smtp.acme.test', porta: 587, seguranca: 'starttls', usuario: 'contato@acme.test', remetente: 'contato@acme.test', nome_remetente: 'Acme' },
}
const linha = (nome) => screen.getByRole('row', { name: new RegExp(nome) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarIntegracoes).mockResolvedValue([SMTP])
  vi.mocked(salvarIntegracao).mockResolvedValue({ erro: null, integracao: { situacao: 'conectada' } })
  vi.mocked(testarIntegracao).mockResolvedValue({ erro: null, integracao: { situacao: 'conectada' } })
  vi.mocked(desconectarIntegracao).mockResolvedValue({ erro: null })
})

describe('Integrações', () => {
  it('lista IA, e-mail e Google numa tabela, com a situação de cada uma', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    const tabela = await screen.findByRole('table', { name: 'Integrações' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(4)
    expect(within(linha('E-mail')).getByText('Conectada')).toBeInTheDocument()
    expect(within(linha('E-mail')).getByText(/smtp\.acme\.test:587/)).toBeInTheDocument()
    expect(within(linha('Inteligência artificial')).getByText('Não conectada')).toBeInTheDocument()
    expect(listarIntegracoes).toHaveBeenCalledWith({ consultoriaId: 'c1' })
  })

  it('Editar abre o formulário do e-mail preenchido; a senha vem em branco e em branco fica a guardada', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /E-mail/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: /E-mail \(SMTP\)/ })
    expect(within(janela).getByLabelText('Servidor')).toHaveValue('smtp.acme.test')
    expect(within(janela).getByLabelText('Porta')).toHaveValue(587)
    expect(within(janela).getByLabelText('Senha')).toHaveValue('')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar e testar' }))
    expect(salvarIntegracao).toHaveBeenCalledWith('smtp', expect.objectContaining({ host: 'smtp.acme.test', porta: 587 }), null)
  })

  it('Conectar a IA pede a chave e sugere o Claude Opus 5.5', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /Inteligência artificial/ })).getByRole('button', { name: 'Conectar' }))
    const janela = screen.getByRole('dialog', { name: /Inteligência artificial/ })
    expect(within(janela).getByLabelText('Modelo')).toHaveValue('claude-opus-5-5')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar e testar' }))
    expect(within(janela).getByRole('alert')).toHaveTextContent('Informe a chave de API.')
    await userEvent.type(within(janela).getByLabelText('Chave de API'), 'sk-ant-123')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar e testar' }))
    expect(salvarIntegracao).toHaveBeenCalledWith('ia', { provedor: 'anthropic', modelo: 'claude-opus-5-5' }, 'sk-ant-123')
  })

  it('Testar e Desconectar (com confirmação) agem na integração da linha', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /E-mail/ })).getByRole('button', { name: 'Testar' }))
    expect(testarIntegracao).toHaveBeenCalledWith('i1')
    await userEvent.click(within(linha('E-mail')).getByRole('button', { name: 'Desconectar' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desconectar' }))
    expect(desconectarIntegracao).toHaveBeenCalledWith('i1')
  })

  it('Conectar com Google avisa quando o app do Google não está configurado', async () => {
    vi.mocked(iniciarGoogle).mockResolvedValue({ erro: 'Falta configurar o app do Google na plataforma.' })
    renderizarTela(<Integracoes />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /Google/ })).getByRole('button', { name: 'Conectar' }))
    expect(iniciarGoogle).toHaveBeenCalled()
    expect(await screen.findByText('Falta configurar o app do Google na plataforma.')).toBeInTheDocument()
  })

  it('o dono escolhe a consultoria e só olha', async () => {
    renderizarTela(<Integracoes />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
    expect(await screen.findByText(/Escolha uma consultoria/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Consultoria'), 'c1')
    await screen.findByRole('table', { name: 'Integrações' })
    expect(listarIntegracoes).toHaveBeenCalledWith({ consultoriaId: 'c1' })
    expect(screen.queryByRole('button', { name: /Editar|Conectar|Testar|Desconectar/ })).not.toBeInTheDocument()
  })
})
