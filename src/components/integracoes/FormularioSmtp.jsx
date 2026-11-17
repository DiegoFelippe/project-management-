// Conectar ou editar o e-mail (SMTP) da consultoria. A senha nunca volta do servidor.
import { useState } from 'react'
import CampoNumero from '@/components/campos/CampoNumero'
import Seletor from '@/components/campos/Seletor'
import { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { Input } from '@/components/ui/input'
import Campo from './Campo'
import { AVISO_DO_SEGREDO } from './constantes'
import JanelaIntegracao from './JanelaIntegracao'
import { useEnvioDaIntegracao } from './useEnvioDaIntegracao'

const PORTA_DA_SEGURANCA = { starttls: 587, ssl: 465, nenhuma: 25 }
const SEGURANCAS = [
  { valor: 'starttls', rotulo: 'STARTTLS (porta 587)' },
  { valor: 'ssl', rotulo: 'SSL/TLS (porta 465)' },
  { valor: 'nenhuma', rotulo: 'Sem cifra (só para testes)' },
]

export default function FormularioSmtp({ integracao, aoFechar, aoSalvar, aoTestar }) {
  const atual = integracao?.config ?? {}
  const [host, setHost] = useState(atual.host ?? '')
  const [porta, setPorta] = useState(String(atual.porta ?? 587))
  const [seguranca, setSeguranca] = useState(atual.seguranca ?? 'starttls')
  const [usuario, setUsuario] = useState(atual.usuario ?? '')
  const [senha, setSenha] = useState('')
  const [remetente, setRemetente] = useState(atual.remetente ?? '')
  const [nomeRemetente, setNomeRemetente] = useState(atual.nome_remetente ?? '')
  const { erro, enviando, salvar, testar } = useEnvioDaIntegracao(montar, aoSalvar, aoTestar)

  function trocarSeguranca(nova) {
    if (Number(porta) === PORTA_DA_SEGURANCA[seguranca]) setPorta(String(PORTA_DA_SEGURANCA[nova]))
    setSeguranca(nova)
  }

  // O Testar manda um e-mail de teste para quem testa (o e-mail do seu acesso).
  function montar() {
    if (!host.trim()) return { erro: 'Informe o servidor.' }
    const numero = Number(porta)
    if (!Number.isInteger(numero) || numero < 1 || numero > 65535) return { erro: 'Informe uma porta válida.' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(remetente.trim())) return { erro: 'Informe o e-mail do remetente.' }
    return {
      config: {
        host: host.trim(), porta: numero, seguranca, usuario: usuario.trim(),
        remetente: remetente.trim(), nome_remetente: nomeRemetente.trim(),
      },
      segredo: senha || null,
    }
  }

  return (
    <JanelaIntegracao titulo="E-mail (SMTP)" aoFechar={aoFechar} aoSalvar={salvar} aoTestar={testar} erro={erro} enviando={enviando}
      descricao="O servidor de e-mail que o sistema usa para mandar mensagens em nome da consultoria.">
      <SecaoFormulario titulo="Servidor">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Campo id="smtp-host" rotulo="Servidor">
            <Input id="smtp-host" className="h-10" placeholder="smtp.empresa.com.br" value={host} onChange={(e) => setHost(e.target.value)} />
          </Campo>
          <Campo id="smtp-porta" rotulo="Porta">
            <CampoNumero id="smtp-porta" valor={porta} aoMudar={setPorta} min={1} max={65535} />
          </Campo>
        </div>
        <Campo id="smtp-seguranca" rotulo="Segurança">
          <Seletor id="smtp-seguranca" valor={seguranca} aoMudar={trocarSeguranca} opcoes={SEGURANCAS} />
        </Campo>
      </SecaoFormulario>
      <SecaoFormulario titulo="Acesso e remetente">
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
      </SecaoFormulario>
    </JanelaIntegracao>
  )
}
