// Conectar ou editar o Slack da consultoria: o token de bot (xoxb-, nunca volta do servidor) e, opcional, o canal que
// recebe a mensagem do Testar. Por enquanto é só a conexão: para onde vão as mensagens do sistema fica para depois.
import { useState } from 'react'
import { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { Input } from '@/components/ui/input'
import Campo from './Campo'
import { AVISO_DO_TOKEN } from './constantes'
import JanelaIntegracao from './JanelaIntegracao'
import { useEnvioDaIntegracao } from './useEnvioDaIntegracao'

// Nome do canal (com ou sem #) ou o ID (C0123ABCD); o servidor grava o nome em minúsculas.
const CANAL = /^#?[a-z0-9][a-z0-9._-]{0,79}$/i

export default function FormularioSlack({ integracao, aoFechar, aoSalvar, aoTestar }) {
  const [token, setToken] = useState('')
  const [canal, setCanal] = useState(integracao?.config?.canal ?? '')
  const { erro, enviando, testando, resultado, salvar, testar } = useEnvioDaIntegracao(montar, aoSalvar, aoTestar)

  function montar() {
    const tokenLimpo = token.trim()
    const canalLimpo = canal.trim()
    if (!integracao && !tokenLimpo) return { erro: 'Informe o token do bot.' }
    if (tokenLimpo && !/^xoxb-[A-Za-z0-9-]+$/.test(tokenLimpo)) return { erro: 'Use o token de bot do Slack (começa com xoxb-).' }
    if (canalLimpo && !CANAL.test(canalLimpo)) return { erro: 'Informe o canal pelo nome (#geral) ou pelo ID (C0123ABCD).' }
    return { config: canalLimpo ? { canal: canalLimpo } : {}, segredo: tokenLimpo || null }
  }

  return (
    <JanelaIntegracao titulo="Slack" aoFechar={aoFechar} aoSalvar={salvar} aoTestar={testar} erro={erro} enviando={enviando}
      testando={testando} resultado={resultado}
      descricao="O app do Slack da consultoria, que o sistema vai usar para mandar mensagens no workspace.">
      <SecaoFormulario titulo="Acesso">
        <Campo id="slack-token" rotulo="Token do bot"
          dica="No app do Slack (api.slack.com/apps): OAuth & Permissions → Bot User OAuth Token. Começa com xoxb-.">
          <Input id="slack-token" type="password" autoComplete="off" className="h-10" value={token} aria-describedby="slack-token-dica"
            placeholder={integracao ? AVISO_DO_TOKEN : 'xoxb-…'} onChange={(e) => setToken(e.target.value)} />
        </Campo>
      </SecaoFormulario>
      <SecaoFormulario titulo="Teste">
        <Campo id="slack-canal" rotulo="Canal para o teste (opcional)"
          dica="O Testar manda uma mensagem de teste nesse canal. Em canal privado, convide o bot antes (/invite).">
          <Input id="slack-canal" className="h-10" maxLength={81} autoComplete="off" spellCheck={false} value={canal}
            aria-describedby="slack-canal-dica" placeholder="#geral ou C0123ABCD" onChange={(e) => setCanal(e.target.value)} />
        </Campo>
      </SecaoFormulario>
    </JanelaIntegracao>
  )
}
