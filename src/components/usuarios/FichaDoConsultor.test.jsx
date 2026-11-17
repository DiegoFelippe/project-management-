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
const opcoesDoPapel = async () => { await irPara('Papel e times'); return opcoesDo('Papel') }
const nomesDasAbas = () => screen.getAllByRole('tab').map((a) => a.textContent.replace(/, tem erro$/, ''))
const irPara = (nome) => userEvent.click(screen.getByRole('tab', { name: new RegExp(`^${nome}`) }))

async function preencher({ senha } = {}) {
  await userEvent.type(screen.getByLabelText('Nome'), 'João Pereira')
  await userEvent.type(screen.getByLabelText('E-mail'), 'joao@empresa.com.br')
  await irPara('Papel e times')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Implantação' }))
  if (senha) {
    await irPara('Acesso')
    await userEvent.click(screen.getByRole('radio', { name: /Definir senha provisória/ }))
    await userEvent.type(screen.getByLabelText('Senha provisória'), senha)
  }
}

describe('FichaDoConsultor: Novo acesso', () => {
  it('tem o título e as abas na ordem Dados pessoais, Papel e times, Capacidade, Acesso', () => {
    montarNovo()
    expect(screen.getByRole('dialog', { name: 'Nova pessoa' })).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(nomesDasAbas()).toEqual(['Dados pessoais', 'Papel e times', 'Capacidade', 'Acesso'])
    expect(screen.getByRole('tab', { name: 'Dados pessoais' })).toHaveAttribute('aria-selected', 'true')
  })

  it('a janela tem altura fixa e a largura do Hub, e só a aba escolhida aparece', async () => {
    montarNovo()
    const janela = screen.getByRole('dialog')
    expect(janela.className).toContain('sm:h-[min(760px')
    expect(janela.className).toContain('64rem')
    expect(screen.getByRole('tabpanel', { name: 'Dados pessoais' })).toBeVisible()
    expect(screen.queryByRole('tabpanel', { name: 'Acesso' })).not.toBeInTheDocument()
    await irPara('Acesso')
    expect(screen.getByRole('tabpanel', { name: 'Acesso' })).toBeVisible()
    expect(screen.queryByRole('tabpanel', { name: 'Dados pessoais' })).not.toBeInTheDocument()
  })

  it('o que foi digitado numa aba continua ao voltar para ela', async () => {
    montarNovo()
    await userEvent.type(screen.getByLabelText('Nome'), 'João')
    await irPara('Acesso')
    await irPara('Dados pessoais')
    expect(screen.getByLabelText('Nome')).toHaveValue('João')
  })

  it('o subtítulo diz o que acontece, conforme a forma de acesso', async () => {
    montarNovo()
    expect(screen.getByText(/recebe um e-mail para criar a senha/)).toBeInTheDocument()
    await irPara('Acesso')
    await userEvent.click(screen.getByRole('radio', { name: /Definir senha provisória/ }))
    expect(screen.getByText(/Você passa a senha provisória/)).toBeInTheDocument()
  })

  it('o botão principal é Enviar convite (convite) ou Criar pessoa (senha provisória), Cancelar ao lado', async () => {
    montarNovo()
    expect(screen.getByRole('button', { name: 'Enviar convite' })).toHaveClass('min-w-[150px]')
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    await irPara('Acesso')
    await userEvent.click(screen.getByRole('radio', { name: /Definir senha provisória/ }))
    expect(screen.getByRole('button', { name: 'Criar pessoa' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument()
  })

  it('Acesso: duas opções (cartões radio) e a nota de quando o acesso é criado', async () => {
    montarNovo()
    await irPara('Acesso')
    expect(screen.getByRole('radiogroup', { name: 'Como a pessoa entra' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Enviar convite por e-mail/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Definir senha provisória/ })).not.toBeChecked()
    expect(screen.getByText(/O acesso é criado quando você clica em/)).toBeInTheDocument()
  })

  it('o Novo não tem o botão de foto (a foto precisa do cadastro feito)', () => {
    montarNovo()
    expect(screen.queryByRole('button', { name: 'Trocar a foto' })).not.toBeInTheDocument()
  })

  it('e-mail inválido: ponto de erro na aba Dados pessoais e a ficha volta para ela', async () => {
    const { aoCriar } = montarNovo()
    await userEvent.type(screen.getByLabelText('Nome'), 'João Pereira')
    await irPara('Acesso')
    await userEvent.click(screen.getByRole('radio', { name: /Definir senha provisória/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Criar pessoa' }))
    expect(aoCriar).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Dados pessoais, tem erro' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Acesso, tem erro' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Digite um e-mail válido.')).toBeInTheDocument()
  })

  it('erro só na senha leva para a aba Acesso', async () => {
    const { aoCriar } = montarNovo()
    await userEvent.type(screen.getByLabelText('Nome'), 'João Pereira')
    await userEvent.type(screen.getByLabelText('E-mail'), 'joao@empresa.com.br')
    await irPara('Acesso')
    await userEvent.click(screen.getByRole('radio', { name: /Definir senha provisória/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Criar pessoa' }))
    expect(aoCriar).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Acesso, tem erro' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('A senha precisa ter pelo menos 8 caracteres.')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Dados pessoais, tem erro/ })).not.toBeInTheDocument()
  })

  it('carga inválida leva para a aba Capacidade', async () => {
    montarNovo()
    await preencher()
    await irPara('Capacidade')
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '70')
    await irPara('Dados pessoais')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(screen.getByRole('tab', { name: 'Capacidade, tem erro' })).toHaveAttribute('aria-selected', 'true')
  })

  it('gestor só cria consultor (papel pessoa no banco)', async () => {
    montarNovo()
    expect(await opcoesDoPapel()).toEqual(['Consultor'])
  })

  it('admin cria consultor ou gestor', async () => {
    montarNovo({ perfilDeQuem: ADMIN })
    expect(await opcoesDoPapel()).toEqual(['Consultor', 'Gestor'])
  })

  it('dono cria administrador ou central, sem times', async () => {
    const { aoCriar } = montarNovo({ perfilDeQuem: { id: 'd1', papel: 'dono' }, consultoriaId: 'c1', times: [] })
    expect(await opcoesDoPapel()).toEqual(['Administrador', 'Central'])
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await irPara('Dados pessoais')
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
    await irPara('Papel e times')
    await escolherNoSeletor(userEvent, 'Papel', 'Central')
    expect(screen.queryByLabelText('Carga semanal (horas)')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Capacidade' })).not.toBeInTheDocument()
    await irPara('Dados pessoais')
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
    await irPara('Dados pessoais')
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
    expect(screen.getByRole('tab', { name: 'Papel e times, tem erro' })).toHaveAttribute('aria-selected', 'true')
    await escolherNoSeletor(userEvent, 'Consultoria', 'Beta')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalledWith(expect.objectContaining({ consultoria_id: 'c2' }), expect.anything())
  })

  it('criar com senha mostra a senha provisória e muda o botão', async () => {
    montarNovo()
    await irPara('Acesso')
    expect(screen.queryByLabelText('Senha provisória')).not.toBeInTheDocument()
    await irPara('Acesso')
    await userEvent.click(screen.getByRole('radio', { name: /Definir senha provisória/ }))
    expect(screen.getByLabelText('Senha provisória')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar pessoa' })).toBeInTheDocument()
  })

  it('envia os dados certos, só com os campos novos que foram preenchidos', async () => {
    const { aoCriar } = montarNovo()
    await preencher({ senha: 'provisoria-1' })
    await userEvent.click(screen.getByRole('button', { name: 'Criar pessoa' }))
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
    await irPara('Dados pessoais')
    await userEvent.type(screen.getByLabelText('Cargo'), 'Analista')
    await userEvent.type(screen.getByLabelText('Telefone'), '(11) 99999-0000')
    await userEvent.type(screen.getByLabelText('Cidade'), 'Campinas')
    await escolherNoSeletor(userEvent, 'UF', 'SP')
    await escolherData(userEvent, 'Data de entrada', '2026-03-02')
    await irPara('Capacidade')
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '30,5')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalledWith(expect.objectContaining({
      cargo: 'Analista', telefone: '(11) 99999-0000', cidade: 'Campinas', uf: 'SP', data_entrada: '2026-03-02',
    }), { carga: 30.5 })
  })

  it('a carga 44, a padrão, não é enviada', async () => {
    const { aoCriar } = montarNovo()
    await irPara('Capacidade')
    expect(screen.getByLabelText('Carga semanal (horas)')).toHaveValue('44')
    await irPara('Dados pessoais')
    await preencher()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar.mock.calls[0][1]).toEqual({ carga: undefined })
  })

  it('carga fora de 0 a 60 não envia', async () => {
    const { aoCriar } = montarNovo()
    await preencher()
    await irPara('Capacidade')
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '70')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(await screen.findByText('Use de 0 a 60 horas.')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '40')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalled()
  })

  it('o Novo não mostra ausências', async () => {
    montarNovo()
    await irPara('Capacidade')
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
  it('abre com o nome no título e os dados da linha', async () => {
    montarEditar()
    expect(screen.getByRole('dialog', { name: 'Ficha de Ana Lima' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Ana Lima')
    expect(screen.getByLabelText('Cargo')).toHaveValue('Analista')
    expect(screen.getByLabelText('Data de entrada')).toHaveTextContent('10 de jan de 2026')
    expect(screen.getByLabelText('E-mail')).toBeDisabled()
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@exemplo.test')
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 98888-1111')
    expect(screen.getByLabelText('Cidade')).toHaveValue('Santos')
    expect(screen.getByLabelText('UF')).toHaveTextContent('SP')
    await irPara('Capacidade')
    expect(screen.getByLabelText('Carga semanal (horas)')).toHaveValue('40')
  })

  it('o calendário da data de entrada apaga os dias futuros', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T15:00:00Z') })
    try {
      montarEditar({ pessoa: { ...PESSOA, data_entrada: '2026-11-10' } })
      await userEvent.click(screen.getByLabelText('Data de entrada'))
      expect(screen.getByRole('button', { name: '16 de novembro de 2026' })).toBeEnabled()
      expect(screen.getByRole('button', { name: '17 de novembro de 2026' })).toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('data de entrada no futuro (vinda do cadastro) continua sem enviar', async () => {
    const { aoSalvar } = montarEditar({ pessoa: { ...PESSOA, data_entrada: '2099-01-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('A data de entrada não pode ser no futuro.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('a lista de UF tem as 27 UFs mais a opção vazia', async () => {
    montarEditar()
    expect(await opcoesDo('UF')).toHaveLength(28)
  })

  it('admin muda nome, papel e times, e manda só o que mudou', async () => {
    const { aoSalvar } = montarEditar()
    await userEvent.clear(screen.getByLabelText('Nome'))
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana Souza')
    await irPara('Papel e times')
    await escolherNoSeletor(userEvent, 'Papel', 'Gestor')
    await userEvent.click(screen.getByRole('checkbox', { name: /Implantação/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Suporte/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalledWith({
      mudancas: { nome: 'Ana Souza', papel: 'gestor' }, carga: undefined, timesAdicionar: ['t2'], timesRemover: ['t1'], foto: null,
    })
  })

  it('sem mudar nada, não manda campo nenhum', async () => {
    const { aoSalvar } = montarEditar({ perfilDeQuem: GESTOR })
    await irPara('Papel e times')
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalledWith({ mudancas: {}, carga: undefined, timesAdicionar: [], timesRemover: [], foto: null })
  })

  it('manda os campos da ficha que mudaram e a carga nova; esvaziar vira nulo', async () => {
    const { aoSalvar } = montarEditar()
    await userEvent.clear(screen.getByLabelText('Cargo'))
    await userEvent.clear(screen.getByLabelText('Telefone'))
    await userEvent.clear(screen.getByLabelText('Cidade'))
    await escolherNoSeletor(userEvent, 'UF', 'RJ')
    await irPara('Capacidade')
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '35,5')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({
      mudancas: { cargo: null, telefone: null, cidade: null, uf: 'RJ' }, carga: 35.5,
    }))
  })

  it('gestor da consultoria edita a carga; outra consultoria não vê Capacidade', () => {
    montarEditar({ perfilDeQuem: GESTOR })
    expect(screen.getByRole('tab', { name: 'Capacidade' })).toBeInTheDocument()
  })

  it('quem é de outra consultoria não vê a aba Capacidade', () => {
    montarEditar({ perfilDeQuem: { id: 'g2', papel: 'gestor', consultoria_id: 'c2' } })
    expect(screen.queryByRole('tab', { name: 'Capacidade' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Carga semanal (horas)')).not.toBeInTheDocument()
  })

  it('dono editando alguém da central não vê Capacidade nem Times', () => {
    montarEditar({
      perfilDeQuem: { id: 'd1', papel: 'dono' }, times: [],
      pessoa: { ...PESSOA, papel: 'central', consultoria_id: null, times: [] },
    })
    expect(screen.queryByRole('tab', { name: 'Capacidade' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Times' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument()
    expect(nomesDasAbas()).toEqual(['Dados pessoais'])
  })

  it('central edita o administrador: vê Capacidade, sem papel nem times', async () => {
    montarEditar({
      perfilDeQuem: { id: 'c9', papel: 'central' }, times: [], pessoa: { ...PESSOA, papel: 'admin' },
    })
    expect(nomesDasAbas()).toEqual(['Dados pessoais', 'Capacidade'])
    await irPara('Capacidade')
    expect(screen.getByLabelText('Carga semanal (horas)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('lista as ausências, com criar, editar e apagar', async () => {
    vi.mocked(listarAusencias).mockResolvedValue({
      itens: [{ id: 'a1', perfil_id: 'p1', de: '2026-12-20', ate: '2027-01-05', motivo: 'Férias' }], total: 1,
    })
    montarEditar()
    await irPara('Capacidade')
    const tabela = await screen.findByRole('table', { name: 'Ausências' })
    expect(listarAusencias).toHaveBeenCalledWith('p1', { pagina: 1 })
    expect(within(tabela).getByRole('button', { name: /Editar/ })).toBeInTheDocument()
    expect(within(tabela).getByRole('button', { name: /Apagar/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Nova ausência/ }))
    expect(screen.getByRole('form', { name: 'Nova ausência' })).toBeInTheDocument()
  })

  it('a foto escolhida vai junto', async () => {
    const { aoSalvar } = montarEditar()
    expect(screen.getByRole('button', { name: 'Trocar a foto' })).toBeInTheDocument()
    const arquivo = new File(['x'], 'ana.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({ foto: { arquivo } }))
  })

  it('mostra o primeiro erro e mantém a janela aberta', async () => {
    const { aoSalvar, aoFechar } = montarEditar({ aoSalvar: vi.fn().mockResolvedValue({ erro: 'Não deu certo.' }) })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalled()
    expect(await screen.findByText('Não deu certo.')).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
  })

  it('aba Acesso: reenviar convite (no cartão de status) e desativar (no rodapé, à esquerda), quando a página libera', async () => {
    const aoReenviar = vi.fn()
    const aoPedirAtivo = vi.fn()
    montarEditar({ pessoa: { ...PESSOA, convite_pendente: true }, podeReenviar: true, podeDesativar: true, aoReenviar, aoPedirAtivo })
    await irPara('Acesso')
    expect(screen.getByText('Convite pendente')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Reenviar convite/ }))
    expect(aoReenviar).toHaveBeenCalled()
    const rodape = document.querySelector('[data-slot="janela-rodape"]')
    const desativar = screen.getByRole('button', { name: /Desativar/ })
    expect(rodape).toContainElement(desativar)
    expect(rodape.firstElementChild).toContainElement(desativar)
    expect(desativar).toHaveClass('text-notice')
    await userEvent.click(desativar)
    expect(aoPedirAtivo).toHaveBeenCalledWith('desativar')
  })

  it('Desativar fica no rodapé em qualquer aba; pessoa desativada tem Reativar em verde', async () => {
    const aoPedirAtivo = vi.fn()
    montarEditar({ pessoa: { ...PESSOA, ativo: false }, podeDesativar: true, aoPedirAtivo })
    expect(screen.queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
    expect(screen.getByText('Desativado')).toBeInTheDocument()
    const reativar = screen.getByRole('button', { name: /Reativar/ })
    expect(reativar).toHaveClass('text-positive')
    await userEvent.click(reativar)
    expect(aoPedirAtivo).toHaveBeenCalledWith('reativar')
  })

  it('Dados pessoais: foto de 96 px, nome ao lado e selos (papel, convite pendente)', () => {
    montarEditar({ pessoa: { ...PESSOA, convite_pendente: true } })
    const cartao = screen.getByRole('group', { name: 'Identificação' })
    expect(within(cartao).getByLabelText('Nome')).toBeInTheDocument()
    expect(within(cartao).getByText('Consultor')).toBeInTheDocument()
    expect(within(cartao).getByText('Convite pendente')).toBeInTheDocument()
    expect(within(cartao).getByRole('button', { name: 'Trocar a foto' })).toBeInTheDocument()
  })

  it('o subtítulo do Editar fala dos dados, do papel, da capacidade e do acesso', () => {
    montarEditar()
    expect(screen.getByText('Os dados, o papel, a capacidade e o acesso.')).toBeInTheDocument()
  })

  it('aba Acesso: cartão de status mostra Senha provisória', async () => {
    montarEditar({ pessoa: { ...PESSOA, precisa_trocar_senha: true }, podeDesativar: true })
    await irPara('Acesso')
    expect(within(screen.getByRole('tabpanel', { name: 'Acesso' })).getByText('Senha provisória')).toBeInTheDocument()
  })

  it('aba Acesso: sem permissão, não mostra os botões', () => {
    montarEditar({ pessoa: { ...PESSOA, convite_pendente: true } })
    expect(screen.queryByRole('button', { name: /Reenviar convite/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Acesso' })).not.toBeInTheDocument()
  })
})
