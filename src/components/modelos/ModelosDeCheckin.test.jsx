import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usoDoModelo } from '@/data/checklists'
import { buscarConsultorias, buscarConsultoriasAtivas } from '@/data/consultorias'
import { indicadoresDeModelos } from '@/data/indicadores'
import { apagarModelo, arquivarModelo, lerModelo, listarModelos, reativarModelo, salvarModelo } from '@/data/modelos'
import { escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import ModelosDeCheckin from './ModelosDeCheckin'

vi.mock('@/data/modelos', () => ({
  listarModelos: vi.fn(), lerModelo: vi.fn(), salvarModelo: vi.fn(), arquivarModelo: vi.fn(), reativarModelo: vi.fn(),
  apagarModelo: vi.fn(),
}))
vi.mock('@/data/indicadores', () => ({ indicadoresDeModelos: vi.fn() }))
vi.mock('@/data/checklists', () => ({ usoDoModelo: vi.fn() }))
vi.mock('@/data/consultorias', () => ({ buscarConsultorias: vi.fn(), buscarConsultoriasAtivas: vi.fn() }))

const DATA = '2026-11-10T13:00:00Z'
const DA_CENTRAL = {
  id: 'm1', nome: 'Gestão financeira', descricao: 'Para clientes novos', tipo: 'gestao', da_central: true, consultoria: null,
  criado_por: { nome: 'Carla Central' }, criado_em: DATA, etapas: 2, tarefas: 14, obrigatorias: 11, maior_prazo: 60,
  clientes_usando: 4, arquivado_em: null, pode_editar: false, pode_duplicar: true,
}
const DA_STI = {
  id: 'm2', nome: 'Implantação STI', descricao: null, tipo: null, da_central: false, consultoria: { id: 'c1', nome: 'STI Consult' },
  criado_por: { nome: 'Gil Gestor' }, criado_em: DATA, etapas: 1, tarefas: 2, obrigatorias: 2, maior_prazo: 5,
  clientes_usando: 0, arquivado_em: null, pode_editar: true, pode_duplicar: true,
}
const ARQUIVADO = { ...DA_STI, id: 'm3', nome: 'Antigo', arquivado_em: '2026-11-12T10:00:00Z' }

const COMPLETO_STI = {
  ...DA_STI, atualizado_em: DATA,
  etapas: [{ id: 'e1', nome: 'Começo', posicao: 1, tarefas: [
    { id: 't1', titulo: 'Reunião de início', descricao: null, obrigatoria: true, prazo_dias: 2, posicao: 1, depende_de: [] },
    { id: 't2', titulo: 'Análise do DRE', descricao: 'Últimos 12 meses', obrigatoria: true, prazo_dias: 5, posicao: 2, depende_de: ['t1'] },
  ] }],
}
const COMPLETO_CENTRAL = {
  ...DA_CENTRAL, atualizado_em: DATA,
  etapas: [
    { id: 'e1', nome: 'Diagnóstico', posicao: 1, tarefas: [
      { id: 't1', titulo: 'Reunião de início', descricao: null, obrigatoria: true, prazo_dias: 2, posicao: 1, depende_de: [] },
      { id: 't2', titulo: 'Análise do DRE', descricao: null, obrigatoria: true, prazo_dias: 10, posicao: 2, depende_de: ['t1'] },
    ] },
    { id: 'e2', nome: 'Plano', posicao: 2, tarefas: [
      { id: 't3', titulo: 'Plano de ação', descricao: null, obrigatoria: false, prazo_dias: 20, posicao: 3, depende_de: ['t2'] },
    ] },
  ],
}

const central = { id: 'u1', papel: 'central', consultoria_id: null }
const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }
const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }
const comoCentral = (linha) => ({ ...linha, pode_editar: true })

const tela = (perfil) => renderizarTela(<ModelosDeCheckin perfil={perfil} />, { perfil, endereco: '/checkins' })
const linha = (nome) => screen.getByRole('row', { name: new RegExp(nome) })
const botoesDoRodape = (janela) =>
  within(janela.querySelector('[data-slot="dialog-footer"]')).getAllByRole('button').map((b) => b.textContent.trim())
const acoes = async (nome) => {
  const tr = await screen.findByRole('row', { name: new RegExp(nome) })
  // As ações da linha são só ícone, com o nome no aria-label (auditoria, G1); o espaço de uma que não vale não é botão.
  return within(tr.querySelector('td:last-child')).queryAllByRole('button').map((b) => b.getAttribute('aria-label'))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarModelos).mockResolvedValue({ itens: [DA_CENTRAL, DA_STI], total: 2 })
  vi.mocked(indicadoresDeModelos).mockResolvedValue({ recorte: 'consultoria', ativos: 12, da_central: 5, da_consultoria: 7, clientes_usando: 1234 })
  vi.mocked(lerModelo).mockImplementation(async (id) => (id === 'm1' ? COMPLETO_CENTRAL : COMPLETO_STI))
  vi.mocked(salvarModelo).mockResolvedValue({ id: 'm9', erro: null })
  vi.mocked(arquivarModelo).mockResolvedValue({ erro: null })
  vi.mocked(reativarModelo).mockResolvedValue({ erro: null })
  vi.mocked(apagarModelo).mockResolvedValue({ erro: null })
  vi.mocked(usoDoModelo).mockResolvedValue({ clientes: 0, nomes: [] })
  vi.mocked(buscarConsultorias).mockResolvedValue({ itens: [{ id: 'c2', nome: 'Beta' }], total: 1 })
  vi.mocked(buscarConsultoriasAtivas).mockResolvedValue({ itens: [{ id: 'c2', nome: 'Beta' }], total: 1 })
})

describe('ModelosDeCheckin: a tela', () => {
  it('barra (Filtros, abas, busca, tipo e Novo modelo no fim) → cartões do banco → tabela "Modelos de check-in"', async () => {
    tela(gestor)
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos modelos')
    await vi.waitFor(() => expect(numeroDoCartao(cartoes, 'Modelos ativos')).toBe('12'))
    expect(numeroDoCartao(cartoes, 'Da Central')).toBe('5')
    expect(numeroDoCartao(cartoes, 'Da consultoria')).toBe('7')
    expect(numeroDoCartao(cartoes, 'Clientes usando')).toBe('1.234')
    expect(within(cartoes).getByText('que você vê, com check-list ativo')).toBeInTheDocument()
    expect(indicadoresDeModelos).toHaveBeenCalledWith({ consultoriaId: undefined })

    const barra = screen.getByText('Filtros').closest('.card')
    expect(within(barra).getByRole('group', { name: 'Mostrar' })).toBeInTheDocument()
    expect(within(barra).getByRole('searchbox', { name: 'Buscar modelos' })).toHaveAttribute('placeholder', 'Buscar por nome ou descrição')
    expect(within(barra).getByLabelText('Tipo')).toBeInTheDocument()
    expect(within(barra).queryByLabelText('Consultoria')).not.toBeInTheDocument()
    expect(within(barra).getByRole('button', { name: 'Novo modelo' }).parentElement).toHaveClass('ml-auto')

    const tabela = await screen.findByRole('table', { name: 'Modelos de check-in' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(
      ['Modelo', 'Tipo', 'Para', 'Criado por', 'Etapas', 'Tarefas', 'Clientes da consultoria usando', 'Ações'])
    expect(listarModelos).toHaveBeenCalledWith({ aba: 'ativos', pagina: 1 })
  })

  it('cada linha: nome (abre o Ver) e descrição, tipo, para quem, quem criou e quando, etapas, tarefas e clientes usando', async () => {
    tela(gestor)
    await screen.findByRole('table', { name: 'Modelos de check-in' })
    const celulas = (nome) => within(linha(nome)).getAllByRole('cell').map((c) => c.textContent)
    expect(celulas('Gestão financeira').slice(0, 7)).toEqual([
      'Gestão financeiraPara clientes novos', 'Gestão', 'Todas as consultorias', 'Carla CentralCentral · 10/11/2026', '2',
      '14 (11 obrig.)', '4'])
    expect(celulas('Implantação STI').slice(0, 7)).toEqual([
      'Implantação STI', '—', 'STI Consult', 'Gil GestorGestão · STI Consult · 10/11/2026', '1', '2 (2 obrig.)', '—'])
    await userEvent.click(within(linha('Gestão financeira')).getByRole('button', { name: 'Gestão financeira' }))
    expect(await screen.findByRole('dialog', { name: 'Gestão financeira' })).toBeInTheDocument()
    expect(lerModelo).toHaveBeenCalledWith('m1')
  })

  it('a Central chama a coluna de "Clientes usando" e o consultor, de "Seus clientes usando"; o cartão é "Das consultorias" para a Central', async () => {
    vi.mocked(indicadoresDeModelos).mockResolvedValue({ recorte: 'tudo', ativos: 3, da_central: 2, da_consultoria: 1, clientes_usando: 0 })
    const { unmount } = tela(central)
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos modelos')
    await vi.waitFor(() => expect(numeroDoCartao(cartoes, 'Das consultorias')).toBe('1'))
    expect(within(await screen.findByRole('table')).getByRole('columnheader', { name: 'Clientes usando' })).toBeInTheDocument()
    unmount()
    tela(consultor)
    expect(within(await screen.findByRole('table')).getByRole('columnheader', { name: 'Seus clientes usando' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo modelo' })).not.toBeInTheDocument()
  })

  it('pagina no banco: some com 15, aparece com 16 e Próxima pede a página 2', async () => {
    vi.mocked(listarModelos).mockResolvedValue({ itens: [DA_CENTRAL, DA_STI], total: 15 })
    const { unmount } = tela(gestor)
    await screen.findByRole('table', { name: 'Modelos de check-in' })
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    unmount()
    vi.mocked(listarModelos).mockResolvedValue({ itens: [DA_CENTRAL, DA_STI], total: 16 })
    tela(gestor)
    expect(await screen.findByText('1–15 de 16')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarModelos).toHaveBeenLastCalledWith({ aba: 'ativos', pagina: 2 })
  })

  it('aba, busca e tipo voltam à página 1 e vão ao banco; não mudam os cartões', async () => {
    vi.mocked(listarModelos).mockResolvedValue({ itens: [DA_CENTRAL, DA_STI], total: 40 })
    tela(gestor)
    const proxima = async () => {
      await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
      await vi.waitFor(() => expect(listarModelos).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 })))
    }
    await proxima()
    await userEvent.click(screen.getByRole('button', { name: 'Arquivados' }))
    await vi.waitFor(() => expect(listarModelos).toHaveBeenLastCalledWith({ aba: 'arquivados', pagina: 1 }))
    await proxima()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar modelos' }), 'finan')
    await vi.waitFor(() => expect(listarModelos).toHaveBeenLastCalledWith({ aba: 'arquivados', busca: 'finan', pagina: 1 }))
    await proxima()
    await escolherNoSeletor(userEvent, 'Tipo', 'Assessoria Jurídica')
    await vi.waitFor(() => expect(listarModelos).toHaveBeenLastCalledWith(
      { aba: 'arquivados', busca: 'finan', tipo: 'assessoria_juridica', pagina: 1 }))
    expect(indicadoresDeModelos).toHaveBeenCalledTimes(1)
  })

  it('a Central filtra por consultoria (os modelos que ela vê): vai ao banco, volta à página 1 e muda os cartões', async () => {
    vi.mocked(listarModelos).mockResolvedValue({ itens: [comoCentral(DA_CENTRAL)], total: 40 })
    tela(central)
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    await escolherNoSeletor(userEvent, 'Consultoria', 'Beta')
    await vi.waitFor(() => expect(listarModelos).toHaveBeenLastCalledWith({ aba: 'ativos', consultoriaId: 'c2', pagina: 1 }))
    await vi.waitFor(() => expect(indicadoresDeModelos).toHaveBeenLastCalledWith({ consultoriaId: 'c2' }))
  })

  it('lista vazia e erro ao carregar', async () => {
    vi.mocked(listarModelos).mockResolvedValue({ itens: [], total: 0 })
    const { unmount } = tela(gestor)
    expect(await screen.findByText('Nenhum modelo ainda. Crie o primeiro em "Novo modelo".')).toBeInTheDocument()
    unmount()
    const outro = tela(consultor)
    expect(await screen.findByText('Nenhum modelo por aqui ainda.')).toBeInTheDocument()
    outro.unmount()
    vi.mocked(listarModelos).mockRejectedValue(new Error('x'))
    tela(gestor)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os modelos.')
  })

  it('a 360 px nada rola para o lado: a barra quebra linha, a tabela rola dentro do cartão e as ações são só ícone', async () => {
    const { container } = tela(gestor)
    await screen.findByRole('table', { name: 'Modelos de check-in' })
    expect(screen.getByText('Filtros').closest('.card')).toHaveClass('flex-wrap')
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto')
    const editar = within(linha('Implantação STI')).getByRole('button', { name: 'Editar' })
    expect(editar).toHaveAttribute('title', 'Editar')
    expect(editar).toHaveTextContent('')
    expect(container.innerHTML).not.toMatch(/max-w-(?:sm|md|lg|xl|\dxl|screen)[^"]*mx-auto|mx-auto[^"]*max-w-(?:sm|md|lg|xl|\dxl|screen)/)
  })
})

describe('ModelosDeCheckin: quem faz o quê', () => {
  it('o consultor só vê (Ver em cada linha)', async () => {
    vi.mocked(listarModelos).mockResolvedValue({ itens: [{ ...DA_CENTRAL, pode_duplicar: false }, { ...DA_STI, pode_editar: false, pode_duplicar: false }], total: 2 })
    tela(consultor)
    expect(await acoes('Gestão financeira')).toEqual(['Ver'])
    expect(await acoes('Implantação STI')).toEqual(['Ver'])
  })

  it('o gestor vê e duplica os da Central; edita, duplica, arquiva e apaga os dele', async () => {
    tela(gestor)
    expect(await acoes('Gestão financeira')).toEqual(['Ver', 'Duplicar'])
    expect(await acoes('Implantação STI')).toEqual(['Editar', 'Duplicar', 'Arquivar', 'Apagar'])
    // Posições fixas (auditoria, G1): as duas que não valem para o da Central deixam o espaço, e Duplicar fica no 2º lugar.
    const lugares = [...linha('Gestão financeira').querySelector('td:last-child').children]
    expect(lugares.map((el) => el.getAttribute('aria-label') ?? (el.getAttribute('aria-hidden') && 'espaço'))).toEqual(['Ver', 'Duplicar', 'espaço', 'espaço'])
  })

  it('a Central faz tudo em todos', async () => {
    vi.mocked(listarModelos).mockResolvedValue({ itens: [comoCentral(DA_CENTRAL), comoCentral(DA_STI)], total: 2 })
    tela(central)
    expect(await acoes('Gestão financeira')).toEqual(['Editar', 'Duplicar', 'Arquivar', 'Apagar'])
    expect(await acoes('Implantação STI')).toEqual(['Editar', 'Duplicar', 'Arquivar', 'Apagar'])
  })

  it('Arquivados: Reativar e Apagar para quem mexe; os outros só Ver', async () => {
    vi.mocked(listarModelos).mockResolvedValue({ itens: [ARQUIVADO, { ...DA_CENTRAL, id: 'm4', nome: 'Velho da Central', arquivado_em: DATA }], total: 2 })
    tela(gestor)
    await userEvent.click(await screen.findByRole('button', { name: 'Arquivados' }))
    expect(await acoes('Antigo')).toEqual(['Reativar', 'Apagar'])
    expect(await acoes('Velho da Central')).toEqual(['Ver'])
    await userEvent.click(within(linha('Antigo')).getByRole('button', { name: 'Reativar' }))
    expect(reativarModelo).toHaveBeenCalledWith('m3')
    await vi.waitFor(() => expect(listarModelos).toHaveBeenCalledTimes(3))
  })
})

describe('ModelosDeCheckin: criar, editar e duplicar', () => {
  it('Editar abre a janela preenchida com as etapas e as tarefas da linha; a Central salva com "para" = a consultoria do modelo', async () => {
    vi.mocked(listarModelos).mockResolvedValue({ itens: [comoCentral(DA_STI)], total: 1 })
    tela(central)
    await userEvent.click(within(await screen.findByRole('row', { name: /Implantação STI/ })).getByRole('button', { name: 'Editar' }))
    const janela = await screen.findByRole('dialog', { name: 'Editar modelo de check-in' })
    expect(lerModelo).toHaveBeenCalledWith('m2')
    expect(within(janela).getByLabelText('Nome do modelo')).toHaveValue('Implantação STI')
    expect(within(janela).getByLabelText('Nome da etapa 1')).toHaveValue('Começo')
    expect(within(janela).getByLabelText('Título da tarefa 1')).toHaveValue('Reunião de início')
    expect(within(janela).getByLabelText('Título da tarefa 2')).toHaveValue('Análise do DRE')
    expect(within(janela).getByLabelText('Descrição da tarefa 2')).toHaveValue('Últimos 12 meses')
    expect(within(janela).queryByRole('radiogroup', { name: 'Para quem' })).not.toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(salvarModelo).toHaveBeenCalledWith('m2', expect.objectContaining({ nome: 'Implantação STI', para: 'c1' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(listarModelos).toHaveBeenCalledTimes(2)
  })

  it('Novo modelo chama salvarModelo(null, …) com o p_dados certo e mostra "Salvando…"', async () => {
    let terminar
    vi.mocked(salvarModelo).mockImplementation(() => new Promise((r) => { terminar = r }))
    tela(central)
    await userEvent.click(await screen.findByRole('button', { name: 'Novo modelo' }))
    const janela = screen.getByRole('dialog', { name: 'Novo modelo de check-in' })
    await userEvent.type(within(janela).getByLabelText('Nome do modelo'), 'Gestão de pessoas')
    await userEvent.type(within(janela).getByLabelText('Título da tarefa 1'), 'Reunião de início')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(within(janela).getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    expect(salvarModelo).toHaveBeenCalledWith(null, {
      nome: 'Gestão de pessoas', descricao: null, tipo: null, para: 'todas',
      etapas: [{ nome: 'Diagnóstico', tarefas: [
        { chave: expect.any(String), titulo: 'Reunião de início', descricao: null, obrigatoria: true, prazo_dias: 2, depende_de: [] },
      ] }],
    })
    terminar({ id: 'm9', erro: null })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(listarModelos).toHaveBeenCalledTimes(2)
  })

  it('Duplicar abre "Cópia de X" e salva como modelo novo (sem id); o gestor tem "Para quem" fixo na consultoria dele', async () => {
    tela(gestor)
    await userEvent.click(within(await screen.findByRole('row', { name: /Gestão financeira/ })).getByRole('button', { name: 'Duplicar' }))
    const janela = await screen.findByRole('dialog', { name: 'Novo modelo de check-in' })
    expect(lerModelo).toHaveBeenCalledWith('m1')
    expect(within(janela).getByText('Cópia de "Gestão financeira". Ajuste o que precisar e salve.')).toBeInTheDocument()
    expect(within(janela).getByLabelText('Nome do modelo')).toHaveValue('Cópia de Gestão financeira')
    expect(within(janela).queryByRole('radiogroup', { name: 'Para quem' })).not.toBeInTheDocument()
    expect(within(janela).getByRole('group', { name: 'Para quem' })).toHaveTextContent('STI Consult')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    const [id, dados] = vi.mocked(salvarModelo).mock.calls[0]
    expect(id).toBeNull()
    expect(dados).toMatchObject({ nome: 'Cópia de Gestão financeira', para: 'c1', tipo: 'gestao' })
    expect(dados.etapas.map((e) => e.tarefas.map((t) => t.titulo))).toEqual([['Reunião de início', 'Análise do DRE'], ['Plano de ação']])
  })

  it('modelo que sumiu ao abrir: avisa e não abre a janela', async () => {
    vi.mocked(lerModelo).mockResolvedValue(null)
    tela(gestor)
    await userEvent.click(within(await screen.findByRole('row', { name: /Implantação STI/ })).getByRole('button', { name: 'Editar' }))
    await vi.waitFor(() => expect(lerModelo).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ModelosDeCheckin: arquivar e apagar', () => {
  it('Arquivar pede confirmação dizendo que os clientes que você vê usando continuam com o check-list', async () => {
    vi.mocked(listarModelos).mockResolvedValue({ itens: [comoCentral(DA_CENTRAL)], total: 1 })
    tela(central)
    await userEvent.click(within(await screen.findByRole('row', { name: /Gestão financeira/ })).getByRole('button', { name: 'Arquivar' }))
    const confirmar = screen.getByRole('alertdialog', { name: 'Arquivar "Gestão financeira"?' })
    expect(confirmar).toHaveTextContent('Ele sai da lista de modelos para aplicar. Os 4 clientes que você vê usando continuam com o check-list. Dá para reativar na aba Arquivados.')
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Arquivar' }))
    expect(arquivarModelo).toHaveBeenCalledWith('m1')
    await vi.waitFor(() => expect(listarModelos).toHaveBeenCalledTimes(2))
  })

  it('Apagar sem uso: confirmação com "N etapas e M tarefas" e Arquivar como alternativa', async () => {
    tela(gestor)
    await userEvent.click(within(await screen.findByRole('row', { name: /Implantação STI/ })).getByRole('button', { name: 'Apagar' }))
    const confirmar = await screen.findByRole('alertdialog', { name: 'Apagar "Implantação STI"?' })
    expect(usoDoModelo).toHaveBeenCalledWith('m2')
    await within(confirmar).findByText(/Somem junto 1 etapa e 2 tarefas do modelo\. Nenhum cliente que você vê usa este modelo\. Não dá para desfazer\. Se quiser só tirar da lista, arquive\./)
    expect(botoesDoRodape(confirmar)).toEqual(['Cancelar', 'Arquivar', 'Apagar'])
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Apagar' }))
    expect(apagarModelo).toHaveBeenCalledWith('m2')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(listarModelos).toHaveBeenCalledTimes(2)
  })

  it('Apagar sem uso, escolhendo Arquivar', async () => {
    tela(gestor)
    await userEvent.click(within(await screen.findByRole('row', { name: /Implantação STI/ })).getByRole('button', { name: 'Apagar' }))
    const confirmar = await screen.findByRole('alertdialog')
    await userEvent.click(await within(confirmar).findByRole('button', { name: 'Arquivar' }))
    expect(arquivarModelo).toHaveBeenCalledWith('m2')
    expect(apagarModelo).not.toHaveBeenCalled()
  })

  it('Apagar em uso: só Arquivar, com os nomes dos clientes que eu vejo', async () => {
    vi.mocked(usoDoModelo).mockResolvedValue({ clientes: 7, nomes: ['Acme', 'Beta Ltda', 'Gama', 'Delta', 'Épsilon'] })
    tela(gestor)
    await userEvent.click(within(await screen.findByRole('row', { name: /Implantação STI/ })).getByRole('button', { name: 'Apagar' }))
    const confirmar = await screen.findByRole('alertdialog', { name: '"Implantação STI" está em uso' })
    expect(confirmar).toHaveTextContent('7 clientes que você vê usam este modelo: Acme, Beta Ltda, Gama, Delta, Épsilon e mais 2. Por isso ele não pode ser apagado.')
    expect(botoesDoRodape(confirmar)).toEqual(['Cancelar', 'Arquivar'])
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Arquivar' }))
    expect(arquivarModelo).toHaveBeenCalledWith('m2')
  })

  it('o banco recusa ao apagar (alguém aplicou no meio do caminho): o motivo aparece na janela', async () => {
    vi.mocked(apagarModelo).mockResolvedValue({ erro: 'Este modelo está em uso: clientes têm check-list dele. Arquive em vez de apagar.' })
    tela(gestor)
    await userEvent.click(within(await screen.findByRole('row', { name: /Implantação STI/ })).getByRole('button', { name: 'Apagar' }))
    const confirmar = await screen.findByRole('alertdialog')
    await userEvent.click(await within(confirmar).findByRole('button', { name: 'Apagar' }))
    expect(await within(confirmar).findByRole('alert')).toHaveTextContent('Este modelo está em uso')
  })
})
