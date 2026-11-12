// Conectar ou editar o e-mail (SMTP) da consultoria. A senha nunca volta do servidor.
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectNativo } from '@/components/ui/select-nativo'
import { AVISO_DO_SEGREDO } from './constantes'
import JanelaIntegracao from './JanelaIntegracao'

const PORTA_DA_SEGURANCA = { starttls: 587, ssl: 465, nenhuma: 25 }

function Campo({ id, rotulo, children }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  )
}

export default function FormularioSmtp({ integracao, aoFechar, aoSalvar }) {
  const atual = integracao?.config ?? {}
  const [host, setHost] = useState(atual.host ?? '')
  const [porta, setPorta] = useState(atual.porta ?? 587)
  const [seguranca, setSeguranca] = useState(atual.seguranca ?? 'starttls')
  const [usuario, setUsuario] = useState(atual.usuario ?? '')
  const [senha, setSenha] = useState('')
  const [remetente, setRemetente] = useState(atual.remetente ?? '')
  const [nomeRemetente, setNomeRemetente] = useState(atual.nome_remetente ?? '')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  function trocarSeguranca(nova) {
    if (Number(porta) === PORTA_DA_SEGURANCA[seguranca]) setPorta(PORTA_DA_SEGURANCA[nova])
    setSeguranca(nova)
  }

  async function salvar(evento) {
    evento.preventDefault()
    if (!host.trim()) return setErro('Informe o servidor.')
    const numero = Number(porta)
    if (!Number.isInteger(numero) || numero < 1 || numero > 65535) return setErro('Informe uma porta válida.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(remetente.trim())) return setErro('Informe o e-mail do remetente.')
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar({
      host: host.trim(), porta: numero, seguranca, usuario: usuario.trim(),
      remetente: remetente.trim(), nome_remetente: nomeRemetente.trim(),
    }, senha || null)
    setEnviando(false)
    if (resposta?.erro) setErro(resposta.erro)
  }

  return (
    <JanelaIntegracao titulo="E-mail (SMTP)" aoFechar={aoFechar} aoSalvar={salvar} erro={erro} enviando={enviando}
      descricao="O servidor de e-mail que o sistema usa para mandar mensagens em nome da consultoria.">
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Campo id="smtp-host" rotulo="Servidor">
          <Input id="smtp-host" className="h-10" placeholder="smtp.empresa.com.br" value={host} onChange={(e) => setHost(e.target.value)} />
        </Campo>
        <Campo id="smtp-porta" rotulo="Porta">
          <Input id="smtp-porta" type="number" min={1} max={65535} className="h-10" value={porta} onChange={(e) => setPorta(e.target.value)} />
        </Campo>
      </div>
      <Campo id="smtp-seguranca" rotulo="Segurança">
        <SelectNativo id="smtp-seguranca" value={seguranca} onChange={(e) => trocarSeguranca(e.target.value)}>
          <option value="starttls">STARTTLS (porta 587)</option>
          <option value="ssl">SSL/TLS (porta 465)</option>
          <option value="nenhuma">Sem cifra (só para testes)</option>
        </SelectNativo>
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="smtp-usuario" rotulo="Usuário">
          <Input id="smtp-usuario" className="h-10" autoComplete="off" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </Campo>
        <Campo id="smtp-senha" rotulo="Senha">
          <Input id="smtp-senha" type="password" autoComplete="new-password" className="h-10" value={senha}
            placeholder={integracao ? AVISO_DO_SEGREDO : ''} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Campo id="smtp-remetente" rotulo="E-mail do remetente">
          <Input id="smtp-remetente" type="email" className="h-10" placeholder="contato@empresa.com.br" value={remetente}
            onChange={(e) => setRemetente(e.target.value)} />
        </Campo>
        <Campo id="smtp-nome" rotulo="Nome do remetente">
          <Input id="smtp-nome" className="h-10" maxLength={120} value={nomeRemetente} onChange={(e) => setNomeRemetente(e.target.value)} />
        </Campo>
      </div>
    </JanelaIntegracao>
  )
}
