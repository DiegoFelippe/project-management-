import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectNativo } from '@/components/ui/select-nativo'
import { consultoresPorOcupacao } from '@/data/capacidade'
import { Search } from 'lucide-react'
import ListaDeOcupacao from './ListaDeOcupacao'
import { rotuloDeOcupacao } from './rotulos'
import { useOpcoes } from './useOpcoes'

function Busca({ consultoriaId, valor, aoEscolher }) {
  const { busca, setBusca, itens, total, erro, carregandoMais, mostrarMais } =
    useOpcoes((parametros) => consultoresPorOcupacao({ ...parametros, consultoriaId: consultoriaId ?? null }))
  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Buscar consultor" placeholder="Buscar consultor" className="h-10 pl-9"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {itens === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {erro && <Aviso>{erro}</Aviso>}
      {itens?.length === 0 && !erro && <p className="text-sm text-muted-foreground">Nenhum consultor encontrado.</p>}
      {itens?.length > 0 && (
        <ListaDeOcupacao itens={itens} total={total} escolhido={valor} semSugestao rotuloDoValor={rotuloDeOcupacao}
          carregandoMais={carregandoMais} aoEscolher={aoEscolher} aoMostrarMais={mostrarMais} />
      )}
    </>
  )
}

// Filtro "Consultor" da lista: Todos, Sem consultor ou uma pessoa buscada (ordenada por ocupação).
// valor: '' | 'sem' | id. aoMudar(valor, nome). consultoriaId: null = de todas as consultorias.
export default function FiltroConsultor({ valor, nome, consultoriaId, aoMudar }) {
  const [buscando, setBuscando] = useState(false)
  const pessoa = valor && valor !== 'sem'

  function mudou(evento) {
    const novo = evento.target.value
    if (novo === 'escolher') return setBuscando(true)
    aoMudar(novo, null)
  }

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="filtro-consultor" className="shrink-0 text-muted-foreground">Consultor</Label>
      <SelectNativo id="filtro-consultor" className="min-w-44" value={valor} onChange={mudou}>
        <option value="">Todos</option>
        <option value="sem">Sem consultor</option>
        {pessoa && <option value={valor}>{nome ?? 'Consultor escolhido'}</option>}
        <option value="escolher">Escolher uma pessoa…</option>
      </SelectNativo>
      {buscando && (
        <Dialog open onOpenChange={(abrir) => !abrir && setBuscando(false)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Filtrar por consultor</DialogTitle>
              <DialogDescription>Escolha a pessoa para ver só os clientes dela.</DialogDescription>
            </DialogHeader>
            <Busca consultoriaId={consultoriaId} valor={valor}
              aoEscolher={(item) => { aoMudar(item.id, item.nome); setBuscando(false) }} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
