// Conectar ou editar a IA da consultoria: provedor, modelo e chave de API (a chave nunca volta do servidor).
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectNativo } from '@/components/ui/select-nativo'
import { AVISO_DO_SEGREDO, MODELO_PADRAO } from './constantes'
import JanelaIntegracao from './JanelaIntegracao'

export default function FormularioIa({ integracao, aoFechar, aoSalvar }) {
  const atual = integracao?.config ?? {}
  const [provedor, setProvedor] = useState(atual.provedor ?? 'anthropic')
  const [modelo, setModelo] = useState(atual.modelo ?? MODELO_PADRAO.anthropic)
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  function trocarProvedor(novo) {
    // o modelo sugerido acompanha o provedor, a não ser que a pessoa já tenha escrito outro
    if (modelo === MODELO_PADRAO[provedor]) setModelo(MODELO_PADRAO[novo])
    setProvedor(novo)
  }

  async function salvar(evento) {
    evento.preventDefault()
    if (!integracao && !chave.trim()) return setErro('Informe a chave de API.')
    if (!modelo.trim()) return setErro('Informe o modelo.')
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar({ provedor, modelo: modelo.trim() }, chave.trim() || null)
    setEnviando(false)
    if (resposta?.erro) setErro(resposta.erro)
  }

  return (
    <JanelaIntegracao titulo="Inteligência artificial" aoFechar={aoFechar} aoSalvar={salvar} erro={erro} enviando={enviando}
      descricao="A chave de API da consultoria, usada por todos os recursos de IA do sistema.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ia-provedor">Provedor</Label>
          <SelectNativo id="ia-provedor" value={provedor} onChange={(e) => trocarProvedor(e.target.value)}>
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="openai">OpenAI</option>
          </SelectNativo>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ia-modelo">Modelo</Label>
          <Input id="ia-modelo" className="h-10" maxLength={100} value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ia-chave">Chave de API</Label>
        <Input id="ia-chave" type="password" autoComplete="off" className="h-10" value={chave}
          placeholder={integracao ? AVISO_DO_SEGREDO : ''} onChange={(e) => setChave(e.target.value)} />
      </div>
    </JanelaIntegracao>
  )
}
