// Conectar ou editar a IA da consultoria: provedor, modelo e chave de API (a chave nunca volta do servidor).
import { useState } from 'react'
import Seletor from '@/components/campos/Seletor'
import { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AVISO_DO_SEGREDO, MODELO_PADRAO } from './constantes'
import JanelaIntegracao from './JanelaIntegracao'
import { useEnvioDaIntegracao } from './useEnvioDaIntegracao'

const PROVEDORES = [{ valor: 'anthropic', rotulo: 'Claude (Anthropic)' }, { valor: 'openai', rotulo: 'OpenAI' }]

export default function FormularioIa({ integracao, aoFechar, aoSalvar, aoTestar }) {
  const atual = integracao?.config ?? {}
  const [provedor, setProvedor] = useState(atual.provedor ?? 'anthropic')
  const [modelo, setModelo] = useState(atual.modelo ?? MODELO_PADRAO.anthropic)
  const [chave, setChave] = useState('')
  const { erro, enviando, salvar, testar } = useEnvioDaIntegracao(montar, aoSalvar, aoTestar)

  function trocarProvedor(novo) {
    // o modelo sugerido acompanha o provedor, a não ser que a pessoa já tenha escrito outro
    if (modelo === MODELO_PADRAO[provedor]) setModelo(MODELO_PADRAO[novo])
    setProvedor(novo)
  }

  function montar() {
    if (!integracao && !chave.trim()) return { erro: 'Informe a chave de API.' }
    if (!modelo.trim()) return { erro: 'Informe o modelo.' }
    return { config: { provedor, modelo: modelo.trim() }, segredo: chave.trim() || null }
  }

  return (
    <JanelaIntegracao titulo="Inteligência artificial" aoFechar={aoFechar} aoSalvar={salvar} aoTestar={testar} erro={erro} enviando={enviando}
      descricao="A chave de API da consultoria, usada por todos os recursos de IA do sistema.">
      <SecaoFormulario titulo="Modelo">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ia-provedor">Provedor</Label>
            <Seletor id="ia-provedor" valor={provedor} aoMudar={trocarProvedor} opcoes={PROVEDORES} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ia-modelo">Modelo</Label>
            <Input id="ia-modelo" className="h-10" maxLength={100} value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </div>
        </div>
      </SecaoFormulario>
      <SecaoFormulario titulo="Acesso">
        <div className="grid gap-2">
          <Label htmlFor="ia-chave">Chave de API</Label>
          <Input id="ia-chave" type="password" autoComplete="off" className="h-10" value={chave}
            placeholder={integracao ? AVISO_DO_SEGREDO : ''} onChange={(e) => setChave(e.target.value)} />
        </div>
      </SecaoFormulario>
    </JanelaIntegracao>
  )
}
