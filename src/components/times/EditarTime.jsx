import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectNativo } from '@/components/ui/select-nativo'

// Editar time: nome e descrição (gestor do time e administrador); trocar o gestor só o administrador.
export default function EditarTime({ aberto, aoFechar, time, papelDeQuemEdita, gestores = [], aoSalvar }) {
  const [nome, setNome] = useState(time?.nome ?? '')
  const [descricao, setDescricao] = useState(time?.descricao ?? '')
  const [gestorId, setGestorId] = useState(time?.gestor_id ?? '')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const trocaGestor = papelDeQuemEdita === 'admin'

  async function salvar(evento) {
    evento.preventDefault()
    if (nome.trim().length < 2) return setErro('Use pelo menos 2 caracteres no nome.')
    setErro(null)
    setEnviando(true)
    const dados = { nome: nome.trim(), descricao: descricao.trim() }
    if (trocaGestor) dados.gestorId = gestorId
    const resposta = await aoSalvar(dados)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar time</DialogTitle>
          <DialogDescription>{trocaGestor ? 'Nome, descrição e gestor do time.' : 'Nome e descrição do time.'}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={salvar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="editar-time-nome">Nome do time</Label>
            <Input id="editar-time-nome" className="h-10" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editar-time-descricao">Descrição (opcional)</Label>
            <textarea id="editar-time-descricao" rows={2} maxLength={500}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30"
              value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          {trocaGestor && (
            <div className="grid gap-2">
              <Label htmlFor="editar-time-gestor">Gestor do time</Label>
              <SelectNativo id="editar-time-gestor" value={gestorId} onChange={(e) => setGestorId(e.target.value)}>
                {gestores.map((g) => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </SelectNativo>
            </div>
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
