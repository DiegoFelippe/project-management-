import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { renomearQuadro } from '@/data/quadros'

// "Renomear" (o Editar do quadro: tipo e dono não mudam, decisão 9 do desenho, aprovada pelo Diego): o nome preenchido,
// até 80. Só quem administra (o banco recusa os outros e o quadro arquivado). `aoSalvo(nome)`: quem chama relê o quadro.
export default function JanelaRenomearQuadro({ quadro, aoFechar, aoSalvo }) {
  const [nome, setNome] = useState(quadro.nome ?? '')
  const { erro, setErro, enviando, enviar } = useEnvio()

  function aoEnviar(evento) {
    evento.preventDefault()
    const limpo = nome.trim()
    if (!limpo) return setErro('Dê um nome ao quadro.')
    if (limpo === quadro.nome) return aoFechar()
    enviar(async () => {
      const resposta = await renomearQuadro(quadro.id, limpo)
      if (!resposta.erro) aoSalvo(limpo)
      return resposta
    })
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Renomear quadro" icone={Pencil} enviando={enviando}
      form="form-renomear-quadro" rotuloEnviar="Salvar" rotuloEnviando="Salvando…">
      <form id="form-renomear-quadro" noValidate onSubmit={aoEnviar} className="space-y-5">
        <SecaoFormulario>
          <div className="grid gap-2">
            <Label htmlFor="renomear-quadro-nome">Nome</Label>
            <Input id="renomear-quadro-nome" className="h-10" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
        </SecaoFormulario>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
