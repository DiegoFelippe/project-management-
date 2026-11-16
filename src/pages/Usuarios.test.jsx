import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { contarClientesAtivos } from '@/data/clientes'
import { trocarFoto } from '@/data/imagens'
import { definirCarga, listarAusencias } from '@/data/capacidade'
import { buscarConsultoriasAtivas, listarNomesDeConsultorias } from '@/data/consultorias'
import { criarAcesso, gerenciarAcesso, listarUsuarios, reenviarConvite } from '@/data/usuarios'
import { escolherNoSeletor } from '@/test/campos'
import { renderizarTela } from '@/test/renderizar'
import Usuarios from './Usuarios'

vi.mock('@/data/usuarios', () => ({
  listarUsuarios: vi.fn(), criarAcesso: vi.fn(), gerenciarAcesso: vi.fn(), reenviarConvite: vi.fn(),
}))
vi.mock('@/data/capacidade', () => ({
  definirCarga: vi.fn(), listarAusencias: vi.fn(), criarAusencia: vi.fn(), editarAusencia: vi.fn(), apagarAusencia: vi.fn(),
}))
vi.mock('@/data/clientes', () => ({ contarClientesAtivos: vi.fn() }))
vi.mock('@/data/consultorias', () => ({ listarNomesDeConsultorias: vi.fn(), buscarConsultoriasAtivas: vi.fn() }))
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
  vi.mocked(listarNomesDeConsultorias).mockImplementation(async () => [{ id: 'k1', nome: 'Acme' }, { id: 'k2', nome: 'Velha Arquivada' }])
  vi.mocked(buscarConsultoriasAtivas).mockResolvedValue({ itens: [{ id: 'k1', nome: 'Acme' }], total: 1 })
  vi.mocked(listarAusencias).mockResolvedValue({ itens: [], total: 0 })
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

    it('na ficha do dono, o seletor de consultoria mostra só as ativas; o filtro da lista, todas', async () => {
      renderizarTela(<Usuarios />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
      await userEvent.click(await screen.findByRole('button', { name: /Novo acesso/ }))
      const janela = screen.getByRole('dialog', { name: 'Novo acesso' })
      // O filtro fica escondido (aria-hidden) enquanto a janela está aberta: as opções saem direto do elemento.
      const opcoes = (seletor) => [...seletor.querySelectorAll('option')].map((o) => o.textContent)
      await userEvent.click(within(janela).getByLabelText('Consultoria'))
      expect((await within(janela).findAllByRole('option')).map((o) => o.textContent)).toEqual(['Acme'])
      expect(buscarConsultoriasAtivas).toHaveBeenCalledWith('')
      await waitFor(() => expect(opcoes(document.getElementById('filtro-consultoria'))).toEqual(['Todas', 'Acme', 'Velha Arquivada']))
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
})
