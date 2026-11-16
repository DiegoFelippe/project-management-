import { Archive, ArchiveRestore, ArrowRightLeft, Clock, History, Pencil, Plus, Search, Send, Trash2, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { GraficoCarregando } from '@/components/comum/Carregando'
import Cabecalho from '@/components/comum/Cabecalho'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import FiltroConsultor from '@/components/clientes/FiltroConsultor'
import BotaoCheckin from '@/components/clientes/BotaoCheckin'
import FormularioCliente from '@/components/clientes/FormularioCliente'
import JanelaCheckin from '@/components/clientes/JanelaCheckin'
import JanelaConsultor from '@/components/clientes/JanelaConsultor'
import JanelaMandar from '@/components/clientes/JanelaMandar'
import JanelaPrevisao from '@/components/clientes/JanelaPrevisao'
import MeusCheckins from '@/components/clientes/MeusCheckins'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ajustarPrevisao, apagarCliente, arquivarCliente, criarCliente, editarCliente, escolherConsultor, listarClientes,
  mandarParaConsultoria, reativarCliente,
} from '@/data/clientes'
import { lancarHoras, meuCheckinAberto } from '@/data/checkins'
import { formatarCnpj } from '@/lib/cnpj'
import { formatarHoras } from '@/lib/horas'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'

// Abas por papel. Quem atende (pessoa, gestor e admin) também tem Meus clientes e Meus check-ins;
// a central e o dono nunca fazem check-in.
const ABAS_DA_CENTRAL = [['distribuir', 'A distribuir'], ['nas_consultorias', 'Nas consultorias'], ['arquivados', 'Arquivados']]
const ABAS_DO_CONSULTOR = [['meus', 'Meus clientes'], ['checkins', 'Meus check-ins']]
const ABAS_DA_CONSULTORIA = [['aguardando', 'Aguardando consultor'], ['atendimento', 'Em atendimento'], ...ABAS_DO_CONSULTOR]
const ABAS_DA_PESSOA = ABAS_DO_CONSULTOR

function abasDoPapel(perfil) {
  if (veTudo(perfil)) return ABAS_DA_CENTRAL
  if (perfil.papel === 'pessoa') return ABAS_DA_PESSOA
  return ABAS_DA_CONSULTORIA
}

const VAZIO = {
  distribuir: 'Nenhum cliente esperando distribuição.',
  nas_consultorias: 'Nenhum cliente nas consultorias ainda.',
  arquivados: 'Nenhum cliente arquivado.',
  aguardando: 'Nenhum cliente aguardando consultor.',
  atendimento: 'Nenhum cliente em atendimento.',
  meus: 'Você ainda não tem clientes.',
}

function Previsao({ cliente, comRealizado }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums">
        {comRealizado ? `${formatarHoras(cliente.realizado_no_mes)} de ${formatarHoras(cliente.horas_mes)}` : formatarHoras(cliente.horas_mes)}
      </span>
      {cliente.realizado_no_mes > cliente.horas_mes && <Badge variant="notice">Passou da previsão</Badge>}
    </div>
  )
}

const BOTAO_PERIGO = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'

// Ações da linha por papel: a central (e o dono) distribui e cuida do cadastro; admin e gestor escolhem o
// consultor e ajustam a previsão; em Meus clientes, quem atende faz check-in/check-out e lança horas.
function AcoesDaLinha({ cliente, aba, central, gestao, aberto, abrir, aoMudar }) {
  if (central) {
    return (
      <>
        {aba === 'distribuir' && (
          <Button variant="ghost" size="sm" onClick={() => abrir('mandar', cliente)}><Send /> Mandar para consultoria</Button>
        )}
        {aba === 'nas_consultorias' && (
          <Button variant="ghost" size="sm" onClick={() => abrir('mandar', cliente)}><ArrowRightLeft /> Mover</Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => abrir('formulario', cliente)}><Pencil /> Editar</Button>
        {cliente.arquivado ? (
          <Button variant="ghost" size="sm" onClick={() => abrir('reativar', cliente)}><ArchiveRestore /> Reativar</Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => abrir('arquivar', cliente)}><Archive /> Arquivar</Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => abrir('apagar', cliente)} className={BOTAO_PERIGO}><Trash2 /> Apagar</Button>
      </>
    )
  }
  if (aba === 'meus') {
    return (
      <>
        <BotaoCheckin key={aberto?.id ?? 'livre'} cliente={cliente} aberto={aberto} aoMudar={aoMudar} />
        <Button variant="ghost" size="sm" onClick={() => abrir('lancar', cliente)}><History /> Lançar horas</Button>
      </>
    )
  }
  if (!gestao) return null
  return (
    <>
      {aba === 'aguardando' && (
        <Button variant="ghost" size="sm" onClick={() => abrir('consultor', cliente)}><UserCheck /> Escolher consultor</Button>
      )}
      {aba === 'atendimento' && (
        <>
          <Button variant="ghost" size="sm" onClick={() => abrir('consultor', cliente)}><ArrowRightLeft /> Trocar consultor</Button>
          <Button variant="ghost" size="sm" onClick={() => abrir('previsao', cliente)}><Clock /> Ajustar previsão</Button>
        </>
      )}
    </>
  )
}

export default function Clientes() {
  const { perfil } = useAuth()
  const central = veTudo(perfil)
  const gestao = !central && perfil.papel !== 'pessoa'
  const abas = abasDoPapel(perfil)
  const [aba, setAba] = useState(abas[0][0])
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [consultoriaId, setConsultoriaId] = useState('')
  const [consultor, setConsultor] = useState({ valor: '', nome: null }) // '' = todos, 'sem' ou o id
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [versao, setVersao] = useState(0)
  const [formulario, setFormulario] = useState(null) // { cliente? }
  const [arquivando, setArquivando] = useState(null)
  const [apagando, setApagando] = useState(null)
  const [mandando, setMandando] = useState(null)
  const [escolhendo, setEscolhendo] = useState(null)
  const [ajustando, setAjustando] = useState(null)
  const [lancando, setLancando] = useState(null)
  const [aberto, setAberto] = useState(null) // meu check-in aberto
  const consultorQueAtende = !central
  const emCheckins = aba === 'checkins'
  // O filtro de consultor só faz sentido onde já há consultor (e não nas listas só minhas).
  const mostraFiltroConsultor = perfil.papel !== 'pessoa' && !['distribuir', 'aguardando', 'meus', 'checkins'].includes(aba)
  const consultorFiltrado = mostraFiltroConsultor ? consultor.valor : ''
  const recarregar = () => setVersao((v) => v + 1)

  // Uma página por vez, filtrada e paginada no banco (regra "Escala" no CLAUDE.md).
  useEffect(() => {
    if (emCheckins) return undefined
    let ativo = true
    listarClientes({
      aba,
      busca: buscaAtrasada || undefined,
      consultoriaId: consultoriaId || undefined,
      consultorId: aba === 'meus' ? perfil.id : consultorFiltrado || undefined,
      pagina,
    })
      .then((r) => {
        if (!ativo) return
        if (r.foraDaFaixa && pagina > 1) return setPagina(1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os clientes.'))
    return () => {
      ativo = false
    }
  }, [aba, emCheckins, buscaAtrasada, consultoriaId, consultorFiltrado, pagina, versao, perfil.id])

  // O check-in que ficou aberto (no máximo um); recarregado depois de cada check-in, check-out ou lançamento.
  useEffect(() => {
    if (!consultorQueAtende) return undefined
    let ativo = true
    meuCheckinAberto(perfil.id)
      .then((r) => ativo && setAberto(r))
      .catch(() => {})
    return () => {
      ativo = false
    }
  }, [consultorQueAtende, perfil.id, versao])

  // Qualquer mudança de filtro volta para a página 1.
  const filtros = `${aba}|${buscaAtrasada}|${consultoriaId}|${consultorFiltrado}`
  const [filtrosAnteriores, setFiltrosAnteriores] = useState(filtros)
  if (filtros !== filtrosAnteriores) {
    setFiltrosAnteriores(filtros)
    setPagina(1)
  }

  async function salvar(cliente, dados) {
    const resposta = cliente ? await editarCliente(cliente.id, dados) : await criarCliente(dados)
    if (!resposta.erro) {
      toast.success(cliente ? `Cliente ${dados.nome} atualizado.` : `Cliente ${dados.nome} criado.`)
      recarregar()
    }
    return resposta
  }

  async function arquivarOuReativar(cliente) {
    const resposta = cliente.arquivado ? await reativarCliente(cliente.id) : await arquivarCliente(cliente.id)
    if (!resposta.erro) {
      toast.success(`Cliente ${cliente.nome} ${cliente.arquivado ? 'reativado' : 'arquivado'}.`)
      recarregar()
    }
    return resposta
  }

  async function apagar(cliente) {
    const resposta = await apagarCliente(cliente.id)
    if (!resposta.erro) {
      toast.success(`Cliente ${cliente.nome} apagado.`)
      recarregar()
    }
    return resposta
  }

  function abrir(acao, cliente) {
    if (acao === 'formulario') setFormulario({ cliente })
    else if (acao === 'arquivar') setArquivando(cliente)
    else if (acao === 'reativar') arquivarOuReativar(cliente)
    else if (acao === 'apagar') setApagando(cliente)
    else if (acao === 'mandar') setMandando(cliente)
    else if (acao === 'consultor') setEscolhendo(cliente)
    else if (acao === 'previsao') setAjustando(cliente)
    else if (acao === 'lancar') setLancando(cliente)
  }

  async function lancar(cliente, dados) {
    const resposta = await lancarHoras({ clienteId: cliente.id, ...dados })
    if (!resposta.erro) {
      toast.success(`Horas lançadas em ${cliente.nome}.`)
      recarregar()
    }
    return resposta
  }

  async function mandar(cliente, consultoriaId, consultoria) {
    const resposta = await mandarParaConsultoria(cliente.id, consultoriaId)
    if (!resposta.erro) {
      toast.success(`Cliente ${cliente.nome} ${cliente.consultoria ? 'movido' : 'enviado'} para ${consultoria.nome}.`)
      recarregar()
    }
    return resposta
  }

  async function escolher(cliente, consultorId, pessoa) {
    const resposta = await escolherConsultor(cliente.id, consultorId)
    if (!resposta.erro) {
      toast.success(`${pessoa.nome} é o consultor de ${cliente.nome}.`)
      recarregar()
    }
    return resposta
  }

  async function ajustar(cliente, horas) {
    const resposta = await ajustarPrevisao(cliente.id, horas)
    if (!resposta.erro) {
      toast.success(`Previsão de ${cliente.nome} ajustada.`)
      recarregar()
    }
    return resposta
  }

  const clientes = resultado?.itens ?? null
  const total = resultado?.total ?? 0

  return (
    <>
      <Cabecalho titulo="Clientes"
        descricao={resultado && !emCheckins ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'cliente' : 'clientes'}` : null}>
        {central && (
          <Button onClick={() => setFormulario({})}>
            <Plus /> Novo cliente
          </Button>
        )}
      </Cabecalho>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {abas.length > 1 && (
          <div role="group" aria-label="Mostrar" className="inline-flex rounded-lg bg-muted p-1 text-sm font-semibold">
            {abas.map(([valor, rotulo]) => (
              <button key={valor} type="button" aria-pressed={aba === valor} onClick={() => setAba(valor)}
                className={`botao-animado rounded-md px-3 py-1 transition-[background-color,color,translate,scale] hover:-translate-y-px active:scale-[0.97] ${aba === valor ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}>
                {rotulo}
              </button>
            ))}
          </div>
        )}
        {!emCheckins && <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Buscar clientes" placeholder="Buscar por nome, cidade ou CNPJ" className="h-10 pl-9"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>}
        {central && (
          <div className="[&>div]:mb-0">
            <FiltroConsultoria valor={consultoriaId} aoMudar={(id) => { setConsultoriaId(id); setConsultor({ valor: '', nome: null }) }} />
          </div>
        )}
        {mostraFiltroConsultor && (
          <FiltroConsultor valor={consultor.valor} nome={consultor.nome}
            consultoriaId={central ? (consultoriaId || null) : perfil.consultoria_id}
            aoMudar={(valor, nome) => setConsultor({ valor, nome })} />
        )}
      </div>
      {emCheckins && <MeusCheckins consultorId={perfil.id} aoMudar={recarregar} />}
      {!emCheckins && erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!emCheckins && !erro && clientes === null && <GraficoCarregando texto="Carregando os clientes…" className="py-12" />}
      {!emCheckins && clientes?.length === 0 && <ListaVazia>{buscaAtrasada ? 'Nenhum cliente encontrado.' : VAZIO[aba]}</ListaVazia>}
      {!emCheckins && clientes?.length > 0 && (
        <Tabela rotulo="Clientes" colunas={['Cliente', 'CNPJ', 'Cidade', 'Previsão', 'Consultoria', 'Consultor']}
          paginacao={{ pagina, total, aoMudar: setPagina }}>
          {clientes.map((c) => (
            <Linha key={c.id}>
              <Celula>
                <p className="flex items-center gap-2 font-semibold">
                  {c.nome}
                  {aba === 'aguardando' && <Badge variant="notice">Novo</Badge>}
                </p>
                {c.razao_social && <p className="truncate text-xs text-muted-foreground">{c.razao_social}</p>}
              </Celula>
              <Celula className="tabular-nums text-muted-foreground">{c.cnpj ? formatarCnpj(c.cnpj) : '—'}</Celula>
              <Celula className="text-muted-foreground">{c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ''}` : '—'}</Celula>
              <Celula><Previsao cliente={c} comRealizado={aba === 'meus'} /></Celula>
              <Celula className="text-muted-foreground">{c.consultoria?.nome ?? '—'}</Celula>
              <Celula className="text-muted-foreground">
                {c.consultor ? (
                  <>
                    {c.consultor.nome}
                    {c.consultor.ativo === false && <span className="ml-1 text-xs">(desativado)</span>}
                  </>
                ) : '—'}
              </Celula>
              <CelulaAcoes><AcoesDaLinha cliente={c} aba={aba} central={central} gestao={gestao} aberto={aberto} abrir={abrir} aoMudar={recarregar} /></CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
      {formulario && (
        <FormularioCliente key={formulario.cliente?.id ?? 'novo'} aberto cliente={formulario.cliente}
          aoFechar={() => setFormulario(null)} aoSalvar={(dados) => salvar(formulario.cliente, dados)} />
      )}
      {mandando && (
        <JanelaMandar key={mandando.id} aberto cliente={mandando} aoFechar={() => setMandando(null)}
          aoMandar={(id, item) => mandar(mandando, id, item)} />
      )}
      {escolhendo && (
        <JanelaConsultor key={escolhendo.id} aberto cliente={escolhendo} aoFechar={() => setEscolhendo(null)}
          aoEscolher={(id, item) => escolher(escolhendo, id, item)} />
      )}
      {ajustando && (
        <JanelaPrevisao key={ajustando.id} aberto cliente={ajustando} aoFechar={() => setAjustando(null)}
          aoSalvar={(horas) => ajustar(ajustando, horas)} />
      )}
      {lancando && (
        <JanelaCheckin key={lancando.id} aberto modo="lancar" nomeDoCliente={lancando.nome} aoFechar={() => setLancando(null)}
          aoSalvar={(dados) => lancar(lancando, dados)} />
      )}
      {arquivando && (
        <ConfirmarAcao aberto aoFechar={() => setArquivando(null)} titulo={`Arquivar o cliente ${arquivando.nome}?`}
          descricao="O cliente sai das listas de trabalho e o check-in aberto é encerrado. As horas registradas ficam. Dá para reativar depois."
          rotuloConfirmar="Arquivar cliente" perigo={false} aoConfirmar={() => arquivarOuReativar(arquivando)} />
      )}
      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo={`Apagar o cliente ${apagando.nome}?`}
          descricao="O cliente some de vez. Se já tiver horas registradas, não dá para apagar: arquive."
          rotuloConfirmar="Apagar cliente" aoConfirmar={() => apagar(apagando)} />
      )}
    </>
  )
}
