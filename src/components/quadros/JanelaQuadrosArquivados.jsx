import { useEffect, useState } from 'react'
import { Archive, FolderOpen, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import { CampoBusca } from '@/components/comum/BarraDeFiltros'
import { GraficoCarregando } from '@/components/comum/Carregando'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { AcaoDaLinha, Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { Button } from '@/components/ui/button'
import { QUADROS_ARQUIVADOS_POR_PAGINA, quadrosArquivados, restaurarQuadro } from '@/data/quadros'
import { FUSO } from '@/lib/mes'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'
import JanelaApagarQuadro from './JanelaApagarQuadro'
import { OQuadro } from './nomeDoQuadro'

const QUANDO = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' })
const ABAS = [{ valor: '', rotulo: 'Todos' }, { valor: 'pessoa', rotulo: 'Pessoais' }, { valor: 'time', rotulo: 'Dos times' }]

// "Quadros arquivados" (menu ⋯ da tela Quadros): os arquivados que a pessoa vê, mais recentes primeiro, numa Tabela
// paginada no banco (15 por página), com busca pelo nome e as abas Todos · Pessoais · Dos times (a central e o dono só
// têm pessoais: sem abas). Ações da linha só com o ícone, em posições fixas (AcaoDaLinha): Abrir mostra o quadro só
// para ler; Restaurar e Apagar (com a confirmação do que some junto) só para quem administra (nos outros, o espaço fica). `aoAbrir(id)` abre o quadro; `aoMudou(id, 'restaurado' | 'apagado')` avisa a tela.
export default function JanelaQuadrosArquivados({ perfil, aoFechar, aoAbrir, aoMudou }) {
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [tipo, setTipo] = useState('')
  const [pagina, setPagina] = useState(1)
  const [versao, setVersao] = useState(0)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [restaurando, setRestaurando] = useState(null)
  const [apagando, setApagando] = useState(null)
  const comAbas = !veTudo(perfil)

  useEffect(() => {
    let vale = true
    quadrosArquivados({ busca: buscaAtrasada, tipo, pagina })
      .then((r) => {
        if (!vale) return
        // A página ficou vazia (o último dela saiu): volta uma.
        if (r.itens.length === 0 && pagina > 1) return setPagina((p) => p - 1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => vale && setErro('Não foi possível carregar os quadros arquivados.'))
    return () => {
      vale = false
    }
  }, [buscaAtrasada, tipo, pagina, versao])

  async function restaurar(quadro) {
    setRestaurando(quadro.id)
    const resposta = await restaurarQuadro(quadro.id)
    setRestaurando(null)
    setVersao((v) => v + 1)
    if (resposta.erro) return toast.error(resposta.erro)
    toast.success(`${OQuadro(quadro.nome)} restaurado.`)
    aoMudou(quadro.id, 'restaurado')
  }

  function apagado(quadro) {
    setApagando(null)
    setVersao((v) => v + 1)
    aoMudou(quadro.id, 'apagado')
  }

  const itens = resultado?.itens ?? null
  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Quadros arquivados" icone={Archive} largura="xl"
      descricao="Abrir mostra o quadro só para ler. Restaurar o devolve à lista de quadros."
      rodape={<Button type="button" variant="outline" onClick={aoFechar}>Fechar</Button>}>
      <div className="flex flex-wrap items-center gap-2">
        {comAbas && (
          <AbasSegmentadas rotulo="De quem" abas={ABAS} valor={tipo} aoMudar={(valor) => {
            setTipo(valor)
            setPagina(1)
          }} />
        )}
        <CampoBusca rotulo="Buscar quadros arquivados" placeholder="Buscar pelo nome" valor={busca}
          aoMudar={(valor) => {
            setBusca(valor)
            setPagina(1)
          }} />
      </div>
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && itens === null && <GraficoCarregando texto="Carregando os arquivados…" className="py-8" />}
      {itens?.length === 0 && <ListaVazia>{buscaAtrasada ? 'Nenhum arquivado com esse nome.' : 'Nenhum quadro arquivado.'}</ListaVazia>}
      {itens?.length > 0 && (
        <Tabela rotulo="Quadros arquivados" colunas={['Nome', 'De quem', 'Cartões', 'Arquivado em']} larguraMinima={640}
          paginacao={{ pagina, total: resultado.total, porPagina: QUADROS_ARQUIVADOS_POR_PAGINA, aoMudar: setPagina }}>
          {itens.map((q) => (
            <Linha key={q.id}>
              <Celula className="font-medium break-words">{q.nome}</Celula>
              <Celula className="text-muted-foreground">{q.tipo === 'time' ? q.time?.nome ?? 'Time' : 'Pessoal'}</Celula>
              <Celula className="tabular-nums text-muted-foreground">{(q.cartoes ?? 0).toLocaleString('pt-BR')}</Celula>
              <Celula className="tabular-nums text-muted-foreground">{QUANDO.format(new Date(q.arquivado_em))}</Celula>
              <CelulaAcoes>
                <AcaoDaLinha nome="Abrir" icone={FolderOpen} onClick={() => aoAbrir(q.id)} />
                <AcaoDaLinha nome="Restaurar" icone={RotateCcw} visivel={q.pode_administrar} disabled={restaurando === q.id}
                  onClick={() => restaurar(q)} />
                <AcaoDaLinha nome="Apagar" icone={Trash2} perigo visivel={q.pode_administrar} onClick={() => setApagando(q)} />
              </CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
      {apagando && (
        <JanelaApagarQuadro quadro={apagando} aoFechar={() => setApagando(null)} aoApagado={() => apagado(apagando)} />
      )}
    </JanelaFormulario>
  )
}
