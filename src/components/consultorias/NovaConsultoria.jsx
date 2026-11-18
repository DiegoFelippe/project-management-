import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import EscolhaForma from '@/components/comum/EscolhaForma'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
import CampoSenha from '@/components/campos/CampoSenha'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { avaliarSenha } from '@/lib/senha'

const VAZIO = { nome: '', forma: 'convite', adminNome: '', adminEmail: '', senha: '' }

// Só o dono: a consultoria que contratou a plataforma e o primeiro administrador dela.
export default function NovaConsultoria({ aberto, aoFechar, aoCriar }) {
  const [dados, setDados] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const { erro, setErro, enviando, enviar } = useEnvio(fechar)
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
    if (dados.forma === 'senha' && !avaliarSenha(dados.senha).forte) achados.senha = 'A senha provisória precisa ser forte: confira as regras abaixo do campo.'
    setErros(achados)
    return Object.keys(achados).length === 0
  }

  async function criar(evento) {
    evento.preventDefault()
    if (enviando || !validar()) return
    const admin = { forma: dados.forma, nome: dados.adminNome.trim(), email: dados.adminEmail.trim() }
    if (dados.forma === 'senha') admin.senha = dados.senha
    await enviar(() => aoCriar({ nome: dados.nome.trim(), admin }))
  }

  const campo = (id, rotulo, chave, extra = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} autoComplete="off" className="h-10" aria-invalid={erros[chave] ? true : undefined}
        value={dados[chave]} onChange={mudar(chave)} {...extra} />
      {erros[chave] && <p className="text-rotulo text-destructive">{erros[chave]}</p>}
    </div>
  )

  return (
    <JanelaFormulario aberto={aberto} aoFechar={fechar} titulo="Nova consultoria" icone={Building2} largura="lg" enviando={enviando}
      descricao="A consultoria que contratou a plataforma e quem vai administrá-la."
      form="form-nova-consultoria" rotuloEnviar="Criar consultoria" rotuloEnviando="Criando…">
      <form id="form-nova-consultoria" noValidate onSubmit={criar} className="space-y-5">
        <SecaoFormulario titulo="Consultoria">
          {campo('consultoria-nome', 'Nome da consultoria', 'nome', { maxLength: 120 })}
        </SecaoFormulario>
        <SecaoFormulario titulo="Primeiro administrador">
          <EscolhaForma nome="forma-admin" valor={dados.forma} aoMudar={(forma) => setDados((d) => ({ ...d, forma }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            {campo('admin-nome', 'Nome', 'adminNome', { maxLength: 120 })}
            {campo('admin-email', 'E-mail', 'adminEmail', { type: 'email' })}
          </div>
          {dados.forma === 'senha' && (
            <div className="grid gap-2">
              <Label htmlFor="admin-senha">Senha provisória</Label>
              <CampoSenha id="admin-senha" valor={dados.senha} invalido={!!erros.senha} aoMudar={(senha) => setDados((d) => ({ ...d, senha }))} />
              {erros.senha && <p className="text-rotulo text-destructive">{erros.senha}</p>}
            </div>
          )}
        </SecaoFormulario>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
