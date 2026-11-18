import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  desconectarIntegracao,
  iniciarGoogle,
  listarIntegracoes,
  salvarIntegracao,
  testarIntegracao,
  testarRascunho,
} from '@/data/integracoes'
import { indicadoresDeIntegracoes } from '@/data/indicadores'
import { escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import Integracoes from './Integracoes'

vi.mock('@/data/integracoes', () => ({
  listarIntegracoes: vi.fn(), salvarIntegracao: vi.fn(), testarIntegracao: vi.fn(), testarRascunho: vi.fn(),
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
  vi.mocked(testarRascunho).mockResolvedValue({ erro: null, mensagem: 'E-mail de teste enviado para a1@acme.test.' })
  vi.mocked(desconectarIntegracao).mockResolvedValue({ erro: null })
  vi.mocked(indicadoresDeIntegracoes).mockResolvedValue({ conectadas: 1, com_erro: 0, nao_configuradas: 2, ultimo_teste: '2026-11-12T16:00:00Z' })
})

describe('Integrações', () => {
  it('lista IA, e-mail, Google, Slack e WhatsApp numa tabela, com a situação de cada uma', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    const tabela = await screen.findByRole('table', { name: 'Integrações' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(6)
    expect(within(linha('Slack')).getByText('Não conectada')).toBeInTheDocument()
    expect(within(linha('WhatsApp')).getByText('Não conectada')).toBeInTheDocument()
    expect(within(linha('E-mail')).getByText('Conectada')).toBeInTheDocument()
    expect(within(linha('E-mail')).getByText(/smtp\.acme\.test:587/)).toBeInTheDocument()
    expect(within(linha('Inteligência artificial')).getByText('Não conectada')).toBeInTheDocument()
    expect(listarIntegracoes).toHaveBeenCalledWith({ consultoriaId: 'c1' })
  })

  it('o subtítulo diz que a conexão é da consultoria (auditoria, R9)', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    expect(await screen.findByText('Conexões que o sistema usa. Cada consultoria conecta as suas; todos da consultoria usam a mesma conexão.')).toBeInTheDocument()
  })

  it('a barra começa com Filtros e o filtro Conectadas/Não conectadas recorta a tabela', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    expect(await screen.findByText('Filtros')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Conectadas' }))
    const tabela = screen.getByRole('table', { name: 'Integrações' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Não conectadas' }))
    expect(within(screen.getByRole('table', { name: 'Integrações' })).getAllByRole('row')).toHaveLength(5)
  })

  it('Editar abre o formulário do e-mail preenchido; a senha vem em branco e em branco fica a guardada', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /E-mail/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: /E-mail \(SMTP\)/ })
    expect(within(janela).getByLabelText('Servidor')).toHaveValue('smtp.acme.test')
    expect(within(janela).getByLabelText('Porta')).toHaveValue('587')
    expect(within(janela).getByLabelText('Senha')).toHaveValue('')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(salvarIntegracao).toHaveBeenCalledWith('smtp', expect.objectContaining({ host: 'smtp.acme.test', porta: 587 }), null)
  })

  it('porta fora do intervalo (70000) avisa e não grava 65535 no lugar', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /E-mail/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: /E-mail \(SMTP\)/ })
    const porta = within(janela).getByLabelText('Porta')
    await userEvent.clear(porta)
    await userEvent.type(porta, '70000')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    // O erro fica embaixo do campo (usabilidade, U2).
    expect(porta).toHaveAccessibleDescription('Informe uma porta válida.')
    expect(porta).toHaveValue('70000')
    expect(salvarIntegracao).not.toHaveBeenCalled()
  })

  it('Conectar a IA pede a chave e sugere o Claude Opus 5.5', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /Inteligência artificial/ })).getByRole('button', { name: 'Conectar' }))
    const janela = screen.getByRole('dialog', { name: /Inteligência artificial/ })
    expect(within(janela).getByLabelText('Modelo')).toHaveValue('claude-opus-5-5')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(within(janela).getByLabelText('Chave de API')).toHaveAccessibleDescription('Informe a chave de API.')
    await userEvent.type(within(janela).getByLabelText('Chave de API'), 'sk-ant-123')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
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

describe('Integrações: Testar dentro da janela (antes de salvar)', () => {
  const SLACK = {
    id: 'i2', consultoria_id: 'c1', tipo: 'slack', situacao: 'conectada', ultimo_erro: null, ultimo_teste_em: '2026-11-17T12:00:00Z',
    config: { canal: '#geral', workspace: 'Acme', bot: 'ixc-consult' },
  }
  const WHATSAPP = {
    id: 'i3', consultoria_id: 'c1', tipo: 'whatsapp', situacao: 'conectada', ultimo_erro: null, ultimo_teste_em: '2026-11-17T12:00:00Z',
    config: { phone_number_id: '1234567890123', waba_id: '9876543210', numero: '+55 11 4000-0000', nome_verificado: 'Acme Ltda' },
  }
  const abrir = async (nomeDaLinha, botao) =>
    userEvent.click(within(await screen.findByRole('row', { name: new RegExp(nomeDaLinha) })).getByRole('button', { name: botao }))

  it('rodapé: Cancelar, Testar e Salvar; Testar mostra "Testando…", testa o que foi digitado e não salva', async () => {
    let terminar
    vi.mocked(testarRascunho).mockReturnValue(new Promise((r) => { terminar = r }))
    renderizarTela(<Integracoes />, { perfil: admin })
    await abrir('E-mail', 'Editar')
    const janela = screen.getByRole('dialog', { name: /E-mail \(SMTP\)/ })
    const rodape = janela.querySelector('[data-slot="janela-rodape"]')
    expect(within(rodape).getAllByRole('button').map((b) => b.textContent.trim())).toEqual(['Cancelar', 'Testar', 'Salvar'])
    await userEvent.clear(within(janela).getByLabelText('Servidor'))
    await userEvent.type(within(janela).getByLabelText('Servidor'), 'smtp.novo.test')
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(within(janela).getByRole('button', { name: 'Testando…' })).toBeDisabled()
    expect(within(janela).getByRole('button', { name: 'Salvar' })).toBeDisabled()
    expect(testarRascunho).toHaveBeenCalledWith('smtp', expect.objectContaining({ host: 'smtp.novo.test', porta: 587 }), null, {})
    terminar({ erro: null, mensagem: 'E-mail de teste enviado para a1@acme.test.' })
    expect(await within(janela).findByRole('status')).toHaveTextContent('E-mail de teste enviado para a1@acme.test.')
    expect(within(janela).getByRole('button', { name: 'Testar' })).toBeEnabled()
    expect(salvarIntegracao).not.toHaveBeenCalled()
  })

  it('o teste que falha mostra o erro na janela; dado inválido nem chega a testar', async () => {
    vi.mocked(testarRascunho).mockResolvedValue({ erro: 'O servidor recusou o usuário ou a senha.', mensagem: null })
    renderizarTela(<Integracoes />, { perfil: admin })
    await abrir('E-mail', 'Editar')
    const janela = screen.getByRole('dialog', { name: /E-mail \(SMTP\)/ })
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(await within(janela).findByRole('alert')).toHaveTextContent('O servidor recusou o usuário ou a senha.')
    await userEvent.clear(within(janela).getByLabelText('Servidor'))
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(within(janela).getByLabelText('Servidor')).toHaveAccessibleDescription('Informe o servidor.')
    expect(within(janela).queryByRole('alert')).toBeNull()
    expect(testarRascunho).toHaveBeenCalledTimes(1)
  })

  it('falha da rede no Testar: o aviso aparece na janela e o botão volta', async () => {
    vi.mocked(testarRascunho).mockRejectedValue(new TypeError('Failed to fetch'))
    renderizarTela(<Integracoes />, { perfil: admin })
    await abrir('E-mail', 'Editar')
    const janela = screen.getByRole('dialog', { name: /E-mail \(SMTP\)/ })
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Não foi possível testar agora. Confira a conexão e tente de novo.')
    expect(within(janela).getByRole('button', { name: 'Testar' })).toBeEnabled()
    expect(within(janela).getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })

  it('falha da rede no Salvar: o aviso aparece e a janela não fica presa em "Salvando…"', async () => {
    vi.mocked(salvarIntegracao).mockRejectedValue(new TypeError('Failed to fetch'))
    renderizarTela(<Integracoes />, { perfil: admin })
    await abrir('E-mail', 'Editar')
    const janela = screen.getByRole('dialog', { name: /E-mail \(SMTP\)/ })
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Não foi possível salvar agora. Confira a conexão e tente de novo.')
    expect(within(janela).getByRole('button', { name: 'Salvar' })).toBeEnabled()
    expect(within(janela).queryByRole('button', { name: 'Salvando…' })).not.toBeInTheDocument()
  })

  it('o resultado do teste some quando qualquer campo muda (de digitar ou de escolher)', async () => {
    vi.mocked(testarRascunho).mockResolvedValue({ erro: null, mensagem: 'A Anthropic respondeu usando o modelo claude-opus-5-5.' })
    renderizarTela(<Integracoes />, { perfil: admin })
    await abrir('Inteligência artificial', 'Conectar')
    const janela = screen.getByRole('dialog', { name: /Inteligência artificial/ })
    await userEvent.type(within(janela).getByLabelText('Chave de API'), 'sk-ant-123')
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(await within(janela).findByRole('status')).toBeInTheDocument()
    await userEvent.type(within(janela).getByLabelText('Modelo'), 'x')
    expect(within(janela).queryByRole('status')).not.toBeInTheDocument()
    await userEvent.clear(within(janela).getByLabelText('Modelo'))
    await userEvent.type(within(janela).getByLabelText('Modelo'), 'claude-opus-5-5')
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(await within(janela).findByRole('status')).toBeInTheDocument()
    await escolherNoSeletor(userEvent, 'Provedor', 'OpenAI')
    expect(within(janela).queryByRole('status')).not.toBeInTheDocument()
  })

  it('IA: Testar pergunta ao modelo digitado com a chave digitada', async () => {
    vi.mocked(testarRascunho).mockResolvedValue({ erro: null, mensagem: 'A Anthropic respondeu usando o modelo claude-opus-5-5.' })
    renderizarTela(<Integracoes />, { perfil: admin })
    await abrir('Inteligência artificial', 'Conectar')
    const janela = screen.getByRole('dialog', { name: /Inteligência artificial/ })
    await userEvent.type(within(janela).getByLabelText('Chave de API'), 'sk-ant-123')
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(testarRascunho).toHaveBeenCalledWith('ia', { provedor: 'anthropic', modelo: 'claude-opus-5-5' }, 'sk-ant-123', {})
    expect(await within(janela).findByRole('status')).toHaveTextContent('A Anthropic respondeu usando o modelo claude-opus-5-5.')
  })

  it('Slack: token de bot e canal opcional; Testar manda a mensagem no canal e Salvar grava sem o resultado do teste', async () => {
    vi.mocked(testarRascunho).mockResolvedValue({ erro: null, mensagem: 'Conectado ao workspace Acme como ixc-consult. Mensagem de teste enviada em #geral.' })
    renderizarTela(<Integracoes />, { perfil: admin })
    await abrir('Slack', 'Conectar')
    const janela = screen.getByRole('dialog', { name: /Slack/ })
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(within(janela).getByLabelText('Token do bot')).toHaveAccessibleDescription(/Informe o token do bot\./)
    await userEvent.type(within(janela).getByLabelText('Token do bot'), 'xoxp-token-de-usuario')
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(within(janela).getByLabelText('Token do bot')).toHaveAccessibleDescription(/Use o token de bot do Slack \(começa com xoxb-\)\./)
    await userEvent.clear(within(janela).getByLabelText('Token do bot'))
    await userEvent.type(within(janela).getByLabelText('Token do bot'), 'xoxb-1-abc')
    await userEvent.type(within(janela).getByLabelText(/Canal para o teste/), '#geral')
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(testarRascunho).toHaveBeenCalledWith('slack', { canal: '#geral' }, 'xoxb-1-abc', {})
    expect(await within(janela).findByRole('status')).toHaveTextContent('Mensagem de teste enviada em #geral.')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(salvarIntegracao).toHaveBeenCalledWith('slack', { canal: '#geral' }, 'xoxb-1-abc')
  })

  it('WhatsApp: IDs e token; o número do teste só vai no Testar e não é salvo', async () => {
    vi.mocked(testarRascunho).mockResolvedValue({ erro: null, mensagem: 'Conectado ao número +55 11 4000-0000 (Acme Ltda).' })
    renderizarTela(<Integracoes />, { perfil: admin })
    await abrir('WhatsApp', 'Conectar')
    const janela = screen.getByRole('dialog', { name: /WhatsApp/ })
    await userEvent.type(within(janela).getByLabelText('ID do número de telefone'), '1234567890123')
    await userEvent.type(within(janela).getByLabelText('ID da conta do WhatsApp Business'), '9876543210')
    await userEvent.type(within(janela).getByLabelText('Token de acesso'), 'EAAG-token')
    await userEvent.type(within(janela).getByLabelText(/Número para o teste/), '11999998888')
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(within(janela).getByLabelText(/Número para o teste/)).toHaveAccessibleDescription(/Informe o número do teste com \+ e o código do país/)
    await userEvent.clear(within(janela).getByLabelText(/Número para o teste/))
    await userEvent.type(within(janela).getByLabelText(/Número para o teste/), '+55 11 99999-8888')
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    const config = { phone_number_id: '1234567890123', waba_id: '9876543210' }
    expect(testarRascunho).toHaveBeenCalledWith('whatsapp', config, 'EAAG-token', { numero_teste: '+5511999998888' })
    expect(await within(janela).findByRole('status')).toHaveTextContent('Conectado ao número +55 11 4000-0000 (Acme Ltda).')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(salvarIntegracao).toHaveBeenCalledWith('whatsapp', config, 'EAAG-token')
  })

  it('Slack e WhatsApp conectados: a linha mostra workspace e canal, número e nome; Editar abre preenchido e Testar age na linha', async () => {
    vi.mocked(listarIntegracoes).mockResolvedValue([SMTP, SLACK, WHATSAPP])
    renderizarTela(<Integracoes />, { perfil: admin })
    await screen.findByRole('table', { name: 'Integrações' })
    expect(within(linha('Slack')).getByText('Workspace Acme · #geral')).toBeInTheDocument()
    expect(within(linha('WhatsApp')).getByText('+55 11 4000-0000 · Acme Ltda')).toBeInTheDocument()
    await abrir('Slack', 'Testar')
    expect(testarIntegracao).toHaveBeenCalledWith('i2')
    await abrir('WhatsApp', 'Editar')
    const janela = screen.getByRole('dialog', { name: /WhatsApp/ })
    expect(within(janela).getByLabelText('ID do número de telefone')).toHaveValue('1234567890123')
    expect(within(janela).getByLabelText('ID da conta do WhatsApp Business')).toHaveValue('9876543210')
    expect(within(janela).getByLabelText('Token de acesso')).toHaveValue('')
    await userEvent.click(within(janela).getByRole('button', { name: 'Testar' }))
    expect(testarRascunho).toHaveBeenCalledWith('whatsapp', { phone_number_id: '1234567890123', waba_id: '9876543210' }, null, {})
  })
})

describe('Integrações: cartões de números abaixo dos filtros', () => {
  const dia = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  it('Conectadas, Com erro, Não configuradas e Último teste (o mais recente), do banco', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores das integrações')
    await vi.waitFor(() => expect(numeroDoCartao(cartoes, 'Conectadas')).toBe('1'))
    expect(numeroDoCartao(cartoes, 'Com erro')).toBe('0')
    expect(numeroDoCartao(cartoes, 'Não configuradas')).toBe('2')
    expect(numeroDoCartao(cartoes, 'Último teste')).toBe(dia('2026-11-12T16:00:00Z'))
    expect(within(cartoes).getByText(`às ${hora('2026-11-12T16:00:00Z')}`)).toBeInTheDocument()
    expect(indicadoresDeIntegracoes).toHaveBeenCalledWith({ consultoriaId: 'c1' })
  })

  it('no celular (360 px) o ícone vai para cima do número, para "Nenhum" e a data caberem', async () => {
    renderizarTela(<Integracoes />, { perfil: admin })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores das integrações')
    const ultimo = within(cartoes).getByText('Último teste').closest('[data-cartao]')
    expect(ultimo).toHaveClass('max-sm:flex-col', 'max-sm:items-start')
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
