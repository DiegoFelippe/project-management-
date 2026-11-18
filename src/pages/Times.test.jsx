import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { buscarConsultorias } from '@/data/consultorias'
import { indicadoresDeTimes } from '@/data/indicadores'
import { buscarPessoas } from '@/data/pessoas'
import { adicionarMembros, apagarTime, criarTime, editarTime, listarTimes } from '@/data/times'
import { escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import Times from './Times'

vi.mock('@/data/times', () => ({
  listarTimes: vi.fn(), criarTime: vi.fn(), editarTime: vi.fn(), apagarTime: vi.fn(), adicionarMembros: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/data/pessoas', () => ({ buscarPessoas: vi.fn() }))
vi.mock('@/data/consultorias', () => ({ buscarConsultorias: vi.fn() }))
vi.mock('@/data/indicadores', () => ({ indicadoresDeTimes: vi.fn() }))

const gil = { id: 'g1', nome: 'Gil Gestor' }
const TIMES = [
  { id: 't1', nome: 'Implantação', descricao: 'Clientes novos', gestor_id: 'g1', gestor: gil, consultoria_id: 'c1',
    membros: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa' }], totalMembros: 1 },
  { id: 't2', nome: 'Suporte', descricao: null, gestor_id: 'g2', gestor: { id: 'g2', nome: 'Outro' }, consultoria_id: 'c1', membros: [], totalMembros: 0 },
]
const admin = { id: 'a1', papel: 'admin', consultoria_id: 'c1' }
const linha = (nome) => screen.getByRole('row', { name: new RegExp(nome) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarTimes).mockResolvedValue({ itens: TIMES, total: 2 })
  vi.mocked(editarTime).mockResolvedValue({ erro: null })
  vi.mocked(apagarTime).mockResolvedValue({ erro: null })
  vi.mocked(criarTime).mockResolvedValue({ id: 't9' })
  vi.mocked(adicionarMembros).mockResolvedValue({ erro: null })
  vi.mocked(buscarPessoas).mockResolvedValue({ itens: [{ id: 'g9', nome: 'Gabi Gestora', email: 'gabi@x.test', papel: 'gestor' }], total: 1 })
  vi.mocked(buscarConsultorias).mockResolvedValue({ itens: [{ id: 'c2', nome: 'Beta' }], total: 1 })
  vi.mocked(indicadoresDeTimes).mockResolvedValue({ times: 12, pessoas_em_times: 1340, pessoas_sem_time: 5, times_sem_membros: 2 })
})

describe('Times', () => {
  it('lista os times numa tabela: nome (abre o time), gestor e pessoas', async () => {
    renderizarTela(<Times />, { perfil: admin })
    const tabela = await screen.findByRole('table', { name: 'Times' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(3)
    expect(within(linha('Implantação')).getByRole('link', { name: 'Implantação' })).toHaveAttribute('href', '/times/t1')
    expect(within(linha('Implantação')).getByText('Gil Gestor')).toBeInTheDocument()
    expect(within(linha('Implantação')).getByText('2 pessoas')).toBeInTheDocument()
  })

  it('Editar abre o formulário com o time escolhido já preenchido', async () => {
    renderizarTela(<Times />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /Suporte/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar time' })
    expect(within(janela).getByLabelText('Nome do time')).toHaveValue('Suporte')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(editarTime).toHaveBeenCalledWith('t2', expect.objectContaining({ nome: 'Suporte' }))
  })

  it('o administrador escolhe o gestor numa busca no banco, ao criar e ao editar o time', async () => {
    renderizarTela(<Times />, { perfil: admin })
    await userEvent.click(await screen.findByRole('button', { name: 'Novo time' }))
    const nova = screen.getByRole('dialog', { name: 'Novo time' })
    await userEvent.type(within(nova).getByLabelText('Nome do time'), 'Projetos')
    await escolherNoSeletor(userEvent, 'Gestor do time', 'Gabi Gestora')
    expect(buscarPessoas).toHaveBeenCalledWith({ consultoriaId: 'c1', papeis: ['gestor', 'admin'], termo: '' })
    await userEvent.click(within(nova).getByRole('button', { name: 'Criar time' }))
    expect(criarTime).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Projetos', gestorId: 'g9', consultoriaId: 'c1' }))

    await userEvent.click(within(await screen.findByRole('row', { name: /Suporte/ })).getByRole('button', { name: 'Editar' }))
    const janela = await screen.findByRole('dialog', { name: 'Editar time' })
    expect(within(janela).getByLabelText('Gestor do time')).toHaveTextContent('Outro')
    await escolherNoSeletor(userEvent, 'Gestor do time', 'Gabi Gestora')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(editarTime).toHaveBeenCalledWith('t2', expect.objectContaining({ gestorId: 'g9' }))
  })

  it('Apagar pede confirmação e apaga o time escolhido', async () => {
    renderizarTela(<Times />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /Implantação/ })).getByRole('button', { name: 'Apagar' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar time' }))
    expect(apagarTime).toHaveBeenCalledWith('t1')
  })

  it('o gestor só edita e apaga os times dele; o dono só olha', async () => {
    const { unmount } = renderizarTela(<Times />, { perfil: { id: 'g1', papel: 'gestor', consultoria_id: 'c1' } })
    expect(within(await screen.findByRole('row', { name: /Implantação/ })).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(within(linha('Suporte')).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    unmount()
    renderizarTela(<Times />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
    await screen.findByRole('table', { name: 'Times' })
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })

  it('o número de pessoas vem do total do banco, não da amostra de rostos', async () => {
    vi.mocked(listarTimes).mockResolvedValue({ itens: [{ ...TIMES[0], totalMembros: 120 }], total: 1 })
    renderizarTela(<Times />, { perfil: admin })
    expect(within(await screen.findByRole('row', { name: /Implantação/ })).getByText('121 pessoas')).toBeInTheDocument()
  })

  it('a barra começa com Filtros, busca o nome no banco (voltando à página 1) e traz o Novo time no fim', async () => {
    renderizarTela(<Times />, { perfil: admin })
    expect(await screen.findByText('Filtros')).toBeInTheDocument()
    const novo = screen.getByRole('button', { name: 'Novo time' })
    expect(novo.parentElement).toHaveClass('ml-auto')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar times' }), 'Sup')
    await vi.waitFor(() => expect(listarTimes).toHaveBeenLastCalledWith({ consultoriaId: 'c1', busca: 'Sup', pagina: 1 }))
  })

  it('pagina no banco acima de 15 times', async () => {
    vi.mocked(listarTimes).mockResolvedValue({ itens: TIMES, total: 31 })
    renderizarTela(<Times />, { perfil: admin })
    expect(await screen.findByText('1–15 de 31')).toBeInTheDocument()
    expect(listarTimes).toHaveBeenLastCalledWith({ consultoriaId: 'c1', pagina: 1 })
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarTimes).toHaveBeenLastCalledWith({ consultoriaId: 'c1', pagina: 2 })
  })

  it('buscar estando na página 2 volta para a página 1, com o termo no banco', async () => {
    vi.mocked(listarTimes).mockResolvedValue({ itens: TIMES, total: 31 })
    renderizarTela(<Times />, { perfil: admin })
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    expect(listarTimes).toHaveBeenLastCalledWith({ consultoriaId: 'c1', pagina: 2 })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar times' }), 'implantação 50%')
    await vi.waitFor(() => expect(listarTimes).toHaveBeenLastCalledWith({ consultoriaId: 'c1', busca: 'implantação 50%', pagina: 1 }))
  })

  it('cartões logo abaixo da barra, com os números do banco: Times, Pessoas em times, Pessoas sem time, Times sem membros', async () => {
    renderizarTela(<Times />, { perfil: admin })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos times')
    await vi.waitFor(() => expect(numeroDoCartao(cartoes, 'Times')).toBe('12'))
    expect(numeroDoCartao(cartoes, 'Pessoas em times')).toBe('1.340')
    expect(numeroDoCartao(cartoes, 'Pessoas sem time')).toBe('5')
    expect(numeroDoCartao(cartoes, 'Times sem membros')).toBe('2')
    expect(indicadoresDeTimes).toHaveBeenCalledWith({ consultoriaId: 'c1' })
  })

  it('a busca não muda os cartões; o filtro de consultoria do dono muda', async () => {
    renderizarTela(<Times />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
    await cartoesAbaixoDaBarra('Indicadores dos times')
    expect(indicadoresDeTimes).toHaveBeenLastCalledWith({ consultoriaId: undefined })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar times' }), 'Sup')
    await vi.waitFor(() => expect(listarTimes).toHaveBeenLastCalledWith(expect.objectContaining({ busca: 'Sup' })))
    expect(indicadoresDeTimes).toHaveBeenCalledTimes(1)
    await escolherNoSeletor(userEvent, 'Consultoria', 'Beta')
    await vi.waitFor(() => expect(indicadoresDeTimes).toHaveBeenLastCalledWith({ consultoriaId: 'c2' }))
  })

  it('sem resposta dos números, os cartões mostram "—" e a lista continua', async () => {
    vi.mocked(indicadoresDeTimes).mockRejectedValue(new Error('x'))
    renderizarTela(<Times />, { perfil: admin })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos times')
    expect(numeroDoCartao(cartoes, 'Times')).toBe('—')
    expect(await screen.findByRole('table', { name: 'Times' })).toBeInTheDocument()
  })
})

// A página do time, de mentira: mostra o id e as pessoas que chegaram escolhidas (state da navegação).
function PaginaDoTime() {
  const { pathname, state } = useLocation()
  return <p>Página {pathname} · {(state?.pessoasQueFaltam ?? []).map((p) => p.nome).join(', ') || 'ninguém escolhido'}</p>
}
function telaComRotas(perfil) {
  return render(
    <AuthContext.Provider value={{ perfil }}>
      <MemoryRouter initialEntries={['/times']}>
        <Routes>
          <Route path="/times" element={<Times />} />
          <Route path="/times/:id" element={<PaginaDoTime />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}
const PESSOAS = [{ id: 'p1', nome: 'Ana', email: 'ana@x.test' }, { id: 'p2', nome: 'Bruno', email: 'bruno@x.test' }]

describe('Times: Novo time com pessoas (usabilidade, U7)', () => {
  const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 'c1' }

  it('escolhe várias pessoas de uma vez, cria o time, coloca as pessoas numa chamada só e abre o time novo', async () => {
    vi.mocked(buscarPessoas).mockResolvedValue({ itens: PESSOAS, total: 2 })
    telaComRotas(gestor)
    await userEvent.click(await screen.findByRole('button', { name: 'Novo time' }))
    const janela = screen.getByRole('dialog', { name: 'Novo time' })
    await userEvent.type(within(janela).getByLabelText('Nome do time'), 'Suporte N2')
    await userEvent.click(within(janela).getByLabelText('Pessoas (opcional)'))
    // As da consultoria, sem o gestor que cria (ele é o gestor do time).
    expect(buscarPessoas).toHaveBeenLastCalledWith({ consultoriaId: 'c1', termo: '', excluirIds: ['g1'] })
    await userEvent.click(await screen.findByRole('option', { name: /Ana/ }))
    await userEvent.click(screen.getByRole('option', { name: /Bruno/ }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(within(janela).getByRole('button', { name: 'Criar time' }))
    expect(criarTime).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Suporte N2', gestorId: 'g1', consultoriaId: 'c1' }))
    expect(adicionarMembros).toHaveBeenCalledWith('t9', ['p1', 'p2'])
    expect(await screen.findByText('Página /times/t9 · ninguém escolhido')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Time Suporte N2 criado com 2 pessoas.')
  })

  it('sem pessoas: cria e abre o time, sem colocar ninguém', async () => {
    telaComRotas(admin)
    await userEvent.click(await screen.findByRole('button', { name: 'Novo time' }))
    const janela = screen.getByRole('dialog', { name: 'Novo time' })
    await userEvent.type(within(janela).getByLabelText('Nome do time'), 'Projetos')
    await escolherNoSeletor(userEvent, 'Gestor do time', 'Gabi Gestora')
    await userEvent.click(within(janela).getByRole('button', { name: 'Criar time' }))
    expect(await screen.findByText('Página /times/t9 · ninguém escolhido')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Time Projetos criado.')
  })

  it('o time foi criado e as pessoas não entraram: o aviso diz quem, e a página do time abre com elas escolhidas', async () => {
    vi.mocked(buscarPessoas).mockResolvedValue({ itens: PESSOAS, total: 2 })
    vi.mocked(adicionarMembros).mockResolvedValue({ erro: 'Só entra no time quem é da mesma consultoria.' })
    telaComRotas(gestor)
    await userEvent.click(await screen.findByRole('button', { name: 'Novo time' }))
    const janela = screen.getByRole('dialog', { name: 'Novo time' })
    await userEvent.type(within(janela).getByLabelText('Nome do time'), 'Suporte N2')
    await escolherNoSeletor(userEvent, 'Pessoas (opcional)', 'Ana')
    await userEvent.click(screen.getByRole('option', { name: /Bruno/ }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(within(janela).getByRole('button', { name: 'Criar time' }))
    expect(await screen.findByText('Página /times/t9 · Ana, Bruno')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('O time Suporte N2 foi criado, mas Ana e Bruno não entraram'))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('o banco recusa o time: nada é colocado e a janela fica aberta com o erro', async () => {
    vi.mocked(criarTime).mockResolvedValue({ erro: 'Já existe um time com esse nome.' })
    telaComRotas(gestor)
    await userEvent.click(await screen.findByRole('button', { name: 'Novo time' }))
    const janela = screen.getByRole('dialog', { name: 'Novo time' })
    await userEvent.type(within(janela).getByLabelText('Nome do time'), 'Suporte')
    await userEvent.click(within(janela).getByRole('button', { name: 'Criar time' }))
    expect(await within(janela).findByText('Já existe um time com esse nome.')).toBeInTheDocument()
    expect(adicionarMembros).not.toHaveBeenCalled()
  })
})

describe('Times: ações da linha (auditoria, G1)', () => {
  it('só ícones, com o nome no aria-label; nos times de outro gestor fica o espaço, e o lápis não muda de lugar', async () => {
    renderizarTela(<Times />, { perfil: { id: 'g1', papel: 'gestor', consultoria_id: 'c1' } })
    const meu = await screen.findByRole('row', { name: /Implantação/ })
    const editar = within(meu).getByRole('button', { name: 'Editar' })
    expect(editar).toHaveAttribute('title', 'Editar')
    expect(editar).toHaveTextContent('')
    const doOutro = linha('Suporte').querySelector('td:last-child')
    expect([...doOutro.children].map((el) => el.getAttribute('aria-hidden'))).toEqual(['true', 'true'])
  })

  it('o dono só olha: a tabela fica sem a coluna de ações', async () => {
    renderizarTela(<Times />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
    const tabela = await screen.findByRole('table', { name: 'Times' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Time', 'Gestor', 'Pessoas'])
  })
})

