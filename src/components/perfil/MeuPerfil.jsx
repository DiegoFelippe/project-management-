// Meu perfil (abre pela bolinha da pessoa no trilho, acima do Sair): foto, nome, contato, senha e verificação em duas
// etapas de quem está usando.
// E-mail e papel quem muda é o administrador; cargo, data de entrada e carga semanal aparecem só para ler.
// O nome passa pela Edge Function; o contato, pela função do banco; a foto, pelo Storage.
import { UserRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Seletor from '@/components/campos/Seletor'
import CampoImagem from '@/components/comum/CampoImagem'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import SeletorDeCor from '@/components/comum/SeletorDeCor'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import CampoSenha from '@/components/campos/CampoSenha'
import { avaliarSenha } from '@/lib/senha'
import { Label } from '@/components/ui/label'
import VerificacaoDoPerfil from './VerificacaoDoPerfil'
import { mudarCor, tirarFoto, trocarFoto } from '@/data/imagens'
import { atualizarMeuContato, gerenciarAcesso } from '@/data/usuarios'
import { corDaPessoa } from '@/lib/cores'
import { formatarHoras } from '@/lib/horas'
import { urlPublica } from '@/lib/imagem'
import { formatarDia } from '@/lib/mes'
import { iniciais } from '@/lib/nomes'
import { UFS } from '@/lib/ufs'

const OPCOES_DE_UF = UFS.map((u) => ({ valor: u, rotulo: u }))

export default function MeuPerfil({ aberto, aoFechar }) {
  const { perfil, recarregarPerfil, definirSenha } = useAuth()
  const [nome, setNome] = useState(perfil.nome)
  const [foto, setFoto] = useState(null)
  const [corEscolhida, setCorEscolhida] = useState(undefined) // undefined = não mexeu; null = automática
  const [telefone, setTelefone] = useState(perfil.telefone ?? '')
  const [cidade, setCidade] = useState(perfil.cidade ?? '')
  const [uf, setUf] = useState(perfil.uf ?? '')
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const corMarcada = corEscolhida === undefined ? (perfil.cor ?? null) : corEscolhida
  const corMostrada = corMarcada ?? corDaPessoa({ id: perfil.id })
  const semFoto = foto?.arquivo ? false : foto?.tirar ? true : !perfil.foto
  const naConsultoria = ['admin', 'gestor', 'pessoa'].includes(perfil.papel)

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
    if (corMarcada !== (perfil.cor ?? null)) {
      const { erro: falha } = await mudarCor(perfil.id, corMarcada)
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
      if (!avaliarSenha(senha).forte) return setErro('A senha precisa ser forte: confira as regras abaixo do campo.')
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
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo="Meu perfil" icone={UserRound} largura="lg" enviando={enviando}
      descricao="Sua foto, seu nome, seu contato, sua senha e a verificação em duas etapas. O e-mail e o papel quem muda é o administrador."
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-perfil" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}>
      <form id="form-perfil" noValidate onSubmit={salvar} className="space-y-5">
        <SecaoFormulario titulo="Dados">
          <CampoImagem rotulo="foto" atual={urlPublica('fotos', perfil.foto)} reserva={iniciais(nome || perfil.nome)}
            reservaCor={corMostrada} valor={foto} aoMudar={setFoto} />
          {semFoto && <SeletorDeCor valor={corMarcada} aoMudar={setCorEscolhida} />}
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
          {(perfil.cargo || perfil.data_entrada || naConsultoria) && (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {perfil.cargo && <div><dt className="text-xs text-muted-foreground">Cargo</dt><dd>{perfil.cargo}</dd></div>}
              {perfil.data_entrada && <div><dt className="text-xs text-muted-foreground">Data de entrada</dt><dd>{formatarDia(perfil.data_entrada)}</dd></div>}
              {naConsultoria && perfil.carga_semanal != null && (
                <div><dt className="text-xs text-muted-foreground">Carga semanal</dt><dd>{formatarHoras(Number(perfil.carga_semanal))} por semana</dd></div>
              )}
            </dl>
          )}
        </SecaoFormulario>
        <SecaoFormulario titulo="Contato">
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
              <Seletor id="perfil-uf" valor={uf} aoMudar={setUf} rotuloTodos="—" opcoes={OPCOES_DE_UF} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" disabled={enviando || !contatoMudou} onClick={salvarContato}>Salvar contato</Button>
          </div>
        </SecaoFormulario>
        <SecaoFormulario titulo="Trocar senha (opcional)">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="perfil-senha">Senha nova</Label>
              <CampoSenha id="perfil-senha" valor={senha} aoMudar={setSenha} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="perfil-senha-repetida">Repita a senha nova</Label>
              <Input id="perfil-senha-repetida" type="password" autoComplete="new-password" className="h-10" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Só senha forte é aceita. Deixe em branco para manter a atual.</p>
        </SecaoFormulario>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
      <VerificacaoDoPerfil perfil={perfil} aoMudar={recarregarPerfil} />
    </JanelaFormulario>
  )
}
