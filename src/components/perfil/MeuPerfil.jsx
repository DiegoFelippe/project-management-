// Meu perfil (abre pela bolinha da pessoa no trilho, acima do Sair): foto, nome e senha de quem está usando.
// E-mail e papel quem muda é o administrador. O nome passa pela Edge Function; a foto, pelo Storage.
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoImagem from '@/components/comum/CampoImagem'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { tirarFoto, trocarFoto } from '@/data/imagens'
import { gerenciarAcesso } from '@/data/usuarios'
import { urlPublica } from '@/lib/imagem'
import { iniciais } from '@/lib/nomes'

export default function MeuPerfil({ aberto, aoFechar }) {
  const { perfil, recarregarPerfil, definirSenha } = useAuth()
  const [nome, setNome] = useState(perfil.nome)
  const [foto, setFoto] = useState(null)
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function aplicar() {
    if (nome.trim() !== perfil.nome) {
      const { erro: falha } = await gerenciarAcesso('editar', perfil.id, { nome: nome.trim() })
      if (falha) return falha
    }
    if (foto?.arquivo || foto?.tirar) {
      const { erro: falha } = foto.arquivo ? await trocarFoto(perfil.id, foto.arquivo, perfil.foto) : await tirarFoto(perfil.id, perfil.foto)
      if (falha) return falha
    }
    if (senha) {
      const { erro: falha } = await definirSenha(senha)
      if (falha) return falha
    }
    return null
  }

  async function salvar(evento) {
    evento.preventDefault()
    if (nome.trim().length < 2) return setErro('Use pelo menos 2 caracteres no nome.')
    if (senha || repetida) {
      if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
      if (senha !== repetida) return setErro('As senhas não são iguais.')
    }
    setErro(null)
    setEnviando(true)
    const falha = await aplicar()
    setEnviando(false)
    if (falha) return setErro(falha)
    await recarregarPerfil?.()
    toast.success('Perfil atualizado.')
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Meu perfil</DialogTitle>
          <DialogDescription>Sua foto, seu nome e sua senha. O e-mail e o papel quem muda é o administrador.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={salvar} className="grid gap-4">
          <CampoImagem rotulo="foto" atual={urlPublica('fotos', perfil.foto)} reserva={iniciais(nome || perfil.nome)}
            valor={foto} aoMudar={setFoto} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="perfil-nome">Nome</Label>
              <Input id="perfil-nome" className="h-10" maxLength={120} autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="perfil-email">E-mail</Label>
              <Input id="perfil-email" className="h-10" value={perfil.email} disabled readOnly />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {NOME_DO_PAPEL[perfil.papel]} · {perfil.consultoria?.nome ?? 'Plataforma'}
          </p>
          <fieldset className="grid gap-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-medium">Trocar senha (opcional)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="perfil-senha">Senha nova</Label>
                <Input id="perfil-senha" type="password" autoComplete="new-password" className="h-10" value={senha} onChange={(e) => setSenha(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="perfil-senha-repetida">Repita a senha nova</Label>
                <Input id="perfil-senha-repetida" type="password" autoComplete="new-password" className="h-10" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres. Deixe em branco para manter a atual.</p>
          </fieldset>
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
