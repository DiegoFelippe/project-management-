// Funções puras da pasta da reunião (transcrição, documentação, nome da pasta) e a leitura da resposta da IA.
// Roda no `npm test` (projeto unidade). Horários no fuso de São Paulo (UTC-3 em novembro de 2026).
import { describe, expect, it } from 'vitest'
import { lerResumo, cortarParaAIa } from './ia.ts'
import { documentacaoDaReuniao, duracaoEmTexto, nomeDaPasta, transcricaoEmTexto } from './reuniao.ts'

const falas = [
  { hora: '2026-11-20T17:00:05Z', nome: 'Ana Souza', texto: 'Bom dia a todos.' },
  { hora: '2026-11-20T17:01:10Z', nome: 'Contato do Cliente', texto: 'Bom dia!\nPodemos começar\n  pelo escopo?' },
  { hora: '2026-11-20T17:02:00Z', nome: 'Ana Souza', texto: 'Claro.' },
]

const reuniao = {
  titulo: 'Kickoff com o cliente',
  descricao: 'Pauta: escopo e prazos',
  inicio: '2026-11-20T17:00:00Z',
  fim: '2026-11-20T18:00:00Z',
  cliente: 'ACME Ltda',
  organizador: 'Ana Souza',
  participantes: [
    { nome: 'Beto Lima', resposta: 'confirmou' },
    { nome: 'Caio Reis', resposta: 'pendente' },
    { nome: 'contato@cliente.test', deFora: true },
  ],
  meet_link: 'https://meet.google.com/abc-defg-hij',
  link_do_evento: 'https://www.google.com/calendar/event?eid=abc',
}

const artefatos = {
  inicio: '2026-11-20T17:00:00Z',
  fim: '2026-11-20T17:58:00Z',
  gravacaoUrl: 'https://drive.google.com/file/d/arquivo-0/view',
  falas,
}

const resumo = {
  resumo: 'Alinhamos o escopo do projeto.',
  decisoes: ['Começar pelo módulo financeiro'],
  proximosPassos: ['Ana envia o cronograma até sexta', 'Cliente manda os acessos'],
}

describe('transcricaoEmTexto', () => {
  it('uma linha por fala, com a hora de São Paulo e o nome de quem falou', () => {
    expect(transcricaoEmTexto(falas)).toBe(
      '[14:00:05] Ana Souza: Bom dia a todos.\n' +
        '[14:01:10] Contato do Cliente: Bom dia! Podemos começar pelo escopo?\n' +
        '[14:02:00] Ana Souza: Claro.\n',
    )
  })

  it('sem falas: um aviso (o arquivo nunca fica vazio)', () => {
    expect(transcricaoEmTexto([])).toBe('A transcrição do Meet veio sem falas.\n')
  })
})

describe('nomeDaPasta', () => {
  it('"Reunião dd/MM/yyyy HH:mm — <título>", no horário de São Paulo', () => {
    expect(nomeDaPasta({ titulo: 'Kickoff com o cliente', inicio: '2026-11-20T17:00:00Z' }))
      .toBe('Reunião 20/11/2026 14:00 — Kickoff com o cliente')
    expect(nomeDaPasta({ titulo: '  Fechamento  ', inicio: '2026-11-21T02:30:00Z' }))
      .toBe('Reunião 20/11/2026 23:30 — Fechamento')
  })

  it('título longo é cortado para o nome caber em 120 caracteres', () => {
    const nome = nomeDaPasta({ titulo: 'x'.repeat(200), inicio: '2026-11-20T17:00:00Z' })
    expect(nome).toHaveLength(120)
    expect(nome.startsWith('Reunião 20/11/2026 14:00 — xxx')).toBe(true)
    expect(nome.endsWith('…')).toBe(true)
  })
})

describe('duracaoEmTexto', () => {
  it('minutos e horas', () => {
    expect(duracaoEmTexto(58 * 60_000)).toBe('58 min')
    expect(duracaoEmTexto(60 * 60_000)).toBe('1 h')
    expect(duracaoEmTexto(65 * 60_000)).toBe('1 h 05 min')
    expect(duracaoEmTexto(150 * 60_000)).toBe('2 h 30 min')
    expect(duracaoEmTexto(20_000)).toBe('menos de 1 min')
  })
})

describe('documentacaoDaReuniao', () => {
  it('título, data e hora, duração, cliente, organizador, participantes, links e o resumo da IA', () => {
    const doc = documentacaoDaReuniao(reuniao, artefatos, resumo)
    const linhas = doc.split('\n')
    expect(linhas[0]).toBe('# Kickoff com o cliente')
    expect(linhas).toContain('- **Data e hora:** 20/11/2026, das 14:00 às 15:00 (horário de Brasília)')
    // A duração é a da conferência do Meet (14:00 às 14:58), não a do convite.
    expect(linhas).toContain('- **Duração:** 58 min')
    expect(linhas).toContain('- **Cliente:** ACME Ltda')
    expect(linhas).toContain('- **Organizador:** Ana Souza')
    expect(linhas).toContain(
      '- **Participantes:** Beto Lima (confirmou), Caio Reis (não respondeu), contato@cliente.test (convidado de fora)',
    )
    expect(linhas).toContain('- **Falaram na reunião:** Ana Souza, Contato do Cliente')
    expect(linhas).toContain('- **Gravação:** [Abrir a gravação](https://drive.google.com/file/d/arquivo-0/view)')
    expect(linhas).toContain('- **Evento:** [Abrir no Google Agenda](https://www.google.com/calendar/event?eid=abc)')
    expect(linhas).toContain('- **Meet:** [https://meet.google.com/abc-defg-hij](https://meet.google.com/abc-defg-hij)')
    expect(doc).toContain('## Pauta\n\nPauta: escopo e prazos\n')
    expect(doc).toContain('## Resumo\n\nAlinhamos o escopo do projeto.\n')
    expect(doc).toContain('## Decisões\n\n- Começar pelo módulo financeiro\n')
    expect(doc).toContain('## Próximos passos\n\n- Ana envia o cronograma até sexta\n- Cliente manda os acessos\n')
    expect(doc).toContain('A transcrição completa está em `transcricao.txt`, nesta pasta.')
    // A ordem das seções.
    const ordem = ['## Pauta', '## Resumo', '## Decisões', '## Próximos passos'].map((s) => doc.indexOf(s))
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b))
  })

  it('sem resumo (IA desligada ou fora do ar): a documentação sai sem resumo, decisões e próximos passos', () => {
    const doc = documentacaoDaReuniao(reuniao, artefatos, null)
    expect(doc).toContain('# Kickoff com o cliente')
    expect(doc).toContain('- **Organizador:** Ana Souza')
    expect(doc).not.toContain('## Resumo')
    expect(doc).not.toContain('## Decisões')
    expect(doc).not.toContain('## Próximos passos')
  })

  it('listas vazias da IA viram "nenhum(a) registrado(a)"', () => {
    const doc = documentacaoDaReuniao(reuniao, artefatos, { resumo: 'Conversa rápida.', decisoes: [], proximosPassos: [] })
    expect(doc).toContain('## Decisões\n\nNenhuma decisão registrada.\n')
    expect(doc).toContain('## Próximos passos\n\nNenhum próximo passo registrado.\n')
  })

  it('sem gravação, sem cliente, sem participantes e sem pauta: diz o que não houve e some com o resto', () => {
    const doc = documentacaoDaReuniao(
      { ...reuniao, cliente: null, descricao: null, participantes: [], meet_link: null, link_do_evento: null },
      { inicio: null, fim: null, gravacaoUrl: null, falas: [] },
      null,
    )
    const linhas = doc.split('\n')
    expect(linhas).toContain('- **Gravação:** a reunião não foi gravada')
    expect(linhas).toContain('- **Participantes:** só o organizador')
    // Sem a conferência, a duração é a do convite.
    expect(linhas).toContain('- **Duração:** 1 h')
    expect(doc).not.toContain('**Cliente:**')
    expect(doc).not.toContain('**Falaram na reunião:**')
    expect(doc).not.toContain('**Evento:**')
    expect(doc).not.toContain('**Meet:**')
    expect(doc).not.toContain('## Pauta')
  })

  it('reunião que atravessa a meia-noite mostra as duas datas', () => {
    const doc = documentacaoDaReuniao(
      { ...reuniao, inicio: '2026-11-21T02:00:00Z', fim: '2026-11-21T04:00:00Z' },
      { ...artefatos, inicio: null, fim: null },
      null,
    )
    expect(doc).toContain('- **Data e hora:** 20/11/2026 23:00 até 21/11/2026 01:00 (horário de Brasília)')
    expect(doc).toContain('- **Duração:** 2 h')
  })

  it('o que vem de fora não quebra o Markdown e link que não é https não entra', () => {
    const doc = documentacaoDaReuniao(
      {
        ...reuniao,
        titulo: '# Revisão *urgente* [v2]',
        organizador: 'Ana_Souza',
        meet_link: 'javascript:alert(1)',
        link_do_evento: 'http://inseguro.test/evento',
      },
      { ...artefatos, gravacaoUrl: 'https://drive.google.com/file/d/a(b)/view' },
      { resumo: 'Linha 1\n# Título injetado', decisoes: ['- item'], proximosPassos: [] },
    )
    expect(doc.split('\n')[0]).toBe('# \\# Revisão \\*urgente\\* \\[v2\\]')
    expect(doc).toContain('- **Organizador:** Ana\\_Souza')
    expect(doc).toContain('- **Gravação:** [Abrir a gravação](https://drive.google.com/file/d/a%28b%29/view)')
    expect(doc).not.toContain('javascript:')
    expect(doc).not.toContain('inseguro.test')
    expect(doc).toContain('Linha 1\n\\# Título injetado')
    expect(doc).toContain('- \\- item')
  })
})

describe('resposta da IA', () => {
  it('lerResumo aceita o JSON pedido, mesmo com texto em volta, e corta o que passa do tamanho', () => {
    const texto = 'Aqui está:\n```json\n' + JSON.stringify({
      resumo: '  Alinhamos o escopo.  ',
      decisoes: ['A', '', 7, 'B'],
      proximos_passos: Array.from({ length: 30 }, (_, i) => `Passo ${i + 1}`),
    }) + '\n```'
    const r = lerResumo(texto)
    expect(r.resumo).toBe('Alinhamos o escopo.')
    expect(r.decisoes).toEqual(['A', 'B'])
    expect(r.proximosPassos).toHaveLength(20)
    expect(lerResumo(JSON.stringify({ resumo: 'x'.repeat(10_000), decisoes: [], proximos_passos: [] })).resumo)
      .toHaveLength(4000)
  })

  it('lerResumo recusa o que não é o JSON pedido', () => {
    expect(() => lerResumo('não sei')).toThrow()
    expect(() => lerResumo('{"resumo": 3}')).toThrow()
    expect(() => lerResumo('{"resumo": "  "}')).toThrow()
  })

  it('a transcrição que vai para a IA tem teto de tamanho', () => {
    expect(cortarParaAIa('curta')).toBe('curta')
    const longa = cortarParaAIa('a'.repeat(250_000))
    expect(longa.length).toBeLessThan(101_000)
    expect(longa.endsWith('[A transcrição foi cortada aqui: só o começo dela foi enviado.]')).toBe(true)
  })
})
