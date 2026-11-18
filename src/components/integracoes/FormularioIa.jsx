// Conectar ou editar a IA da consultoria: provedor, modelo e chave de API (a chave nunca volta do servidor).
import { useState } from 'react'
import Campo from '@/components/campos/Campo'
import Seletor from '@/components/campos/Seletor'
import { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { Input } from '@/components/ui/input'
import { AVISO_DO_SEGREDO, MODELO_PADRAO } from './constantes'
import JanelaIntegracao from './JanelaIntegracao'
import { useEnvioDaIntegracao } from './useEnvioDaIntegracao'

const PROVEDORES = [{ valor: 'anthropic', rotulo: 'Claude (Anthropic)' }, { valor: 'openai', rotulo: 'OpenAI' }]

export default function FormularioIa({ integracao, aoFechar, aoSalvar, aoTestar }) {
  const atual = integracao?.config ?? {}
  const [provedor, setProvedor] = useState(atual.provedor ?? 'anthropic')
  const [modelo, setModelo] = useState(atual.modelo ?? MODELO_PADRAO.anthropic)
  const [chave, setChave] = useState('')
  const { erro, erros, tentativa, enviando, testando, resultado, salvar, testar } = useEnvioDaIntegracao(montar, aoSalvar, aoTestar)
  const alterado = useAlterado({ provedor, modelo, chave })

  function trocarProvedor(novo) {
    // o modelo sugerido acompanha o provedor, a não ser que a pessoa já tenha escrito outro
    if (modelo === MODELO_PADRAO[provedor]) setModelo(MODELO_PADRAO[novo])
    setProvedor(novo)
  }

  function montar() {
    const erros = {}
    if (!modelo.trim()) erros.modelo = 'Informe o modelo.'
    if (!integracao && !chave.trim()) erros.chave = 'Informe a chave de API.'
    if (Object.keys(erros).length) return { erros }
    return { config: { provedor, modelo: modelo.trim() }, segredo: chave.trim() || null }
  }

  return (
    <JanelaIntegracao titulo="Inteligência artificial" aoFechar={aoFechar} aoSalvar={salvar} aoTestar={testar} erro={erro} tentativa={tentativa} alterado={alterado} enviando={enviando}
      testando={testando} resultado={resultado}
      descricao="A chave de API da consultoria, usada por todos os recursos de IA do sistema.">
      <SecaoFormulario titulo="Modelo">
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Campo id="ia-provedor" rotulo="Provedor">
            <Seletor id="ia-provedor" valor={provedor} aoMudar={trocarProvedor} opcoes={PROVEDORES} />
          </Campo>
          <Campo id="ia-modelo" rotulo="Modelo" erro={erros.modelo}>
            <Input id="ia-modelo" className="h-10" maxLength={100} value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </Campo>
        </div>
      </SecaoFormulario>
      <SecaoFormulario titulo="Acesso">
        <Campo id="ia-chave" rotulo="Chave de API" erro={erros.chave}>
          <Input id="ia-chave" type="password" autoComplete="off" className="h-10" value={chave}
            placeholder={integracao ? AVISO_DO_SEGREDO : ''} onChange={(e) => setChave(e.target.value)} />
        </Campo>
      </SecaoFormulario>
    </JanelaIntegracao>
  )
}
