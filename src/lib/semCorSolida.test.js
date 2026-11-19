import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Cores Tropical, modelo atual (Diego, 19/11, CLAUDE.md): sem fundo sólido de cor fora dos botões. Selo, ladrilho, etiqueta,
// contador e número de etapa são suaves (fundo suave + texto escuro). Esta varredura pega `bg-<primary|positive|notice|
// destructive>-cheio` (o fundo cheio com texto branco/"sobre") e falha com arquivo:linha; só entram os arquivos abaixo,
// cada um com o motivo. Foi assim que o cheio da Viva (a7a0cb6) entrou nos selos sem ninguém guardar.
const SOLIDO = /(?<![\w-])(?:[\w-]+:)*bg-(?:primary|positive|notice|destructive)-cheio(?![\w-])/

const PERMITIDOS = {
  'components/ui/button.jsx': 'o botão (principal e destrutivo)',
  'components/ui/badge.jsx': 'variantes default e destructive do selo de ação (notice e positive são suaves)',
  'components/ui/input.jsx': 'cor da seleção de texto (selection:), não é fundo de componente',
  'components/shell/Trilho.jsx': 'item aceso do trilho (controle marcado, como botão)',
  'components/campos/Caixa.jsx': 'caixa de marcar ligada (estado do controle)',
  'components/campos/CampoData.jsx': 'dia escolhido e botão Pronto (estado do controle)',
  'components/campos/CampoHora.jsx': 'hora escolhida e botão Pronto (estado do controle)',
  'components/campos/CartaoChave.jsx': 'ícone do cartão de chave ligada (estado do controle)',
  'components/campos/CampoSenha.jsx': 'barra de força da senha: fraca/média/forte (marca com palavra ao lado)',
  'components/comum/CartoesDeOpcao.jsx': 'ícone da opção escolhida (estado do controle)',
  'components/comum/BarraDeOcupacao.jsx': 'barra de progresso acima de 100% (marca, não rótulo)',
  'components/comum/AbasSegmentadas.jsx': 'bolinha de erro da aba (marca de 6 px com o aviso ao lado)',
  'components/quadro/ChecklistDoCartao.jsx': 'check do item feito (estado do controle)',
  'components/modelos/EditorDeEtapas.jsx': 'número da etapa no editor, controle de edição fora de a7a0cb6',
  'components/calendario/VisaoMes.jsx': 'dia de hoje na grade (estado do dia)',
  'components/calendario/VisaoAgenda.jsx': 'selo "Hoje" da agenda (estado do dia)',
  'components/calendario/JanelaEvento.jsx': 'dia escolhido no seletor de dia (estado do controle)',
  'components/clientes/JanelaCheckin.jsx': 'dia escolhido no seletor de dia (estado do controle)',
}

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.jsx?$/.test(nome) && !nome.includes('.test.') ? [caminho] : []
  })
}

const achar = (codigo) => codigo.split('\n').flatMap((linha, i) => (SOLIDO.test(linha) ? [`${i + 1}: ${linha.trim().slice(0, 70)}`] : []))

describe('sem fundo sólido de cor fora dos botões', () => {
  it('pega o cheio de estado com variantes (hover:, selection:)', () => {
    expect(achar("'bg-positive-cheio text-sobre-positive'")).toHaveLength(1)
    expect(achar("'hover:bg-destructive-cheio/90'")).toHaveLength(1)
    expect(achar("'bg-primary/10 text-primary-texto bg-cor-azul-cheio'")).toEqual([])
  })

  it('nenhum arquivo fora da lista usa bg-<estado>-cheio', () => {
    const achados = []
    for (const arquivo of arquivos(join(process.cwd(), 'src'))) {
      const rel = arquivo.split('/src/')[1]
      if (rel in PERMITIDOS) continue
      achados.push(...achar(readFileSync(arquivo, 'utf8')).map((a) => `${rel}:${a}`))
    }
    expect(achados).toEqual([])
  })

  it('todo arquivo da lista ainda usa o cheio (lista sem entrada velha)', () => {
    const velhos = Object.keys(PERMITIDOS).filter((rel) => !SOLIDO.test(readFileSync(join(process.cwd(), 'src', rel), 'utf8')))
    expect(velhos).toEqual([])
  })
})
