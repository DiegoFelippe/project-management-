import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { useEnvio } from '@/components/comum/useEnvio'
import { Input } from '@/components/ui/input'
import { renomearQuadro } from '@/data/quadros'

// "Renomear" (o Editar do quadro: tipo e dono não mudam, decisão 9 do desenho, aprovada pelo Diego): o nome preenchido,
// até 80. Só quem administra (o banco recusa os outros e o quadro arquivado). `aoSalvo(nome)`: quem chama relê o quadro.
// O erro fica embaixo do nome, e fechar com o nome mudado pergunta antes (usabilidade, U2 e U4).
export default function JanelaRenomearQuadro({ quadro, aoFechar, aoSalvo }) {
  const [nome, setNome] = useState(quadro.nome ?? '')
  const { erro, erros, conferir, enviando, enviar } = useEnvio()
  const alterado = useAlterado(nome)

  function aoEnviar(evento) {
    evento.preventDefault()
    const limpo = nome.trim()
    if (!conferir(limpo ? {} : { nome: 'Dê um nome ao quadro.' })) return
    if (limpo === quadro.nome) return aoFechar()
    enviar(async () => {
      const resposta = await renomearQuadro(quadro.id, limpo)
      if (!resposta.erro) aoSalvo(limpo)
      return resposta
    })
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Renomear quadro" icone={Pencil} enviando={enviando} erros={erros} alterado={alterado}
      form="form-renomear-quadro" rotuloEnviar="Salvar" rotuloEnviando="Salvando…">
      <form id="form-renomear-quadro" noValidate onSubmit={aoEnviar} className="space-y-5">
        <SecaoFormulario>
          <Campo id="renomear-quadro-nome" rotulo="Nome" erro={erros.nome}>
            <Input id="renomear-quadro-nome" className="h-10" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
        </SecaoFormulario>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
