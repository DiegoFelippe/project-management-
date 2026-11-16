import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoImagem from '@/components/comum/CampoImagem'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { urlPublica } from '@/lib/imagem'

// Editar consultoria (só o dono): logo e nome. Arquivar e reativar ficam na linha da tabela.
export default function EditarConsultoria({ aberto, aoFechar, consultoria, aoSalvar }) {
  const [nome, setNome] = useState(consultoria?.nome ?? '')
  const [logo, setLogo] = useState(null)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(evento) {
    evento.preventDefault()
    if (nome.trim().length < 2) return setErro('Use pelo menos 2 caracteres.')
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar({ nome: nome.trim(), logo })
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo="Editar consultoria" icone={Building2} enviando={enviando}
      descricao="A logo e o nome aparecem para todos da consultoria."
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-editar-consultoria" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}>
      <form id="form-editar-consultoria" noValidate onSubmit={salvar} className="space-y-5">
        <CampoImagem rotulo="logo" redondo={false} atual={urlPublica('logos', consultoria?.logo)}
          reserva={<Building2 className="size-6" />} valor={logo} aoMudar={setLogo} />
        <div className="grid gap-2">
          <Label htmlFor="editar-consultoria">Nome da consultoria</Label>
          <Input id="editar-consultoria" className="h-10" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
