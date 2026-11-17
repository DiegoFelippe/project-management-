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
import { indicadoresDeIntegracoes } from '@/data/indicadores'
import { escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import Integracoes from './Integracoes'

vi.mock('@/data/integracoes', () => ({
  listarIntegracoes: vi.fn(), salvarIntegracao: vi.fn(), testarIntegracao: vi.fn(),
  desconectarIntegracao: vi.fn(), iniciarGoogle: vi.fn(),
}))
vi.mock('@/data/consultorias', () => ({ buscarConsultorias: vi.fn().mockResolvedValue({ itens: [{ id: 'c1', nome: 'Acme' }], total: 1 }) }))
vi.mock('@/data/indicadores', () => ({ indicadoresDeIntegracoes: vi.fn() }))

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
  vi.mocked(indicadoresDeIntegracoes).mockResolvedValue({ conectadas: 1, com_erro: 0, nao_configuradas: 2, ultimo_teste: '2026-11-12T16:00:00Z' })
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

  it('a barra começa com Filtros e o filtro Conectadas/Não conectadas recorta a tabela', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    expect(await screen.findByText('Filtros')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Conectadas' }))
    const tabela = screen.getByRole('table', { name: 'Integrações' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Não conectadas' }))
    expect(within(screen.getByRole('table', { name: 'Integrações' })).getAllByRole('row')).toHaveLength(3)
  })

  it('Editar abre o formulário do e-mail preenchido; a senha vem em branco e em branco fica a guardada', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /E-mail/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: /E-mail \(SMTP\)/ })
    expect(within(janela).getByLabelText('Servidor')).toHaveValue('smtp.acme.test')
    expect(within(janela).getByLabelText('Porta')).toHaveValue('587')
    expect(within(janela).getByLabelText('Senha')).toHaveValue('')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar e testar' }))
    expect(salvarIntegracao).toHaveBeenCalledWith('smtp', expect.objectContaining({ host: 'smtp.acme.test', porta: 587 }), null)
  })

  it('porta fora do intervalo (70000) avisa e não grava 65535 no lugar', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /E-mail/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: /E-mail \(SMTP\)/ })
    const porta = within(janela).getByLabelText('Porta')
    await userEvent.clear(porta)
    await userEvent.type(porta, '70000')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar e testar' }))
    expect(within(janela).getByRole('alert')).toHaveTextContent('Informe uma porta válida.')
    expect(porta).toHaveValue('70000')
    expect(salvarIntegracao).not.toHaveBeenCalled()
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
    await escolherNoSeletor(userEvent, 'Consultoria', 'Acme')
    await screen.findByRole('table', { name: 'Integrações' })
    expect(listarIntegracoes).toHaveBeenCalledWith({ consultoriaId: 'c1' })
    expect(screen.queryByRole('button', { name: /Editar|Conectar|Testar|Desconectar/ })).not.toBeInTheDocument()
  })
})

describe('Integrações: cartões de números abaixo dos filtros', () => {
  const dataCurta = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  it('Conectadas, Com erro, Não configuradas e Último teste (o mais recente), do banco', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores das integrações')
    await vi.waitFor(() => expect(numeroDoCartao(cartoes, 'Conectadas')).toBe('1'))
    expect(numeroDoCartao(cartoes, 'Com erro')).toBe('0')
    expect(numeroDoCartao(cartoes, 'Não configuradas')).toBe('2')
    expect(numeroDoCartao(cartoes, 'Último teste')).toBe(dataCurta('2026-11-12T16:00:00Z'))
    expect(indicadoresDeIntegracoes).toHaveBeenCalledWith({ consultoriaId: 'c1' })
  })

  it('nunca testada: "Nenhum"; o filtro Conectadas/Não conectadas não muda os cartões; Testar recarrega', async () => {
    vi.mocked(indicadoresDeIntegracoes).mockResolvedValue({ conectadas: 0, com_erro: 0, nao_configuradas: 3, ultimo_teste: null })
    renderizarTela(<Integracoes />, { perfil: admin })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores das integrações')
    await vi.waitFor(() => expect(numeroDoCartao(cartoes, 'Último teste')).toBe('Nenhum'))
    await userEvent.click(screen.getByRole('button', { name: 'Conectadas' }))
    expect(indicadoresDeIntegracoes).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Todas' }))
    await userEvent.click(within(await screen.findByRole('row', { name: /E-mail/ })).getByRole('button', { name: 'Testar' }))
    await vi.waitFor(() => expect(indicadoresDeIntegracoes).toHaveBeenCalledTimes(2))
  })

  it('o dono vê os números de todas antes de escolher, e os da consultoria escolhida depois', async () => {
    renderizarTela(<Integracoes />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
    await cartoesAbaixoDaBarra('Indicadores das integrações')
    expect(indicadoresDeIntegracoes).toHaveBeenLastCalledWith({ consultoriaId: undefined })
    await escolherNoSeletor(userEvent, 'Consultoria', 'Acme')
    await vi.waitFor(() => expect(indicadoresDeIntegracoes).toHaveBeenLastCalledWith({ consultoriaId: 'c1' }))
  })
})
