import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import JanelaFormulario from './JanelaFormulario'

// O botão principal fica no rodapé da janela, fora do <form>. Ele só envia o formulário (inclusive com Enter
// num campo) se estiver associado a ele pelo atributo `form`. O jsdom não simula o Enter, então a guarda é
// estrutural: a associação em tela e uma varredura do código.
function arquivosJsx(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosJsx(caminho)
    return nome.endsWith('.jsx') && !nome.includes('.test.') ? [caminho] : []
  })
}

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
