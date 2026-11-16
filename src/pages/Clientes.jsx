import { Archive, ArchiveRestore, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { GraficoCarregando } from '@/components/comum/Carregando'
import Cabecalho from '@/components/comum/Cabecalho'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import FormularioCliente from '@/components/clientes/FormularioCliente'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apagarCliente, arquivarCliente, criarCliente, editarCliente, listarClientes, reativarCliente } from '@/data/clientes'
import { formatarCnpj } from '@/lib/cnpj'
import { formatarHoras } from '@/lib/horas'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'

// Abas por papel. As ações de cada papel entram em ACOES_POR_PAPEL (as de admin, gestor e pessoa vêm depois).
const ABAS_DA_CENTRAL = [['distribuir', 'A distribuir'], ['nas_consultorias', 'Nas consultorias'], ['arquivados', 'Arquivados']]
const ABAS_DA_CONSULTORIA = [['aguardando', 'Aguardando consultor'], ['atendimento', 'Em atendimento']]
const ABAS_DA_PESSOA = [['meus', 'Meus clientes']]

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

function Previsao({ cliente }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums">{formatarHoras(cliente.horas_mes)}</span>
      {cliente.realizado_no_mes > cliente.horas_mes && <Badge variant="notice">Passou da previsão</Badge>}
    </div>
  )
}

export default function Clientes() {
  const { perfil } = useAuth()
  const central = veTudo(perfil)
  const abas = abasDoPapel(perfil)
  const [aba, setAba] = useState(abas[0][0])
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [consultoriaId, setConsultoriaId] = useState('')
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [versao, setVersao] = useState(0)
  const [formulario, setFormulario] = useState(null) // { cliente? }
  const [arquivando, setArquivando] = useState(null)
  const [apagando, setApagando] = useState(null)
  const recarregar = () => setVersao((v) => v + 1)

  // Uma página por vez, filtrada e paginada no banco (regra "Escala" no CLAUDE.md).
  useEffect(() => {
    let ativo = true
    listarClientes({
      aba,
      busca: buscaAtrasada || undefined,
      consultoriaId: consultoriaId || undefined,
      consultorId: aba === 'meus' ? perfil.id : undefined,
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
  }, [aba, buscaAtrasada, consultoriaId, pagina, versao, perfil.id])

  // Qualquer mudança de filtro volta para a página 1.
  const filtros = `${aba}|${buscaAtrasada}|${consultoriaId}`
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

  // Ações da linha por papel. Admin, gestor e pessoa ganham as deles nas próximas tarefas.
  function Acoes({ cliente }) {
    if (!central) return null
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setFormulario({ cliente })}>
          <Pencil /> Editar
        </Button>
        {cliente.arquivado ? (
          <Button variant="ghost" size="sm" onClick={() => arquivarOuReativar(cliente)}>
            <ArchiveRestore /> Reativar
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setArquivando(cliente)}>
            <Archive /> Arquivar
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setApagando(cliente)}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 /> Apagar
        </Button>
      </>
    )
  }

  const clientes = resultado?.itens ?? null
  const total = resultado?.total ?? 0

  return (
    <>
      <Cabecalho titulo="Clientes"
        descricao={resultado ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'cliente' : 'clientes'}` : null}>
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
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Buscar clientes" placeholder="Buscar por nome, cidade ou CNPJ" className="h-10 pl-9"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {central && <div className="[&>div]:mb-0"><FiltroConsultoria valor={consultoriaId} aoMudar={setConsultoriaId} /></div>}
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && clientes === null && <GraficoCarregando texto="Carregando os clientes…" className="py-12" />}
      {clientes?.length === 0 && <ListaVazia>{buscaAtrasada ? 'Nenhum cliente encontrado.' : VAZIO[aba]}</ListaVazia>}
      {clientes?.length > 0 && (
        <Tabela rotulo="Clientes" colunas={['Cliente', 'CNPJ', 'Cidade', 'Previsão', 'Consultoria', 'Consultor']}
          paginacao={{ pagina, total, aoMudar: setPagina }}>
          {clientes.map((c) => (
            <Linha key={c.id}>
              <Celula>
                <p className="font-semibold">{c.nome}</p>
                {c.razao_social && <p className="truncate text-xs text-muted-foreground">{c.razao_social}</p>}
              </Celula>
              <Celula className="tabular-nums text-muted-foreground">{c.cnpj ? formatarCnpj(c.cnpj) : '—'}</Celula>
              <Celula className="text-muted-foreground">{c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ''}` : '—'}</Celula>
              <Celula><Previsao cliente={c} /></Celula>
              <Celula className="text-muted-foreground">{c.consultoria?.nome ?? '—'}</Celula>
              <Celula className="text-muted-foreground">
                {c.consultor ? (
                  <>
                    {c.consultor.nome}
                    {c.consultor.ativo === false && <span className="ml-1 text-xs">(desativado)</span>}
                  </>
                ) : '—'}
              </Celula>
              <CelulaAcoes><Acoes cliente={c} /></CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
      {formulario && (
        <FormularioCliente key={formulario.cliente?.id ?? 'novo'} aberto cliente={formulario.cliente}
          aoFechar={() => setFormulario(null)} aoSalvar={(dados) => salvar(formulario.cliente, dados)} />
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
