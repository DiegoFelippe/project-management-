import { Search, Users } from 'lucide-react'
import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
import { Input } from '@/components/ui/input'
import { formatarOcupacao } from '@/lib/horas'
import ListaDeOcupacao from './ListaDeOcupacao'
import { sugestaoDe } from './rotulos'
import { previaDeOcupacao, useOpcoes } from './useOpcoes'

// Miolo comum de "Mandar para uma consultoria" e "Escolher o consultor": busca, lista com sugestão, prévia e confirmar.
// aoConfirmar(id, item) devolve { erro }; com erro a janela continua aberta.
export default function EscolhaDeOcupacao({
  aberto, aoFechar, titulo, descricao, carregar, atualId, horas, rotuloDoValor, rotuloDoBotao, rotuloDaBusca, frasePrevia, fraseSemCapacidade, aoConfirmar,
}) {
  const { busca, setBusca, itens, total, erro: erroDaLista, carregandoMais, mostrarMais } = useOpcoes(carregar)
  const [manual, setManual] = useState(null)
  const { erro, enviando, enviar } = useEnvio(aoFechar)

  // Começa com a sugestão; vale a escolha da pessoa enquanto o item ainda estiver na lista.
  const sugestao = sugestaoDe(itens, atualId)
  const escolhido = (manual && itens?.some((i) => i.id === manual.id) ? manual : null)
    ?? sugestao ?? itens?.find((i) => i.id !== atualId) ?? null
  const previa = escolhido ? previaDeOcupacao(escolhido, horas) : null

  async function confirmar() {
    if (!escolhido || enviando) return
    await enviar(() => aoConfirmar(escolhido.id, escolhido))
  }

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo={titulo} descricao={descricao} icone={Users} largura="lg" enviando={enviando}
      rotuloEnviar={escolhido ? rotuloDoBotao(escolhido) : 'Escolher'} aoEnviar={confirmar} envioDesabilitado={!escolhido}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label={rotuloDaBusca} placeholder={rotuloDaBusca} className="h-10 pl-9"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {erroDaLista && <Aviso>{erroDaLista}</Aviso>}
      {itens === null && <p className="text-corpo text-muted-foreground">Carregando…</p>}
      {itens?.length === 0 && !erroDaLista && <p className="text-corpo text-muted-foreground">Nenhuma opção encontrada.</p>}
      {itens?.length > 0 && (
        <ListaDeOcupacao itens={itens} total={total} escolhido={escolhido?.id} atualId={atualId} rotuloDoValor={rotuloDoValor}
          carregandoMais={carregandoMais} aoEscolher={setManual} aoMostrarMais={mostrarMais} />
      )}
      {escolhido && (
        <p aria-live="polite" className="rounded-md bg-muted px-3 py-2 text-corpo">
          {previa
            ? frasePrevia(escolhido.nome, formatarOcupacao(previa.antes), formatarOcupacao(previa.depois))
            : fraseSemCapacidade(escolhido.nome)}
        </p>
      )}
      {erro && <Aviso>{erro}</Aviso>}
    </JanelaFormulario>
  )
}
