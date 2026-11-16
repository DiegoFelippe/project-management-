import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listarAusencias } from '@/data/capacidade'
import { escolherData, escolherNoSeletor } from '@/test/campos'
import FichaDoConsultor from './FichaDoConsultor'

vi.mock('@/data/capacidade', () => ({
  listarAusencias: vi.fn(), criarAusencia: vi.fn(), editarAusencia: vi.fn(), apagarAusencia: vi.fn(),
}))

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarAusencias).mockResolvedValue({ itens: [], total: 0 })
})

const TIMES = [
  { id: 't1', nome: 'Implantação' },
  { id: 't2', nome: 'Suporte N2' },
]
const GESTOR = { id: 'g1', papel: 'gestor', consultoria_id: 'c1' }
const ADMIN = { id: 'a1', papel: 'admin', consultoria_id: 'c1' }

function montarNovo(props = {}) {
  const funcoes = {
    aoCriar: vi.fn().mockResolvedValue({ pessoaId: 'p9' }),
    aoColocarNosTimes: vi.fn().mockResolvedValue({ erro: null }),
    aoFechar: vi.fn(),
    ...props,
  }
  render(<FichaDoConsultor aberto perfilDeQuem={GESTOR} times={TIMES} {...props} {...funcoes} />)
  return funcoes
}

// Abre o Seletor `nome`, lê as opções da lista e fecha com Esc.
async function opcoesDo(nome) {
  await userEvent.click(screen.getByLabelText(nome))
  const textos = screen.getAllByRole('option').map((o) => o.textContent)
  await userEvent.keyboard('{Escape}')
  return textos
}
const opcoesDoPapel = () => opcoesDo('Papel')

async function preencher({ senha } = {}) {
  await userEvent.type(screen.getByLabelText('Nome'), 'João Pereira')
  await userEvent.type(screen.getByLabelText('E-mail'), 'joao@empresa.com.br')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Implantação' }))
  if (senha) await userEvent.type(screen.getByLabelText('Senha provisória'), senha)
}

describe('FichaDoConsultor: Novo acesso', () => {
  it('tem o título e os blocos na ordem Dados, Contato, Capacidade, Papel e times, Acesso', () => {
    montarNovo()
    expect(screen.getByRole('dialog', { name: 'Novo acesso' })).toBeInTheDocument()
    const blocos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(blocos).toEqual(['Dados', 'Contato', 'Capacidade', 'Papel e times', 'Acesso'])
  })

  it('gestor só cria pessoa', async () => {
    montarNovo()
    expect(await opcoesDoPapel()).toEqual(['Pessoa'])
  })

  it('admin cria pessoa ou gestor', async () => {
    montarNovo({ perfilDeQuem: ADMIN })
    expect(await opcoesDoPapel()).toEqual(['Pessoa', 'Gestor'])
  })

  it('dono cria administrador ou central, sem times', async () => {
    const { aoCriar } = montarNovo({ perfilDeQuem: { id: 'd1', papel: 'dono' }, consultoriaId: 'c1', times: [] })
    expect(await opcoesDoPapel()).toEqual(['Administrador', 'Central'])
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nome'), 'Rita Alves')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rita@acme.com.br')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalledWith(
      expect.objectContaining({ papel: 'admin', times: [], consultoria_id: 'c1' }),
      expect.anything(),
    )
  })

  it('dono criando central não manda consultoria e não vê Capacidade', async () => {
    const { aoCriar } = montarNovo({ perfilDeQuem: { id: 'd1', papel: 'dono' }, consultoriaId: 'c1', times: [] })
    await escolherNoSeletor(userEvent, 'Papel', 'Central')
    expect(screen.queryByLabelText('Carga semanal (horas)')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Capacidade' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nome'), 'Rita Alves')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rita@acme.com.br')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    const pedido = aoCriar.mock.calls[0][0]
    expect(pedido.papel).toBe('central')
    expect(pedido).not.toHaveProperty('consultoria_id')
  })

  it('central cria só administrador, na consultoria escolhida', async () => {
    const { aoCriar } = montarNovo({ perfilDeQuem: { id: 'c9', papel: 'central' }, consultoriaId: 'c1', times: [] })
    expect(await opcoesDoPapel()).toEqual(['Administrador'])
    await userEvent.type(screen.getByLabelText('Nome'), 'Rita Alves')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rita@acme.com.br')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalledWith(expect.objectContaining({ papel: 'admin', consultoria_id: 'c1' }), expect.anything())
  })

  it('quem vê tudo escolhe a consultoria do administrador dentro da ficha', async () => {
    const { aoCriar } = montarNovo({
      perfilDeQuem: { id: 'c9', papel: 'central' }, consultoriaId: '', times: [],
      buscarConsultorias: vi.fn().mockResolvedValue({ itens: [{ id: 'c1', nome: 'Acme' }, { id: 'c2', nome: 'Beta' }], total: 2 }),
    })
    await userEvent.type(screen.getByLabelText('Nome'), 'Rita Alves')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rita@acme.com.br')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/Escolha uma consultoria/)
    await escolherNoSeletor(userEvent, 'Consultoria', 'Beta')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalledWith(expect.objectContaining({ consultoria_id: 'c2' }), expect.anything())
  })

  it('criar com senha mostra a senha provisória e muda o botão', async () => {
    montarNovo()
    expect(screen.queryByLabelText('Senha provisória')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Criar com senha' }))
    expect(screen.getByLabelText('Senha provisória')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar acesso' })).toBeInTheDocument()
  })

  it('envia os dados certos, só com os campos novos que foram preenchidos', async () => {
    const { aoCriar } = montarNovo()
    await userEvent.click(screen.getByRole('radio', { name: 'Criar com senha' }))
    await preencher({ senha: 'provisoria-1' })
    await userEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    expect(aoCriar).toHaveBeenCalledWith({
      forma: 'senha',
      nome: 'João Pereira',
      email: 'joao@empresa.com.br',
      papel: 'pessoa',
      times: ['t1'],
      senha: 'provisoria-1',
    }, { carga: undefined })
  })

  it('envia cargo, telefone, cidade, UF e data de entrada, e a carga quando é diferente de 44', async () => {
    const { aoCriar } = montarNovo()
    await preencher()
    await userEvent.type(screen.getByLabelText('Cargo'), 'Analista')
    await userEvent.type(screen.getByLabelText('Telefone'), '(11) 99999-0000')
    await userEvent.type(screen.getByLabelText('Cidade'), 'Campinas')
    await escolherNoSeletor(userEvent, 'UF', 'SP')
    await escolherData(userEvent, 'Data de entrada', '2026-03-02')
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '30,5')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalledWith(expect.objectContaining({
      cargo: 'Analista', telefone: '(11) 99999-0000', cidade: 'Campinas', uf: 'SP', data_entrada: '2026-03-02',
    }), { carga: 30.5 })
  })

  it('a carga 44, a padrão, não é enviada', async () => {
    const { aoCriar } = montarNovo()
    expect(screen.getByLabelText('Carga semanal (horas)')).toHaveValue('44')
    await preencher()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar.mock.calls[0][1]).toEqual({ carga: undefined })
  })

  it('carga fora de 0 a 60 e data de entrada no futuro não enviam', async () => {
    const { aoCriar } = montarNovo()
    await preencher()
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '70')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(await screen.findByText('Use de 0 a 60 horas.')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '40')
    await escolherData(userEvent, 'Data de entrada', '2099-01-01')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(await screen.findByText('A data de entrada não pode ser no futuro.')).toBeInTheDocument()
    expect(aoCriar).not.toHaveBeenCalled()
  })

  it('o Novo não mostra ausências', () => {
    montarNovo()
    expect(screen.queryByRole('table', { name: 'Ausências' })).not.toBeInTheDocument()
    expect(listarAusencias).not.toHaveBeenCalled()
  })

  it('clique duplo não envia duas vezes', async () => {
    const { aoCriar } = montarNovo({ aoCriar: vi.fn(() => new Promise(() => {})) })
    await preencher()
    const botao = screen.getByRole('button', { name: 'Enviar convite' })
    await userEvent.click(botao)
    await userEvent.click(botao)
    expect(botao).toBeDisabled()
    expect(aoCriar).toHaveBeenCalledTimes(1)
  })

  it('pessoa que já tem acesso pode entrar nos times marcados', async () => {
    const { aoColocarNosTimes } = montarNovo({
      aoCriar: vi.fn().mockResolvedValue({
        codigo: 'ja_na_consultoria',
        erro: 'Essa pessoa já tem acesso na sua consultoria.',
        pessoa: { id: 'p1', nome: 'João' },
      }),
    })
    await preencher()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(await screen.findByText('Essa pessoa já tem acesso na sua consultoria.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Colocar nos times marcados' }))
    expect(aoColocarNosTimes).toHaveBeenCalledWith('p1', ['t1'])
  })
})

const PESSOA = {
  id: 'p1', nome: 'Ana Lima', email: 'ana@exemplo.test', papel: 'pessoa', consultoria_id: 'c1',
  times: [{ id: 't1', nome: 'Implantação' }], cargo: 'Analista', telefone: '(11) 98888-1111', cidade: 'Santos', uf: 'SP',
  data_entrada: '2026-01-10', carga_semanal: 40, convite_pendente: false, ativo: true,
}

function montarEditar(props = {}) {
  const funcoes = { aoSalvar: vi.fn().mockResolvedValue({ erro: null }), aoFechar: vi.fn(), ...props }
  render(<FichaDoConsultor aberto perfilDeQuem={ADMIN} pessoa={PESSOA} times={TIMES} {...props} {...funcoes} />)
  return funcoes
}

describe('FichaDoConsultor: Editar', () => {
  it('abre com o nome no título e os dados da linha', () => {
    montarEditar()
    expect(screen.getByRole('dialog', { name: 'Editar Ana Lima' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Ana Lima')
    expect(screen.getByLabelText('Cargo')).toHaveValue('Analista')
    expect(screen.getByLabelText('Data de entrada')).toHaveTextContent('10 de jan de 2026')
    expect(screen.getByLabelText('E-mail')).toBeDisabled()
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@exemplo.test')
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 98888-1111')
    expect(screen.getByLabelText('Cidade')).toHaveValue('Santos')
    expect(screen.getByLabelText('UF')).toHaveTextContent('SP')
    expect(screen.getByLabelText('Carga semanal (horas)')).toHaveValue('40')
  })

  it('a lista de UF tem as 27 UFs mais a opção vazia', async () => {
    montarEditar()
    expect(await opcoesDo('UF')).toHaveLength(28)
  })

  it('admin muda nome, papel e times, e manda só o que mudou', async () => {
    const { aoSalvar } = montarEditar()
    await userEvent.clear(screen.getByLabelText('Nome'))
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana Souza')
    await escolherNoSeletor(userEvent, 'Papel', 'Gestor')
    await userEvent.click(screen.getByRole('checkbox', { name: /Implantação/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Suporte/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({
      mudancas: { nome: 'Ana Souza', papel: 'gestor' }, carga: undefined, timesAdicionar: ['t2'], timesRemover: ['t1'], foto: null,
    })
  })

  it('sem mudar nada, não manda campo nenhum', async () => {
    const { aoSalvar } = montarEditar({ perfilDeQuem: GESTOR })
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ mudancas: {}, carga: undefined, timesAdicionar: [], timesRemover: [], foto: null })
  })

  it('manda os campos da ficha que mudaram e a carga nova; esvaziar vira nulo', async () => {
    const { aoSalvar } = montarEditar()
    await userEvent.clear(screen.getByLabelText('Cargo'))
    await userEvent.clear(screen.getByLabelText('Telefone'))
    await userEvent.clear(screen.getByLabelText('Cidade'))
    await escolherNoSeletor(userEvent, 'UF', 'RJ')
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '35,5')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({
      mudancas: { cargo: null, telefone: null, cidade: null, uf: 'RJ' }, carga: 35.5,
    }))
  })

  it('gestor da consultoria edita a carga; outra consultoria não vê Capacidade', () => {
    montarEditar({ perfilDeQuem: GESTOR })
    expect(screen.getByRole('heading', { name: 'Capacidade' })).toBeInTheDocument()
  })

  it('quem é de outra consultoria não vê o bloco Capacidade', () => {
    montarEditar({ perfilDeQuem: { id: 'g2', papel: 'gestor', consultoria_id: 'c2' } })
    expect(screen.queryByRole('heading', { name: 'Capacidade' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Carga semanal (horas)')).not.toBeInTheDocument()
  })

  it('dono editando alguém da central não vê Capacidade nem Times', () => {
    montarEditar({
      perfilDeQuem: { id: 'd1', papel: 'dono' }, times: [],
      pessoa: { ...PESSOA, papel: 'central', consultoria_id: null, times: [] },
    })
    expect(screen.queryByRole('heading', { name: 'Capacidade' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Times' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument()
  })

  it('central edita o administrador: vê Capacidade, sem papel nem times', () => {
    montarEditar({
      perfilDeQuem: { id: 'c9', papel: 'central' }, times: [], pessoa: { ...PESSOA, papel: 'admin' },
    })
    expect(screen.getByLabelText('Carga semanal (horas)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('lista as ausências, com criar, editar e apagar', async () => {
    vi.mocked(listarAusencias).mockResolvedValue({
      itens: [{ id: 'a1', perfil_id: 'p1', de: '2026-12-20', ate: '2027-01-05', motivo: 'Férias' }], total: 1,
    })
    montarEditar()
    const tabela = await screen.findByRole('table', { name: 'Ausências' })
    expect(listarAusencias).toHaveBeenCalledWith('p1', { pagina: 1 })
    expect(within(tabela).getByRole('button', { name: /Editar/ })).toBeInTheDocument()
    expect(within(tabela).getByRole('button', { name: /Apagar/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Nova ausência/ }))
    expect(screen.getByRole('form', { name: 'Nova ausência' })).toBeInTheDocument()
  })

  it('a foto escolhida vai junto', async () => {
    const { aoSalvar } = montarEditar()
    const arquivo = new File(['x'], 'ana.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({ foto: { arquivo } }))
  })

  it('mostra o primeiro erro e mantém a janela aberta', async () => {
    const { aoSalvar, aoFechar } = montarEditar({ aoSalvar: vi.fn().mockResolvedValue({ erro: 'Não deu certo.' }) })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalled()
    expect(await screen.findByText('Não deu certo.')).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
  })

  it('bloco Acesso: reenviar convite e desativar, quando a página libera', async () => {
    const aoReenviar = vi.fn()
    const aoPedirAtivo = vi.fn()
    montarEditar({ pessoa: { ...PESSOA, convite_pendente: true }, podeReenviar: true, podeDesativar: true, aoReenviar, aoPedirAtivo })
    await userEvent.click(screen.getByRole('button', { name: /Reenviar convite/ }))
    expect(aoReenviar).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Desativar/ }))
    expect(aoPedirAtivo).toHaveBeenCalledWith('desativar')
  })

  it('bloco Acesso: sem permissão, não mostra os botões', () => {
    montarEditar({ pessoa: { ...PESSOA, convite_pendente: true } })
    expect(screen.queryByRole('button', { name: /Reenviar convite/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
  })
})
