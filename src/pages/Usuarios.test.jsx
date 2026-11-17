import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { contarClientesAtivos } from '@/data/clientes'
import { trocarFoto } from '@/data/imagens'
import { apagarAusencia, definirCarga, listarAusencias, ocupacaoDasPessoas } from '@/data/capacidade'
import { buscarConsultorias, buscarConsultoriasAtivas } from '@/data/consultorias'
import { criarAcesso, gerenciarAcesso, listarUsuarios, reenviarConvite } from '@/data/usuarios'
import { deslocarMes, mesAtual, rotuloDoMes } from '@/lib/mes'
import { escolherNoSeletor } from '@/test/campos'
import { renderizarTela } from '@/test/renderizar'
import Usuarios from './Usuarios'

vi.mock('@/data/usuarios', () => ({
  listarUsuarios: vi.fn(), criarAcesso: vi.fn(), gerenciarAcesso: vi.fn(), reenviarConvite: vi.fn(),
}))
vi.mock('@/data/capacidade', () => ({
  definirCarga: vi.fn(), listarAusencias: vi.fn(), ocupacaoDasPessoas: vi.fn(), criarAusencia: vi.fn(), editarAusencia: vi.fn(), apagarAusencia: vi.fn(),
}))
vi.mock('@/data/clientes', () => ({ contarClientesAtivos: vi.fn() }))
vi.mock('@/data/consultorias', () => ({ buscarConsultorias: vi.fn(), buscarConsultoriasAtivas: vi.fn() }))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn().mockResolvedValue({ erro: null }), tirarFoto: vi.fn() }))
vi.mock('@/data/times', () => ({
  listarOpcoesDeTimes: vi.fn().mockResolvedValue([]), adicionarMembro: vi.fn(), removerMembro: vi.fn(),
}))

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
  vi.mocked(listarUsuarios).mockResolvedValue({
    itens: [
      {
        id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [], consultoria_id: 'c1',
        cargo: 'Analista', telefone: '(11) 98888-1111', cidade: 'Santos', uf: 'SP', data_entrada: '2026-01-10', carga_semanal: 40,
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
    const janela = screen.getByRole('dialog', { name: 'Editar Bruno' })
    expect(within(janela).getByLabelText('Nome')).toHaveValue('Bruno')
    expect(within(janela).getByLabelText('E-mail')).toHaveValue('bruno@x.test')
  })

  it('Editar abre a ficha com cargo, telefone, cidade, UF, data de entrada e carga da linha', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar Ana' })
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
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(gerenciarAcesso).toHaveBeenCalledTimes(1)
    expect(gerenciarAcesso).toHaveBeenCalledWith('editar', 'p1', { telefone: '(11) 90000-0000' })
    expect(definirCarga).not.toHaveBeenCalled()
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '32,5')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Você não tem permissão para isso.')).toBeInTheDocument()
    expect(definirCarga).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Editar Ana' })).toBeInTheDocument()
  })

  it('gestor edita uma pessoa da consultoria e vê a Capacidade; a ficha tem Reenviar convite e Desativar só para quem pode', async () => {
    vi.mocked(reenviarConvite).mockResolvedValue({ erro: null })
    vi.mocked(listarUsuarios).mockResolvedValue({
      itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, convite_pendente: true, times: [], consultoria_id: 'c1' }],
      total: 1,
    })
    renderizarTela(<Usuarios />, { perfil: { id: 'g1', papel: 'gestor', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar Ana' })
    expect(within(janela).getByRole('heading', { name: 'Capacidade' })).toBeInTheDocument()
    expect(within(janela).queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: /Reenviar convite/ }))
    expect(reenviarConvite).toHaveBeenCalledWith('p1')
  })

  it('Desativar pela ficha pede confirmação e fecha a ficha', async () => {
    vi.mocked(gerenciarAcesso).mockResolvedValue({ erro: null })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Editar Ana' })).getByRole('button', { name: /Desativar/ }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desativar' }))
    expect(gerenciarAcesso).toHaveBeenCalledWith('desativar', 'p1')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar Ana' })).not.toBeInTheDocument())
  })

  it('Novo acesso manda os campos da ficha e grava a carga depois de criar', async () => {
    vi.mocked(criarAcesso).mockResolvedValue({ pessoaId: 'p9' })
    vi.mocked(definirCarga).mockResolvedValue({ erro: null })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(await screen.findByRole('button', { name: /Novo acesso/ }))
    const janela = screen.getByRole('dialog', { name: 'Novo acesso' })
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
    const janela = screen.getByRole('dialog', { name: 'Novo acesso' })
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Rita Alves')
    await userEvent.type(within(janela).getByLabelText('E-mail'), 'rita@x.test')
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar convite' }))
    await waitFor(() => expect(criarAcesso).toHaveBeenCalled())
    expect(definirCarga).not.toHaveBeenCalled()
  })

  it('a foto escolhida no Editar vai para o Storage', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    const arquivo = new File(['x'], 'ana.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
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
    for (const nome of ['Capacidade', 'Reservado', 'Realizado', 'Ocupação', 'Utilização']) {
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
      await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Desativar' }))
      const janela = screen.getByRole('alertdialog')
      expect(await within(janela).findByText(/4 clientes dela voltam para Aguardando consultor\./)).toBeInTheDocument()
      expect(contarClientesAtivos).toHaveBeenCalledWith({ consultorId: 'p1' })
      await userEvent.click(within(janela).getByRole('button', { name: 'Desativar' }))
      expect(gerenciarAcesso).toHaveBeenCalledWith('desativar', 'p1')
    })

    it('Desativar com 1 cliente fala no singular', async () => {
      vi.mocked(contarClientesAtivos).mockResolvedValue(1)
      renderizarTela(<Usuarios />, { perfil: admin })
      await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Desativar' }))
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
      await userEvent.click(await within(await screen.findByRole('row', { name: /Ana/ })).findByRole('button', { name: /Mover para a central/ }))
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
    const botoes = (nome) => within(screen.getByRole('row', { name: nome })).queryByRole('button', { name: /Mover para a central/ })

    it('o dono move um administrador para a central, depois de confirmar', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
      await userEvent.click(await within(await screen.findByRole('row', { name: /Ana/ })).findByRole('button', { name: /Mover para a central/ }))
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
      expect(within(linha).getByRole('button', { name: 'Desativar' })).toBeInTheDocument()
      expect(botoes(/Cida/)).toBeNull()
    })

    it('na ficha do dono, o seletor de consultoria mostra só as ativas', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
      await userEvent.click(await screen.findByRole('button', { name: /Novo acesso/ }))
      const janela = screen.getByRole('dialog', { name: 'Novo acesso' })
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
      expect(within(ana).getByRole('button', { name: 'Desativar' })).toBeInTheDocument()
      expect(botoes(/Ana/)).toBeNull()
      expect(within(screen.getByRole('row', { name: /Cida/ })).queryByRole('button', { name: 'Editar' })).toBeNull()
      expect(screen.getByLabelText('Consultoria')).toBeInTheDocument()
    })
  })

  describe('capacidade do mês', () => {
    const NUMEROS = { capacidade: 160, reservado: 80, realizado: 40.5, ocupacao: 0.5, clientes: 3 }

    it('mostra Capacidade, Reservado, Realizado e Ocupação do mês, com "—" para quem o banco não devolveu', async () => {
      vi.mocked(ocupacaoDasPessoas).mockResolvedValue({ p1: NUMEROS })
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      const tabela = await screen.findByRole('table', { name: 'Usuários' })
      for (const nome of ['Capacidade', 'Reservado', 'Realizado', 'Ocupação']) {
        expect(within(tabela).getByRole('columnheader', { name: nome })).toBeInTheDocument()
      }
      const ana = within(tabela).getByRole('row', { name: /Ana/ })
      await waitFor(() => expect(within(ana).getByText('160 h')).toBeInTheDocument())
      expect(within(ana).getByText('80 h')).toBeInTheDocument()
      expect(within(ana).getByText('40,5 h')).toBeInTheDocument()
      expect(within(ana).getByText('50%')).toBeInTheDocument()
      const bruno = within(tabela).getByRole('row', { name: /Bruno/ })
      expect(within(bruno).queryByText('160 h')).toBeNull()
      expect(within(bruno).getAllByText('—').length).toBeGreaterThanOrEqual(4)
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

    it('em mês passado some o Reservado e a Ocupação vira Utilização; no mês atual é o contrário', async () => {
      vi.mocked(ocupacaoDasPessoas).mockResolvedValue({ p1: NUMEROS })
      renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      const tabela = await screen.findByRole('table', { name: 'Usuários' })
      expect(within(tabela).getByRole('columnheader', { name: 'Reservado' })).toBeInTheDocument()
      expect(within(tabela).getByRole('columnheader', { name: 'Ocupação' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
      await waitFor(() => expect(within(tabela).getByRole('columnheader', { name: 'Utilização' })).toBeInTheDocument())
      expect(within(tabela).queryByRole('columnheader', { name: 'Reservado' })).toBeNull()
      expect(within(tabela).queryByRole('columnheader', { name: 'Ocupação' })).toBeNull()
      await waitFor(() => expect(within(within(tabela).getByRole('row', { name: /Ana/ })).queryByText('80 h')).toBeNull())
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
    const janela = screen.getByRole('dialog', { name: 'Editar Ana' })
    await userEvent.click(await within(janela).findByRole('button', { name: 'Apagar' }))
    const chamadas = vi.mocked(ocupacaoDasPessoas).mock.calls.length
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(apagarAusencia).toHaveBeenCalledWith('a1'))
    await waitFor(() => expect(ocupacaoDasPessoas.mock.calls.length).toBeGreaterThan(chamadas))
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
