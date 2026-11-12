import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectNativo } from '@/components/ui/select-nativo'

// Gestor cria o time dele; o administrador escolhe quem é o gestor.
export default function NovoTime({ aberto, aoFechar, papelDeQuemCria, gestores, aoCriar }) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [gestorId, setGestorId] = useState('')
  const [erroNome, setErroNome] = useState(null)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const escolheGestor = papelDeQuemCria === 'admin'

  function limpar() {
    setNome('')
    setDescricao('')
    setGestorId('')
    setErroNome(null)
    setErro(null)
  }

  async function enviar(evento) {
    evento.preventDefault()
    if (nome.trim().length < 2) return setErroNome('Use pelo menos 2 caracteres.')
    setErroNome(null)
    if (escolheGestor && !gestorId) return setErro('Escolha o gestor do time.')
    setErro(null)
    setEnviando(true)
    const dados = { nome: nome.trim(), descricao: descricao.trim() }
    if (escolheGestor) dados.gestorId = gestorId
    const resposta = await aoCriar(dados)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    limpar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => { if (!abrir) { limpar(); aoFechar() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo time</DialogTitle>
          <DialogDescription>
            {escolheGestor ? 'Dê um nome ao time e escolha quem é o gestor.' : 'Você será o gestor deste time.'}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={enviar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nome-time">Nome do time</Label>
            <Input id="nome-time" maxLength={80} aria-invalid={erroNome ? true : undefined} className="h-10"
              value={nome} onChange={(e) => setNome(e.target.value)} />
            {erroNome && <p className="text-xs text-destructive">{erroNome}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="descricao-time">Descrição (opcional)</Label>
            <textarea id="descricao-time" maxLength={500} rows={2}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30"
              value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          {escolheGestor && (
            <div className="grid gap-2">
              <Label htmlFor="gestor-time">Gestor do time</Label>
              <SelectNativo id="gestor-time" value={gestorId} onChange={(e) => setGestorId(e.target.value)}>
                <option value="">Escolha…</option>
                {gestores.map((g) => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </SelectNativo>
            </div>
          )}
          {erro && <Aviso>{erro}</Aviso>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { limpar(); aoFechar() }}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>Criar time</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
