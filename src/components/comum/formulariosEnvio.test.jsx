import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import JanelaFormulario from './JanelaFormulario'

// O botão principal fica no rodapé da janela, fora do <form>. Ele só envia o formulário (inclusive com Enter
// num campo) se estiver associado a ele pelo atributo `form`. O jsdom não simula o Enter, então a guarda é
// estrutural: a associação em tela e uma varredura do código. Vale para o rodapé padrão (a janela monta o botão com
// `rotuloEnviar` e `form`) e para o `rodape` escrito à mão.
function arquivosJsx(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosJsx(caminho)
    return nome.endsWith('.jsx') && !nome.includes('.test.') ? [caminho] : []
  })
}

// O texto da tag de abertura que começa em `inicio` (até o ">" de fora de chaves e de textos).
function tagDeAbertura(codigo, inicio) {
  let chaves = 0
  for (let i = inicio + 1; i < codigo.length; i++) {
    const c = codigo[i]
    if (c === '"' || c === "'" || c === '`') {
      if (chaves === 0 && c !== '"') continue
      i = codigo.indexOf(c, i + 1)
      if (i < 0) break
    } else if (c === '{') chaves++
    else if (c === '}') chaves--
    else if (c === '>' && chaves === 0) return codigo.slice(inicio, i + 1)
  }
  return codigo.slice(inicio)
}

const aberturasDaJanela = (codigo) => [...codigo.matchAll(/<JanelaFormulario\b/g)].map((m) => tagDeAbertura(codigo, m.index))

describe('envio dos formulários em janela', () => {
  it('o botão submit do rodapé com form="id" pertence ao form do corpo', () => {
    render(
      <JanelaFormulario aberto aoFechar={() => {}} titulo="Teste"
        rodape={<Button type="submit" form="form-teste">Salvar</Button>}>
        <form id="form-teste"><input aria-label="Campo" /></form>
      </JanelaFormulario>,
    )
    expect(screen.getByRole('button', { name: 'Salvar' }).form).toBe(screen.getByLabelText('Campo').form)
  })

  it('no rodapé padrão (rotuloEnviar + form), o botão principal pertence ao form do corpo', () => {
    render(
      <JanelaFormulario aberto aoFechar={() => {}} titulo="Teste" form="form-teste" rotuloEnviar="Criar">
        <form id="form-teste"><input aria-label="Campo" /></form>
      </JanelaFormulario>,
    )
    const criar = screen.getByRole('button', { name: 'Criar' })
    expect(criar).toHaveAttribute('type', 'submit')
    expect(criar.form).toBe(screen.getByLabelText('Campo').form)
  })

  it('a varredura lê a tag inteira da JanelaFormulario, com chaves, setas e textos no meio', () => {
    const codigo = '<JanelaFormulario aoFechar={() => x > 1 && f("}")} titulo={`A ${b}`} form="f1" rotuloEnviar="Salvar">\n<form id="f1" />'
    expect(aberturasDaJanela(codigo)).toEqual(['<JanelaFormulario aoFechar={() => x > 1 && f("}")} titulo={`A ${b}`} form="f1" rotuloEnviar="Salvar">'])
  })

  it('toda JanelaFormulario com rotuloEnviar diz o que o botão faz (form= ou aoEnviar=), e todo form="id" aponta para um <form id> do arquivo', () => {
    const problemas = []
    for (const arquivo of arquivosJsx(join(process.cwd(), 'src'))) {
      const codigo = readFileSync(arquivo, 'utf8')
      if (!codigo.includes('<JanelaFormulario')) continue
      const nome = arquivo.replace(process.cwd(), '')
      const ids = [...codigo.matchAll(/<form\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1])
      for (const tag of aberturasDaJanela(codigo)) {
        if (/\srotuloEnviar=/.test(tag) && !/\sform="[^"]+"/.test(tag) && !/\saoEnviar=/.test(tag)) problemas.push(`${nome}: rotuloEnviar sem form= nem aoEnviar=`)
      }
      for (const m of codigo.matchAll(/\sform="([^"]+)"/g)) {
        if (!ids.includes(m[1])) problemas.push(`${nome}: form="${m[1]}" sem <form id="${m[1]}">`)
      }
    }
    expect(problemas).toEqual([])
  })

  it('todo <Button type="submit"> do rodape= de uma JanelaFormulario aponta para um <form id> do mesmo arquivo', () => {
    const problemas = []
    for (const arquivo of arquivosJsx(join(process.cwd(), 'src'))) {
      const codigo = readFileSync(arquivo, 'utf8')
      if (!codigo.includes('<JanelaFormulario')) continue
      const ids = [...codigo.matchAll(/<form\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1])
      // Só o rodapé conta: um formulário inline dentro do corpo pode ter o botão dele dentro do próprio <form>.
      const rodape = codigo.slice(codigo.indexOf('rodape={')).split(/\)\}>|\}>\n/)[0]
      for (const m of rodape.matchAll(/<Button\b[^>]*type="submit"[^>]*>/g)) {
        const alvo = /\bform="([^"]+)"/.exec(m[0])?.[1]
        if (!alvo || !ids.includes(alvo)) problemas.push(`${arquivo.replace(process.cwd(), '')}: ${m[0]}`)
      }
    }
    expect(problemas).toEqual([])
  })

  // Usabilidade, U4 (pedido do Diego, 18/11): toda janela que envia o que a pessoa digitou pergunta antes de descartar.
  // A janela calcula `alterado` (useAlterado) e a JanelaFormulario pergunta no Cancelar, no Esc e no X. Fora: as janelas
  // de uma escolha só (sem nada digitado) e as confirmações, listadas aqui pelo componente, com o motivo. A exceção vale
  // para uma janela só do componente (revisão do lote F): outra janela no mesmo arquivo ou componente é conferida.
  // Sem exceção, porque a guarda não as vê enviando: a Reserva do AbrirCartao (só mostra "Abrindo…" ou o erro) e a
  // JanelaApagarQuadro (Arquivar e Apagar com onClick próprio).
  const SEM_PERGUNTA = {
    EscolhaDeOcupacao: 'uma escolha só (consultor ou consultoria), sem nada digitado',
    ApagarColuna: 'confirmação de apagar',
  }

  // O componente em que a tag está: a última `function Nome(` antes dela.
  const componenteDaTag = (codigo, indice) => [...codigo.slice(0, indice).matchAll(/function ([A-Z]\w*)\s*\(/g)].at(-1)?.[1]

  function janelasSemAlterado(nome, codigo) {
    const problemas = []
    const isentas = new Set()
    for (const { index } of codigo.matchAll(/<JanelaFormulario\b/g)) {
      const tag = tagDeAbertura(codigo, index)
      const envia = /\srotuloEnviar=/.test(tag) || (/\srodape=/.test(tag) && /type="submit"|onClick=\{enviar\}/.test(tag))
      if (!envia || /\salterado=/.test(tag)) continue
      const componente = componenteDaTag(codigo, index)
      if (SEM_PERGUNTA[componente] && !isentas.has(componente)) isentas.add(componente)
      else problemas.push(`${nome} (${componente}): JanelaFormulario que envia sem alterado=`)
    }
    return problemas
  }

  it('a exceção vale só para a janela do componente listado: uma janela nova no mesmo arquivo é conferida', () => {
    const exceto = '<JanelaFormulario titulo="Apagar?" rodape={<Button type="submit" form="f" />}>'
    const nova = '<JanelaFormulario titulo="Nova" form="g" rotuloEnviar="Salvar">'
    expect(janelasSemAlterado('ApagarColuna.jsx', `function ApagarColuna() { return ${exceto} }`)).toEqual([])
    expect(janelasSemAlterado('ApagarColuna.jsx', `function ApagarColuna() { return ${exceto} }\nfunction Outra() { return ${nova} }`))
      .toEqual(['ApagarColuna.jsx (Outra): JanelaFormulario que envia sem alterado='])
    expect(janelasSemAlterado('ApagarColuna.jsx', `function ApagarColuna() { return x ? ${exceto} : ${nova} }`))
      .toEqual(['ApagarColuna.jsx (ApagarColuna): JanelaFormulario que envia sem alterado='])
  })

  it('toda JanelaFormulario que envia (rotuloEnviar= ou um submit no rodape=) passa alterado=', () => {
    const problemas = []
    for (const arquivo of arquivosJsx(join(process.cwd(), 'src'))) {
      const codigo = readFileSync(arquivo, 'utf8')
      if (codigo.includes('<JanelaFormulario')) problemas.push(...janelasSemAlterado(arquivo.replace(process.cwd(), ''), codigo))
    }
    expect(problemas).toEqual([])
  })

  it('nenhum rodape= de JanelaFormulario tem um Cancelar escrito à mão: é o BotaoCancelar (passa pela pergunta)', () => {
    const problemas = []
    for (const arquivo of arquivosJsx(join(process.cwd(), 'src'))) {
      const codigo = readFileSync(arquivo, 'utf8')
      if (!codigo.includes('<JanelaFormulario')) continue
      for (const tag of aberturasDaJanela(codigo)) {
        if (/>\s*Cancelar\s*</.test(tag)) problemas.push(arquivo.replace(process.cwd(), ''))
      }
    }
    expect(problemas).toEqual([])
  })
})

