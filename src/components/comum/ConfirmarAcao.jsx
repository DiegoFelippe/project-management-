import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Confirmação de apagar, desativar e arquivar: diz o que acontece e o que fica (regra CRUD do CLAUDE.md).
// aoConfirmar devolve { erro }: com erro, a janela continua aberta mostrando o motivo. `rotuloCancelar` troca o
// "Cancelar" (ex.: "Continuar editando" na pergunta de descartar da JanelaFormulario).
export default function ConfirmarAcao({ aberto, aoFechar, titulo, descricao, rotuloConfirmar, rotuloCancelar = 'Cancelar', perigo = true, aoConfirmar }) {
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  function fechar() {
    setErro(null)
    aoFechar()
  }

  async function confirmar() {
    if (enviando) return
    setEnviando(true)
    const resposta = await aoConfirmar()
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    fechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && fechar()}>
      <DialogContent role="alertdialog" className="sm:max-w-md">
        <DialogHeader className="flex-row items-start gap-3 text-left">
          <span data-slot="confirmar-icone" className="bg-notice-soft text-notice grid size-10 shrink-0 place-items-center rounded-xl">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <DialogTitle className="text-janela">{titulo}</DialogTitle>
            <DialogDescription className="text-rotulo">{descricao}</DialogDescription>
          </div>
        </DialogHeader>
        {erro && <Aviso>{erro}</Aviso>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fechar}>{rotuloCancelar}</Button>
          <Button type="button" variant={perigo ? 'destructive' : 'default'} disabled={enviando} onClick={confirmar}>
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
