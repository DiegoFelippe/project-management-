// Meu perfil (abre pela bolinha da pessoa no trilho, acima do Sair): foto, nome, contato e senha de quem está usando.
// E-mail e papel quem muda é o administrador; cargo, data de entrada e carga semanal aparecem só para ler.
// O nome passa pela Edge Function; o contato, pela função do banco; a foto, pelo Storage.
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import AusenciasDaPessoa from '@/components/capacidade/AusenciasDaPessoa'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoImagem from '@/components/comum/CampoImagem'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { tirarFoto, trocarFoto } from '@/data/imagens'
import { atualizarMeuContato, gerenciarAcesso } from '@/data/usuarios'
import { SelectNativo } from '@/components/ui/select-nativo'
import { formatarHoras } from '@/lib/horas'
import { urlPublica } from '@/lib/imagem'
import { formatarDia } from '@/lib/mes'
import { iniciais } from '@/lib/nomes'
import { UFS } from '@/lib/ufs'

export default function MeuPerfil({ aberto, aoFechar }) {
  const { perfil, recarregarPerfil, definirSenha } = useAuth()
  const [nome, setNome] = useState(perfil.nome)
  const [foto, setFoto] = useState(null)
  const [telefone, setTelefone] = useState(perfil.telefone ?? '')
  const [cidade, setCidade] = useState(perfil.cidade ?? '')
  const [uf, setUf] = useState(perfil.uf ?? '')
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const minhasAusencias = ['admin', 'gestor', 'pessoa'].includes(perfil.papel)

  const contatoMudou = telefone.trim() !== (perfil.telefone ?? '') || cidade.trim() !== (perfil.cidade ?? '') || uf !== (perfil.uf ?? '')

  async function gravarContato() {
    const { erro: falha } = await atualizarMeuContato({ telefone: telefone.trim(), cidade: cidade.trim(), uf })
    return falha
  }

  async function salvarContato() {
    setErro(null)
    setEnviando(true)
    const falha = await gravarContato()
    setEnviando(false)
    if (falha) return setErro(falha)
    await recarregarPerfil?.()
    toast.success('Contato atualizado.')
  }

  async function aplicar() {
    if (nome.trim() !== perfil.nome) {
      const { erro: falha } = await gerenciarAcesso('editar', perfil.id, { nome: nome.trim() })
      if (falha) return falha
    }
    if (contatoMudou) {
      const falha = await gravarContato()
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
          <DialogDescription>Sua foto, seu nome, seu contato e sua senha. O e-mail e o papel quem muda é o administrador.</DialogDescription>
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
            <legend className="px-1 text-sm font-medium">Contato</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="perfil-telefone">Telefone</Label>
                <Input id="perfil-telefone" type="text" inputMode="tel" autoComplete="tel" maxLength={30} className="h-10" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="perfil-cidade">Cidade</Label>
                <Input id="perfil-cidade" autoComplete="address-level2" maxLength={120} className="h-10" value={cidade} onChange={(e) => setCidade(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="perfil-uf">UF</Label>
                <SelectNativo id="perfil-uf" value={uf} onChange={(e) => setUf(e.target.value)}>
                  <option value="">—</option>
                  {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                </SelectNativo>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" disabled={enviando || !contatoMudou} onClick={salvarContato}>Salvar contato</Button>
            </div>
          </fieldset>
          {(perfil.cargo || perfil.data_entrada || minhasAusencias) && (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {perfil.cargo && <div><dt className="text-xs text-muted-foreground">Cargo</dt><dd>{perfil.cargo}</dd></div>}
              {perfil.data_entrada && <div><dt className="text-xs text-muted-foreground">Data de entrada</dt><dd>{formatarDia(perfil.data_entrada)}</dd></div>}
              {minhasAusencias && perfil.carga_semanal != null && (
                <div><dt className="text-xs text-muted-foreground">Carga semanal</dt><dd>{formatarHoras(Number(perfil.carga_semanal))} por semana</dd></div>
              )}
            </dl>
          )}
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
          {minhasAusencias && (
            <section aria-labelledby="minhas-ausencias" className="grid gap-2">
              <h3 id="minhas-ausencias" className="text-sm font-medium">Minhas ausências</h3>
              <AusenciasDaPessoa perfilId={perfil.id} />
              <p className="text-xs text-muted-foreground">Quem registra ou muda as ausências é a administração da sua consultoria.</p>
            </section>
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
