import { useState } from 'react'
import { Archive, ArchiveRestore, Building2, Copy, Eye, Globe, ListChecks, Pencil, Plus, RadioTower, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Seletor from '@/components/campos/Seletor'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import BarraDeFiltros, { AcaoPrincipal, CampoBusca, NaGaveta } from '@/components/comum/BarraDeFiltros'
import { GraficoCarregando } from '@/components/comum/Carregando'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { AcaoDaLinha, Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { indicadoresDeModelos } from '@/data/indicadores'
import { apagarModelo, arquivarModelo, lerModelo, listarModelos, reativarModelo } from '@/data/modelos'
import { diaEmSP } from '@/lib/calendario'
import { formatarDia } from '@/lib/mes'
import { veTudo } from '@/lib/papeis'
import { OPCOES_DE_TIPO, TIPOS_DE_CONSULTORIA } from '@/lib/tiposDeConsultoria'
import { useAtraso } from '@/lib/useAtraso'
import { useLeitura } from '@/lib/useLeitura'
import { useListaPaginada } from '@/lib/useListaPaginada'
import ApagarModelo from './ApagarModelo'
import JanelaModelo from './JanelaModelo'
import JanelaVerModelo from './JanelaVerModelo'

const ABAS = [{ valor: 'ativos', rotulo: 'Ativos' }, { valor: 'arquivados', rotulo: 'Arquivados' }]
const rotuloDoTipo = (tipo) => TIPOS_DE_CONSULTORIA.find((t) => t.valor === tipo)?.rotulo

// Números dos cartões (contados no banco, no recorte de quem vê): seguem a consultoria do filtro da Central; a aba, a
// busca e o tipo não mudam os cartões.
const lerNumeros = ({ consultoriaId }) => indicadoresDeModelos({ consultoriaId })

// A aba Modelos de Check-ins (molde de tela nova): barra de filtros (Ativos/Arquivados, busca, tipo, consultoria para a
// Central e "Novo modelo" no fim) → cartões de números → tabela "Modelos de check-in" (15 por página, do banco) →
// janelas (ver, criar, editar, duplicar, arquivar e apagar). Quem faz o quê vem do banco em cada linha (pode_editar,
// pode_duplicar): o consultor só vê; a gestão mexe nos da consultoria e duplica os da Central; a Central mexe em todos.
// "Clientes usando" é sempre o que quem vê enxerga (a Central, todos; a gestão, os da consultoria; o consultor, os dele).
export default function ModelosDeCheckin({ perfil }) {
  const central = veTudo(perfil)
  const gestao = ['admin', 'gestor'].includes(perfil.papel)
  const criaModelo = central || gestao
  const [aba, setAba] = useState('ativos')
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [tipo, setTipo] = useState('')
  const [consultoriaId, setConsultoriaId] = useState('')
  const [versao, setVersao] = useState(0)
  const [janela, setJanela] = useState(null)
  const recarregar = () => setVersao((v) => v + 1)
  const filtroDaCentral = central && consultoriaId ? consultoriaId : undefined
  const numeros = useLeitura(lerNumeros, { consultoriaId: filtroDaCentral, versao }).dados

  // Uma página por vez, filtrada e contada no banco (regra "Escala" do CLAUDE.md); trocar de aba mostra o carregando.
  const { itens: modelos, erro: falhou, paginacao } = useListaPaginada(listarModelos,
    { aba, busca: buscaAtrasada || undefined, tipo: tipo || undefined, consultoriaId: filtroDaCentral },
    { versao, limparAoMudar: ['aba'] })
  const erro = falhou ? 'Não foi possível carregar os modelos.' : null

  // Editar e duplicar abrem a janela com o modelo inteiro, lido na hora (a linha só tem os contadores).
  async function abrirComModelo(linha, tipoDaJanela) {
    let modelo
    try {
      modelo = await lerModelo(linha.id)
    } catch {
      return toast.error('Não foi possível abrir o modelo. Tente de novo.')
    }
    if (!modelo) {
      toast.warning('Este modelo não está mais disponível.')
      return recarregar()
    }
    setJanela(tipoDaJanela === 'editar'
      ? { tipo: 'editar', modelo, usando: linha.clientes_usando }
      : { tipo: 'duplicar', origem: modelo })
  }

  function salvou({ nome, novo }) {
    toast.success(novo
      ? `"${nome}" criado. Ele já aparece em "Aplicar modelo" nos clientes.`
      : `"${nome}" salvo. Quem já usa este modelo continua com o check-list que recebeu.`)
    setJanela(null)
    if (novo && aba !== 'ativos') setAba('ativos')
    recarregar()
  }

  async function arquivar(linha) {
    const resposta = await arquivarModelo(linha.id)
    if (!resposta.erro) {
      toast.success(`"${linha.nome}" arquivado. Ele está na aba Arquivados.`)
      recarregar()
    }
    return resposta
  }

  async function apagar(linha) {
    const resposta = await apagarModelo(linha.id)
    if (!resposta.erro) {
      toast.success(`"${linha.nome}" apagado.`)
      recarregar()
    }
    return resposta
  }

  async function reativar(linha) {
    const resposta = await reativarModelo(linha.id)
    if (resposta.erro) return toast.error(resposta.erro)
    toast.success(`"${linha.nome}" voltou para os ativos.`)
    recarregar()
  }

  // Posições fixas (auditoria, G1): Editar (ou Ver, para quem não edita) · Duplicar · Arquivar (ou Reativar) · Apagar; a
  // que não vale para a linha deixa o espaço. O consultor, que não cria modelos, só tem o Ver.
  function acoesDaLinha(m) {
    const arquivado = Boolean(m.arquivado_em)
    const ver = () => setJanela({ tipo: 'ver', linha: m })
    const primeira = m.pode_editar
      ? <AcaoDaLinha nome="Editar" icone={Pencil} visivel={!arquivado} onClick={() => abrirComModelo(m, 'editar')} />
      : <AcaoDaLinha nome="Ver" icone={Eye} onClick={ver} />
    if (!criaModelo) return primeira
    return (
      <>
        {primeira}
        <AcaoDaLinha nome="Duplicar" icone={Copy} visivel={!arquivado && (m.pode_editar || m.pode_duplicar)}
          onClick={() => abrirComModelo(m, 'duplicar')} />
        <AcaoDaLinha nome={arquivado ? 'Reativar' : 'Arquivar'} icone={arquivado ? ArchiveRestore : Archive} visivel={m.pode_editar}
          onClick={() => (arquivado ? reativar(m) : setJanela({ tipo: 'arquivar', linha: m }))} />
        <AcaoDaLinha nome="Apagar" icone={Trash2} perigo visivel={m.pode_editar} onClick={() => setJanela({ tipo: 'apagar', linha: m })} />
      </>
    )
  }

  const filtrando = Boolean(buscaAtrasada || tipo || filtroDaCentral)
  // No celular (auditoria, G6), Mostrar, Tipo e Consultoria vão para a gaveta; a busca e o Novo modelo ficam à vista.
  const filtrosAtivos = [aba !== 'ativos', Boolean(tipo), Boolean(filtroDaCentral)].filter(Boolean).length
  function limparFiltros() {
    setAba('ativos')
    setTipo('')
    setConsultoriaId('')
  }
  // "Modelos ativos" (usabilidade, U5) mostra exatamente os que ele conta: os ativos, sem busca nem tipo (página 1).
  function irParaAtivos() {
    setAba('ativos')
    setTipo('')
    setBusca('')
  }
  const colunaUsando = central ? 'Clientes usando' : gestao ? 'Clientes da consultoria usando' : 'Seus clientes usando'
  const usando = janela?.linha?.clientes_usando ?? 0

  return (
    <>
      <BarraDeFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <NaGaveta><AbasSegmentadas rotulo="Mostrar" abas={ABAS} valor={aba} aoMudar={setAba} /></NaGaveta>
        <CampoBusca rotulo="Buscar modelos" placeholder="Buscar por nome ou descrição" valor={busca} aoMudar={setBusca} />
        <NaGaveta>
          <div className="flex items-center gap-2">
            <Label htmlFor="filtro-tipo-do-modelo" className="text-muted-foreground shrink-0">Tipo</Label>
            <div className="w-48">
              <Seletor id="filtro-tipo-do-modelo" tamanho="sm" valor={tipo} aoMudar={setTipo} opcoes={OPCOES_DE_TIPO} rotuloTodos="Todos" />
            </div>
          </div>
        </NaGaveta>
        {central && <NaGaveta><FiltroConsultoria valor={consultoriaId} aoMudar={setConsultoriaId} /></NaGaveta>}
        {criaModelo && (
          <AcaoPrincipal>
            <Button onClick={() => setJanela({ tipo: 'novo' })}>
              <Plus /> Novo modelo
            </Button>
          </AcaoPrincipal>
        )}
      </BarraDeFiltros>
      <CartoesDeNumeros rotulo="Indicadores dos modelos" cartoes={[
        { chave: 'ativos', rotulo: 'Modelos ativos', icone: ListChecks, valor: numeros?.ativos, destino: irParaAtivos,
          ativo: aba === 'ativos' && !tipo && !buscaAtrasada },
        { chave: 'da_central', rotulo: 'Da Central', icone: Globe, tom: 'ceu', valor: numeros?.da_central },
        { chave: 'da_consultoria', rotulo: central ? 'Das consultorias' : 'Da consultoria', icone: Building2, tom: 'neutro', valor: numeros?.da_consultoria },
        { chave: 'usando', rotulo: 'Clientes usando', icone: RadioTower, tom: 'positivo', valor: numeros?.clientes_usando,
          detalhe: 'que você vê, com check-list ativo' },
      ]} />
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && modelos === null && <GraficoCarregando texto="Carregando os modelos…" className="py-12" />}
      {!erro && modelos?.length === 0 && (
        <ListaVazia>
          {filtrando ? 'Nenhum modelo encontrado.'
            : aba === 'arquivados' ? 'Nenhum modelo arquivado.'
              : criaModelo ? 'Nenhum modelo ainda. Crie o primeiro em "Novo modelo".' : 'Nenhum modelo por aqui ainda.'}
        </ListaVazia>
      )}
      {!erro && modelos?.length > 0 && (
        <Tabela rotulo="Modelos de check-in" larguraMinima={980} paginacao={paginacao}
          colunas={['Modelo', 'Tipo', 'Para', 'Criado por', 'Etapas', 'Tarefas', colunaUsando]}>
          {modelos.map((m) => (
            <Linha key={m.id}>
              <Celula className="max-w-80 min-w-56">
                <button type="button" onClick={() => setJanela({ tipo: 'ver', linha: m })}
                  className="botao-animado hover:text-primary text-left font-semibold transition-[color,translate,scale] outline-none hover:-translate-y-px hover:underline focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97]">
                  {m.nome}
                </button>
                {m.descricao && <p className="text-muted-foreground line-clamp-2 text-rotulo">{m.descricao}</p>}
              </Celula>
              <Celula className="text-muted-foreground whitespace-nowrap">{rotuloDoTipo(m.tipo) ?? '—'}</Celula>
              <Celula>
                <Badge variant={m.consultoria ? 'outline' : 'secondary'}>{m.consultoria?.nome ?? 'Todas as consultorias'}</Badge>
              </Celula>
              <Celula className="whitespace-nowrap">
                <p>{m.criado_por?.nome ?? '—'}</p>
                <p className="text-muted-foreground text-rotulo">
                  {m.da_central ? 'Central' : `Gestão · ${m.consultoria?.nome ?? ''}`} · {formatarDia(diaEmSP(m.criado_em))}
                </p>
              </Celula>
              <Celula className="tabular-nums">{m.etapas.toLocaleString('pt-BR')}</Celula>
              <Celula className="tabular-nums whitespace-nowrap">
                {m.tarefas.toLocaleString('pt-BR')} <span className="text-muted-foreground">({m.obrigatorias.toLocaleString('pt-BR')} obrig.)</span>
              </Celula>
              <Celula className="tabular-nums">{m.clientes_usando ? m.clientes_usando.toLocaleString('pt-BR') : '—'}</Celula>
              <CelulaAcoes>{acoesDaLinha(m)}</CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}

      {janela?.tipo === 'novo' && <JanelaModelo aoFechar={() => setJanela(null)} aoSalvar={salvou} />}
      {janela?.tipo === 'editar' && (
        <JanelaModelo key={janela.modelo.id} modelo={janela.modelo} clientesUsando={janela.usando}
          aoFechar={() => setJanela(null)} aoSalvar={salvou} />
      )}
      {janela?.tipo === 'duplicar' && (
        <JanelaModelo key={`copia-${janela.origem.id}`} origem={janela.origem} aoFechar={() => setJanela(null)} aoSalvar={salvou} />
      )}
      {janela?.tipo === 'ver' && (
        <JanelaVerModelo modeloId={janela.linha.id} aoFechar={() => setJanela(null)}
          aoEditar={(modelo) => setJanela({ tipo: 'editar', modelo, usando: janela.linha.clientes_usando })}
          aoDuplicar={(modelo) => setJanela({ tipo: 'duplicar', origem: modelo })} />
      )}
      {janela?.tipo === 'arquivar' && (
        <ConfirmarAcao aberto aoFechar={() => setJanela(null)} titulo={`Arquivar "${janela.linha.nome}"?`}
          descricao={`Ele sai da lista de modelos para aplicar. ${usando === 0
            ? 'Nenhum cliente que você vê usa este modelo.'
            : usando === 1 ? 'O cliente que você vê usando continua com o check-list.'
              : `Os ${usando.toLocaleString('pt-BR')} clientes que você vê usando continuam com o check-list.`} Dá para reativar na aba Arquivados.`}
          rotuloConfirmar="Arquivar" aoConfirmar={() => arquivar(janela.linha)} />
      )}
      {janela?.tipo === 'apagar' && (
        <ApagarModelo modelo={janela.linha} aoFechar={() => setJanela(null)} aoApagar={() => apagar(janela.linha)}
          aoArquivar={() => arquivar(janela.linha)} />
      )}
    </>
  )
}
