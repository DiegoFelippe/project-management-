import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoImagem from '@/components/comum/CampoImagem'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectNativo } from '@/components/ui/select-nativo'
import { urlPublica } from '@/lib/imagem'
import { iniciais } from '@/lib/nomes'
import { cn } from '@/lib/utils'

// Editar acesso: foto e nome (todos que podem editar), papel (só o administrador, pessoa ↔ gestor) e times
// (administrador: todos da consultoria; gestor: só os dele). E-mail não muda (decisão do Diego).
export default function EditarAcesso({ aberto, aoFechar, pessoa, papelDeQuemEdita, times = [], aoSalvar }) {
  const timesIniciais = (pessoa?.times ?? []).map((t) => t.id).filter((id) => times.some((t) => t.id === id))
  const [nome, setNome] = useState(pessoa?.nome ?? '')
  const [papel, setPapel] = useState(pessoa?.papel ?? 'pessoa')
  const [marcados, setMarcados] = useState(timesIniciais)
  const [foto, setFoto] = useState(null)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const mudaPapel = papelDeQuemEdita === 'admin'
  const mudaTimes = papelDeQuemEdita !== 'dono'

  const alternar = (id) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))

  async function salvar(evento) {
    evento.preventDefault()
    if (nome.trim().length < 2) return setErro('Use pelo menos 2 caracteres no nome.')
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar({
      nome: nome.trim(),
      papel: mudaPapel ? papel : undefined,
      timesAdicionar: marcados.filter((id) => !timesIniciais.includes(id)),
      timesRemover: timesIniciais.filter((id) => !marcados.includes(id)),
      foto,
    })
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar acesso</DialogTitle>
          <DialogDescription>O e-mail não muda. Para trocar de e-mail, crie um acesso novo e desative este.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={salvar} className="grid gap-4">
          <CampoImagem rotulo="foto" atual={urlPublica('fotos', pessoa?.foto)} reserva={iniciais(nome || pessoa?.nome || '')}
            valor={foto} aoMudar={setFoto} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="editar-nome">Nome</Label>
              <Input id="editar-nome" className="h-10" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editar-email">E-mail</Label>
              <Input id="editar-email" className="h-10" value={pessoa?.email ?? ''} disabled readOnly />
            </div>
          </div>
          {mudaPapel && (
            <div className="grid gap-2">
              <Label htmlFor="editar-papel">Papel</Label>
              <SelectNativo id="editar-papel" value={papel} onChange={(e) => setPapel(e.target.value)}>
                <option value="pessoa">Pessoa</option>
                <option value="gestor">Gestor</option>
              </SelectNativo>
            </div>
          )}
          {mudaTimes && times.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Times</legend>
              <div className="flex flex-wrap gap-2">
                {times.map((t) => {
                  const marcado = marcados.includes(t.id)
                  return (
                    <label key={t.id}
                      className={cn('cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                        marcado ? 'border-transparent bg-accent text-accent-foreground' : 'text-muted-foreground hover:border-primary/40')}>
                      <input type="checkbox" className="sr-only" checked={marcado} onChange={() => alternar(t.id)} />
                      {marcado ? '✓ ' : ''}{t.nome}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}
          {erro && <Aviso>{erro}</Aviso>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
