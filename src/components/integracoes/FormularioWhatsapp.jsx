// Conectar ou editar o WhatsApp da consultoria (WhatsApp Business Cloud API, a oficial da Meta): o ID do número, o ID
// da conta do WhatsApp Business e o token de acesso permanente (nunca volta do servidor). O número para o teste só vai
// no Testar (recebe o modelo hello_world) e não é guardado. Por enquanto é só a conexão.
import { useState } from 'react'
import Campo from '@/components/campos/Campo'
import { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { Input } from '@/components/ui/input'
import { AVISO_DO_TOKEN } from './constantes'
import JanelaIntegracao from './JanelaIntegracao'
import { useEnvioDaIntegracao } from './useEnvioDaIntegracao'

const ID_DA_META = /^\d{5,25}$/
const NUMERO_INTERNACIONAL = /^\+[1-9]\d{7,14}$/

export default function FormularioWhatsapp({ integracao, aoFechar, aoSalvar, aoTestar }) {
  const atual = integracao?.config ?? {}
  const [numeroId, setNumeroId] = useState(atual.phone_number_id ?? '')
  const [contaId, setContaId] = useState(atual.waba_id ?? '')
  const [token, setToken] = useState('')
  const [numeroDeTeste, setNumeroDeTeste] = useState('')
  const { erro, erros, tentativa, enviando, testando, resultado, salvar, testar } = useEnvioDaIntegracao(montar, aoSalvar, aoTestar)
  const alterado = useAlterado({ numeroId, contaId, token, numeroDeTeste })

  function montar() {
    const tokenLimpo = token.trim()
    const numero = numeroDeTeste.replace(/[\s().-]/g, '')
    const erros = {}
    if (!ID_DA_META.test(numeroId.trim())) erros.numeroId = 'Informe o ID do número de telefone (só números).'
    if (!ID_DA_META.test(contaId.trim())) erros.contaId = 'Informe o ID da conta do WhatsApp Business (só números).'
    if (!integracao && !tokenLimpo) erros.token = 'Informe o token de acesso.'
    else if (/\s/.test(tokenLimpo)) erros.token = 'O token de acesso não tem espaços. Copie de novo.'
    if (numero && !NUMERO_INTERNACIONAL.test(numero)) erros.numeroDeTeste = 'Informe o número do teste com + e o código do país (ex.: +5511999998888).'
    if (Object.keys(erros).length) return { erros }
    return {
      config: { phone_number_id: numeroId.trim(), waba_id: contaId.trim() },
      segredo: tokenLimpo || null,
      extras: numero ? { numero_teste: numero } : {},
    }
  }

  return (
    <JanelaIntegracao titulo="WhatsApp" aoFechar={aoFechar} aoSalvar={salvar} aoTestar={testar} erro={erro} tentativa={tentativa} alterado={alterado} enviando={enviando}
      testando={testando} resultado={resultado}
      descricao="O número do WhatsApp Business da consultoria, pela API oficial da Meta (Cloud API).">
      <SecaoFormulario titulo="Conta">
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Campo id="whatsapp-numero-id" rotulo="ID do número de telefone" erro={erros.numeroId}>
            <Input id="whatsapp-numero-id" className="h-10 tabular-nums" inputMode="numeric" autoComplete="off" maxLength={25}
              value={numeroId} onChange={(e) => setNumeroId(e.target.value)} />
          </Campo>
          <Campo id="whatsapp-conta-id" rotulo="ID da conta do WhatsApp Business" erro={erros.contaId}>
            <Input id="whatsapp-conta-id" className="h-10 tabular-nums" inputMode="numeric" autoComplete="off" maxLength={25}
              value={contaId} onChange={(e) => setContaId(e.target.value)} />
          </Campo>
        </div>
        <p className="text-legenda text-muted-foreground">
          Os dois ficam no app da Meta (developers.facebook.com), em WhatsApp → Configuração da API.
        </p>
      </SecaoFormulario>
      <SecaoFormulario titulo="Acesso">
        <Campo id="whatsapp-token" rotulo="Token de acesso" erro={erros.token}
          dica="O token permanente de um usuário do sistema (Configurações do negócio → Usuários do sistema), com as permissões whatsapp_business_messaging e whatsapp_business_management.">
          <Input id="whatsapp-token" type="password" autoComplete="off" className="h-10" value={token}
            placeholder={integracao ? AVISO_DO_TOKEN : ''} onChange={(e) => setToken(e.target.value)} />
        </Campo>
      </SecaoFormulario>
      <SecaoFormulario titulo="Teste">
        <Campo id="whatsapp-teste" rotulo="Número para o teste (opcional)" erro={erros.numeroDeTeste}
          dica="Só para o Testar: recebe o modelo hello_world. Não fica guardado. Com o app da Meta em desenvolvimento, o número precisa estar na lista de destinatários liberados.">
          <Input id="whatsapp-teste" type="text" inputMode="tel" autoComplete="off" className="h-10 tabular-nums" maxLength={25}
            placeholder="+5511999998888" value={numeroDeTeste}
            onChange={(e) => setNumeroDeTeste(e.target.value)} />
        </Campo>
      </SecaoFormulario>
    </JanelaIntegracao>
  )
}
