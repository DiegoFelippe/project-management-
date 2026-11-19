import { useEffect, useState } from 'react'
import { Archive, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CampoBusca } from '@/components/comum/BarraDeFiltros'
import { GraficoCarregando } from '@/components/comum/Carregando'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { Button } from '@/components/ui/button'
import { apagarCartao, ARQUIVADOS_POR_PAGINA, cartoesArquivados, restaurarCartao } from '@/data/quadro'
import { FUSO, formatarDia } from '@/lib/mes'
import { useAtraso } from '@/lib/useAtraso'

const QUANDO = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' })
const BOTAO_PERIGO = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'

// Cartões arquivados do quadro (mais recentes primeiro), numa Tabela paginada no banco (15 por página) com busca no título
// e na descrição. Quem mexe restaura (o cartão volta ao mesmo lugar); apaga quem criou o cartão ou a gestão, com
// confirmação dizendo o que some junto. Quem só lê vê a lista. `aoMudar()` avisa o quadro depois de cada ação (o
// restaurado volta para a coluna; a recusa do banco relê o quadro).
export default function JanelaArquivados({ quadro, perfil, aoFechar, aoMudar }) {
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [pagina, setPagina] = useState(1)
  const [versao, setVersao] = useState(0)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [apagando, setApagando] = useState(null)
  const [restaurando, setRestaurando] = useState(null)

  useEffect(() => {
    let ativo = true
    cartoesArquivados({ quadroId: quadro.id, busca: buscaAtrasada, pagina })
      .then((r) => {
        if (!ativo) return
        // A página ficou vazia (o último dela saiu): volta uma.
        if (r.itens.length === 0 && pagina > 1) return setPagina((p) => p - 1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os arquivados.'))
    return () => {
      ativo = false
    }
  }, [quadro.id, buscaAtrasada, pagina, versao])

  const podeApagar = (c) => quadro.pode_gerir || (quadro.pode_mexer && c.criado_por === perfil.id)

  async function restaurar(cartao) {
    setRestaurando(cartao.id)
    const resposta = await restaurarCartao(cartao.id)
    setRestaurando(null)
    // Recusado (sem permissão, cartão que já saiu): avisa e relê a lista e o quadro.
    if (resposta.erro) toast.error(resposta.erro)
    else toast.success(`${cartao.titulo} voltou para ${cartao.coluna?.nome ?? 'o quadro'}.`)
    setVersao((v) => v + 1)
    aoMudar()
  }

  async function apagar(cartao) {
    const resposta = await apagarCartao(cartao.id)
    setVersao((v) => v + 1)
    aoMudar()
    if (resposta.erro) return resposta
    if (resposta.aviso) toast.warning(resposta.aviso)
    else toast.success(`${cartao.titulo} apagado.`)
    return resposta
  }

  const itens = resultado?.itens ?? null
  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Cartões arquivados" icone={Archive} largura="xl"
      descricao={quadro.pode_mexer ? 'Restaurar volta o cartão ao mesmo lugar da coluna dele.' : 'Os cartões que saíram do quadro.'}
      rodape={<Button type="button" variant="outline" onClick={aoFechar}>Fechar</Button>}>
      <CampoBusca rotulo="Buscar arquivados" placeholder="Buscar no título e na descrição" valor={busca}
        aoMudar={(valor) => {
          setBusca(valor)
          setPagina(1)
        }} />
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && itens === null && <GraficoCarregando texto="Carregando os arquivados…" className="py-8" />}
      {itens?.length === 0 && <ListaVazia>{buscaAtrasada ? 'Nenhum arquivado com essa busca.' : 'Nenhum cartão arquivado.'}</ListaVazia>}
      {itens?.length > 0 && (
        <Tabela rotulo="Cartões arquivados" colunas={['Título', 'Coluna', 'Prazo', 'Arquivado em']} larguraMinima={640}
          semAcoes={!quadro.pode_mexer} paginacao={{ pagina, total: resultado.total, porPagina: ARQUIVADOS_POR_PAGINA, aoMudar: setPagina }}>
          {itens.map((c) => (
            <Linha key={c.id}>
              <Celula className="font-medium break-words">{c.titulo}</Celula>
              <Celula className="text-muted-foreground">{c.coluna?.nome ?? '—'}</Celula>
              <Celula className="tabular-nums text-muted-foreground">{c.prazo ? formatarDia(c.prazo) : '—'}</Celula>
              <Celula className="tabular-nums text-muted-foreground">{QUANDO.format(new Date(c.arquivado_em))}</Celula>
              {quadro.pode_mexer && (
                <CelulaAcoes>
                  <Button variant="ghost" size="sm" disabled={restaurando === c.id} onClick={() => restaurar(c)}><RotateCcw /> Restaurar</Button>
                  {podeApagar(c) && (
                    <Button variant="ghost" size="sm" className={BOTAO_PERIGO} onClick={() => setApagando(c)}><Trash2 /> Apagar</Button>
                  )}
                </CelulaAcoes>
              )}
            </Linha>
          ))}
        </Tabela>
      )}
      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo={`Apagar o cartão ${apagando.titulo}?`}
          descricao="O cartão some de vez, com checklist, comentários e anexos." rotuloConfirmar="Apagar cartão"
          aoConfirmar={() => apagar(apagando)} />
      )}
    </JanelaFormulario>
  )
}
