import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import JanelaDaTarefa from './JanelaDaTarefa'
import { situacaoDaTarefa } from './situacao'

const HOJE = '2026-11-17'
const ETAPAS = [{ id: 'e1', nome: 'Diagnóstico' }, { id: 'e2', nome: 'Plano' }]
const t = (id, etapa, titulo, campos = {}) => ({
  id, etapa_id: etapa, titulo, descricao: null, obrigatoria: true, prazo_dias: 10, vence_em: '2026-11-20', estado: 'a_fazer',
  nota: null, feita_em: null, feita_por: null, depende_de: [], na_sessao: false, ...campos,
})
const TAREFAS = [
  t('t1', 'e1', 'Reunião de alinhamento', { prazo_dias: 2, vence_em: '2026-11-12', estado: 'feita', feita_em: '2026-11-12T15:00:00Z', feita_por: { nome: 'Ana Lima' } }),
  t('t2', 'e1', 'Análise do DRE', { descricao: 'Últimos 12 meses', depende_de: ['t1'], nota: 'Faltam os extratos' }),
  t('t3', 'e2', 'Mapa de custos', { obrigatoria: false, prazo_dias: 7, vence_em: '2026-11-17', depende_de: ['t2'] }),
  t('t4', 'e2', 'Plano de ação', { prazo_dias: 3, vence_em: '2026-11-13', estado: 'andamento' }),
  t('t5', 'e2', 'Revisão', { estado: 'andamento', depende_de: ['t2', 't3'] }),
]

function abrir(id, { podeMarcar = true, tarefas = TAREFAS, aoAgir = vi.fn().mockResolvedValue({ erro: null }) } = {}) {
  const porId = new Map(tarefas.map((x) => [x.id, x]))
  const situacoes = new Map(tarefas.map((x) => [x.id, situacaoDaTarefa(x, porId, HOJE)]))
  const aoFechar = vi.fn()
  const aoAbrir = vi.fn()
  render(
    <JanelaDaTarefa tarefa={porId.get(id)} etapas={ETAPAS} tarefas={tarefas} situacoes={situacoes} nomeDoCliente="Provedor Alfa"
      inicio="2026-11-10" podeMarcar={podeMarcar} aoAgir={aoAgir} aoAbrir={aoAbrir} aoFechar={aoFechar} />,
  )
  const janela = screen.getByRole('dialog', { name: porId.get(id).titulo })
  const rodape = janela.querySelector('[data-slot="janela-rodape"]')
  const botoes = () => within(rodape).getAllByRole('button').map((b) => b.textContent.trim())
  return { janela, rodape, botoes, aoAgir, aoFechar, aoAbrir }
}

describe('JanelaDaTarefa', () => {
  it('mostra onde a tarefa está, os selos, a descrição, o prazo, a situação, do que depende e o que libera', () => {
    const { janela } = abrir('t2')
    expect(janela).toHaveTextContent('Provedor Alfa · etapa 1, Diagnóstico · obrigatória')
    expect(janela).toHaveTextContent('Vence 20/11')
    expect(janela).toHaveTextContent('Últimos 12 meses')
    expect(janela).toHaveTextContent('20/11/2026 · dia 10 a partir de 10/11/2026')
    expect(janela).toHaveTextContent('Faltam 3 dias')
    const depende = within(janela).getByRole('list', { name: 'Depende de' })
    expect(within(depende).getByRole('button', { name: /Reunião de alinhamento/ })).toHaveTextContent('Feita')
    const libera = within(janela).getByRole('list', { name: 'Libera' })
    expect(within(libera).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Mapa de custosBloqueada, vence hoje', 'RevisãoEm andamento · espera 2 tarefas',
    ])
    expect(within(janela).getByLabelText('Nota (opcional)')).toHaveValue('Faltam os extratos')
  })

  it('sem dependências e sem quem espere por ela, diz isso', () => {
    const { janela } = abrir('t4')
    expect(janela).toHaveTextContent('Nada: pode começar quando quiser.')
    expect(janela).toHaveTextContent('Nenhuma tarefa espera por esta.')
  })

  it('a fazer (livre): Começar e Marcar como feita; cada um manda a situação com a nota', async () => {
    const { botoes, rodape, aoAgir, aoFechar } = abrir('t2')
    expect(botoes()).toEqual(['Cancelar', 'Começar', 'Marcar como feita'])
    await userEvent.click(within(rodape).getByRole('button', { name: 'Começar' }))
    expect(aoAgir).toHaveBeenCalledWith({ estado: 'andamento', nota: 'Faltam os extratos' })
    expect(aoFechar).toHaveBeenCalled()
  })

  it('Marcar como feita é o botão principal (envia o formulário), com a nota mudada', async () => {
    const { janela, rodape, aoAgir } = abrir('t2')
    const nota = within(janela).getByLabelText('Nota (opcional)')
    await userEvent.clear(nota)
    await userEvent.type(nota, 'Recebi tudo')
    const principal = within(rodape).getByRole('button', { name: 'Marcar como feita' })
    expect(principal).toHaveAttribute('type', 'submit')
    await userEvent.click(principal)
    expect(aoAgir).toHaveBeenCalledWith({ estado: 'feita', nota: 'Recebi tudo' })
  })

  it('em andamento: Voltar para a fazer e Marcar como feita', async () => {
    const { botoes, rodape, aoAgir, janela } = abrir('t4')
    expect(janela).toHaveTextContent('Em andamento')
    expect(janela).toHaveTextContent('Atrasada há 4 dias')
    expect(botoes()).toEqual(['Cancelar', 'Voltar para a fazer', 'Marcar como feita'])
    await userEvent.click(within(rodape).getByRole('button', { name: 'Voltar para a fazer' }))
    expect(aoAgir).toHaveBeenCalledWith({ estado: 'a_fazer', nota: '' })
  })

  it('feita: Reabrir tarefa e Salvar nota (só a nota); a situação diz por quem e quando', async () => {
    const { botoes, rodape, aoAgir, janela } = abrir('t1')
    expect(janela).toHaveTextContent('por Ana Lima em 12/11/2026')
    expect(botoes()).toEqual(['Cancelar', 'Reabrir tarefa', 'Salvar nota'])
    await userEvent.type(within(janela).getByLabelText('Nota (opcional)'), 'Ata no Drive')
    await userEvent.click(within(rodape).getByRole('button', { name: 'Salvar nota' }))
    expect(aoAgir).toHaveBeenCalledWith({ estado: null, nota: 'Ata no Drive' })
    await userEvent.click(within(rodape).getByRole('button', { name: 'Reabrir tarefa' }))
    expect(aoAgir).toHaveBeenLastCalledWith({ estado: 'a_fazer', nota: 'Ata no Drive' })
  })

  it('bloqueada: só Salvar nota, com o aviso do que ela espera; vence hoje na situação', () => {
    const { botoes, janela } = abrir('t3')
    expect(janela).toHaveTextContent('Ainda não dá para marcar como feita: espera Análise do DRE.')
    expect(janela).toHaveTextContent('Vence hoje')
    expect(janela).toHaveTextContent('Provedor Alfa · etapa 2, Plano · opcional')
    expect(botoes()).toEqual(['Cancelar', 'Salvar nota'])
  })

  it('em andamento e bloqueada (uma dependência foi reaberta): Voltar para a fazer e Salvar nota, sem marcar', () => {
    const { botoes, janela } = abrir('t5')
    const selos = janela.querySelector('[data-selos]')
    expect(selos).toHaveTextContent('Em andamento · espera 2 tarefas')
    expect(selos).not.toHaveTextContent('Bloqueada')
    expect(janela).toHaveTextContent('Ainda não dá para marcar como feita: espera Análise do DRE e Mapa de custos.')
    expect(botoes()).toEqual(['Cancelar', 'Voltar para a fazer', 'Salvar nota'])
  })

  it('quem só acompanha: Fechar e a nota só para ler, sem aviso de bloqueio', () => {
    const { botoes, janela } = abrir('t2', { podeMarcar: false })
    expect(botoes()).toEqual(['Fechar'])
    expect(within(janela).queryByRole('textbox')).not.toBeInTheDocument()
    expect(janela).toHaveTextContent('Faltam os extratos')
    const semNota = abrir('t3', { podeMarcar: false }).janela
    expect(semNota).toHaveTextContent('Sem nota.')
    expect(semNota).not.toHaveTextContent('Ainda não dá para marcar')
  })

  it('clicar numa tarefa de "Depende de" ou "Libera" abre aquela tarefa', async () => {
    const { janela, aoAbrir } = abrir('t2')
    await userEvent.click(within(within(janela).getByRole('list', { name: 'Libera' })).getByRole('button', { name: /Mapa de custos/ }))
    expect(aoAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 't3' }))
  })

  describe('não se aplica', () => {
    const NSA = t('t6', 'e2', 'Inventário', {
      estado: 'nao_se_aplica', motivo: 'O cliente não tem estoque', feita_em: '2026-11-14T15:00:00Z', feita_por: { nome: 'Ana Lima' },
      depende_de: ['t1'], vence_em: '2026-11-01',
    })
    const COM_NSA = [...TAREFAS, NSA, t('t7', 'e2', 'Contagem', { depende_de: ['t6'] })]

    it('a fazer e livre: "Não se aplica" no corpo; abre o Motivo (obrigatório, até 500) e o rodapé confirma', async () => {
      const { janela, rodape, botoes, aoAgir, aoFechar } = abrir('t2')
      expect(botoes()).toEqual(['Cancelar', 'Começar', 'Marcar como feita'])
      // No celular o secundário fica só com o ícone (o nome continua), para Cancelar e o principal caberem a 360 px.
      expect(within(rodape).getByText('Começar')).toHaveClass('max-sm:sr-only')
      await userEvent.click(within(janela).getByRole('button', { name: 'Não se aplica' }))
      const motivo = within(janela).getByRole('textbox', { name: 'Motivo' })
      expect(motivo).toHaveFocus()
      expect(motivo).toHaveAttribute('maxlength', '500')
      expect(motivo).toHaveClass('texto-de-campo')
      expect(janela).toHaveTextContent('0/500')
      expect(janela).toHaveTextContent('A tarefa fecha sem ser feita e libera as que dependem dela.')
      expect(botoes()).toEqual(['Cancelar', 'Voltar', 'Não se aplica'])
      expect(within(rodape).getByText('Voltar')).toHaveClass('max-sm:sr-only')
      const confirmar = within(rodape).getByRole('button', { name: 'Não se aplica' })
      expect(confirmar).toHaveAttribute('type', 'submit')

      await userEvent.click(confirmar)
      expect(aoAgir).not.toHaveBeenCalled()
      expect(motivo).toHaveAttribute('aria-invalid', 'true')
      expect(motivo).toHaveAccessibleDescription(/Conte por que esta tarefa não se aplica\./)
      expect(within(janela).getByText('Conte por que esta tarefa não se aplica.')).toHaveClass('text-destructive')

      await userEvent.type(motivo, '   ')
      await userEvent.click(confirmar)
      expect(aoAgir).not.toHaveBeenCalled()

      await userEvent.clear(motivo)
      await userEvent.type(motivo, 'Cliente já tem o DRE auditado')
      expect(janela).toHaveTextContent('29/500')
      expect(motivo).not.toHaveAttribute('aria-invalid')
      await userEvent.click(confirmar)
      expect(aoAgir).toHaveBeenCalledWith({ estado: 'nao_se_aplica', nota: 'Faltam os extratos', motivo: 'Cliente já tem o DRE auditado' })
      expect(aoFechar).toHaveBeenCalled()
    })

    it('Voltar sai do Motivo sem gravar; o rodapé volta a ser o de antes', async () => {
      const { janela, rodape, botoes, aoAgir } = abrir('t4')
      await userEvent.click(within(janela).getByRole('button', { name: 'Não se aplica' }))
      await userEvent.click(within(rodape).getByRole('button', { name: 'Voltar' }))
      expect(within(janela).queryByRole('textbox', { name: 'Motivo' })).not.toBeInTheDocument()
      expect(botoes()).toEqual(['Cancelar', 'Voltar para a fazer', 'Marcar como feita'])
      expect(aoAgir).not.toHaveBeenCalled()
    })

    it('enquanto grava: "Marcando…" e tudo parado; erro do banco fica na janela', async () => {
      let responder
      const aoAgir = vi.fn(() => new Promise((r) => { responder = r }))
      const { janela, rodape, aoFechar } = abrir('t2', { aoAgir })
      await userEvent.click(within(janela).getByRole('button', { name: 'Não se aplica' }))
      await userEvent.type(within(janela).getByRole('textbox', { name: 'Motivo' }), 'Não precisa')
      await userEvent.click(within(rodape).getByRole('button', { name: 'Não se aplica' }))
      expect(within(rodape).getByRole('button', { name: 'Marcando…' })).toBeDisabled()
      expect(within(rodape).getByRole('button', { name: 'Voltar' })).toBeDisabled()
      responder({ erro: 'Só o consultor do cliente marca as tarefas.' })
      expect(await within(janela).findByText('Só o consultor do cliente marca as tarefas.')).toBeInTheDocument()
      expect(aoFechar).not.toHaveBeenCalled()
    })

    it('feita ou para quem só acompanha: sem "Não se aplica"', () => {
      expect(within(abrir('t1').janela).queryByRole('button', { name: 'Não se aplica' })).not.toBeInTheDocument()
      expect(within(abrir('t2', { podeMarcar: false }).janela).queryByRole('button', { name: 'Não se aplica' })).not.toBeInTheDocument()
    })

    // Pedido do Diego (18/11): a bloqueada pode ser "não se aplica"; as que dependem dela esperam as dependências dela.
    it('bloqueada: oferece "Não se aplica"; o motivo avisa que as que dependem dela continuam esperando', async () => {
      const { janela, rodape, botoes, aoAgir } = abrir('t3')
      expect(botoes()).toEqual(['Cancelar', 'Salvar nota'])
      await userEvent.click(within(janela).getByRole('button', { name: 'Não se aplica' }))
      expect(janela).toHaveTextContent('A tarefa fecha sem ser feita. As que dependem dela continuam esperando Análise do DRE.')
      expect(botoes()).toEqual(['Cancelar', 'Voltar', 'Não se aplica'])
      await userEvent.type(within(janela).getByRole('textbox', { name: 'Motivo' }), 'Opcional e o cliente não quer')
      await userEvent.click(within(rodape).getByRole('button', { name: 'Não se aplica' }))
      expect(aoAgir).toHaveBeenCalledWith({ estado: 'nao_se_aplica', nota: '', motivo: 'Opcional e o cliente não quer' })
    })

    it('a que depende de uma "não se aplica" presa diz o que espera de verdade (a pendente da cadeia)', () => {
      const presa = t('t8', 'e2', 'Inventário', { estado: 'nao_se_aplica', motivo: 'x', depende_de: ['t2'] })
      const tarefas = [...TAREFAS, presa, t('t9', 'e2', 'Contagem', { depende_de: ['t8'] })]
      const { janela, botoes } = abrir('t9', { tarefas })
      expect(janela).toHaveTextContent('Ainda não dá para marcar como feita: espera Análise do DRE.')
      expect(botoes()).toEqual(['Cancelar', 'Salvar nota'])
    })

    it('no celular os secundários só com ícone têm 44 px no toque', async () => {
      const { janela, rodape } = abrir('t2')
      expect(within(rodape).getByRole('button', { name: 'Começar' })).toHaveClass('max-sm:pointer-coarse:min-w-11')
      await userEvent.click(within(janela).getByRole('button', { name: 'Não se aplica' }))
      expect(within(rodape).getByRole('button', { name: 'Voltar' })).toHaveClass('max-sm:pointer-coarse:min-w-11')
    })

    it('a que não se aplica: selo cinza com ícone próprio (nunca o check), o motivo, quem e quando; Reabrir volta para a fazer', async () => {
      const { janela, rodape, botoes, aoAgir } = abrir('t6', { tarefas: COM_NSA })
      const selos = janela.querySelector('[data-selos]')
      expect(selos).toHaveTextContent('Não se aplica')
      expect(selos).toHaveTextContent('por Ana Lima em 14/11/2026')
      expect(selos).not.toHaveTextContent('Atrasada')
      expect(selos.querySelector('[data-selo="nao_se_aplica"] svg.lucide-ban')).not.toBeNull()
      expect(selos.querySelector('.lucide-check')).toBeNull()
      expect(within(janela).getByRole('region', { name: 'Motivo' })).toHaveTextContent('O cliente não tem estoque')
      expect(within(janela).getByRole('list', { name: 'Libera' })).toHaveTextContent('Contagem')
      expect(botoes()).toEqual(['Cancelar', 'Reabrir tarefa', 'Salvar nota'])
      await userEvent.click(within(rodape).getByRole('button', { name: 'Reabrir tarefa' }))
      expect(aoAgir).toHaveBeenCalledWith({ estado: 'a_fazer', nota: '' })
    })

    it('quem só acompanha vê o motivo, sem mudar nada', () => {
      const { janela, botoes } = abrir('t6', { tarefas: COM_NSA, podeMarcar: false })
      expect(within(janela).getByRole('region', { name: 'Motivo' })).toHaveTextContent('O cliente não tem estoque')
      expect(botoes()).toEqual(['Fechar'])
    })

    it('nas relacionadas, a que não se aplica diz isso (e libera: a dependente fica "A fazer")', () => {
      const { janela } = abrir('t7', { tarefas: COM_NSA })
      expect(within(janela).getByRole('list', { name: 'Depende de' })).toHaveTextContent('InventárioNão se aplica')
      expect(within(janela).queryByText(/Ainda não dá para marcar/)).not.toBeInTheDocument()
    })
  })

  it('enquanto grava, o botão diz o que está fazendo e tudo fica parado; erro do banco fica na janela', async () => {
    let responder
    const aoAgir = vi.fn(() => new Promise((r) => { responder = r }))
    const { rodape, aoFechar, janela } = abrir('t2', { aoAgir })
    await userEvent.click(within(rodape).getByRole('button', { name: 'Marcar como feita' }))
    expect(within(rodape).getByRole('button', { name: 'Marcando…' })).toBeDisabled()
    expect(within(rodape).getByRole('button', { name: 'Começar' })).toBeDisabled()
    responder({ erro: 'Esta tarefa depende de outras que ainda não foram feitas.' })
    expect(await within(janela).findByText('Esta tarefa depende de outras que ainda não foram feitas.')).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(within(rodape).getByRole('button', { name: 'Marcar como feita' })).toBeEnabled()
  })
})
