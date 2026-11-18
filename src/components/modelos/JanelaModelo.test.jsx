import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarConsultoriasAtivas } from '@/data/consultorias'
import { salvarModelo } from '@/data/modelos'
import { escolherNoSeletor } from '@/test/campos'
import { renderizarTela } from '@/test/renderizar'
import JanelaModelo from './JanelaModelo'

vi.mock('@/data/modelos', () => ({ salvarModelo: vi.fn() }))
vi.mock('@/data/consultorias', () => ({ buscarConsultoriasAtivas: vi.fn() }))

const MODELO = {
  id: 'm1', nome: 'Gestão financeira', descricao: 'Para clientes novos', tipo: 'gestao', da_central: true, consultoria: null,
  criado_por: { nome: 'Carla Central' }, criado_em: '2026-11-10T13:00:00Z', atualizado_em: '2026-11-17T21:37:40.123456+00:00',
  arquivado_em: null, pode_editar: true, pode_duplicar: true,
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

function abrir(props = {}, perfil = central) {
  const aoFechar = vi.fn()
  const aoSalvar = vi.fn()
  renderizarTela(<JanelaModelo aoFechar={aoFechar} aoSalvar={aoSalvar} {...props} />, { perfil })
  return { aoFechar, aoSalvar, janela: screen.getByRole('dialog') }
}
const rodape = (janela) => janela.querySelector('[data-slot="janela-rodape"]')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(salvarModelo).mockResolvedValue({ id: 'm9', erro: null })
  vi.mocked(buscarConsultoriasAtivas).mockResolvedValue({ itens: [{ id: 'c2', nome: 'Beta' }], total: 1 })
})

describe('JanelaModelo', () => {
  it('novo: duas colunas (dados e resumo à esquerda; etapas e tarefas à direita) e as abas da janela', () => {
    const { janela } = abrir()
    expect(within(janela).getByRole('heading', { name: 'Novo modelo de check-in' })).toBeInTheDocument()
    expect(within(janela).getByText('Ao salvar, o modelo fica disponível para aplicar nos clientes.')).toBeInTheDocument()
    const abas = within(janela).getByRole('tablist', { name: 'Partes do modelo' })
    expect(within(abas).getAllByRole('tab').map((a) => a.textContent)).toEqual(['Etapas e tarefas', 'Fluxograma (prévia)'])
    expect(within(janela).getByLabelText('Nome do modelo')).toHaveFocus()
    expect(within(janela).getByLabelText('Descrição (opcional)')).toHaveClass('texto-de-campo')
    expect(within(janela).getByLabelText('Tipo de consultoria')).toHaveTextContent('Nenhum')
    expect(within(janela).getByRole('radio', { name: /Todas as consultorias/ })).toHaveAttribute('aria-checked', 'true')
    const resumo = within(janela).getByRole('group', { name: 'Resumo' })
    expect(resumo).toHaveTextContent('1 etapa · 1 tarefa')
    expect(resumo).toHaveTextContent('1 obrigatória · 0 opcionais')
    expect(resumo).toHaveTextContent('Última tarefa no dia 2 a partir do início')
    expect(janela.querySelector('form#form-modelo')).toHaveClass('grid', 'grid-cols-1')
  })

  it('editar: título, aviso de quem já usa (os clientes que você vê) e o resumo do modelo', () => {
    const { janela } = abrir({ modelo: MODELO, clientesUsando: 3 })
    expect(within(janela).getByRole('heading', { name: 'Editar modelo de check-in' })).toBeInTheDocument()
    expect(within(janela).getByText('3 clientes que você vê usam este modelo. O que você mudar vale para quem receber o modelo daqui em diante; quem já usa continua com o check-list que recebeu.')).toBeInTheDocument()
    expect(within(janela).getByRole('group', { name: 'Resumo' })).toHaveTextContent('2 etapas · 3 tarefas')
    expect(within(janela).getByRole('group', { name: 'Resumo' })).toHaveTextContent('2 obrigatórias · 1 opcional')
    expect(within(janela).getByRole('group', { name: 'Resumo' })).toHaveTextContent('Última tarefa no dia 20 a partir do início')
  })

  it('salva o rascunho inteiro numa chamada, com "Salvando…" enquanto grava, e avisa quem chamou', async () => {
    let terminar
    vi.mocked(salvarModelo).mockImplementation(() => new Promise((r) => { terminar = r }))
    const { janela, aoSalvar } = abrir({ modelo: MODELO })
    await userEvent.clear(within(janela).getByLabelText('Nome do modelo'))
    await userEvent.type(within(janela).getByLabelText('Nome do modelo'), 'Finanças')
    await escolherNoSeletor(userEvent, 'Tipo de consultoria', 'Gestão de Pessoas')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(within(janela).getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    expect(within(janela).getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(salvarModelo).toHaveBeenCalledTimes(1)
    expect(salvarModelo).toHaveBeenCalledWith('m1', expect.objectContaining({ nome: 'Finanças', tipo: 'gestao_de_pessoas', para: 'todas' }))
    terminar({ id: 'm1', erro: null })
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledWith({ id: 'm1', nome: 'Finanças', novo: false }))
  })

  it('subir uma tarefa para antes da sua dependência: o erro aparece na tarefa e no rodapé, e Salvar não chama o banco', async () => {
    const { janela } = abrir({ modelo: MODELO })
    await userEvent.click(within(janela).getByRole('button', { name: 'Subir a tarefa 2' }))
    expect(within(within(janela).getByRole('listitem', { name: 'Tarefa 1' })).getByRole('alert')).toHaveTextContent('Depende de uma tarefa que agora vem depois dela.')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(within(rodape(janela)).getByRole('alert')).toHaveTextContent(
      '"Análise do DRE" depende de "Reunião de início", que vem depois. Mova uma das duas ou tire a dependência.')
    expect(salvarModelo).not.toHaveBeenCalled()
  })

  it('erro de validação na prévia volta para "Etapas e tarefas" e marca o campo', async () => {
    const { janela } = abrir()
    await userEvent.type(within(janela).getByLabelText('Nome do modelo'), 'Modelo')
    await userEvent.click(within(janela).getByRole('tab', { name: 'Fluxograma (prévia)' }))
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    // A aba ganha o ponto vermelho (", tem erro" para o leitor de tela).
    expect(within(janela).getByRole('tab', { name: 'Etapas e tarefas, tem erro' })).toHaveAttribute('aria-selected', 'true')
    expect(within(janela).getByLabelText('Título da tarefa 1')).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(within(janela).getByLabelText('Título da tarefa 1')).toHaveFocus())
    expect(within(rodape(janela)).getByRole('alert')).toHaveTextContent('Dê um título a cada tarefa.')
    expect(salvarModelo).not.toHaveBeenCalled()
  })

  it('nome curto marca o nome e leva o foco para ele; corrigir apaga a marca na hora', async () => {
    const { janela } = abrir()
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(within(janela).getByLabelText('Nome do modelo')).toHaveAttribute('aria-invalid', 'true')
    expect(within(rodape(janela)).getByRole('alert')).toHaveTextContent('Dê um nome ao modelo, com pelo menos 2 letras.')
    await waitFor(() => expect(within(janela).getByLabelText('Nome do modelo')).toHaveFocus())
    await userEvent.type(within(janela).getByLabelText('Nome do modelo'), 'Modelo')
    expect(within(janela).getByLabelText('Nome do modelo')).not.toHaveAttribute('aria-invalid')
  })

  it('o erro do banco aparece no rodapé e a janela continua aberta', async () => {
    vi.mocked(salvarModelo).mockResolvedValue({ id: null, erro: 'Escolha uma consultoria ativa para o modelo.' })
    const { janela, aoSalvar } = abrir({ modelo: MODELO })
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(await within(rodape(janela)).findByRole('alert')).toHaveTextContent('Escolha uma consultoria ativa para o modelo.')
    expect(within(janela).getByRole('button', { name: 'Salvar modelo' })).toBeEnabled()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('a prévia mostra o fluxograma num quadro que o teclado rola', async () => {
    const { janela } = abrir({ modelo: MODELO })
    await userEvent.click(within(janela).getByRole('tab', { name: 'Fluxograma (prévia)' }))
    const quadro = within(janela).getByRole('region', { name: 'Prévia do fluxograma, role para ver tudo' })
    expect(quadro).toHaveAttribute('tabindex', '0')
    expect(quadro).toHaveAttribute('data-caixa-do-fluxo')
    const desenho = within(quadro).getByRole('img', { name: 'Prévia do fluxograma' })
    expect(desenho.querySelectorAll('[data-tarefa]')).toHaveLength(3)
    expect(desenho.querySelectorAll('path.seta')).toHaveLength(2)
    expect(within(janela).getByText('Como o consultor vai ver o fluxograma. As setas saem do "Depende de" de cada tarefa.')).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Em pé' }))
    expect(within(janela).getByRole('button', { name: 'Em pé' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Cancelar com mudanças pergunta antes; Descartar fecha sem ir ao banco', async () => {
    const { janela, aoFechar } = abrir({ modelo: MODELO })
    await userEvent.type(within(janela).getByLabelText('Nome do modelo'), ' 2')
    await userEvent.click(within(rodape(janela)).getByRole('button', { name: 'Cancelar' }))
    const descartar = screen.getByRole('alertdialog', { name: 'Descartar as mudanças do modelo?' })
    expect(descartar).toHaveTextContent('O que você mudou neste modelo se perde: nada foi salvo.')
    expect(aoFechar).not.toHaveBeenCalled()
    await userEvent.click(within(descartar).getByRole('button', { name: 'Descartar' }))
    expect(aoFechar).toHaveBeenCalled()
    expect(salvarModelo).not.toHaveBeenCalled()
  })

  it('Esc ou o X com mudanças também perguntam; continuar editando mantém o rascunho', async () => {
    const { janela, aoFechar } = abrir({ modelo: MODELO })
    await userEvent.type(within(janela).getByLabelText('Nome do modelo'), ' 2')
    await userEvent.keyboard('{Escape}')
    const descartar = screen.getByRole('alertdialog', { name: 'Descartar as mudanças do modelo?' })
    await userEvent.click(within(descartar).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Editar modelo de check-in' })).toBeInTheDocument()
    expect(within(janela).getByLabelText('Nome do modelo')).toHaveValue('Gestão financeira 2')
    await userEvent.click(within(janela).getByRole('button', { name: 'Fechar' }))
    expect(screen.getByRole('alertdialog', { name: 'Descartar as mudanças do modelo?' })).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
  })

  it('sem mudanças, Esc fecha direto', async () => {
    const { aoFechar } = abrir({ modelo: MODELO })
    await userEvent.keyboard('{Escape}')
    expect(aoFechar).toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('Esc numa confirmação dentro da janela (apagar etapa) desiste só dela', async () => {
    const { janela, aoFechar } = abrir({ modelo: MODELO })
    await userEvent.click(within(janela).getByRole('button', { name: 'Apagar a etapa 1' }))
    const etapa = within(janela).getByRole('region', { name: 'Etapa 1' })
    expect(within(etapa).getByRole('button', { name: 'Manter' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(within(etapa).queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Editar modelo de check-in' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(within(etapa).getByRole('button', { name: 'Apagar a etapa 1' })).toHaveFocus()
  })

  it('editar manda o atualizado_em lido; se alguém salvou depois, a mensagem aparece e a janela fica aberta', async () => {
    vi.mocked(salvarModelo).mockResolvedValue({ id: null, erro: 'Alguém salvou este modelo depois que você abriu. Feche e abra de novo.' })
    const { janela, aoSalvar } = abrir({ modelo: MODELO })
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(salvarModelo).toHaveBeenCalledWith('m1', expect.objectContaining({ atualizado_em: '2026-11-17T21:37:40.123456+00:00' }))
    expect(await within(rodape(janela)).findByRole('alert')).toHaveTextContent('Alguém salvou este modelo depois que você abriu. Feche e abra de novo.')
    expect(screen.getByRole('dialog', { name: 'Editar modelo de check-in' })).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('criar e duplicar não mandam atualizado_em (é modelo novo)', async () => {
    const { janela } = abrir({ origem: MODELO })
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(vi.mocked(salvarModelo).mock.calls[0][0]).toBeNull()
    expect(vi.mocked(salvarModelo).mock.calls[0][1]).not.toHaveProperty('atualizado_em')
  })

  it('mudar o tipo apaga o erro do banco do rodapé', async () => {
    vi.mocked(salvarModelo).mockResolvedValue({ id: null, erro: 'Escolha uma consultoria ativa para o modelo.' })
    const { janela } = abrir({ modelo: MODELO })
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(await within(rodape(janela)).findByRole('alert')).toBeInTheDocument()
    await escolherNoSeletor(userEvent, 'Tipo de consultoria', 'Gestão de Pessoas')
    expect(within(rodape(janela)).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('voltar de "Todas" para "Uma consultoria" mostra e salva a mesma consultoria', async () => {
    const daAlfa = { ...MODELO, da_central: false, consultoria: { id: 'c1', nome: 'Alfa' } }
    const { janela } = abrir({ origem: daAlfa })
    const campo = () => within(janela).getByLabelText('Consultoria do modelo')
    expect(campo()).toHaveTextContent('Alfa')
    await escolherNoSeletor(userEvent, 'Consultoria do modelo', 'Beta')
    expect(campo()).toHaveTextContent('Beta')
    await userEvent.click(within(janela).getByRole('radio', { name: /Todas as consultorias/ }))
    await userEvent.click(within(janela).getByRole('radio', { name: /Uma consultoria/ }))
    expect(campo()).toHaveTextContent('Alfa')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(salvarModelo).toHaveBeenCalledWith(null, expect.objectContaining({ para: 'c1' }))
  })

  it('a Central escolhe para quem: todas ou uma consultoria (buscada no banco); sem escolher qual, avisa', async () => {
    const { janela } = abrir({ modelo: MODELO })
    const para = within(janela).getByRole('radiogroup', { name: 'Para quem' })
    await userEvent.click(within(para).getByRole('radio', { name: /Uma consultoria/ }))
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(within(rodape(janela)).getByRole('alert')).toHaveTextContent('Escolha para qual consultoria é o modelo.')
    expect(salvarModelo).not.toHaveBeenCalled()
    await escolherNoSeletor(userEvent, 'Consultoria do modelo', 'Beta')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(salvarModelo).toHaveBeenCalledWith('m1', expect.objectContaining({ para: 'c2' }))
  })

  it('a Central editando um modelo da gestão de uma consultoria: "Para quem" fixo nela e o "para" vai com o id dela', async () => {
    const daSti = { ...MODELO, da_central: false, consultoria: { id: 'c1', nome: 'STI Consult' } }
    const { janela } = abrir({ modelo: daSti })
    expect(within(janela).queryByRole('radiogroup', { name: 'Para quem' })).not.toBeInTheDocument()
    expect(within(janela).getByRole('group', { name: 'Para quem' })).toHaveTextContent('STI Consult')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(salvarModelo).toHaveBeenCalledWith('m1', expect.objectContaining({ para: 'c1' }))
  })

  it('a Central duplicando o modelo de uma consultoria: a cópia é da Central e começa para aquela consultoria', async () => {
    const daSti = { ...MODELO, da_central: false, consultoria: { id: 'c1', nome: 'STI Consult' } }
    const { janela, aoSalvar } = abrir({ origem: daSti })
    expect(within(janela).getByRole('radio', { name: /Uma consultoria/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(janela).getByLabelText('Consultoria do modelo')).toHaveTextContent('STI Consult')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(salvarModelo).toHaveBeenCalledWith(null, expect.objectContaining({ nome: 'Cópia de Gestão financeira', para: 'c1' }))
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledWith({ id: 'm9', nome: 'Cópia de Gestão financeira', novo: true }))
  })

  it('o gestor cria só para a própria consultoria: "Para quem" fixo e o "para" é a consultoria dele', async () => {
    const { janela } = abrir({}, gestor)
    const para = within(janela).getByRole('group', { name: 'Para quem' })
    expect(para).toHaveTextContent('STI Consult')
    expect(para).toHaveTextContent('O gestor cria modelos só para a própria consultoria.')
    await userEvent.type(within(janela).getByLabelText('Nome do modelo'), 'Implantação')
    await userEvent.type(within(janela).getByLabelText('Título da tarefa 1'), 'Reunião')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar modelo' }))
    expect(salvarModelo).toHaveBeenCalledWith(null, expect.objectContaining({ nome: 'Implantação', para: 'c1' }))
  })
})
