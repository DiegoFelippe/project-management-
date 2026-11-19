import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import CampoNumero from '@/components/campos/CampoNumero'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { useEnvio } from '@/components/comum/useEnvio'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cnpjValido, formatarCnpj, normalizarCnpj } from '@/lib/cnpj'
import { erroDeEmail, erroDeTelefone } from '@/lib/validacao'
import { lerHoras, MAXIMO_DE_HORAS_NO_MES } from './rotulos'

// Os erros do cliente, todos de uma vez ({ campo: mensagem }; usabilidade, U2). E-mail e telefone são opcionais, mas
// com o formato certo (conferidos só na tela).
function errosDoCliente({ nome, cnpj, contatoTelefone, contatoEmail, horas }) {
  const erros = {}
  if (nome.trim().length < 2) erros.nome = 'Use pelo menos 2 caracteres no nome.'
  if (cnpj.trim() !== '' && !cnpjValido(cnpj)) erros.cnpj = 'CNPJ inválido.'
  const telefone = erroDeTelefone(contatoTelefone)
  if (telefone) erros.contatoTelefone = telefone
  const email = erroDeEmail(contatoEmail)
  if (email) erros.contatoEmail = email
  const horasMes = lerHoras(horas)
  if (horasMes === null || horasMes <= 0) erros.horas = 'Informe a previsão de horas por mês.'
  else if (horasMes > MAXIMO_DE_HORAS_NO_MES) erros.horas = `O mês tem no máximo ${MAXIMO_DE_HORAS_NO_MES} horas.`
  return erros
}

// Novo cliente (sem `cliente`, botão "Criar cliente") ou Editar cliente (preenchido, "Salvar"). aoSalvar(dados) devolve
// { erro }. Só o nome e a previsão são obrigatórios (como no banco); os demais campos dizem "(opcional)" (a coluna da
// UF tem 7,5rem para o rótulo caber numa linha). Os erros ficam embaixo de cada campo, todos de uma vez, e fechar com
// algo digitado pergunta antes (usabilidade, U2 e U4).
export default function FormularioCliente({ aberto, aoFechar, cliente, aoSalvar }) {
  const [nome, setNome] = useState(cliente?.nome ?? '')
  const [razaoSocial, setRazaoSocial] = useState(cliente?.razao_social ?? '')
  const [cnpj, setCnpj] = useState(cliente?.cnpj ? formatarCnpj(cliente.cnpj) : '')
  const [cidade, setCidade] = useState(cliente?.cidade ?? '')
  const [uf, setUf] = useState(cliente?.uf ?? '')
  const [contatoNome, setContatoNome] = useState(cliente?.contato_nome ?? '')
  const [contatoTelefone, setContatoTelefone] = useState(cliente?.contato_telefone ?? '')
  const [contatoEmail, setContatoEmail] = useState(cliente?.contato_email ?? '')
  const [observacoes, setObservacoes] = useState(cliente?.observacoes ?? '')
  const [horas, setHoras] = useState(String(cliente?.horas_mes ?? '').replace('.', ','))
  const { erro, erros, tentativa, conferir, enviando, enviar } = useEnvio(aoFechar, {
    validar: () => errosDoCliente({ nome, cnpj, contatoTelefone, contatoEmail, horas }),
  })
  const alterado = useAlterado({ nome, razaoSocial, cnpj, cidade, uf, contatoNome, contatoTelefone, contatoEmail, observacoes, horas })

  async function salvar(evento) {
    evento.preventDefault()
    if (!conferir()) return
    await enviar(() => aoSalvar({
      nome: nome.trim(),
      razaoSocial: razaoSocial.trim(),
      cnpj: normalizarCnpj(cnpj),
      cidade: cidade.trim(),
      uf: uf.trim().toUpperCase(),
      contatoNome: contatoNome.trim(),
      contatoTelefone: contatoTelefone.trim(),
      contatoEmail: contatoEmail.trim(),
      observacoes: observacoes.trim(),
      horasMes: lerHoras(horas),
    }))
  }

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo={cliente ? 'Editar cliente' : 'Novo cliente'} icone={Building2} largura="lg" enviando={enviando}
      descricao="Dados do provedor e quantas horas por mês estão previstas para ele." tentativa={tentativa} alterado={alterado}
      form="form-cliente" rotuloEnviar={cliente ? 'Salvar' : 'Criar cliente'} rotuloEnviando={cliente ? 'Salvando…' : 'Criando…'}>
      <form id="form-cliente" noValidate onSubmit={salvar} className="space-y-5">
        <SecaoFormulario titulo="Dados">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="cliente-nome" rotulo="Nome" erro={erros.nome}>
              <Input id="cliente-nome" className="h-10" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <Campo id="cliente-razao" rotulo="Razão social (opcional)">
              <Input id="cliente-razao" className="h-10" maxLength={160} value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
            </Campo>
            <Campo id="cliente-cnpj" rotulo="CNPJ (opcional)" erro={erros.cnpj}>
              <Input id="cliente-cnpj" className="h-10" inputMode="text" maxLength={18} value={cnpj}
                onChange={(e) => setCnpj(e.target.value)} onBlur={() => cnpjValido(cnpj) && setCnpj(formatarCnpj(cnpj))} />
            </Campo>
            <div className="grid grid-cols-[1fr_7.5rem] items-start gap-3">
              <Campo id="cliente-cidade" rotulo="Cidade (opcional)">
                <Input id="cliente-cidade" className="h-10" maxLength={80} value={cidade} onChange={(e) => setCidade(e.target.value)} />
              </Campo>
              <Campo id="cliente-uf" rotulo="UF (opcional)">
                <Input id="cliente-uf" className="h-10 uppercase" maxLength={2} value={uf} onChange={(e) => setUf(e.target.value)} />
              </Campo>
            </div>
          </div>
        </SecaoFormulario>
        <SecaoFormulario titulo="Contato">
          <Campo id="cliente-contato-nome" rotulo="Contato (opcional)">
            <Input id="cliente-contato-nome" className="h-10" maxLength={120} value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} />
          </Campo>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <Campo id="cliente-contato-telefone" rotulo="Telefone do contato (opcional)" erro={erros.contatoTelefone}>
              <Input id="cliente-contato-telefone" className="h-10" type="tel" maxLength={30} placeholder="(49) 99988-7766" value={contatoTelefone}
                onChange={(e) => setContatoTelefone(e.target.value)} />
            </Campo>
            <Campo id="cliente-contato-email" rotulo="E-mail do contato (opcional)" erro={erros.contatoEmail}>
              <Input id="cliente-contato-email" className="h-10" type="email" maxLength={160} placeholder="nome@empresa.com.br" value={contatoEmail}
                onChange={(e) => setContatoEmail(e.target.value)} />
            </Campo>
          </div>
        </SecaoFormulario>
        <SecaoFormulario titulo="Previsão e observações">
          <Campo id="cliente-horas" rotulo="Previsão de horas por mês" erro={erros.horas}>
            <CampoNumero id="cliente-horas" valor={horas} aoMudar={setHoras} min={0} max={999} passo={0.5} decimal unidade="h" />
          </Campo>
          <Campo id="cliente-observacoes" rotulo="Observações (opcional)">
            <Textarea id="cliente-observacoes" rows={2} maxLength={1000}
              value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </Campo>
        </SecaoFormulario>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
