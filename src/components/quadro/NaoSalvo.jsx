import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { juntar } from '@/lib/nomes'

const NOMES = {
  titulo: 'o título', descricao: 'a descrição', coluna: 'a coluna', prazo: 'o prazo', prioridade: 'a prioridade',
  responsaveis: 'os responsáveis',
}

// "Não foi possível salvar o título e a descrição." (campos: titulo, descricao, coluna, prazo, prioridade, responsaveis).
const naoFoiSalvo = (campos) => `Não foi possível salvar ${juntar(campos.map((c) => NOMES[c] ?? c))}.`

// Fechar a janela do cartão com algo que não gravou: diz o quê e deixa escolher — continuar editando, tentar de novo ou
// fechar sem salvar (o que não gravou se perde). Esc e clique fora voltam à janela.
export default function NaoSalvo({ campos, tentando, aoContinuar, aoTentar, aoDescartar }) {
  return (
    <Dialog open onOpenChange={(abrir) => !abrir && !tentando && aoContinuar()}>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="flex-row items-start gap-3 text-left">
          <span className="bg-notice-soft text-notice grid size-10 shrink-0 place-items-center rounded-xl">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <DialogTitle className="text-janela">Algumas mudanças não foram salvas</DialogTitle>
            <DialogDescription className="text-rotulo">
              {naoFoiSalvo(campos)} Tente de novo ou feche sem salvar (essas mudanças se perdem).
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={tentando} onClick={aoContinuar}>Continuar editando</Button>
          <Button type="button" variant="outline" disabled={tentando} onClick={aoDescartar}
            className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
            Fechar sem salvar
          </Button>
          <Button type="button" disabled={tentando} onClick={aoTentar}><RotateCcw /> {tentando ? 'Tentando…' : 'Tentar de novo'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
