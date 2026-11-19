import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import CampoSenha from '@/components/campos/CampoSenha'
import EscolhaForma from '@/components/comum/EscolhaForma'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { useEnvio } from '@/components/comum/useEnvio'
import { Input } from '@/components/ui/input'
import { avaliarSenha } from '@/lib/senha'
import { erroDeEmail } from '@/lib/validacao'

const VAZIO = { nome: '', forma: 'convite', adminNome: '', adminEmail: '', senha: '' }

// Só o dono: a consultoria que contratou a plataforma e o primeiro administrador dela. A janela fica montada (só abre e
// fecha) e `fechar` limpa tudo. Os erros ficam embaixo de cada campo, todos de uma vez, e fechar com algo digitado
// pergunta antes (usabilidade, U2 e U4): a pergunta da JanelaFormulario vem antes do `fechar`, que limpa.
export default function NovaConsultoria({ aberto, aoFechar, aoCriar }) {
  const [dados, setDados] = useState(VAZIO)
  const { erro, erros, tentativa, conferir, limpar, enviando, enviar } = useEnvio(fechar, { validar: errosDaConsultoria })
  const alterado = useAlterado(dados)
  const mudar = (campo) => (evento) => setDados((d) => ({ ...d, [campo]: evento.target.value }))

  function fechar() {
    setDados(VAZIO)
    limpar()
    aoFechar()
  }

  function errosDaConsultoria() {
    const achados = {}
    if (dados.nome.trim().length < 2) achados.nome = 'Use pelo menos 2 caracteres.'
    if (dados.adminNome.trim().length < 2) achados.adminNome = 'Use pelo menos 2 caracteres.'
    const email = erroDeEmail(dados.adminEmail, { obrigatorio: true })
    if (email) achados.adminEmail = email
    if (dados.forma === 'senha' && !avaliarSenha(dados.senha).forte) achados.senha = 'A senha provisória precisa ser forte: confira as regras abaixo do campo.'
    return achados
  }

  async function criar(evento) {
    evento.preventDefault()
    if (enviando || !conferir()) return
    const admin = { forma: dados.forma, nome: dados.adminNome.trim(), email: dados.adminEmail.trim() }
    if (dados.forma === 'senha') admin.senha = dados.senha
    await enviar(() => aoCriar({ nome: dados.nome.trim(), admin }))
  }

  const campo = (id, rotulo, chave, extra = {}) => (
    <Campo id={id} rotulo={rotulo} erro={erros[chave]}>
      <Input id={id} autoComplete="off" className="h-10" value={dados[chave]} onChange={mudar(chave)} {...extra} />
    </Campo>
  )

  return (
    <JanelaFormulario aberto={aberto} aoFechar={fechar} titulo="Nova consultoria" icone={Building2} largura="lg" enviando={enviando}
      descricao="A consultoria que contratou a plataforma e quem vai administrá-la." tentativa={tentativa} alterado={alterado}
      form="form-nova-consultoria" rotuloEnviar="Criar consultoria" rotuloEnviando="Criando…">
      <form id="form-nova-consultoria" noValidate onSubmit={criar} className="space-y-5">
        <SecaoFormulario titulo="Consultoria">
          {campo('consultoria-nome', 'Nome da consultoria', 'nome', { maxLength: 120 })}
        </SecaoFormulario>
        <SecaoFormulario titulo="Primeiro administrador">
          <EscolhaForma nome="forma-admin" valor={dados.forma} aoMudar={(forma) => setDados((d) => ({ ...d, forma }))} />
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {campo('admin-nome', 'Nome', 'adminNome', { maxLength: 120 })}
            {campo('admin-email', 'E-mail', 'adminEmail', { type: 'email' })}
          </div>
          {dados.forma === 'senha' && (
            <Campo id="admin-senha" rotulo="Senha provisória" erro={erros.senha}>
              <CampoSenha id="admin-senha" valor={dados.senha} aoMudar={(senha) => setDados((d) => ({ ...d, senha }))} />
            </Campo>
          )}
        </SecaoFormulario>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
