import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Confirmação de apagar, desativar e arquivar: diz o que acontece e o que fica (regra CRUD do CLAUDE.md).
// aoConfirmar devolve { erro }: com erro, a janela continua aberta mostrando o motivo.
export default function ConfirmarAcao({ aberto, aoFechar, titulo, descricao, rotuloConfirmar, perigo = true, aoConfirmar }) {
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
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {erro && <Aviso>{erro}</Aviso>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
          <Button type="button" variant={perigo ? 'destructive' : 'default'} disabled={enviando} onClick={confirmar}>
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
