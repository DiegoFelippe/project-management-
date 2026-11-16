import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import EscolhaForma from '@/components/comum/EscolhaForma'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const VAZIO = { nome: '', forma: 'convite', adminNome: '', adminEmail: '', senha: '' }

// Só o dono: a consultoria que contratou a plataforma e o primeiro administrador dela.
export default function NovaConsultoria({ aberto, aoFechar, aoCriar }) {
  const [dados, setDados] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const mudar = (campo) => (evento) => setDados((d) => ({ ...d, [campo]: evento.target.value }))

  function fechar() {
    setDados(VAZIO)
    setErros({})
    setErro(null)
    aoFechar()
  }

  function validar() {
    const achados = {}
    if (dados.nome.trim().length < 2) achados.nome = 'Use pelo menos 2 caracteres.'
    if (dados.adminNome.trim().length < 2) achados.adminNome = 'Use pelo menos 2 caracteres.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.adminEmail.trim())) achados.adminEmail = 'Digite um e-mail válido.'
    if (dados.forma === 'senha' && dados.senha.length < 8) achados.senha = 'A senha precisa ter pelo menos 8 caracteres.'
    setErros(achados)
    return Object.keys(achados).length === 0
  }

  async function enviar(evento) {
    evento.preventDefault()
    if (enviando || !validar()) return
    setErro(null)
    setEnviando(true)
    const admin = { forma: dados.forma, nome: dados.adminNome.trim(), email: dados.adminEmail.trim() }
    if (dados.forma === 'senha') admin.senha = dados.senha
    const resposta = await aoCriar({ nome: dados.nome.trim(), admin })
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    fechar()
  }

  const campo = (id, rotulo, chave, extra = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} autoComplete="off" className="h-10" aria-invalid={erros[chave] ? true : undefined}
        value={dados[chave]} onChange={mudar(chave)} {...extra} />
      {erros[chave] && <p className="text-xs text-destructive">{erros[chave]}</p>}
    </div>
  )

  return (
    <JanelaFormulario aberto={aberto} aoFechar={fechar} titulo="Nova consultoria" icone={Building2} largura="lg" enviando={enviando}
      descricao="A consultoria que contratou a plataforma e quem vai administrá-la."
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={fechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-nova-consultoria" disabled={enviando}>{enviando ? 'Criando…' : 'Criar consultoria'}</Button>
        </>
      )}>
      <form id="form-nova-consultoria" noValidate onSubmit={enviar} className="space-y-5">
        <SecaoFormulario titulo="Consultoria">
          {campo('consultoria-nome', 'Nome da consultoria', 'nome', { maxLength: 120 })}
        </SecaoFormulario>
        <SecaoFormulario titulo="Primeiro administrador">
          <EscolhaForma nome="forma-admin" valor={dados.forma} aoMudar={(forma) => setDados((d) => ({ ...d, forma }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            {campo('admin-nome', 'Nome', 'adminNome', { maxLength: 120 })}
            {campo('admin-email', 'E-mail', 'adminEmail', { type: 'email' })}
          </div>
          {dados.forma === 'senha' && campo('admin-senha', 'Senha provisória', 'senha')}
        </SecaoFormulario>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
