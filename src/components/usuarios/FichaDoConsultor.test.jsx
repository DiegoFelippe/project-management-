import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listarAusencias } from '@/data/capacidade'
import { escolherData, escolherNoSeletor } from '@/test/campos'
import FichaDoConsultor from './FichaDoConsultor'

vi.mock('@/data/capacidade', () => ({
  listarAusencias: vi.fn(), criarAusencia: vi.fn(), editarAusencia: vi.fn(), apagarAusencia: vi.fn(),
}))
vi.mock('@/data/verificacao', () => ({
  iniciarCadastro: vi.fn(), concluirCadastro: vi.fn(), cancelarCadastro: vi.fn(), desativarVerificacao: vi.fn(),
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
const nomesDasAbas = () => screen.getAllByRole('tab').map((a) => a.textContent.replace(/, tem erro$/, ''))
const irPara = (nome) => userEvent.click(screen.getByRole('tab', { name: new RegExp(`^${nome}`) }))

async function preencher({ senha } = {}) {
  await userEvent.type(screen.getByLabelText('Nome'), 'João Pereira')
  await userEvent.type(screen.getByLabelText('E-mail'), 'joao@empresa.com.br')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Implantação' }))
  if (senha) {
    await irPara('Acesso')
    await userEvent.click(screen.getByRole('radio', { name: /Definir senha provisória/ }))
    await userEvent.type(screen.getByLabelText('Senha provisória'), senha)
  }
}

describe('FichaDoConsultor: Novo acesso', () => {
  it('tem o título e só duas abas: Dados pessoais e Acesso', () => {
    montarNovo()
    expect(screen.getByRole('dialog', { name: 'Nova pessoa' })).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(nomesDasAbas()).toEqual(['Dados pessoais', 'Acesso'])
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

  it('Acesso com senha provisória: campo, medidor, regras, botões e a dica num cartão só; a chave "Exigir" na seção dela', async () => {
    montarNovo({ perfilDeQuem: ADMIN })
    await irPara('Acesso')
    await userEvent.click(screen.getByRole('radio', { name: /Definir senha provisória/ }))
    const cartao = screen.getByLabelText('Senha provisória').closest('[data-slot="cartao-secao"]')
    expect(cartao).not.toBeNull()
    expect(within(cartao).getByRole('meter', { name: 'Força da senha' })).toBeInTheDocument()
    expect(within(cartao).getByRole('list', { name: 'Regras da senha' })).toBeInTheDocument()
    expect(within(cartao).getAllByRole('button').map((b) => b.textContent.trim()).filter(Boolean)).toEqual(['Gerar senha', 'Copiar', 'Validar'])
    expect(within(cartao).getByText('Só senha forte é aceita. A pessoa troca no primeiro acesso.')).toBeInTheDocument()
    const verificacao = screen.getByRole('heading', { name: 'Verificação em duas etapas' }).closest('section')
    const exigir = within(verificacao).getByRole('switch', { name: /Exigir verificação em duas etapas/ })
    expect(cartao).not.toContainElement(exigir)
  })

  it('Dados pessoais traz, depois dos campos, as seções Papel e times e Capacidade (nada de abas para elas)', () => {
    montarNovo()
    const painel = screen.getByRole('tabpanel', { name: 'Dados pessoais' })
    expect(within(painel).getByRole('heading', { name: 'Papel e times' })).toBeInTheDocument()
    expect(within(painel).getByRole('heading', { name: 'Capacidade' })).toBeInTheDocument()
    expect(within(painel).getByLabelText('Carga semanal (horas)')).toBeInTheDocument()
    expect(within(painel).getByRole('checkbox', { name: 'Implantação' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Papel e times|Capacidade/ })).not.toBeInTheDocument()
  })

  it('o Novo tem o botão de foto: a prévia aparece e o arquivo vai junto no pedido de criar', async () => {
    const { aoCriar } = montarNovo()
    const arquivo = new File(['x'], 'rosto.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    expect(screen.getByRole('img', { name: 'Prévia da foto' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Cor do avatar' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nome'), 'João Pereira')
    await userEvent.type(screen.getByLabelText('E-mail'), 'joao@empresa.com.br')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ foto: { arquivo } }))
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
    // O erro fica embaixo do campo e o descreve (usabilidade, U2).
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription(/Digite um e-mail válido/)
  })

  it('erro só na senha leva para a aba Acesso e foca a senha', async () => {
    const { aoCriar } = montarNovo()
    await userEvent.type(screen.getByLabelText('Nome'), 'João Pereira')
    await userEvent.type(screen.getByLabelText('E-mail'), 'joao@empresa.com.br')
    await irPara('Acesso')
    await userEvent.click(screen.getByRole('radio', { name: /Definir senha provisória/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Criar pessoa' }))
    expect(aoCriar).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Acesso, tem erro' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('A senha provisória precisa ser forte: confira as regras abaixo do campo.')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha provisória')).toHaveFocus()
    expect(screen.queryByRole('tab', { name: /Dados pessoais, tem erro/ })).not.toBeInTheDocument()
  })

  it('carga inválida mostra o erro na seção Capacidade e foca o campo', async () => {
    montarNovo()
    await preencher()
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '70')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(screen.getByRole('tab', { name: 'Dados pessoais, tem erro' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Use de 0 a 60 horas.')).toBeInTheDocument()
    expect(screen.getByLabelText('Carga semanal (horas)')).toHaveFocus()
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
    expect(screen.queryByRole('group', { name: 'Times' })).not.toBeInTheDocument()
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
    await escolherNoSeletor(userEvent, 'Papel', 'Central')
    expect(screen.queryByLabelText('Carga semanal (horas)')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Capacidade' })).not.toBeInTheDocument()
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
    expect(screen.getByRole('tab', { name: 'Dados pessoais, tem erro' })).toHaveAttribute('aria-selected', 'true')
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
    await preencher({ senha: 'Provisoria-1!' })
    await userEvent.click(screen.getByRole('button', { name: 'Criar pessoa' }))
    expect(aoCriar).toHaveBeenCalledWith({
      forma: 'senha',
      nome: 'João Pereira',
      email: 'joao@empresa.com.br',
      papel: 'pessoa',
      times: ['t1'],
      senha: 'Provisoria-1!',
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
    await irPara('Dados pessoais')
    await preencher()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar.mock.calls[0][1]).toEqual({ carga: undefined })
  })

  it('carga fora de 0 a 60 não envia', async () => {
    const { aoCriar } = montarNovo()
    await preencher()
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

  it('e-mail que já tem acesso, vindo da aba Acesso: volta para Dados pessoais e foca as caixas de times', async () => {
    montarNovo({
      aoCriar: vi.fn().mockResolvedValue({ codigo: 'ja_na_consultoria', erro: 'Essa pessoa já tem acesso na sua consultoria.', pessoa: { id: 'p1', nome: 'João' } }),
    })
    await preencher({ senha: 'Senha-forte-1!' })
    expect(screen.getByRole('tab', { name: 'Acesso' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Criar pessoa' }))
    expect(await screen.findByText('Essa pessoa já tem acesso na sua consultoria.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Dados pessoais' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('checkbox', { name: 'Implantação' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Colocar nos times marcados' })).toBeEnabled()
  })
})

describe('FichaDoConsultor: tipo de consultoria (Novo acesso)', () => {
  it('tem o grupo "Tipo de consultoria" com quatro caixas, todas desmarcadas', () => {
    montarNovo()
    const grupo = screen.getByRole('group', { name: 'Tipo de consultoria' })
    expect(within(grupo).getAllByRole('checkbox')).toHaveLength(4)
    for (const nome of ['Gestão', 'Sucesso do Cliente', 'Assessoria Jurídica', 'Gestão de Pessoas']) {
      expect(within(grupo).getByRole('checkbox', { name: nome })).not.toBeChecked()
    }
  })

  it('criar com tipos manda a lista na ordem do pedido', async () => {
    const { aoCriar } = montarNovo()
    await preencher()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Gestão de Pessoas' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Gestão' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar.mock.calls[0][0].tipos_de_consultoria).toEqual(['gestao', 'gestao_de_pessoas'])
  })

  it('criar sem marcar nenhum não manda o campo', async () => {
    const { aoCriar } = montarNovo()
    await preencher()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar.mock.calls[0][0]).not.toHaveProperty('tipos_de_consultoria')
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
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '35,5')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({
      mudancas: { cargo: null, telefone: null, cidade: null, uf: 'RJ' }, carga: 35.5,
    }))
  })

  it('gestor da consultoria edita a carga; outra consultoria não vê Capacidade', () => {
    montarEditar({ perfilDeQuem: GESTOR })
    expect(screen.getByRole('heading', { name: 'Capacidade' })).toBeInTheDocument()
  })

  // Auditoria, R4 (a mesma regra das seções de Check-lists): o gestor, que não mexe no acesso, tem só "Dados pessoais".
  // Uma barra com uma aba só parece que falta alguma: sem a barra, os dados vêm direto, sem o papel de painel de aba.
  it('a ficha do gestor tem uma aba só: sem a barra de abas, com os dados direto', () => {
    montarEditar({ perfilDeQuem: GESTOR })
    const janela = screen.getByRole('dialog', { name: 'Ficha de Ana Lima' })
    expect(within(janela).queryByRole('tablist')).not.toBeInTheDocument()
    expect(within(janela).queryByRole('tabpanel')).not.toBeInTheDocument()
    expect(within(janela).getByLabelText('Nome')).toHaveValue('Ana Lima')
  })

  it('quem é de outra consultoria não vê a aba Capacidade', () => {
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
    // Uma aba só: sem a barra de abas (auditoria, R4).
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('central edita o administrador: vê Capacidade, sem papel nem times', async () => {
    montarEditar({
      perfilDeQuem: { id: 'c9', papel: 'central' }, times: [], pessoa: { ...PESSOA, papel: 'admin' },
    })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Capacidade' })).toBeInTheDocument()
    expect(screen.getByLabelText('Carga semanal (horas)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Times' })).not.toBeInTheDocument()
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

  it('a cor do avatar: sem foto, escolhe uma amostra, a prévia das iniciais muda na hora e a cor vai ao salvar', async () => {
    const { aoSalvar } = montarEditar()
    const grupo = screen.getByRole('radiogroup', { name: 'Cor do avatar' })
    expect(within(grupo).getAllByRole('radio')).toHaveLength(9) // 8 cores + Automática
    expect(within(grupo).getByRole('radio', { name: 'Automática' })).toBeChecked()
    expect(within(grupo).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    await userEvent.click(within(grupo).getByRole('radio', { name: 'Violeta' }))
    expect(within(grupo).getByRole('radio', { name: 'Violeta' })).toBeChecked()
    expect(screen.getByText('AL')).toHaveStyle({ backgroundColor: '#7c3aed' })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({ cor: '#7c3aed' }))
  })

  it('Automática limpa a cor guardada: manda null e a prévia volta à cor automática', async () => {
    const { aoSalvar } = montarEditar({ pessoa: { ...PESSOA, cor: '#16a34a' } })
    await userEvent.click(screen.getByRole('radio', { name: 'Automática' }))
    expect(screen.getByRole('radio', { name: 'Automática' })).toBeChecked()
    expect(screen.queryByRole('radio', { name: 'Verde', checked: true })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar.mock.calls[0][0].cor).toBeNull()
  })

  it('escolher a cor e voltar para Automática sem cor guardada não manda nada', async () => {
    const { aoSalvar } = montarEditar()
    await userEvent.click(screen.getByRole('radio', { name: 'Rosa' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Automática' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar.mock.calls[0][0].cor).toBeUndefined()
  })

  it('a cor guardada da pessoa já vem marcada, e sem mexer nada não é enviada', async () => {
    const { aoSalvar } = montarEditar({ pessoa: { ...PESSOA, cor: '#16a34a' } })
    expect(screen.getByRole('radio', { name: 'Verde' })).toBeChecked()
    expect(screen.getByText('AL')).toHaveStyle({ backgroundColor: '#16a34a' })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar.mock.calls[0][0].cor).toBeUndefined()
  })

  it('as setas mudam a cor escolhida', async () => {
    montarEditar({ pessoa: { ...PESSOA, cor: '#2563eb' } })
    screen.getByRole('radio', { name: 'Azul' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Turquesa' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Turquesa' })).toHaveFocus()
  })

  it('com foto, a cor não aparece; ao tirar a foto, ela volta', async () => {
    montarEditar({ pessoa: { ...PESSOA, foto: 'p1/abc.webp' } })
    expect(screen.queryByRole('radiogroup', { name: 'Cor do avatar' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tirar foto' }))
    expect(screen.getByRole('radiogroup', { name: 'Cor do avatar' })).toBeInTheDocument()
  })

  it('no Novo, escolher a cor vai junto no pedido de criar', async () => {
    const { aoCriar } = montarNovo()
    await userEvent.click(screen.getByRole('radio', { name: 'Laranja' }))
    expect(screen.getByRole('radio', { name: 'Laranja' })).toBeChecked()
    await userEvent.type(screen.getByLabelText('Nome'), 'João Pereira')
    await userEvent.type(screen.getByLabelText('E-mail'), 'joao@empresa.com.br')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cor: '#ea580c' }))
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

  it('aba Acesso: Situação (estado e e-mail de acesso) e a verificação num cartão só, com a chave e a situação', async () => {
    montarEditar({ podeDesativar: true })
    await irPara('Acesso')
    const situacao = screen.getByRole('heading', { name: 'Situação' }).closest('section')
    expect(within(situacao).getByText('Ativo')).toBeInTheDocument()
    expect(within(situacao).getByText('Pode entrar no app.')).toBeInTheDocument()
    expect(within(situacao).getByText('E-mail de acesso')).toBeInTheDocument()
    expect(within(situacao).getByText('ana@exemplo.test')).toBeInTheDocument()
    const cartao = screen.getByRole('switch', { name: /Exigir verificação em duas etapas/ }).closest('[data-slot="cartao-secao"]')
    expect(within(cartao).getByText('Desligada')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Verificação em duas etapas' }).closest('section')).toContainElement(cartao)
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

describe('FichaDoConsultor: tipo de consultoria (Editar)', () => {
  it('abre com os tipos da pessoa marcados', () => {
    montarEditar({ pessoa: { ...PESSOA, tipos_de_consultoria: ['sucesso_do_cliente', 'gestao_de_pessoas'] } })
    expect(screen.getByRole('checkbox', { name: 'Gestão' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Sucesso do Cliente' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Assessoria Jurídica' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Gestão de Pessoas' })).toBeChecked()
  })

  it('marcar e desmarcar manda a lista nova; sem mexer, não manda', async () => {
    const { aoSalvar } = montarEditar({ pessoa: { ...PESSOA, tipos_de_consultoria: ['sucesso_do_cliente'] } })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar.mock.calls[0][0].mudancas).toEqual({})
    await userEvent.click(screen.getByRole('checkbox', { name: 'Assessoria Jurídica' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sucesso do Cliente' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Gestão' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar.mock.calls[1][0].mudancas).toEqual({ tipos_de_consultoria: ['gestao', 'assessoria_juridica'] })
  })

  it('desmarcar todos manda a lista vazia (apagar = desmarcar)', async () => {
    const { aoSalvar } = montarEditar({ pessoa: { ...PESSOA, tipos_de_consultoria: ['gestao'] } })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Gestão' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar.mock.calls[0][0].mudancas).toEqual({ tipos_de_consultoria: [] })
  })

  it('pessoa sem a lista (dados antigos) abre com tudo desmarcado', () => {
    montarEditar()
    expect(screen.getAllByRole('checkbox', { name: /^(Gestão|Sucesso do Cliente|Assessoria Jurídica|Gestão de Pessoas)$/ }).filter((c) => c.checked)).toHaveLength(0)
  })
})

describe('FichaDoConsultor: verificação em duas etapas (aba Acesso)', () => {
  const chave = () => screen.getByRole('switch', { name: /Exigir verificação em duas etapas/ })

  it('quem edita o acesso liga "Exigir" e o salvar manda exige_2fa', async () => {
    const { aoSalvar } = montarEditar({ podeDesativar: true })
    await irPara('Acesso')
    expect(chave()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Desligada')).toBeInTheDocument()
    await userEvent.click(chave())
    expect(chave()).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Ainda não configurada')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({ mudancas: { exige_2fa: true } }))
  })

  it('desligar a exigência de quem já tinha manda exige_2fa: false; sem mexer, não manda', async () => {
    const { aoSalvar } = montarEditar({ podeDesativar: true, pessoa: { ...PESSOA, exige_2fa: true } })
    await irPara('Acesso')
    expect(chave()).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(chave())
    await userEvent.click(chave())
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar.mock.calls[0][0].mudancas).toEqual({})
    await userEvent.click(chave())
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar.mock.calls[1][0].mudancas).toEqual({ exige_2fa: false })
  })

  it('com o app ativo: mostra desde quando e o Zerar pede confirmação à página', async () => {
    const aoPedirZerar2fa = vi.fn()
    montarEditar({ podeDesativar: true, aoPedirZerar2fa, pessoa: { ...PESSOA, verificacao_desde: '2026-11-10T15:00:00Z' } })
    await irPara('Acesso')
    expect(screen.getByText('Ativa desde 10/11/2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Zerar verificação em duas etapas/ }))
    expect(aoPedirZerar2fa).toHaveBeenCalledWith({ exigida: false })
  })

  it('o Zerar leva a chave Exigir como está na ficha, mesmo antes de salvar', async () => {
    const aoPedirZerar2fa = vi.fn()
    montarEditar({ podeDesativar: true, aoPedirZerar2fa, pessoa: { ...PESSOA, verificacao_desde: '2026-11-10T15:00:00Z' } })
    await irPara('Acesso')
    await userEvent.click(screen.getByRole('switch', { name: /Exigir verificação em duas etapas/ }))
    await userEvent.click(screen.getByRole('button', { name: /Zerar verificação em duas etapas/ }))
    expect(aoPedirZerar2fa).toHaveBeenCalledWith({ exigida: true })
  })

  it('sem o app ativo, não há o que zerar', async () => {
    montarEditar({ podeDesativar: true, aoPedirZerar2fa: vi.fn() })
    await irPara('Acesso')
    expect(screen.queryByRole('button', { name: /Zerar verificação/ })).not.toBeInTheDocument()
  })

  it('quem não edita o acesso (gestor) não vê a chave nem o Zerar', () => {
    montarEditar({ perfilDeQuem: GESTOR, pessoa: { ...PESSOA, verificacao_desde: '2026-11-10T15:00:00Z' } })
    expect(screen.queryByRole('tab', { name: 'Acesso' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('Novo (administrador): exigir já na criação manda exige_2fa: true', async () => {
    const { aoCriar } = montarNovo({ perfilDeQuem: ADMIN })
    await preencher()
    await irPara('Acesso')
    await userEvent.click(chave())
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(aoCriar).toHaveBeenCalledWith(expect.objectContaining({ exige_2fa: true }), expect.anything())
  })

  it('Novo (gestor): sem a chave, porque depois ele não edita o acesso da pessoa', async () => {
    montarNovo()
    await irPara('Acesso')
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

// Modo próprio (Meu perfil): a mesma ficha, aberta por quem é a própria pessoa (pela bolinha do trilho ou pela
// própria linha em Usuários). Só muda o que o banco aceita dela: nome, foto, cor e contato; senha e app autenticador
// na aba Acesso. O resto aparece com o valor, só para ler.
const EU = {
  id: 'a1', nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'admin', consultoria_id: 'c1', consultoria: { nome: 'Acme' },
  telefone: '(11) 97777-0000', cidade: 'Santos', uf: 'SP', cargo: 'Consultor sênior', data_entrada: '2026-01-10', carga_semanal: 40,
  tipos_de_consultoria: ['gestao', 'sucesso_do_cliente'], exige_2fa: false, verificacao_desde: null,
}

function montarPropria(props = {}) {
  const funcoes = { aoSalvar: vi.fn().mockResolvedValue({ erro: null }), aoFechar: vi.fn(), ...props }
  render(<FichaDoConsultor aberto perfilDeQuem={EU} pessoa={EU} times={TIMES} {...props} {...funcoes} />)
  return funcoes
}

const rodape = () => document.querySelector('[data-slot="janela-rodape"]')

describe('FichaDoConsultor: modo próprio (Meu perfil)', () => {
  it('a própria ficha se chama Meu perfil e tem as abas Dados pessoais e Acesso', () => {
    montarPropria()
    expect(screen.getByRole('dialog', { name: 'Meu perfil' })).toBeInTheDocument()
    expect(nomesDasAbas()).toEqual(['Dados pessoais', 'Acesso'])
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('muda nome, foto, cor, telefone, cidade e UF; e-mail, papel, consultoria, cargo, entrada, carga e tipos só para ler', () => {
    montarPropria()
    for (const campo of ['Nome', 'Telefone', 'Cidade', 'UF']) expect(screen.getByLabelText(campo), campo).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Trocar a foto' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Cor do avatar' })).toBeInTheDocument()

    expect(screen.getByLabelText('E-mail')).toBeDisabled()
    expect(screen.getByLabelText('E-mail')).toHaveValue('diego@exemplo.test')
    expect(screen.getByLabelText('Papel')).toBeDisabled()
    expect(screen.getByLabelText('Papel')).toHaveValue('Administrador')
    expect(screen.getByLabelText('Consultoria')).toBeDisabled()
    expect(screen.getByLabelText('Consultoria')).toHaveValue('Acme')
    expect(screen.getByLabelText('Cargo')).toBeDisabled()
    expect(screen.getByLabelText('Cargo')).toHaveValue('Consultor sênior')
    expect(screen.getByLabelText('Data de entrada')).toBeDisabled()
    expect(screen.getByLabelText('Data de entrada')).toHaveTextContent('10 de jan de 2026')
    expect(screen.getByLabelText('Carga semanal')).toBeDisabled()
    expect(screen.getByLabelText('Carga semanal')).toHaveValue('40 h por semana')
    expect(screen.getByRole('checkbox', { name: 'Gestão' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Gestão' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Assessoria Jurídica' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Assessoria Jurídica' })).toBeDisabled()
  })

  it('administrador na própria ficha: sem escolher papel, sem times, sem carga para mudar, sem ausências e sem Desativar', () => {
    montarPropria({ podeDesativar: true, podeReenviar: true, aoPedirAtivo: vi.fn() })
    expect(screen.queryByRole('checkbox', { name: 'Implantação' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Carga semanal (horas)')).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Ausências' })).not.toBeInTheDocument()
    expect(listarAusencias).not.toHaveBeenCalled()
    expect(within(rodape()).queryByRole('button', { name: /Desativar|Reativar/ })).not.toBeInTheDocument()
  })

  it('o dono vê o papel com o nome dele (Administrador geral) e nenhuma consultoria', () => {
    const dono = { ...EU, id: 'd1', papel: 'dono', consultoria_id: null, consultoria: null, carga_semanal: null }
    montarPropria({ pessoa: dono, perfilDeQuem: dono })
    expect(screen.getByLabelText('Papel')).toHaveValue('Administrador geral')
    expect(screen.queryByLabelText('Consultoria')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Carga semanal')).not.toBeInTheDocument()
  })

  it('salvar manda só o que a pessoa pode: o nome, o contato inteiro, a foto e a cor', async () => {
    const { aoSalvar } = montarPropria()
    await userEvent.clear(screen.getByLabelText('Nome'))
    await userEvent.type(screen.getByLabelText('Nome'), 'Diego F.')
    await userEvent.clear(screen.getByLabelText('Telefone'))
    await userEvent.type(screen.getByLabelText('Telefone'), '(13) 3333-4444')
    await userEvent.clear(screen.getByLabelText('Cidade'))
    await escolherNoSeletor(userEvent, 'UF', 'RJ')
    await userEvent.click(screen.getByRole('radio', { name: 'Rosa' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalledWith({
      mudancas: { nome: 'Diego F.' }, contato: { telefone: '(13) 3333-4444', cidade: '', uf: 'RJ' }, foto: null, cor: '#db2777',
    })
    const pedido = aoSalvar.mock.calls[0][0]
    expect(Object.keys(pedido.mudancas)).toEqual(['nome'])
    expect(pedido).not.toHaveProperty('carga')
    expect(pedido).not.toHaveProperty('timesAdicionar')
  })

  it('só o telefone mudou: o contato vai inteiro, e sem mexer em nada não vai nome nem contato', async () => {
    const { aoSalvar } = montarPropria()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar.mock.calls[0][0].mudancas).toEqual({})
    expect(aoSalvar.mock.calls[0][0].contato).toBeUndefined()
    expect(aoSalvar.mock.calls[0][0].senha).toBeUndefined()
    // Troca o último número: o telefone continua com 11 números (usabilidade, U2).
    await userEvent.type(screen.getByLabelText('Telefone'), '{Backspace}9')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar.mock.calls[1][0].contato).toEqual({ telefone: '(11) 97777-0009', cidade: 'Santos', uf: 'SP' })
  })

  it('a data de entrada não é da pessoa: mesmo no futuro (vinda do cadastro), não impede salvar', async () => {
    const { aoSalvar } = montarPropria({ pessoa: { ...EU, data_entrada: '2099-01-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalled()
  })

  it('aba Acesso: trocar a senha (medidor, Validar, Gerar), a exigência só para ler, sem Zerar e sem cartão do convite', async () => {
    montarPropria({ podeDesativar: true, aoPedirZerar2fa: vi.fn(), pessoa: { ...EU, verificacao_desde: '2026-11-10T15:00:00Z' } })
    await irPara('Acesso')
    const painel = screen.getByRole('tabpanel', { name: 'Acesso' })
    expect(within(painel).getByLabelText('Senha nova')).toBeInTheDocument()
    expect(within(painel).getByLabelText('Repita a senha nova')).toBeInTheDocument()
    expect(within(painel).getByRole('meter', { name: 'Força da senha' })).toBeInTheDocument()
    expect(within(painel).getByRole('button', { name: 'Validar' })).toBeInTheDocument()
    expect(within(painel).getByRole('button', { name: 'Gerar senha' })).toBeInTheDocument()
    const exigir = within(painel).getByRole('switch', { name: /Exigir verificação em duas etapas/ })
    expect(exigir).toBeDisabled()
    expect(exigir).toHaveAttribute('aria-checked', 'false')
    expect(within(painel).getByText('Ativa desde 10/11/2026')).toBeInTheDocument()
    expect(within(painel).getByRole('button', { name: /Desativar/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Zerar/ })).not.toBeInTheDocument()
    expect(within(painel).queryByText('Pode entrar no app.')).not.toBeInTheDocument()
    expect(within(rodape()).queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
  })

  it('com a verificação exigida e ativa, não há Desativar e a tela diz por quê', async () => {
    montarPropria({ pessoa: { ...EU, exige_2fa: true, verificacao_desde: '2026-11-10T15:00:00Z' } })
    await irPara('Acesso')
    const secao = screen.getByRole('region', { name: 'Verificação em duas etapas' })
    expect(within(secao).getByRole('switch', { name: /Exigir verificação/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(secao).queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument()
    expect(within(secao).getByText(/exigida para o seu acesso/)).toBeInTheDocument()
  })

  it('senha fraca ou diferente não vai; forte e repetida vai no salvar', async () => {
    const { aoSalvar } = montarPropria()
    await irPara('Acesso')
    await userEvent.type(screen.getByLabelText('Senha nova'), 'senha-nova-1')
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'senha-nova-1')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).not.toHaveBeenCalled()
    expect(screen.getByText('A senha precisa ser forte: confira as regras abaixo do campo.')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Senha nova'))
    await userEvent.type(screen.getByLabelText('Senha nova'), 'Senha-nova-1!')
    await userEvent.clear(screen.getByLabelText('Repita a senha nova'))
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'Senha-outra-1!')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).not.toHaveBeenCalled()
    expect(screen.getByText('As senhas não são iguais.')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Repita a senha nova'))
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'Senha-nova-1!')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({ mudancas: {}, senha: 'Senha-nova-1!' }))
  })

  it('erro na senha, salvando de Dados pessoais, leva para a aba Acesso e foca a senha', async () => {
    const { aoSalvar } = montarPropria()
    await irPara('Acesso')
    await userEvent.type(screen.getByLabelText('Senha nova'), 'fraca')
    await irPara('Dados pessoais')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(aoSalvar).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Acesso, tem erro' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Senha nova')).toHaveFocus()
  })

  it('erro de um campo vindo de quem salva (ex.: a senha recusada pelo servidor) marca a aba e o campo', async () => {
    montarPropria({ aoSalvar: vi.fn().mockResolvedValue({ erro: 'Nome salvo. A senha não mudou: Igual.', erros: { senha: 'Igual.' } }) })
    await irPara('Acesso')
    await userEvent.type(screen.getByLabelText('Senha nova'), 'Senha-nova-1!')
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'Senha-nova-1!')
    await irPara('Dados pessoais')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Nome salvo. A senha não mudou: Igual.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Acesso, tem erro' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Igual.')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha nova')).toHaveFocus()
  })

  it('a carga só para ler diz onde ela muda: administração e gestão na própria linha de Usuários, o consultor com a gestão', () => {
    montarPropria()
    expect(screen.getByText(/use Capacidade na sua linha em Usuários/)).toBeInTheDocument()
    expect(screen.queryByText(/quem muda é a gestão da consultoria/)).not.toBeInTheDocument()
  })

  it('consultor: a carga e as ausências quem muda é a gestão da consultoria', () => {
    const consultor = { ...EU, id: 'p7', papel: 'pessoa' }
    montarPropria({ pessoa: consultor, perfilDeQuem: consultor })
    expect(screen.getByText(/quem muda é a gestão da consultoria/)).toBeInTheDocument()
    expect(screen.queryByText(/Capacidade na sua linha/)).not.toBeInTheDocument()
  })

  it('a ficha de outra pessoa não tem a troca de senha nem a verificação da própria pessoa', async () => {
    montarEditar({ podeDesativar: true })
    expect(screen.getByRole('dialog', { name: 'Ficha de Ana Lima' })).toBeInTheDocument()
    await irPara('Acesso')
    expect(screen.queryByLabelText('Senha nova')).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Exigir verificação/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^Ativar/ })).not.toBeInTheDocument()
  })
})
