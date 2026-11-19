import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Label } from './label'
import { Textarea } from './textarea'

// Campo de várias linhas único (auditoria de 17/11, C8): o mesmo .input dos outros campos (borda, foco azul do projeto,
// 44 px no toque) e a .texto-de-campo (16 px no celular, para o iPhone não dar zoom).
describe('Textarea', () => {
  it('tem as classes dos campos, o rótulo e repassa as props', async () => {
    const aoMudar = vi.fn()
    render(<><Label htmlFor="obs">Observações</Label><Textarea id="obs" rows={2} maxLength={10} onChange={(e) => aoMudar(e.target.value)} /></>)
    const campo = screen.getByRole('textbox', { name: 'Observações' })
    expect(campo.tagName).toBe('TEXTAREA')
    expect(campo).toHaveClass('input', 'texto-de-campo', 'resize-y')
    expect(campo).toHaveAttribute('rows', '2')
    expect(campo).toHaveAttribute('maxlength', '10')
    await userEvent.type(campo, 'oi')
    expect(aoMudar).toHaveBeenLastCalledWith('oi')
  })

  it('className ajusta sem perder as classes do campo', () => {
    render(<Textarea aria-label="Pauta" className="resize-none" />)
    const campo = screen.getByRole('textbox', { name: 'Pauta' })
    expect(campo).toHaveClass('input', 'texto-de-campo', 'resize-none')
    expect(campo).not.toHaveClass('resize-y')
  })
})

// Varredura: <textarea> escrito à mão só no próprio componente. PENDENTES: arquivo que ainda não trocou (trocar na
// próxima mexida nele e tirar daqui). A janela da tarefa e a do check-in trocaram no lote F (18/11).
const PENDENTES = []

function arquivosJsx(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosJsx(caminho)
    return nome.endsWith('.jsx') && !nome.includes('.test.') ? [caminho] : []
  })
}

describe('varredura do <textarea>', () => {
  const comTextarea = arquivosJsx(join(process.cwd(), 'src'))
    .filter((arquivo) => /<textarea\b/.test(readFileSync(arquivo, 'utf8')))
    .map((arquivo) => arquivo.split('/src/')[1])

  it('as telas usam o Textarea de src/components/ui/textarea.jsx', () => {
    expect(comTextarea.filter((a) => a !== 'components/ui/textarea.jsx' && !PENDENTES.includes(a))).toEqual([])
  })

  it('a lista de pendentes não guarda arquivo que já foi trocado', () => {
    for (const pendente of PENDENTES) expect(comTextarea, pendente).toContain(pendente)
  })
})
