import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tarefasDoCheckin } from '@/data/checkins'
import { escolherData, escolherHora } from '@/test/campos'
import JanelaCheckin from './JanelaCheckin'

vi.mock('@/data/checkins', () => ({ tarefasDoCheckin: vi.fn() }))

beforeEach(() => {
  vi.mocked(tarefasDoCheckin).mockReset()
  vi.mocked(tarefasDoCheckin).mockResolvedValue([])
})

async function preencher(_janela, { data, inicio, fim }) {
  await escolherData(userEvent, 'Data', data)
  await escolherHora(userEvent, 'Início', inicio)
  await escolherHora(userEvent, 'Fim', fim)
}

describe('JanelaCheckin: check-out', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10T12:34:56') }))
  afterEach(() => vi.useRealTimers())
  const aberto = (inicio) => ({ id: 'a1', inicio: new Date(inicio).toISOString(), fim: null })
  const abrir = (checkin, aoSalvar = vi.fn().mockResolvedValue({ erro: null }), aoFechar = vi.fn()) => {
    render(<JanelaCheckin aberto modo="checkout" nomeDoCliente="Alfa" checkin={checkin} aoFechar={aoFechar} aoSalvar={aoSalvar} />)
    return { aoSalvar, aoFechar, janela: screen.getByRole('dialog', { name: 'Fazer check-out em Alfa' }) }
  }
  const enviar = (janela) => userEvent.click(within(janela).getByRole('button', { name: 'Fazer check-out' }))

  it('exige o que foi feito e, sem mexer no fim, fecha agora (com os segundos)', async () => {
    const { aoSalvar, aoFechar, janela } = abrir(aberto('2026-11-10T10:00'))
    expect(within(janela).queryByLabelText('Início')).not.toBeInTheDocument()
    expect(within(janela).getByLabelText('Data do fim')).toHaveTextContent('10 de nov de 2026')
    expect(within(janela).getByLabelText('Fim')).toHaveTextContent('12:34')
    await enviar(janela)
    expect(aoSalvar).not.toHaveBeenCalled()
    expect(within(janela).getByText('Conte o que foi feito.')).toBeInTheDocument()
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), '  Instalei o servidor ')
    await enviar(janela)
    expect(aoSalvar).toHaveBeenCalledWith({ fim: new Date('2026-11-10T12:34:56').toISOString(), descricao: 'Instalei o servidor' })
    expect(aoFechar).toHaveBeenCalled()
  })

  it('Data do fim e Fim são obrigatórios: não oferecem Limpar', async () => {
    const { janela } = abrir(aberto('2026-11-10T10:00'))
    expect(within(janela).queryByRole('button', { name: /^Limpar/ })).toBeNull()
    await userEvent.click(within(janela).getByLabelText('Data do fim'))
    expect(screen.queryByRole('button', { name: 'Limpar' })).toBeNull()
  })

  it('check-out esquecido há mais de 24 h: o fim vem preenchido com início + 24 h e fecha assim', async () => {
    const { aoSalvar, janela } = abrir(aberto('2026-11-09T06:15'))
    expect(within(janela).getByLabelText('Data do fim')).toHaveTextContent('10 de nov de 2026')
    expect(within(janela).getByLabelText('Fim')).toHaveTextContent('06:15')
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Levantamento inicial')
    await enviar(janela)
    expect(aoSalvar).toHaveBeenCalledWith({ fim: new Date('2026-11-10T06:15').toISOString(), descricao: 'Levantamento inicial' })
  })

  it('o fim é editável: manda o horário escolhido', async () => {
    const { aoSalvar, janela } = abrir(aberto('2026-11-09T22:00'))
    await escolherData(userEvent, 'Data do fim', '2026-11-10')
    await escolherHora(userEvent, 'Fim', '01:30')
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Virada de sistema')
    await enviar(janela)
    expect(aoSalvar).toHaveBeenCalledWith({ fim: new Date('2026-11-10T01:30').toISOString(), descricao: 'Virada de sistema' })
  })

  it('confere o fim escolhido: antes do início, no futuro e mais de 24 h', async () => {
    const { aoSalvar, janela } = abrir(aberto('2026-11-09T06:15'))
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Levantamento')
    await escolherHora(userEvent, 'Fim', '12:00')
    await enviar(janela)
    expect(within(janela).getByText('Um check-in não pode passar de 24 h. Ajuste o horário de fim.')).toBeInTheDocument()
    await escolherData(userEvent, 'Data do fim', '2026-11-09')
    await escolherHora(userEvent, 'Fim', '06:00')
    await enviar(janela)
    expect(within(janela).getByText('O fim precisa ser depois do início.')).toBeInTheDocument()
    await escolherData(userEvent, 'Data do fim', '2026-11-10')
    await escolherHora(userEvent, 'Fim', '13:00')
    await enviar(janela)
    expect(within(janela).getByText('O horário não pode estar no futuro.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('mostra o erro do banco e mantém a janela aberta', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: 'Você não é o consultor deste cliente.' })
    const { aoFechar, janela } = abrir(aberto('2026-11-10T10:00'), aoSalvar)
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'xy')
    await enviar(janela)
    expect(await screen.findByText('Você não é o consultor deste cliente.')).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
  })
})

describe('JanelaCheckin: lançar horas', () => {
  const abrir = (aoSalvar = vi.fn().mockResolvedValue({ erro: null })) => {
    render(<JanelaCheckin aberto modo="lancar" nomeDoCliente="Alfa" aoFechar={vi.fn()} aoSalvar={aoSalvar} />)
    return { aoSalvar, janela: screen.getByRole('dialog', { name: 'Lançar horas em Alfa' }) }
  }
  const enviar = (janela) => userEvent.click(within(janela).getByRole('button', { name: 'Lançar horas' }))

  it('fim antes do início mostra o erro e não envia', async () => {
    const { aoSalvar, janela } = abrir()
    await preencher(janela, { data: '2026-11-10', inicio: '10:00', fim: '09:00' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Reunião')
    await enviar(janela)
    expect(within(janela).getByText('O fim precisa ser depois do início.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('não aceita horário no futuro', async () => {
    const { aoSalvar, janela } = abrir()
    await preencher(janela, { data: '2099-01-01', inicio: '09:00', fim: '10:00' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Reunião')
    await enviar(janela)
    expect(within(janela).getByText('O horário não pode estar no futuro.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('o que foi feito precisa de pelo menos 2 caracteres (o banco recusa menos)', async () => {
    const { aoSalvar, janela } = abrir()
    await preencher(janela, { data: '2026-11-10', inicio: '09:00', fim: '10:00' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), ' x ')
    await enviar(janela)
    expect(within(janela).getByText('Conte o que foi feito.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('exige data, horários e descrição', async () => {
    const { aoSalvar, janela } = abrir()
    await enviar(janela)
    expect(within(janela).getByText('Informe a data, o início e o fim.')).toBeInTheDocument()
    await preencher(janela, { data: '2026-11-10', inicio: '09:00', fim: '10:00' })
    await enviar(janela)
    expect(within(janela).getByText('Conte o que foi feito.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('envia início e fim em ISO, no horário local', async () => {
    const { aoSalvar, janela } = abrir()
    await preencher(janela, { data: '2026-11-10', inicio: '09:00', fim: '10:30' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Reunião')
    await enviar(janela)
    expect(aoSalvar).toHaveBeenCalledWith({
      inicio: new Date('2026-11-10T09:00').toISOString(),
      fim: new Date('2026-11-10T10:30').toISOString(),
      descricao: 'Reunião',
    })
  })

  it('mostra a mensagem de sobreposição devolvida pelo banco', async () => {
    const { janela } = abrir(vi.fn().mockResolvedValue({ erro: 'Esse horário se sobrepõe a outro check-in seu.' }))
    await preencher(janela, { data: '2026-11-10', inicio: '09:00', fim: '10:30' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Reunião')
    await enviar(janela)
    expect(await within(janela).findByText('Esse horário se sobrepõe a outro check-in seu.')).toBeInTheDocument()
  })
})

describe('JanelaCheckin: editar', () => {
  // Início e fim com segundos: sem mexer nos campos, eles não vão (nada de cortar os segundos).
  const checkin = {
    id: 'c1', inicio: new Date('2026-11-10T09:00:30').toISOString(), fim: new Date('2026-11-10T10:30:45').toISOString(),
    descricao: 'Reunião',
  }
  const abrir = (dados = checkin, aoSalvar = vi.fn().mockResolvedValue({ erro: null })) => {
    render(<JanelaCheckin aberto modo="editar" nomeDoCliente="Alfa" checkin={dados} aoFechar={vi.fn()} aoSalvar={aoSalvar} />)
    return { aoSalvar, janela: screen.getByRole('dialog', { name: 'Editar check-in em Alfa' }) }
  }
  const salvar = (janela) => userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))

  it('abre preenchida com o check-in e, sem mexer nos horários, manda só a descrição', async () => {
    const { aoSalvar, janela } = abrir()
    expect(within(janela).getByLabelText('Data')).toHaveTextContent('10 de nov de 2026')
    expect(within(janela).getByLabelText('Início')).toHaveTextContent('09:00')
    expect(within(janela).getByLabelText('Fim')).toHaveTextContent('10:30')
    expect(within(janela).getByLabelText('O que foi feito')).toHaveValue('Reunião')
    await salvar(janela)
    expect(aoSalvar).toHaveBeenCalledWith({ descricao: 'Reunião' })
  })

  it('mudou só o fim: manda só o fim', async () => {
    const { aoSalvar, janela } = abrir()
    await escolherHora(userEvent, 'Fim', '10:45')
    await salvar(janela)
    expect(aoSalvar).toHaveBeenCalledWith({ fim: new Date('2026-11-10T10:45').toISOString(), descricao: 'Reunião' })
  })

  it('mudou só o início: manda só o início', async () => {
    const { aoSalvar, janela } = abrir()
    await escolherHora(userEvent, 'Início', '08:30')
    await salvar(janela)
    expect(aoSalvar).toHaveBeenCalledWith({ inicio: new Date('2026-11-10T08:30').toISOString(), descricao: 'Reunião' })
  })

  it('mudou a data: o início e o fim vão para o novo dia', async () => {
    const { aoSalvar, janela } = abrir()
    await escolherData(userEvent, 'Data', '2026-11-09')
    await salvar(janela)
    expect(aoSalvar).toHaveBeenCalledWith({
      inicio: new Date('2026-11-09T09:00').toISOString(), fim: new Date('2026-11-09T10:30').toISOString(), descricao: 'Reunião',
    })
  })

  describe('check-in aberto', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10T12:34:56') }))
    afterEach(() => vi.useRealTimers())

    it('Editar fecha o check-in: o fim vem preenchido com agora', async () => {
      const { aoSalvar, janela } = abrir({ id: 'c2', inicio: new Date('2026-11-10T09:00').toISOString(), fim: null, descricao: null })
      expect(within(janela).getByLabelText('Fim')).toHaveTextContent('12:34')
      await salvar(janela)
      expect(within(janela).getByText('Conte o que foi feito.')).toBeInTheDocument()
      await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Suporte')
      await salvar(janela)
      expect(aoSalvar).toHaveBeenCalledWith({ fim: new Date('2026-11-10T12:34:56').toISOString(), descricao: 'Suporte' })
    })

    it('aberto há mais de 24 h: o fim vem com início + 24 h, na data do fim', async () => {
      const { aoSalvar, janela } = abrir({ id: 'c3', inicio: new Date('2026-11-08T20:00').toISOString(), fim: null, descricao: 'Migração' })
      expect(within(janela).getByLabelText('Data do fim')).toHaveTextContent('9 de nov de 2026')
      expect(within(janela).getByLabelText('Fim')).toHaveTextContent('20:00')
      await salvar(janela)
      expect(aoSalvar).toHaveBeenCalledWith({ fim: new Date('2026-11-09T20:00').toISOString(), descricao: 'Migração' })
    })
  })
})

describe('JanelaCheckin: tarefas do check-list marcadas no check-in', () => {
  const TAREFAS = [{ tarefa_id: 't1', titulo: 'Análise do DRE' }, { tarefa_id: 't2', titulo: 'Mapa de custos' }]
  const aberto = { id: 'a1', inicio: new Date(Date.now() - 3_600_000).toISOString(), fim: null }
  const fechado = {
    id: 'c1', inicio: new Date('2026-11-10T09:00').toISOString(), fim: new Date('2026-11-10T10:30').toISOString(), descricao: 'Reunião',
  }
  const abrir = (modo, checkin) => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    render(<JanelaCheckin aberto modo={modo} nomeDoCliente="Alfa" checkin={checkin} aoFechar={vi.fn()} aoSalvar={aoSalvar} />)
    return { aoSalvar, janela: screen.getByRole('dialog') }
  }
  const itens = (janela) => within(within(janela).getByRole('list', { name: 'Tarefas marcadas nesta sessão' }))
    .getAllByRole('listitem').map((i) => i.textContent)

  it('check-out: mostra as tarefas marcadas nesta sessão e, com "O que foi feito" vazio, já vem com elas', async () => {
    vi.mocked(tarefasDoCheckin).mockResolvedValue(TAREFAS)
    const { janela, aoSalvar } = abrir('checkout', aberto)
    await waitFor(() => expect(itens(janela)).toEqual(['Análise do DRE', 'Mapa de custos']))
    expect(tarefasDoCheckin).toHaveBeenCalledWith('a1')
    const campo = within(janela).getByLabelText('O que foi feito')
    expect(campo).toHaveValue('Tarefas concluídas: Análise do DRE; Mapa de custos.')
    expect(janela).toHaveTextContent('Já vem com as tarefas marcadas; complete com o que mais foi feito.')
    await userEvent.type(campo, ' Revisei a planilha.')
    await userEvent.click(within(janela).getByRole('button', { name: 'Fazer check-out' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({
      descricao: 'Tarefas concluídas: Análise do DRE; Mapa de custos. Revisei a planilha.',
    }))
  })

  it('check-out: o que a pessoa já digitou não é apagado quando as tarefas chegam depois', async () => {
    let responder
    vi.mocked(tarefasDoCheckin).mockImplementation(() => new Promise((r) => { responder = r }))
    const { janela } = abrir('checkout', aberto)
    const campo = within(janela).getByLabelText('O que foi feito')
    await userEvent.type(campo, 'Treinei a equipe')
    responder(TAREFAS)
    await waitFor(() => expect(itens(janela)).toEqual(['Análise do DRE', 'Mapa de custos']))
    expect(campo).toHaveValue('Treinei a equipe')
  })

  it('editar: mostra as tarefas (só para ler) e não mexe no que foi feito', async () => {
    vi.mocked(tarefasDoCheckin).mockResolvedValue(TAREFAS)
    const { janela } = abrir('editar', fechado)
    await waitFor(() => expect(itens(janela)).toEqual(['Análise do DRE', 'Mapa de custos']))
    expect(tarefasDoCheckin).toHaveBeenCalledWith('c1')
    expect(within(janela).getByLabelText('O que foi feito')).toHaveValue('Reunião')
    expect(within(within(janela).getByRole('list', { name: 'Tarefas marcadas nesta sessão' })).queryByRole('button')).toBeNull()
  })

  it('sem tarefas marcadas, a seção não aparece e o campo fica vazio', async () => {
    const { janela } = abrir('checkout', aberto)
    await waitFor(() => expect(tarefasDoCheckin).toHaveBeenCalledWith('a1'))
    expect(within(janela).queryByRole('list', { name: 'Tarefas marcadas nesta sessão' })).not.toBeInTheDocument()
    expect(within(janela).getByLabelText('O que foi feito')).toHaveValue('')
  })

  it('se a leitura das tarefas falha, o check-out continua funcionando (com um aviso discreto)', async () => {
    vi.mocked(tarefasDoCheckin).mockRejectedValue(new Error('rede'))
    const { janela } = abrir('checkout', aberto)
    expect(await within(janela).findByText('Não foi possível carregar as tarefas marcadas nesta sessão.')).toBeInTheDocument()
    expect(within(janela).getByRole('button', { name: 'Fazer check-out' })).toBeEnabled()
  })

  it('lançar horas não lê tarefas (um atendimento passado não tem sessão no check-list)', () => {
    render(<JanelaCheckin aberto modo="lancar" nomeDoCliente="Alfa" aoFechar={vi.fn()} aoSalvar={vi.fn()} />)
    expect(tarefasDoCheckin).not.toHaveBeenCalled()
  })
})
