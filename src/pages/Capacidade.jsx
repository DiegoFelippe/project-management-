import { CalendarOff, ChevronLeft, ChevronRight, Pencil, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import Cabecalho from '@/components/comum/Cabecalho'
import { GraficoCarregando } from '@/components/comum/Carregando'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import EditarCarga from '@/components/capacidade/EditarCarga'
import JanelaAusencias from '@/components/capacidade/JanelaAusencias'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { consultoriasPorOcupacao, consultoresPorOcupacao, definirCarga } from '@/data/capacidade'
import { POR_PAGINA } from '@/data/paginar'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { deslocarMes, mesAtual, rotuloDoMes } from '@/lib/mes'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'

const ABAS = [['consultores', 'Consultores'], ['consultorias', 'Consultorias']]

export default function Capacidade() {
  const { perfil } = useAuth()
  const central = veTudo(perfil)
  const atual = mesAtual()
  const [mes, setMes] = useState(atual)
  const [aba, setAba] = useState('consultores')
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [consultoriaId, setConsultoriaId] = useState('')
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [versao, setVersao] = useState(0)
  const [carga, setCarga] = useState(null)
  const [ausencias, setAusencias] = useState(null)
  const passado = mes < atual
  const emConsultores = aba === 'consultores'
  const recarregar = () => setVersao((v) => v + 1)

  useEffect(() => {
    let ativo = true
    const comum = { busca: buscaAtrasada || undefined, limite: POR_PAGINA, deslocamento: (pagina - 1) * POR_PAGINA, mes }
    const pedido = emConsultores
      ? consultoresPorOcupacao({ ...comum, consultoriaId: central ? consultoriaId || undefined : perfil.consultoria_id })
      : consultoriasPorOcupacao(comum)
    pedido
      .then((r) => {
        if (!ativo) return
        if (r.itens.length === 0 && r.total > 0 && pagina > 1) return setPagina(1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar a capacidade.'))
    return () => {
      ativo = false
    }
  }, [emConsultores, central, perfil.consultoria_id, buscaAtrasada, consultoriaId, mes, pagina, versao])

  // Qualquer mudança de filtro volta para a página 1.
  const filtros = `${aba}|${buscaAtrasada}|${consultoriaId}|${mes}`
  const [filtrosAnteriores, setFiltrosAnteriores] = useState(filtros)
  if (filtros !== filtrosAnteriores) {
    setFiltrosAnteriores(filtros)
    setPagina(1)
    setResultado(null)
  }

  const itens = resultado?.itens ?? null
  const colunaOcupacao = passado ? 'Utilização' : 'Ocupação'
  const colunas = (primeiras) => [...primeiras, 'Capacidade', ...(passado ? [] : ['Reservado']), 'Realizado', colunaOcupacao]
  const numeros = (i) => (
    <>
      <Celula className="tabular-nums">{formatarHoras(i.capacidade)}</Celula>
      {!passado && <Celula className="tabular-nums">{formatarHoras(i.reservado)}</Celula>}
      <Celula className="tabular-nums">{formatarHoras(i.realizado)}</Celula>
      <Celula className="tabular-nums font-semibold">{formatarOcupacao(i.ocupacao)}</Celula>
    </>
  )

  return (
    <>
      <Cabecalho titulo="Capacidade" descricao="Horas disponíveis, reservadas e realizadas de cada consultor no mês." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {central && (
          <div role="group" aria-label="Mostrar" className="inline-flex rounded-lg bg-muted p-1 text-sm font-semibold">
            {ABAS.map(([valor, rotulo]) => (
              <button key={valor} type="button" aria-pressed={aba === valor} onClick={() => setAba(valor)}
                className={`botao-animado rounded-md px-3 py-1 transition-[background-color,color,translate,scale] hover:-translate-y-px active:scale-[0.97] ${aba === valor ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}>
                {rotulo}
              </button>
            ))}
          </div>
        )}
        <div role="group" aria-label="Mês" className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
          <Button variant="ghost" size="sm" onClick={() => setMes(deslocarMes(mes, -1))}><ChevronLeft /> Anterior</Button>
          <span aria-live="polite" className="min-w-36 px-2 text-center text-sm font-semibold capitalize tabular-nums">{rotuloDoMes(mes)}</span>
          <Button variant="ghost" size="sm" onClick={() => setMes(deslocarMes(mes, 1))}>Próximo <ChevronRight /></Button>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label={emConsultores ? 'Buscar consultores' : 'Buscar consultorias'}
            placeholder={emConsultores ? 'Buscar por nome' : 'Buscar consultoria'} className="h-10 pl-9"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {central && emConsultores && (
          <div className="[&>div]:mb-0">
            <FiltroConsultoria valor={consultoriaId} aoMudar={setConsultoriaId} />
          </div>
        )}
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && itens === null && <GraficoCarregando texto="Carregando a capacidade…" className="py-12" />}
      {itens?.length === 0 && <ListaVazia>{buscaAtrasada ? 'Nenhum resultado encontrado.' : emConsultores ? 'Nenhum consultor ainda.' : 'Nenhuma consultoria ainda.'}</ListaVazia>}
      {itens?.length > 0 && emConsultores && (
        <Tabela rotulo="Capacidade" larguraMinima={960}
          colunas={[...colunas(central ? ['Consultor', 'Consultoria', 'Carga semanal'] : ['Consultor', 'Carga semanal']), 'Clientes']}
          paginacao={{ pagina, total: resultado.total, aoMudar: setPagina }}>
          {itens.map((c) => (
            <Linha key={c.id}>
              <Celula>
                <p className="font-semibold">{c.nome}</p>
                <p className="truncate text-xs text-muted-foreground">{c.email}</p>
              </Celula>
              {central && <Celula className="text-muted-foreground">{c.consultoria_nome ?? '—'}</Celula>}
              <Celula className="tabular-nums">{formatarHoras(c.carga_semanal)}</Celula>
              {numeros(c)}
              <Celula className="tabular-nums">{c.clientes}</Celula>
              <CelulaAcoes>
                <Button variant="ghost" size="sm" onClick={() => setCarga(c)}><Pencil /> Editar carga</Button>
                <Button variant="ghost" size="sm" onClick={() => setAusencias(c)}><CalendarOff /> Ausências</Button>
              </CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
      {itens?.length > 0 && !emConsultores && (
        <Tabela rotulo="Capacidade" larguraMinima={880}
          colunas={[...colunas(['Consultoria', 'Consultores']), 'Clientes', 'Aguardando']}
          paginacao={{ pagina, total: resultado.total, aoMudar: setPagina }}>
          {itens.map((c) => (
            <Linha key={c.id}>
              <Celula className="font-semibold">{c.nome}</Celula>
              <Celula className="tabular-nums">{c.consultores}</Celula>
              {numeros(c)}
              <Celula className="tabular-nums">{c.clientes}</Celula>
              <Celula className="tabular-nums">{c.aguardando}</Celula>
              <CelulaAcoes />
            </Linha>
          ))}
        </Tabela>
      )}
      {carga && (
        <EditarCarga aberto pessoa={carga} aoFechar={() => setCarga(null)}
          aoSalvar={async (horas) => {
            const resposta = await definirCarga(carga.id, horas)
            if (!resposta.erro) recarregar()
            return resposta
          }} />
      )}
      {ausencias && <JanelaAusencias aberto pessoa={ausencias} aoFechar={() => setAusencias(null)} aoMudar={recarregar} />}
    </>
  )
}
