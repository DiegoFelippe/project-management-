import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Caixa from '@/components/campos/Caixa'
import CampoData from '@/components/campos/CampoData'
import CampoHora from '@/components/campos/CampoHora'
import CampoNumero from '@/components/campos/CampoNumero'
import Chave from '@/components/campos/Chave'
import Seletor from '@/components/campos/Seletor'
import { Button } from '@/components/ui/button'
import AbasSegmentadas from './AbasSegmentadas'
import NavegacaoDoMes from './NavegacaoDoMes'
import { CelulaAcoes, Celula, Linha, Tabela } from './Tabela'

// Alvos de toque (auditoria de 17/11, G5): só em tela de toque (variante pointer-coarse: do Tailwind), botões, campos,
// abas, ações da linha e atalhos ganham 44 px e 8 px entre si. No computador nada muda: as classes só valem no toque.
const ALVO = 'pointer-coarse:min-h-11'
const LARGO = 'pointer-coarse:min-w-11'
const ESPACO = 'pointer-coarse:gap-2'

const classes = (el) => el.getAttribute('class') ?? ''

describe('alvos de 44 px no toque', () => {
  it('Button: todos os tamanhos têm 44 px de altura; os de ícone, 44 px de largura também', () => {
    render(
      <>
        <Button>Salvar</Button>
        <Button size="sm">Pequeno</Button>
        <Button size="icon" aria-label="Editar">E</Button>
        <Button size="icon-sm" aria-label="Apagar">A</Button>
        <Button variant="link" size="sm">Limpar filtros</Button>
      </>,
    )
    for (const nome of ['Salvar', 'Pequeno', 'Editar', 'Apagar', 'Limpar filtros']) {
      expect(classes(screen.getByRole('button', { name: nome })), nome).toContain(ALVO)
    }
    expect(classes(screen.getByRole('button', { name: 'Editar' }))).toContain(LARGO)
    expect(classes(screen.getByRole('button', { name: 'Apagar' }))).toContain(LARGO)
  })

  it('os campos de digitar e os gatilhos (.input) têm 44 px no toque: regra no src/index.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
    const input = css.match(/\n\s*\.input \{([^}]*)\}/)
    expect(input?.[1]).toContain(ALVO)
  })

  it('AbasSegmentadas: cada aba tem 44 px e 8 px entre elas', () => {
    render(<AbasSegmentadas rotulo="Situação" valor="a" aoMudar={() => {}} abas={[{ valor: 'a', rotulo: 'Ativos' }, { valor: 'b', rotulo: 'Arquivados' }]} />)
    const grupo = screen.getByRole('group', { name: 'Situação' })
    expect(classes(grupo)).toContain(ESPACO)
    for (const aba of within(grupo).getAllByRole('button')) expect(classes(aba)).toContain(ALVO)
  })

  it('CampoData: atalhos ("Hoje", "Amanhã"…), Limpar e setas com 44 px e 8 px entre os atalhos', async () => {
    function Campo() {
      const [valor, setValor] = useState('2026-11-16')
      return <CampoData id="d" rotulo="Prazo" valor={valor} aoMudar={setValor} atalhos={[{ rotulo: 'Amanhã', valor: '2026-11-17' }]} />
    }
    render(<Campo />)
    await userEvent.click(screen.getByRole('button', { name: 'Prazo' }))
    const janela = screen.getByRole('dialog', { name: 'Escolher data' })
    for (const nome of ['Amanhã', 'Hoje', 'Limpar']) expect(classes(within(janela).getByRole('button', { name: nome })), nome).toContain(ALVO)
    for (const nome of ['Mês anterior', 'Próximo mês']) expect(classes(within(janela).getByRole('button', { name: nome })), nome).toContain('pointer-coarse:size-11')
    expect(classes(within(janela).getByRole('button', { name: 'Hoje' }).parentElement)).toContain(ESPACO)
  })

  it('CampoHora: Limpar e Pronto com 44 px', async () => {
    render(<CampoHora id="h" rotulo="Início" valor="09:00" aoMudar={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Início' }))
    const janela = screen.getByRole('dialog', { name: 'Escolher horário' })
    for (const nome of ['Limpar', 'Pronto']) expect(classes(within(janela).getByRole('button', { name: nome })), nome).toContain(ALVO)
  })

  it('CampoNumero: menos e mais com 44 × 44 px; atalhos com 44 px e 8 px entre si', () => {
    render(<CampoNumero id="n" valor="4" aoMudar={() => {}} atalhos={[4, 8]} />)
    for (const nome of ['Diminuir', 'Aumentar']) {
      const botao = screen.getByRole('button', { name: nome })
      expect(classes(botao)).toContain(LARGO)
      expect(classes(botao.parentElement)).toContain(ALVO)
    }
    const atalhos = screen.getByRole('group', { name: 'Atalhos' })
    expect(classes(atalhos)).toContain(ESPACO)
    for (const atalho of within(atalhos).getAllByRole('button')) expect(classes(atalho)).toContain(ALVO)
  })

  it('NavegacaoDoMes: as setas têm 44 × 44 px (no celular elas são só o ícone)', () => {
    render(<NavegacaoDoMes mes="2026-11-01" aoMudar={() => {}} />)
    for (const nome of ['Mês anterior', 'Próximo mês']) {
      const seta = screen.getByRole('button', { name: nome })
      expect(classes(seta)).toContain(ALVO)
      expect(classes(seta)).toContain(LARGO)
    }
  })

  it('Caixa sem texto (item de lista): o alvo de 44 px cresce em volta do quadrado, sem mudar o alinhamento da linha', () => {
    render(<Caixa nome="Enviar extratos" marcado={false} aoMudar={() => {}} />)
    const caixa = screen.getByRole('checkbox', { name: 'Enviar extratos' })
    expect(classes(caixa.closest('label'))).not.toContain(ALVO)
    expect(classes(caixa.parentElement)).toContain('pointer-coarse:before:-inset-[13px]')
  })

  it('Caixa e Chave: o rótulo inteiro é o alvo, com 44 px', () => {
    render(
      <>
        <Caixa marcado={false} aoMudar={() => {}} rotulo="Fiscal" />
        <Chave ligada={false} aoMudar={() => {}} rotulo="Exigir" />
      </>,
    )
    expect(classes(screen.getByRole('checkbox', { name: 'Fiscal' }).closest('label'))).toContain(ALVO)
    expect(classes(screen.getByRole('switch').closest('label'))).toContain(ALVO)
  })

  it('Seletor: cada opção da lista tem 44 px', async () => {
    render(<Seletor id="s" valor="" aoMudar={() => {}} opcoes={[{ valor: '1', rotulo: 'Um' }, { valor: '2', rotulo: 'Dois' }]} />)
    await userEvent.click(screen.getByRole('combobox'))
    for (const opcao of screen.getAllByRole('option')) expect(classes(opcao)).toContain(ALVO)
  })

  it('ações da linha da tabela: 8 px entre uma e outra no toque', () => {
    render(
      <Tabela rotulo="Pessoas" colunas={['Nome']}>
        <Linha>
          <Celula>Ana</Celula>
          <CelulaAcoes>
            <Button variant="ghost" size="icon" aria-label="Editar">E</Button>
            <Button variant="ghost" size="icon" aria-label="Desativar">D</Button>
          </CelulaAcoes>
        </Linha>
      </Tabela>,
    )
    expect(classes(screen.getByRole('button', { name: 'Editar' }).closest('td'))).toContain('pointer-coarse:[&>*+*]:ml-2')
  })
})

// Varredura: os componentes comuns de toque continuam com a classe (quem mexer neles não perde os 44 px sem querer).
describe('varredura dos alvos de toque', () => {
  it.each([
    'src/components/ui/button.jsx',
    'src/components/comum/AbasSegmentadas.jsx',
    'src/components/campos/Caixa.jsx',
    'src/components/campos/Chave.jsx',
    'src/components/campos/CampoData.jsx',
    'src/components/campos/CampoHora.jsx',
    'src/components/campos/CampoNumero.jsx',
    'src/components/campos/Seletor.jsx',
    'src/components/calendario/JanelaEvento.jsx',
    'src/components/calendario/ChipDoEvento.jsx',
    'src/components/comum/MenuDeAcoes.jsx',
    'src/index.css',
  ])('%s tem pointer-coarse:min-h-11', (arquivo) => {
    expect(readFileSync(join(process.cwd(), arquivo), 'utf8')).toContain(ALVO)
  })
})
