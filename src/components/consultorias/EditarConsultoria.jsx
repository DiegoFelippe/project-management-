import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import CampoImagem from '@/components/comum/CampoImagem'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { useEnvio } from '@/components/comum/useEnvio'
import { Input } from '@/components/ui/input'
import { urlPublica } from '@/lib/imagem'

// Editar consultoria (só o dono): logo e nome. Arquivar e reativar ficam na linha da tabela. O erro fica embaixo do
// nome, e fechar com algo mudado pergunta antes (usabilidade, U2 e U4).
export default function EditarConsultoria({ aberto, aoFechar, consultoria, aoSalvar }) {
  const [nome, setNome] = useState(consultoria?.nome ?? '')
  const [logo, setLogo] = useState(null)
  const { erro, erros, conferir, enviando, enviar } = useEnvio(aoFechar)
  const alterado = useAlterado({ nome, logo })

  async function salvar(evento) {
    evento.preventDefault()
    if (!conferir(nome.trim().length < 2 ? { nome: 'Use pelo menos 2 caracteres.' } : {})) return
    await enviar(() => aoSalvar({ nome: nome.trim(), logo }))
  }

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo="Editar consultoria" icone={Building2} enviando={enviando}
      descricao="A logo e o nome aparecem para todos da consultoria." erros={erros} alterado={alterado}
      form="form-editar-consultoria" rotuloEnviar="Salvar">
      <form id="form-editar-consultoria" noValidate onSubmit={salvar} className="space-y-5">
        <CampoImagem rotulo="logo" redondo={false} atual={urlPublica('logos', consultoria?.logo)}
          reserva={<Building2 className="size-6" />} valor={logo} aoMudar={setLogo} />
        <Campo id="editar-consultoria" rotulo="Nome da consultoria" erro={erros.nome}>
          <Input id="editar-consultoria" className="h-10" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
