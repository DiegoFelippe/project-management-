import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { contarClientesAtivos } from '@/data/clientes'
import { mudarCor, trocarFoto } from '@/data/imagens'
import { toast } from 'sonner'
import { apagarAusencia, definirCarga, listarAusencias, ocupacaoDasPessoas } from '@/data/capacidade'
import { buscarConsultorias, buscarConsultoriasAtivas } from '@/data/consultorias'
import { indicadoresDeUsuarios } from '@/data/indicadores'
import { atualizarMeuContato, buscarUsuario, criarAcesso, gerenciarAcesso, listarUsuarios, reenviarConvite } from '@/data/usuarios'
import { deslocarMes, mesAtual, rotuloCurto, rotuloDoMes } from '@/lib/mes'
import { escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import Usuarios from './Usuarios'

vi.mock('@/data/usuarios', () => ({
  listarUsuarios: vi.fn(), buscarUsuario: vi.fn(), criarAcesso: vi.fn(), gerenciarAcesso: vi.fn(), reenviarConvite: vi.fn(),
  atualizarMeuContato: vi.fn(),
}))
vi.mock('@/data/capacidade', () => ({
  definirCarga: vi.fn(), listarAusencias: vi.fn(), ocupacaoDasPessoas: vi.fn(), criarAusencia: vi.fn(), editarAusencia: vi.fn(), apagarAusencia: vi.fn(),
}))
vi.mock('@/data/clientes', () => ({ contarClientesAtivos: vi.fn() }))
vi.mock('@/data/consultorias', () => ({ buscarConsultorias: vi.fn(), buscarConsultoriasAtivas: vi.fn() }))
vi.mock('@/data/indicadores', () => ({ indicadoresDeUsuarios: vi.fn() }))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn().mockResolvedValue({ erro: null }), tirarFoto: vi.fn(), mudarCor: vi.fn().mockResolvedValue({ erro: null }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/data/times', () => ({
  listarOpcoesDeTimes: vi.fn().mockResolvedValue([]), adicionarMembro: vi.fn(), removerMembro: vi.fn(),
}))

// As ações raras da linha (Reenviar convite, Mover para a central, Desativar) ficam no "⋯" (revisão do lote B).
async function pelaReticencia(linha, nome) {
  await userEvent.click(within(linha).getByRole('button', { name: /^Mais ações de / }))
  await userEvent.click(await screen.findByRole('menuitem', { name: nome }))
}
async function itensDaReticencia(linha) {
  const botao = within(linha).queryByRole('button', { name: /^Mais ações de / })
  if (!botao) return []
  await userEvent.click(botao)
  const itens = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
  await userEvent.keyboard('{Escape}')
  return itens
}

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(contarClientesAtivos).mockResolvedValue(0)
  // O filtro da lista mostra todas; o seletor da ficha busca no banco só as ativas.
  vi.mocked(buscarConsultorias).mockResolvedValue({ itens: [{ id: 'k1', nome: 'Acme' }, { id: 'k2', nome: 'Velha Arquivada' }], total: 2 })
  vi.mocked(buscarConsultoriasAtivas).mockResolvedValue({ itens: [{ id: 'k1', nome: 'Acme' }], total: 1 })
  vi.mocked(listarAusencias).mockResolvedValue({ itens: [], total: 0 })
  vi.mocked(ocupacaoDasPessoas).mockResolvedValue({})
  vi.mocked(indicadoresDeUsuarios).mockResolvedValue({ mes: mesAtual(), passado: false, pessoas_ativas: 6, ocupacao_media: 0.6234, acima_de_100: 1, sem_tipo: 3 })
  vi.mocked(listarUsuarios).mockResolvedValue({
    itens: [
      {
        id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1',
        cargo: 'Analista', telefone: '(11) 98888-1111', cidade: 'Santos', uf: 'SP', data_entrada: '2026-01-10', carga_semanal: 40,
        tipos_de_consultoria: ['gestao', 'assessoria_juridica'],
      },
      { id: 'p2', nome: 'Bruno', email: 'bruno@x.test', papel: 'gestor', ativo: true, times: [], consultoria_id: 'c1', carga_semanal: 44 },
    ],
    total: 2,
  })
})

describe('Usuários', () => {
  it('lista as pessoas numa tabela, com Cargo e Telefone, e Editar abre a ficha da pessoa escolhida', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    const tabela = await screen.findByRole('table', { name: 'Usuários' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(3)
    expect(within(tabela).getByRole('columnheader', { name: 'Cargo' })).toBeInTheDocument()
    expect(within(tabela).getByRole('columnheader', { name: 'Telefone' })).toBeInTheDocument()
    const ana = within(tabela).getByRole('row', { name: /Ana/ })
    expect(within(ana).getByText('Analista')).toBeInTheDocument()
    expect(within(ana).getByText('(11) 98888-1111')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('row', { name: /Bruno/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Ficha de Bruno' })
    expect(within(janela).getByLabelText('Nome')).toHaveValue('Bruno')
    expect(within(janela).getByLabelText('E-mail')).toHaveValue('bruno@x.test')
  })

  it('tem a coluna "Tipo de consultoria" com os rótulos e "—" para quem não tem', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    const tabela = await screen.findByRole('table', { name: 'Usuários' })
    expect(within(tabela).getByRole('columnheader', { name: 'Tipo de consultoria' })).toBeInTheDocument()
    const ana = within(tabela).getByRole('row', { name: /Ana/ })
    expect(within(ana).getByText('Gestão')).toBeInTheDocument()
    expect(within(ana).getByText('Assessoria Jurídica')).toBeInTheDocument()
    expect(within(within(tabela).getByRole('row', { name: /Bruno/ })).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('filtro Tipo: pede ao banco só quem tem o tipo e volta para a página 1', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1' }], total: 40,
    })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(await screen.findByRole('button', { name: 'Próxima' }))
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 2 }))
    await escolherNoSeletor(userEvent, 'Tipo', 'Sucesso do Cliente')
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 1, tipo: 'sucesso_do_cliente' }))
    await escolherNoSeletor(userEvent, 'Tipo', 'Todos')
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 1, tipo: undefined }))
  })

  it('Editar abre a ficha com cargo, telefone, cidade, UF, data de entrada e carga da linha', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Ficha de Ana' })
    expect(within(janela).getByLabelText('Cargo')).toHaveValue('Analista')
    expect(within(janela).getByLabelText('Telefone')).toHaveValue('(11) 98888-1111')
    expect(within(janela).getByLabelText('Cidade')).toHaveValue('Santos')
    expect(within(janela).getByLabelText('UF')).toHaveTextContent('SP')
    expect(within(janela).getByLabelText('Data de entrada')).toHaveTextContent('10 de jan de 2026')
    expect(within(janela).getByLabelText('Carga semanal (horas)')).toHaveValue('40')
  })

  it('salvar chama gerenciarAcesso uma vez só com o que mudou, e definirCarga só se a carga mudou', async () => {
    vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null })
    vi.mocked(definirCarga).mockResolvedValue({ erro: null })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    await userEvent.clear(screen.getByLabelText('Telefone'))
    await userEvent.type(screen.getByLabelText('Telefone'), '(11) 90000-0000')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(gerenciarAcesso).toHaveBeenCalledTimes(1)
    expect(gerenciarAcesso).toHaveBeenCalledWith('editar', 'p1', { telefone: '(11) 90000-0000' })
    expect(definirCarga).not.toHaveBeenCalled()
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '32,5')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(gerenciarAcesso).toHaveBeenCalledTimes(1)
    expect(definirCarga).toHaveBeenCalledWith('p1', 32.5)
  })

  it('mostra o primeiro erro ao salvar e mantém a ficha aberta', async () => {
    vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: 'Você não tem permissão para isso.' })
    vi.mocked(definirCarga).mockResolvedValue({ erro: null })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    await userEvent.type(screen.getByLabelText('Cargo'), ' sênior')
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '30')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Você não tem permissão para isso.')).toBeInTheDocument()
    expect(definirCarga).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Ficha de Ana' })).toBeInTheDocument()
  })

  it('gestor edita uma pessoa da consultoria e vê a Capacidade; a ficha tem Reenviar convite e Desativar só para quem pode', async () => {
    vi.mocked(reenviarConvite).mockResolvedValue({ erro: null })
    vi.mocked(listarUsuarios).mockResolvedValue({
      itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, convite_pendente: true, times: [], consultoria_id: 'c1' }],
      total: 1,
    })
    renderizarTela(<Usuarios />, { perfil: { id: 'g1', papel: 'gestor', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Ficha de Ana' })
    expect(within(janela).getByRole('heading', { name: 'Capacidade' })).toBeInTheDocument()
    expect(within(janela).queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('tab', { name: 'Acesso' }))
    await userEvent.click(within(janela).getByRole('button', { name: /Reenviar convite/ }))
    expect(reenviarConvite).toHaveBeenCalledWith('p1')
  })

  it('Desativar pela ficha pede confirmação e fecha a ficha', async () => {
    vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Ficha de Ana' })).getByRole('button', { name: /Desativar/ }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desativar' }))
    expect(gerenciarAcesso).toHaveBeenCalledWith('desativar', 'p1')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ficha de Ana' })).not.toBeInTheDocument())
  })

  describe('verificação em duas etapas', () => {
    const comApp = () => vi.mocked(listarUsuarios).mockResolvedValue({
      itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1',
        exige_2fa: true, verificacao_desde: '2026-11-10T15:00:00Z' }],
      total: 1,
    })

    it('Zerar pela ficha pede confirmação (botão de perigo), diz o que acontece e chama zerar_2fa', async () => {
      comApp()
      vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null })
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
      const ficha = screen.getByRole('dialog', { name: 'Ficha de Ana' })
      await userEvent.click(within(ficha).getByRole('tab', { name: 'Acesso' }))
      await userEvent.click(within(ficha).getByRole('button', { name: /Zerar verificação em duas etapas/ }))
      const confirmar = await screen.findByRole('alertdialog')
      expect(confirmar).toHaveTextContent('Zerar a verificação em duas etapas de Ana?')
      expect(confirmar).toHaveTextContent(/sai de todos os aparelhos/)
      expect(confirmar).toHaveTextContent(/no próximo acesso.*configura o app de novo/)
      expect(confirmar).not.toHaveTextContent(/ainda não foi salva/)
      const botao = within(confirmar).getByRole('button', { name: 'Zerar' })
      expect(botao).toHaveClass('bg-destructive-cheio')
      await userEvent.click(botao)
      expect(gerenciarAcesso).toHaveBeenCalledWith('zerar_2fa', 'p1')
      expect(toast.success).toHaveBeenCalledWith('Verificação em duas etapas de Ana zerada.')
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      // A ficha continua aberta e já mostra a situação nova.
      expect(within(screen.getByRole('dialog', { name: 'Ficha de Ana' })).getByText('Ainda não configurada')).toBeInTheDocument()
      expect(contarClientesAtivos).not.toHaveBeenCalled()
    })

    it('a confirmação do Zerar segue a chave Exigir como está na ficha, mesmo sem salvar', async () => {
      vi.mocked(listarUsuarios).mockResolvedValue({
        itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1',
          exige_2fa: false, verificacao_desde: '2026-11-10T15:00:00Z' }],
        total: 1,
      })
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
      const ficha = screen.getByRole('dialog', { name: 'Ficha de Ana' })
      await userEvent.click(within(ficha).getByRole('tab', { name: 'Acesso' }))
      await userEvent.click(within(ficha).getByRole('button', { name: /Zerar verificação em duas etapas/ }))
      let confirmar = await screen.findByRole('alertdialog')
      expect(confirmar).toHaveTextContent(/sai de todos os aparelhos/)
      expect(confirmar).toHaveTextContent(/volta a entrar só com a senha/)
      await userEvent.click(within(confirmar).getByRole('button', { name: 'Cancelar' }))

      await userEvent.click(within(ficha).getByRole('switch', { name: /Exigir verificação em duas etapas/ }))
      await userEvent.click(within(ficha).getByRole('button', { name: /Zerar verificação em duas etapas/ }))
      confirmar = await screen.findByRole('alertdialog')
      expect(confirmar).toHaveTextContent(/no próximo acesso.*configura o app de novo/)
      expect(confirmar).toHaveTextContent(/ainda não foi salva/)
    })

    it('a chave Exigir vai junto no salvar da ficha', async () => {
      vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null })
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
      await userEvent.click(screen.getByRole('tab', { name: 'Acesso' }))
      await userEvent.click(screen.getByRole('switch', { name: /Exigir verificação em duas etapas/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
      expect(gerenciarAcesso).toHaveBeenCalledWith('editar', 'p1', { exige_2fa: true })
    })
  })

  it('Novo acesso manda os campos da ficha e grava a carga depois de criar', async () => {
    vi.mocked(criarAcesso).mockResolvedValue({ pessoaId: 'p9' })
    vi.mocked(definirCarga).mockResolvedValue({ erro: null })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(await screen.findByRole('button', { name: /Novo acesso/ }))
    const janela = screen.getByRole('dialog', { name: 'Nova pessoa' })
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Rita Alves')
    await userEvent.type(within(janela).getByLabelText('E-mail'), 'rita@x.test')
    await userEvent.type(within(janela).getByLabelText('Cargo'), 'Analista')
    await escolherNoSeletor(userEvent, 'UF', 'MG')
    await userEvent.clear(within(janela).getByLabelText('Carga semanal (horas)'))
    await userEvent.type(within(janela).getByLabelText('Carga semanal (horas)'), '30')
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar convite' }))
    expect(criarAcesso).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Rita Alves', cargo: 'Analista', uf: 'MG', papel: 'pessoa' }))
    await waitFor(() => expect(definirCarga).toHaveBeenCalledWith('p9', 30))
  })

  it('Novo acesso com a carga padrão não chama definirCarga', async () => {
    vi.mocked(criarAcesso).mockResolvedValue({ pessoaId: 'p9' })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(await screen.findByRole('button', { name: /Novo acesso/ }))
    const janela = screen.getByRole('dialog', { name: 'Nova pessoa' })
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Rita Alves')
    await userEvent.type(within(janela).getByLabelText('E-mail'), 'rita@x.test')
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar convite' }))
    await waitFor(() => expect(criarAcesso).toHaveBeenCalled())
    expect(definirCarga).not.toHaveBeenCalled()
  })

  async function abrirNovoEPreencher() {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(await screen.findByRole('button', { name: /Novo acesso/ }))
    const janela = screen.getByRole('dialog', { name: 'Nova pessoa' })
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Rita Alves')
    await userEvent.type(within(janela).getByLabelText('E-mail'), 'rita@x.test')
    return janela
  }

  it('foto e cor escolhidas no Novo são enviadas depois de criar, na pasta do id novo', async () => {
    vi.mocked(criarAcesso).mockResolvedValue({ pessoaId: 'p9' })
    const janela = await abrirNovoEPreencher()
    const arquivo = new File(['x'], 'rita.png', { type: 'image/png' })
    await userEvent.upload(within(janela).getByLabelText('Escolher foto'), arquivo)
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar convite' }))
    await waitFor(() => expect(trocarFoto).toHaveBeenCalledWith('p9', arquivo, null))
    expect(vi.mocked(criarAcesso).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(trocarFoto).mock.invocationCallOrder[0])
    expect(mudarCor).not.toHaveBeenCalled()
  })

  it('a cor escolhida no Novo é gravada depois de criar', async () => {
    vi.mocked(criarAcesso).mockResolvedValue({ pessoaId: 'p9' })
    const janela = await abrirNovoEPreencher()
    await userEvent.click(within(janela).getByRole('radio', { name: 'Verde' }))
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar convite' }))
    await waitFor(() => expect(mudarCor).toHaveBeenCalledWith('p9', '#16a34a'))
    expect(trocarFoto).not.toHaveBeenCalled()
  })

  it('se a foto falhar, a pessoa continua criada e a tela avisa', async () => {
    vi.mocked(criarAcesso).mockResolvedValue({ pessoaId: 'p9' })
    vi.mocked(trocarFoto).mockResolvedValueOnce({ erro: 'Não foi possível enviar a imagem. Tente de novo.' })
    const janela = await abrirNovoEPreencher()
    await userEvent.upload(within(janela).getByLabelText('Escolher foto'), new File(['x'], 'rita.png', { type: 'image/png' }))
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar convite' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Pessoa criada, mas a foto não foi enviada: Não foi possível enviar a imagem. Tente de novo.'))
    expect(toast.success).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova pessoa' })).not.toBeInTheDocument())
  })

  it('Automática no Editar grava null (limpa a cor)', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1', cor: '#16a34a' }], total: 1,
    })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Automática' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(mudarCor).toHaveBeenCalledWith('p1', null))
  })

  it('a cor escolhida no Editar é gravada junto', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Rosa' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(mudarCor).toHaveBeenCalledWith('p1', '#db2777'))
    expect(gerenciarAcesso).not.toHaveBeenCalled()
  })

  it('na própria linha, Editar abre o Meu perfil (a ficha no modo próprio) e salvar grava só o que a pessoa pode', async () => {
    vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null })
    vi.mocked(atualizarMeuContato).mockResolvedValue({ erro: null })
    const eu = {
      id: 'a1', nome: 'Eu Admin', email: 'eu@x.test', papel: 'admin', ativo: true, times: [], consultoria_id: 'c1',
      consultoria: { nome: 'Acme' }, cargo: 'Diretor', telefone: '(11) 90000-0000', carga_semanal: 40,
    }
    vi.mocked(listarUsuarios).mockResolvedValue({ itens: [eu], total: 1 })
    renderizarTela(<Usuarios />, { perfil: eu })
    const linha = await screen.findByRole('row', { name: /Eu Admin/ })
    expect(within(linha).queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
    await userEvent.click(within(linha).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Meu perfil' })
    expect(within(janela).getByLabelText('Cargo')).toBeDisabled()
    expect(within(janela).getByLabelText('Papel')).toBeDisabled()
    expect(within(janela).queryByLabelText('Carga semanal (horas)')).not.toBeInTheDocument()
    expect(within(janela).queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
    const chamadas = vi.mocked(listarUsuarios).mock.calls.length
    await userEvent.clear(within(janela).getByLabelText('Nome'))
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Eu Mesmo')
    await userEvent.type(within(janela).getByLabelText('Telefone'), '{Backspace}1')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(gerenciarAcesso).toHaveBeenCalledWith('editar', 'a1', { nome: 'Eu Mesmo' }))
    expect(gerenciarAcesso).toHaveBeenCalledTimes(1)
    expect(atualizarMeuContato).toHaveBeenCalledWith({ telefone: '(11) 90000-0001', cidade: '', uf: '' })
    expect(definirCarga).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Meu perfil' })).not.toBeInTheDocument())
    await waitFor(() => expect(vi.mocked(listarUsuarios).mock.calls.length).toBeGreaterThan(chamadas))
  })

  it('a foto escolhida no Editar vai para o Storage', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    const arquivo = new File(['x'], 'ana.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(trocarFoto).toHaveBeenCalledWith('p1', arquivo, undefined)
    expect(gerenciarAcesso).not.toHaveBeenCalled()
  })

  it('pagina no banco acima de 15 pessoas, e o filtro volta para a página 1', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [] }],
      total: 40,
    })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    expect(await screen.findByText('1–15 de 40')).toBeInTheDocument()
    expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 1 })
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Desativados' }))
    expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: false, pagina: 1 })
  })

  it('a aba Desativados não tem barra do mês, nem as colunas do mês, nem chama ocupacaoDasPessoas', async () => {
    vi.mocked(listarUsuarios).mockImplementation(async ({ ativos }) => ({
      itens: [{ id: 'p1', nome: ativos ? 'Ana' : 'Dora', email: 'x@x.test', papel: 'pessoa', ativo: ativos, times: [], consultoria_id: 'c1' }], total: 1,
    }))
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await screen.findByRole('row', { name: /Ana/ })
    expect(screen.getByRole('group', { name: 'Mês' })).toBeInTheDocument()
    await waitFor(() => expect(ocupacaoDasPessoas).toHaveBeenCalled())
    vi.mocked(ocupacaoDasPessoas).mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Desativados' }))
    const tabela = await screen.findByRole('table', { name: 'Usuários' })
    await within(tabela).findByRole('row', { name: /Dora/ })
    expect(screen.queryByRole('group', { name: 'Mês' })).toBeNull()
    for (const nome of ['Capacidade', 'Reservado', 'Realizado', 'Ocupação', 'Utilização', 'Situação']) {
      expect(within(tabela).queryByRole('columnheader', { name: nome })).toBeNull()
    }
    expect(ocupacaoDasPessoas).not.toHaveBeenCalled()
  })

  describe('o que acontece com os clientes', () => {
    const admin = { id: 'a1', papel: 'admin', consultoria_id: 'c1' }
    beforeEach(() => vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null }))

    it('Desativar diz quantos clientes da pessoa voltam para Aguardando consultor', async () => {
      vi.mocked(contarClientesAtivos).mockResolvedValue(4)
      renderizarTela(<Usuarios />, { perfil: admin })
      await pelaReticencia(await screen.findByRole('row', { name: /Ana/ }), 'Desativar')
      const janela = screen.getByRole('alertdialog')
      expect(await within(janela).findByText(/4 clientes dela voltam para Aguardando consultor\./)).toBeInTheDocument()
      expect(contarClientesAtivos).toHaveBeenCalledWith({ consultorId: 'p1' })
      await userEvent.click(within(janela).getByRole('button', { name: 'Desativar' }))
      expect(gerenciarAcesso).toHaveBeenCalledWith('desativar', 'p1')
    })

    it('Desativar com 1 cliente fala no singular', async () => {
      vi.mocked(contarClientesAtivos).mockResolvedValue(1)
      renderizarTela(<Usuarios />, { perfil: admin })
      await pelaReticencia(await screen.findByRole('row', { name: /Ana/ }), 'Desativar')
      expect(await screen.findByText(/1 cliente dela volta para Aguardando consultor\./)).toBeInTheDocument()
    })

    it('Reativar não promete devolver os clientes', async () => {
      vi.mocked(listarUsuarios).mockResolvedValue({
        itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: false, times: [] }], total: 1,
      })
      renderizarTela(<Usuarios />, { perfil: admin })
      await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Reativar' }))
      const janela = screen.getByRole('alertdialog')
      expect(janela).not.toHaveTextContent(/do jeito que estava antes/)
      expect(janela).toHaveTextContent(/Os clientes que eram dela não voltam/)
      expect(contarClientesAtivos).not.toHaveBeenCalled()
    })

    it('Mover para a central diz quantos clientes voltam para Aguardando consultor', async () => {
      vi.mocked(contarClientesAtivos).mockResolvedValue(2)
      vi.mocked(listarUsuarios).mockResolvedValue({
        itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'admin', ativo: true, times: [], consultoria: { nome: 'Acme' } }],
        total: 1,
      })
      renderizarTela(<Usuarios />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
      await pelaReticencia(await screen.findByRole('row', { name: /Ana/ }), 'Mover para a central')
      expect(await within(screen.getByRole('alertdialog')).findByText(/2 clientes dela voltam para Aguardando consultor\./))
        .toBeInTheDocument()
      expect(contarClientesAtivos).toHaveBeenCalledWith({ consultorId: 'p1' })
    })
  })

  describe('central e administrador geral', () => {
    const LINHAS = {
      itens: [
        { id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'admin', ativo: true, times: [], consultoria: { nome: 'Acme' } },
        { id: 'p2', nome: 'Cida', email: 'cida@x.test', papel: 'central', ativo: true, times: [], consultoria: null },
      ],
      total: 2,
    }
    beforeEach(() => {
      vi.mocked(listarUsuarios).mockResolvedValue(LINHAS)
      vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null })
    })

    it('o dono move um administrador para a central, depois de confirmar', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
      await pelaReticencia(await screen.findByRole('row', { name: /Ana/ }), 'Mover para a central')
      const janela = screen.getByRole('alertdialog')
      expect(janela).toHaveTextContent(/sai da consultoria e dos times/)
      expect(gerenciarAcesso).not.toHaveBeenCalled()
      await userEvent.click(within(janela).getByRole('button', { name: 'Mover para a central' }))
      expect(gerenciarAcesso).toHaveBeenCalledWith('mover_para_central', 'p1')
    })

    it('o dono edita e desativa a pessoa da central, que mostra consultoria —', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
      const linha = await screen.findByRole('row', { name: /Cida/ })
      expect(within(linha).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
      // Cida é da central: não se move para a central de novo.
      expect(await itensDaReticencia(linha)).toEqual(['Desativar'])
      expect(await itensDaReticencia(screen.getByRole('row', { name: /Ana/ }))).toEqual(['Mover para a central', 'Desativar'])
    })

    it('na ficha do dono, o seletor de consultoria mostra só as ativas', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
      await userEvent.click(await screen.findByRole('button', { name: /Novo acesso/ }))
      const janela = screen.getByRole('dialog', { name: 'Nova pessoa' })
      await userEvent.click(within(janela).getByLabelText('Consultoria'))
      expect((await within(janela).findAllByRole('option')).map((o) => o.textContent)).toEqual(['Acme'])
      expect(buscarConsultoriasAtivas).toHaveBeenCalledWith('')
    })

    it('o filtro da lista do dono busca no banco e mostra todas, inclusive as arquivadas', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
      await userEvent.click(await screen.findByLabelText('Consultoria'))
      await waitFor(() => expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas', 'Acme', 'Velha Arquivada']))
      expect(buscarConsultorias).toHaveBeenCalledWith('')
      expect(buscarConsultoriasAtivas).not.toHaveBeenCalled()
    })

    it('a central só edita e desativa administradores, não move, e vê o filtro de consultoria', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'c9', papel: 'central', consultoria_id: null } })
      const ana = await screen.findByRole('row', { name: /Ana/ })
      expect(within(ana).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
      expect(await itensDaReticencia(ana)).toEqual(['Desativar'])
      const cida = screen.getByRole('row', { name: /Cida/ })
      expect(within(cida).queryByRole('button', { name: 'Editar' })).toBeNull()
      expect(await itensDaReticencia(cida)).toEqual([])
      expect(screen.getByLabelText('Consultoria')).toBeInTheDocument()
    })
  })

  describe('capacidade do mês', () => {
    const NUMEROS = { capacidade: 160, reservado: 80, realizado: 40.5, ocupacao: 0.5, clientes: 3 }

    it('mostra Ocupação (porcentagem e "R h de C h") e Realizado do mês, com "—" para quem o banco não devolveu', async () => {
      vi.mocked(ocupacaoDasPessoas).mockResolvedValue({ p1: NUMEROS })
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      const tabela = await screen.findByRole('table', { name: 'Usuários' })
      for (const nome of ['Ocupação', 'Realizado']) {
        expect(within(tabela).getByRole('columnheader', { name: nome })).toBeInTheDocument()
      }
      for (const nome of ['Capacidade', 'Reservado', 'Situação']) {
        expect(within(tabela).queryByRole('columnheader', { name: nome })).toBeNull()
      }
      const ana = within(tabela).getByRole('row', { name: /Ana/ })
      await waitFor(() => expect(within(ana).getByText('50%')).toBeInTheDocument())
      expect(within(ana).getByText('80 h de 160 h')).toBeInTheDocument()
      expect(within(ana).getByText('40,5 h')).toBeInTheDocument()
      const bruno = within(tabela).getByRole('row', { name: /Bruno/ })
      expect(within(bruno).queryByText(/160 h/)).toBeNull()
      expect(within(bruno).getAllByText('—').length).toBeGreaterThanOrEqual(2)
      expect(ocupacaoDasPessoas).toHaveBeenCalledTimes(1)
      expect(ocupacaoDasPessoas).toHaveBeenCalledWith({ ids: ['p1', 'p2'], mes: mesAtual() })
    })

    it('mudar o mês chama ocupacaoDasPessoas uma vez, com os ids da página e o mês novo, sem recarregar a lista', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      await screen.findByRole('row', { name: /Ana/ })
      await waitFor(() => expect(ocupacaoDasPessoas).toHaveBeenCalledTimes(1))
      const chamadasDaLista = vi.mocked(listarUsuarios).mock.calls.length
      await userEvent.click(screen.getByRole('button', { name: /Próximo/ }))
      await waitFor(() => expect(ocupacaoDasPessoas).toHaveBeenCalledTimes(2))
      expect(ocupacaoDasPessoas).toHaveBeenLastCalledWith({ ids: ['p1', 'p2'], mes: deslocarMes(mesAtual(), 1) })
      expect(screen.getByText(rotuloDoMes(deslocarMes(mesAtual(), 1)))).toBeInTheDocument()
      expect(listarUsuarios).toHaveBeenCalledTimes(chamadasDaLista)
    })

    it('em mês passado a Ocupação vira Utilização, com "realizado de capacidade" e sem reservado', async () => {
      vi.mocked(ocupacaoDasPessoas).mockResolvedValue({ p1: NUMEROS })
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      const tabela = await screen.findByRole('table', { name: 'Usuários' })
      expect(within(tabela).getByRole('columnheader', { name: 'Ocupação' })).toBeInTheDocument()
      expect(await within(within(tabela).getByRole('row', { name: /Ana/ })).findByText('80 h de 160 h')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
      await waitFor(() => expect(within(tabela).getByRole('columnheader', { name: 'Utilização' })).toBeInTheDocument())
      expect(within(tabela).queryByRole('columnheader', { name: 'Ocupação' })).toBeNull()
      expect(within(tabela).queryByRole('columnheader', { name: 'Reservado' })).toBeNull()
      const ana = within(tabela).getByRole('row', { name: /Ana/ })
      await waitFor(() => expect(within(ana).getByText('40,5 h de 160 h')).toBeInTheDocument())
      expect(within(ana).queryByText('80 h de 160 h')).toBeNull()
    })

    it('Situação vira etiqueta ao lado do nome só quando não é o estado normal, e Cargo e Telefone não cortam o texto', async () => {
      vi.mocked(listarUsuarios).mockResolvedValue({
        itens: [
          { id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1', cargo: 'Analista de projetos sênior', telefone: '(11) 98888-1111', convite_pendente: true },
          { id: 'p2', nome: 'Bruno', email: 'bruno@x.test', papel: 'gestor', ativo: true, times: [], consultoria_id: 'c1', precisa_trocar_senha: true },
          { id: 'p3', nome: 'Caio', email: 'caio@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1' },
        ],
        total: 3,
      })
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      const tabela = await screen.findByRole('table', { name: 'Usuários' })
      expect(within(tabela).queryByRole('columnheader', { name: 'Situação' })).toBeNull()
      const ana = within(tabela).getByRole('row', { name: /Ana/ })
      const etiqueta = within(ana).getByText('Convite pendente')
      expect(etiqueta.closest('td')).toBe(within(ana).getByText('Ana').closest('td'))
      expect(within(within(tabela).getByRole('row', { name: /Bruno/ })).getByText('Senha provisória')).toBeInTheDocument()
      expect(within(within(tabela).getByRole('row', { name: /Caio/ })).queryByText('Ativo')).toBeNull()
      for (const texto of ['Analista de projetos sênior', '(11) 98888-1111']) {
        expect(within(ana).getByText(texto).className).not.toMatch(/truncate/)
      }
    })

    it('as ações da linha são botões só com ícone, com nome acessível e title; as raras ficam no "⋯"', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      const ana = await screen.findByRole('row', { name: /Ana/ })
      for (const nome of ['Editar', 'Capacidade', 'Mais ações de Ana']) {
        const botao = within(ana).getByRole('button', { name: nome })
        expect(botao).toHaveAttribute('title', nome)
        expect(botao).toHaveTextContent('')
      }
      expect(within(ana).queryByRole('button', { name: 'Desativar' })).toBeNull()
      expect(await itensDaReticencia(ana)).toEqual(['Desativar'])
    })

    it('posições fixas: no máximo Editar, Capacidade e "⋯"; sem ação rara, o "⋯" guarda o lugar', async () => {
      const eu = { id: 'a1', nome: 'Eu Admin', email: 'eu@x.test', papel: 'admin', ativo: true, times: [], consultoria_id: 'c1' }
      vi.mocked(listarUsuarios).mockResolvedValue({ itens: [eu, { id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1' }], total: 2 })
      renderizarTela(<Usuarios />, { perfil: eu })
      const lugares = (nome) => [...screen.getByRole('row', { name: nome }).querySelector('td:last-child').children]
        .map((el) => el.getAttribute('aria-label') ?? (el.getAttribute('aria-hidden') && 'espaço'))
      await screen.findByRole('row', { name: /Ana/ })
      expect(lugares(/Ana/)).toEqual(['Editar', 'Capacidade', 'Mais ações de Ana'])
      expect(lugares(/Eu Admin/)).toEqual(['Editar', 'Capacidade', 'espaço'])
    })

    it('Reenviar convite pelo "⋯": o mesmo pedido de antes e o aviso', async () => {
      vi.mocked(reenviarConvite).mockResolvedValue({ erro: null })
      vi.mocked(listarUsuarios).mockResolvedValue({
        itens: [{ id: 'p3', nome: 'Caio', email: 'caio@x.test', papel: 'pessoa', ativo: true, times: [], convite_pendente: true }], total: 1,
      })
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      const caio = await screen.findByRole('row', { name: /Caio/ })
      expect(await itensDaReticencia(caio)).toEqual(['Reenviar convite', 'Desativar'])
      await pelaReticencia(caio, 'Reenviar convite')
      expect(reenviarConvite).toHaveBeenCalledWith('p3')
      expect(toast.success).toHaveBeenCalledWith('Convite reenviado para caio@x.test.')
    })

    it('a linha da central mostra "—" nos quatro números', async () => {
      vi.mocked(listarUsuarios).mockResolvedValue({
        itens: [{ id: 'c1', nome: 'Cida', email: 'cida@x.test', papel: 'central', ativo: true, times: [], consultoria: null }],
        total: 1,
      })
      renderizarTela(<Usuarios />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
      const cida = await screen.findByRole('row', { name: /Cida/ })
      await waitFor(() => expect(ocupacaoDasPessoas).toHaveBeenCalled())
      expect(within(cida).queryByText(/ h$/)).toBeNull()
      expect(within(cida).queryByText(/%$/)).toBeNull()
    })

    it('se a chamada falha, a lista continua com "—" e um aviso', async () => {
      vi.mocked(ocupacaoDasPessoas).mockRejectedValue(new Error('falhou'))
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      expect(await screen.findByText('Não foi possível carregar a capacidade do mês.')).toBeInTheDocument()
      expect(screen.getByRole('table', { name: 'Usuários' })).toBeInTheDocument()
      expect(screen.getByRole('row', { name: /Ana/ })).toBeInTheDocument()
    })
  })

  it('mexer nas ausências pela ficha busca os números do mês de novo', async () => {
    vi.mocked(listarAusencias).mockResolvedValue({ itens: [{ id: 'a1', perfil_id: 'p1', de: '2026-12-20', ate: '2027-01-05', motivo: 'Férias' }], total: 1 })
    vi.mocked(apagarAusencia).mockResolvedValue({ erro: null })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Ficha de Ana' })
    await userEvent.click(await within(janela).findByRole('button', { name: 'Apagar' }))
    const chamadas = vi.mocked(ocupacaoDasPessoas).mock.calls.length
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(apagarAusencia).toHaveBeenCalledWith('a1'))
    await waitFor(() => expect(ocupacaoDasPessoas.mock.calls.length).toBeGreaterThan(chamadas))
  })

  describe('?pessoa=<id>&mes=AAAA-MM-01 (vindo do painel do Início)', () => {
    const ana = { id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1', carga_semanal: 40 }
    it('gestor/admin: carrega a pessoa por id e abre a Capacidade dela, no mês pedido', async () => {
      vi.mocked(buscarUsuario).mockResolvedValue(ana)
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' }, endereco: '/usuarios?pessoa=p1&mes=2026-03-01' })
      expect(await screen.findByRole('dialog', { name: 'Capacidade de Ana' })).toBeInTheDocument()
      expect(buscarUsuario).toHaveBeenCalledWith('p1')
      await waitFor(() => expect(ocupacaoDasPessoas).toHaveBeenCalledWith(expect.objectContaining({ mes: '2026-03-01' })))
    })
    it('quem edita mas não tem Capacidade (pessoa de outra consultoria) abre a ficha', async () => {
      vi.mocked(buscarUsuario).mockResolvedValue({ ...ana, papel: 'pessoa', consultoria_id: 'c2' })
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' }, endereco: '/usuarios?pessoa=p1' })
      expect(await screen.findByRole('dialog', { name: 'Ficha de Ana' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Capacidade de Ana' })).not.toBeInTheDocument()
    })
    it('pessoa que não aparece (RLS): aviso curto e a lista segue', async () => {
      vi.mocked(buscarUsuario).mockResolvedValue(null)
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' }, endereco: '/usuarios?pessoa=zzz' })
      expect(await screen.findByText('Você não tem acesso a essa pessoa.')).toBeInTheDocument()
      expect(await screen.findByRole('table', { name: 'Usuários' })).toBeInTheDocument()
    })
    it('mês inválido cai no atual; sem ?pessoa= nada é buscado', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' }, endereco: '/usuarios?mes=lixo' })
      await screen.findByRole('table', { name: 'Usuários' })
      await waitFor(() => expect(ocupacaoDasPessoas).toHaveBeenCalledWith(expect.objectContaining({ mes: mesAtual() })))
      expect(buscarUsuario).not.toHaveBeenCalled()
    })
  })

  describe('ação "Capacidade" da linha (carga e ausências)', () => {
    const linha = (id, nome, papel, extra = {}) => ({
      id, nome, email: `${nome.toLowerCase()}@x.test`, papel, ativo: true, times: [], consultoria_id: 'c1', carga_semanal: 40, ...extra,
    })
    const com = (...itens) => vi.mocked(listarUsuarios).mockImplementation(async () => ({ itens: [...itens], total: itens.length }))
    const botao = async (nome) => within(await screen.findByRole('row', { name: new RegExp(nome) })).queryByRole('button', { name: 'Capacidade' })

    it('a central abre a janela de uma pessoa, muda a carga e os números são buscados de novo', async () => {
      com(linha('p1', 'Ana', 'pessoa'))
      vi.mocked(definirCarga).mockResolvedValue({ erro: null })
      renderizarTela(<Usuarios />, { perfil: { id: 'c9', papel: 'central', consultoria_id: null } })
      await userEvent.click(await botao('Ana'))
      const janela = screen.getByRole('dialog', { name: 'Capacidade de Ana' })
      const campo = within(janela).getByLabelText('Carga semanal (horas)')
      expect(campo).toHaveValue('40')
      expect(await within(janela).findByText('Nenhuma ausência registrada.')).toBeInTheDocument()
      const chamadas = vi.mocked(ocupacaoDasPessoas).mock.calls.length
      await userEvent.clear(campo)
      await userEvent.type(campo, '32,5')
      await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
      await waitFor(() => expect(definirCarga).toHaveBeenCalledWith('p1', 32.5))
      await waitFor(() => expect(ocupacaoDasPessoas.mock.calls.length).toBeGreaterThan(chamadas))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Capacidade de Ana' })).toBeNull())
    })

    it('recusa carga acima de 60 sem chamar o banco', async () => {
      com(linha('p1', 'Ana', 'pessoa'))
      renderizarTela(<Usuarios />, { perfil: { id: 'c9', papel: 'central', consultoria_id: null } })
      await userEvent.click(await botao('Ana'))
      const janela = screen.getByRole('dialog', { name: 'Capacidade de Ana' })
      const campo = within(janela).getByLabelText('Carga semanal (horas)')
      await userEvent.clear(campo)
      await userEvent.type(campo, '61')
      await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
      expect(within(janela).getByText('Use de 0 a 60 horas.')).toBeInTheDocument()
      expect(definirCarga).not.toHaveBeenCalled()
    })

    it('mexer nas ausências na janela busca os números de novo', async () => {
      com(linha('p1', 'Ana', 'pessoa'))
      vi.mocked(listarAusencias).mockResolvedValue({ itens: [{ id: 'a1', perfil_id: 'p1', de: '2026-12-20', ate: '2027-01-05', motivo: 'Férias' }], total: 1 })
      vi.mocked(apagarAusencia).mockResolvedValue({ erro: null })
      renderizarTela(<Usuarios />, { perfil: { id: 'c9', papel: 'central', consultoria_id: null } })
      await userEvent.click(await botao('Ana'))
      const janela = screen.getByRole('dialog', { name: 'Capacidade de Ana' })
      await userEvent.click(await within(janela).findByRole('button', { name: 'Apagar' }))
      const chamadas = vi.mocked(ocupacaoDasPessoas).mock.calls.length
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar' }))
      await waitFor(() => expect(apagarAusencia).toHaveBeenCalledWith('a1'))
      await waitFor(() => expect(ocupacaoDasPessoas.mock.calls.length).toBeGreaterThan(chamadas))
    })

    it('o administrador tem a ação em si mesmo, em outro administrador e nas pessoas da consultoria', async () => {
      com(linha('a1', 'Eu', 'admin'), linha('a2', 'Outro', 'admin'), linha('p1', 'Ana', 'pessoa'))
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      expect(await botao('Eu')).toBeInTheDocument()
      expect(await botao('Outro')).toBeInTheDocument()
      expect(await botao('Ana')).toBeInTheDocument()
    })

    it('o gestor tem a ação em si mesmo e nas pessoas da consultoria', async () => {
      com(linha('g1', 'Gil', 'gestor'), linha('p1', 'Ana', 'pessoa'))
      renderizarTela(<Usuarios />, { perfil: { id: 'g1', papel: 'gestor', consultoria_id: 'c1' } })
      expect(await botao('Gil')).toBeInTheDocument()
      expect(await botao('Ana')).toBeInTheDocument()
    })

    it('pessoa de outra consultoria, desativada, da central ou o próprio perfil de "pessoa" ficam sem a ação', async () => {
      com(
        linha('p2', 'Zeca', 'pessoa', { consultoria_id: 'c2' }),
        linha('p3', 'Dora', 'pessoa', { ativo: false }),
        linha('c5', 'Cida', 'central', { consultoria_id: null }),
      )
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      expect(await botao('Zeca')).toBeNull()
      expect(await botao('Dora')).toBeNull()
      expect(await botao('Cida')).toBeNull()
    })

    it('a pessoa comum não tem a ação', async () => {
      com(linha('p1', 'Ana', 'pessoa'))
      renderizarTela(<Usuarios />, { perfil: { id: 'p1', papel: 'pessoa', consultoria_id: 'c1' } })
      expect(await botao('Ana')).toBeNull()
    })
  })
})

describe('Usuários: cartões de números abaixo dos filtros', () => {
  const admin = { id: 'a1', papel: 'admin', consultoria_id: 'c1' }

  it('Pessoas ativas, Ocupação média do mês, Acima de 100% e Sem tipo de consultoria, do banco', async () => {
    renderizarTela(<Usuarios />, { perfil: admin })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos usuários')
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Pessoas ativas')).toBe('6'))
    expect(numeroDoCartao(cartoes, 'Ocupação média do mês')).toBe('62%')
    expect(within(cartoes).getByText(`média por pessoa · ${rotuloCurto(mesAtual())}`)).toBeInTheDocument()
    expect(numeroDoCartao(cartoes, 'Acima de 100%')).toBe('1')
    expect(numeroDoCartao(cartoes, 'Sem tipo de consultoria')).toBe('3')
    expect(indicadoresDeUsuarios).toHaveBeenCalledWith({ consultoriaId: 'c1', mes: mesAtual() })
  })

  it('mês passado: Utilização média; trocar o mês pede os números do mês novo', async () => {
    renderizarTela(<Usuarios />, { perfil: admin })
    await cartoesAbaixoDaBarra('Indicadores dos usuários')
    vi.mocked(indicadoresDeUsuarios).mockResolvedValue({ mes: deslocarMes(mesAtual(), -1), passado: true, pessoas_ativas: 6, ocupacao_media: 0.5, acima_de_100: 0, sem_tipo: 3 })
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await waitFor(() => expect(indicadoresDeUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', mes: deslocarMes(mesAtual(), -1) }))
    const cartoes = screen.getByRole('region', { name: 'Indicadores dos usuários' })
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Utilização média do mês')).toBe('50%'))
  })

  it('a central vê os números de todas e o filtro de consultoria muda os cartões (o Tipo não)', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'c0', papel: 'central', consultoria_id: null } })
    await cartoesAbaixoDaBarra('Indicadores dos usuários')
    expect(indicadoresDeUsuarios).toHaveBeenLastCalledWith({ consultoriaId: undefined, mes: mesAtual() })
    await escolherNoSeletor(userEvent, 'Tipo', 'Gestão')
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'gestao' })))
    expect(indicadoresDeUsuarios).toHaveBeenCalledTimes(1)
    await escolherNoSeletor(userEvent, 'Consultoria', 'Acme')
    await waitFor(() => expect(indicadoresDeUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'k1', mes: mesAtual() }))
  })

  it('na aba Desativados (sem a navegação do mês) o cartão da ocupação ainda diz de que mês é', async () => {
    renderizarTela(<Usuarios />, { perfil: admin })
    await cartoesAbaixoDaBarra('Indicadores dos usuários')
    await userEvent.click(screen.getByRole('button', { name: 'Desativados' }))
    expect(screen.queryByRole('button', { name: 'Mês anterior' })).toBeNull()
    const cartoes = screen.getByRole('region', { name: 'Indicadores dos usuários' })
    expect(within(cartoes).getByText(`média por pessoa · ${rotuloCurto(mesAtual())}`)).toBeInTheDocument()
  })
})

// Usabilidade, U5 (pedido do Diego, 18/11): os cartões cujo número a lista sabe filtrar levam ao filtro (página 1).
describe('Usuários: cartões que levam ao filtro', () => {
  const admin = { id: 'a1', papel: 'admin', consultoria_id: 'c1' }

  it('"Sem tipo de consultoria" mostra os ativos sem tipo (Tipo: Sem tipo) na página 1; "Pessoas ativas" volta a todos', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1' }], total: 40,
    })
    renderizarTela(<Usuarios />, { perfil: admin })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos usuários')
    await userEvent.click(await screen.findByRole('button', { name: 'Desativados' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Próxima' }))
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith(expect.objectContaining({ ativos: false, pagina: 2 })))
    await userEvent.click(within(cartoes).getByRole('button', { name: 'Sem tipo de consultoria: 3. Mostrar na lista' }))
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 1, tipo: 'sem' }))
    expect(screen.getByLabelText('Tipo')).toHaveTextContent('Sem tipo')
    expect(screen.getByRole('button', { name: 'Ativos' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(cartoes).getByRole('button', { name: /^Sem tipo de consultoria/ })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(within(cartoes).getByRole('button', { name: 'Pessoas ativas: 6. Mostrar na lista' }))
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 1, tipo: undefined }))
    expect(within(cartoes).getByRole('button', { name: /^Pessoas ativas/ })).toHaveAttribute('aria-current', 'true')
  })

  it('"Acima de 100%" mostra quem passa de 100% no mês (pela função do banco), na página 1; a ocupação média fica só número', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1' }], total: 40,
    })
    renderizarTela(<Usuarios />, { perfil: admin })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos usuários')
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Acima de 100%')).toBe('1'))
    expect(within(cartoes).getAllByRole('button').map((b) => b.getAttribute('data-cartao'))).toEqual(['ativas', 'acima', 'sem_tipo'])
    await escolherNoSeletor(userEvent, 'Tipo', 'Gestão')
    await userEvent.click(await screen.findByRole('button', { name: 'Próxima' }))
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'gestao', pagina: 2 })))
    await userEvent.click(within(cartoes).getByRole('button', { name: 'Acima de 100%: 1. Mostrar na lista' }))
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith(
      { consultoriaId: 'c1', ativos: true, pagina: 1, tipo: undefined, acima: true, mes: mesAtual() }))
    expect(screen.getByLabelText('Ocupação')).toHaveTextContent('Acima de 100%')
    expect(within(cartoes).getByRole('button', { name: /^Acima de 100%/ })).toHaveAttribute('aria-current', 'true')
    expect(within(cartoes).getByRole('button', { name: /^Pessoas ativas/ })).not.toHaveAttribute('aria-current')
    // O filtro segue o mês da tela (o mesmo do cartão).
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith(expect.objectContaining({ acima: true, mes: deslocarMes(mesAtual(), -1) })))
    await userEvent.click(within(cartoes).getByRole('button', { name: 'Pessoas ativas: 6. Mostrar na lista' }))
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 1, tipo: undefined }))
    expect(screen.getByLabelText('Ocupação')).toHaveTextContent('Todas')
  })

  it('o filtro Ocupação da barra: "Acima de 100%" e Todas; some nos desativados; ninguém acima diz o mês', async () => {
    renderizarTela(<Usuarios />, { perfil: admin })
    await screen.findByRole('table', { name: 'Usuários' })
    vi.mocked(listarUsuarios).mockResolvedValue({ itens: [], total: 0 })
    await escolherNoSeletor(userEvent, 'Ocupação', 'Acima de 100%')
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith(expect.objectContaining({ acima: true, pagina: 1 })))
    expect(await screen.findByText(`Ninguém acima de 100% em ${rotuloDoMes(mesAtual()).toLowerCase()}.`)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Desativados' }))
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: false, pagina: 1, tipo: undefined }))
    expect(screen.queryByLabelText('Ocupação')).toBeNull()
  })

  it('o Tipo oferece "Sem tipo" no fim', async () => {
    renderizarTela(<Usuarios />, { perfil: admin })
    await screen.findByRole('table', { name: 'Usuários' })
    await escolherNoSeletor(userEvent, 'Tipo', 'Sem tipo')
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'sem', pagina: 1 })))
  })
})

// Auditoria, G6 (pedido do Diego, 17/11): no celular, Mostrar, o mês, o Tipo e a Consultoria vão para a gaveta.
describe('Usuários no celular: filtros na gaveta', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', vi.fn((consulta) => ({
    matches: !consulta.includes('min-width: 640px'), media: consulta, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))))
  afterEach(() => vi.unstubAllGlobals())

  it('a barra tem Filtros e o Novo acesso; o mês e o Tipo contam como ativos e Limpar volta ao mês atual', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await cartoesAbaixoDaBarra('Indicadores dos usuários')
    expect(screen.getByRole('button', { name: 'Novo acesso' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Mostrar' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    const gaveta = screen.getByRole('dialog', { name: 'Filtros' })
    expect(within(gaveta).getByRole('group', { name: 'Mostrar' })).toBeInTheDocument()
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Mês anterior' }))
    await escolherNoSeletor(userEvent, 'Tipo', 'Gestão')
    await waitFor(() => expect(indicadoresDeUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', mes: deslocarMes(mesAtual(), -1) }))
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Ver resultados' }))
    await userEvent.click(screen.getByRole('button', { name: 'Filtros (2 ativos)' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Filtros' })).getByRole('button', { name: 'Limpar' }))
    await waitFor(() => expect(indicadoresDeUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', mes: mesAtual() }))
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 1, tipo: undefined }))
  })
})
