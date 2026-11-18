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
})
