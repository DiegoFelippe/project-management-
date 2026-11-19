import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Cabecalho from '@/components/comum/Cabecalho'
import { GraficoCarregando } from '@/components/comum/Carregando'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { ListaVazia } from '@/components/comum/Tabela'
import QuadroKanban from '@/components/quadro/QuadroKanban'
import { FILTROS_VAZIOS, useQuadro } from '@/components/quadro/useQuadro'
import EstrelaDoQuadro from '@/components/quadros/EstrelaDoQuadro'
import JanelaApagarQuadro from '@/components/quadros/JanelaApagarQuadro'
import JanelaNovoQuadro from '@/components/quadros/JanelaNovoQuadro'
import JanelaQuadrosArquivados from '@/components/quadros/JanelaQuadrosArquivados'
import JanelaRenomearQuadro from '@/components/quadros/JanelaRenomearQuadro'
import MenuDoQuadro from '@/components/quadros/MenuDoQuadro'
import { oQuadro, OQuadro } from '@/components/quadros/nomeDoQuadro'
import SeletorDeQuadro from '@/components/quadros/SeletorDeQuadro'
import { Button } from '@/components/ui/button'
import { quadroPorId } from '@/data/quadro'
import { arquivarQuadro, quadrosParaEscolher, restaurarQuadro } from '@/data/quadros'
import { veTudo } from '@/lib/papeis'
import { ehUuid, esquecerQuadro, lembrarQuadro, lerMemoria } from '@/lib/quadrosRecentes'
import { useAtraso } from '@/lib/useAtraso'

// Quem vê o quadro aberto (o subtítulo do cabeçalho).
function quemVe(quadro, central) {
  if (!quadro) return central ? 'Seus quadros pessoais: só você vê.' : 'Seus quadros pessoais e os dos seus times.'
  if (quadro.arquivado_em) return 'Arquivado · só para ler'
  if (quadro.tipo === 'time') return `Time ${quadro.time?.nome ?? ''} · o time vê e mexe`
  return 'Pessoal · só você vê'
}

// Menu Quadros (desenho: docs/superpowers/specs/2026-11-17-quadros-pessoais-e-de-time-design.md): os quadros pessoais
// (só a pessoa vê) e os dos times dela, com o mesmo Kanban do quadro do cliente. Cabeçalho "Quadros" com quem vê, o
// seletor de quadros, a estrela e o "⋯" (Novo quadro, Quadros arquivados e, para quem administra, Renomear, Arquivar ou
// Restaurar e Apagar); depois a barra do quadro (ícone + "Filtros") e as colunas. Sem cartões de números (decisão 7 do
// desenho: o quadro ocupa o resto da tela, como a aba Quadro do cliente).
// Sem :id, decide qual abrir: o último guardado no navegador (se o banco o devolver aberto), senão o primeiro favorito,
// de Meus ou Dos times; sem nenhum, a lista vazia com "Novo quadro". O navegador guarda só ids e o banco confere sempre.
export default function Quadros() {
  const { perfil } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const central = veTudo(perfil)
  const naTela = useRef(null)
  // O que o quadro aberto (filho com key) mostrou por último: { id, quadro, semAcesso }.
  const [visto, setVisto] = useState(null)
  // A janela do cabeçalho vale só para o quadro em que foi aberta: trocar de quadro (endereço, inclusive voltar e
  // avançar do navegador) a fecha de vez.
  const [janela, setJanela] = useState(null) // 'novo' | 'arquivados' | 'renomear' | 'arquivar' | 'apagar'
  const [idDaJanela, setIdDaJanela] = useState(id)
  if (idDaJanela !== id) {
    setIdDaJanela(id)
    setJanela(null)
  }
  const quadro = id && visto?.id === id && !visto.semAcesso ? visto.quadro ?? null : null

  const abrir = (tipo) => setJanela(tipo)
  const fechar = () => setJanela(null)
  const reler = () => naTela.current?.reler()
  const irPara = (quadroId) => navigate(`/quadros/${quadroId}`)
  const sairDoQuadro = (quadroId) => {
    esquecerQuadro(perfil.id, quadroId)
    navigate('/quadros', { replace: true })
  }

  async function arquivar() {
    const resposta = await arquivarQuadro(quadro.id)
    if (!resposta.erro) {
      toast.success(`${OQuadro(quadro.nome)} arquivado.`)
      fechar()
      reler()
    }
    return resposta
  }

  async function restaurar() {
    const resposta = await restaurarQuadro(quadro.id)
    if (resposta.erro) return toast.error(resposta.erro)
    toast.success(`${OQuadro(quadro.nome)} restaurado.`)
    reler()
  }

  return (
    <>
      <Cabecalho titulo="Quadros" descricao={quemVe(quadro, central)}>
        {id && <SeletorDeQuadro perfil={perfil} quadro={quadro} aoEscolher={irPara} />}
        {quadro && <EstrelaDoQuadro key={quadro.id} quadro={quadro} aoMudar={reler} />}
        <MenuDoQuadro quadro={quadro} aoNovo={() => abrir('novo')} aoArquivados={() => abrir('arquivados')}
          aoRenomear={() => abrir('renomear')} aoArquivar={() => abrir('arquivar')} aoRestaurar={restaurar} aoApagar={() => abrir('apagar')} />
      </Cabecalho>

      {id
        ? <QuadroAberto key={id} ref={naTela} quadroId={id} perfil={perfil} aoVer={setVisto} />
        : <EscolherQuadro perfil={perfil} aoNovo={() => abrir('novo')} aoArquivados={() => abrir('arquivados')} />}

      {janela === 'novo' && (
        <JanelaNovoQuadro perfil={perfil} aoFechar={fechar} aoCriado={(novo, nome) => {
          toast.success(`${OQuadro(nome)} criado.`)
          fechar()
          irPara(novo)
        }} />
      )}
      {janela === 'arquivados' && (
        <JanelaQuadrosArquivados perfil={perfil} aoFechar={fechar} aoAbrir={(arquivado) => {
          fechar()
          irPara(arquivado)
        }} aoMudou={(quadroId, mudanca) => {
          // Restaurou a partir da lista vazia (sem quadro aberto): abre o restaurado.
          if (!id && mudanca === 'restaurado') {
            fechar()
            irPara(quadroId)
            return
          }
          if (quadroId !== id) return
          if (mudanca === 'apagado') sairDoQuadro(quadroId)
          else reler()
        }} />
      )}
      {janela === 'renomear' && quadro && (
        <JanelaRenomearQuadro quadro={quadro} aoFechar={fechar} aoSalvo={() => {
          toast.success('Quadro renomeado.')
          fechar()
          reler()
        }} />
      )}
      {janela === 'arquivar' && quadro && (
        <ConfirmarAcao aberto aoFechar={fechar} perigo={false} titulo={`Arquivar o ${oQuadro(quadro.nome)}?`}
          descricao="O quadro sai da lista e fica em Quadros arquivados, só para ler. Dá para restaurar."
          rotuloConfirmar="Arquivar quadro" aoConfirmar={arquivar} />
      )}
      {janela === 'apagar' && quadro && (
        <JanelaApagarQuadro quadro={quadro} aoFechar={fechar} aoApagado={() => sairDoQuadro(quadro.id)}
          aoArquivar={quadro.arquivado_em ? undefined : arquivar} />
      )}
    </>
  )
}

// /quadros sem id: decide qual quadro abrir e vai para ele (replace, para o Voltar do navegador não cair aqui de novo).
function EscolherQuadro({ perfil, aoNovo, aoArquivados }) {
  const navigate = useNavigate()
  const [situacao, setSituacao] = useState('decidindo') // 'decidindo' | 'vazio' | 'erro'
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vale = true
    async function decidir() {
      const { ultimo } = lerMemoria(perfil.id)
      if (ultimo) {
        const q = await quadroPorId(ultimo)
        if (!vale) return
        if (q && !q.cliente_id && !q.arquivado_em) return navigate(`/quadros/${ultimo}`, { replace: true })
        // Sumiu, foi arquivado, é de cliente ou de outra pessoa: sai da memória, sem mensagem.
        esquecerQuadro(perfil.id, ultimo)
      }
      const { favoritos, meus, dosTimes } = await quadrosParaEscolher({ limite: 1 })
      if (!vale) return
      const primeiro = favoritos.itens[0] ?? meus.itens[0] ?? dosTimes.itens[0]
      if (primeiro) navigate(`/quadros/${primeiro.id}`, { replace: true })
      else setSituacao('vazio')
    }
    decidir().catch(() => vale && setSituacao('erro'))
    return () => {
      vale = false
    }
  }, [perfil.id, navigate, tentativa])

  if (situacao === 'erro') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-corpo text-destructive">Não foi possível carregar os quadros.</p>
        <Button type="button" variant="outline" onClick={() => {
          setSituacao('decidindo')
          setTentativa((t) => t + 1)
        }}><RotateCcw /> Tentar de novo</Button>
      </div>
    )
  }
  if (situacao === 'vazio') {
    return (
      <ListaVazia>
        <p>Você ainda não tem quadros.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={aoNovo}><Plus /> Novo quadro</Button>
          <Button type="button" variant="outline" onClick={aoArquivados}>Quadros arquivados</Button>
        </div>
      </ListaVazia>
    )
  }
  return <GraficoCarregando texto="Abrindo seus quadros…" className="py-12" />
}

// Uma mensagem no lugar do quadro, com o caminho de volta.
function SemQuadro({ children, para = '/quadros', rotulo = 'Ir para os meus quadros' }) {
  return (
    <ListaVazia>
      <p>{children}</p>
      <Button asChild variant="outline" className="mt-4"><Link to={para}>{rotulo}</Link></Button>
    </ListaVazia>
  )
}

// O quadro de :id. Montado com key={quadroId}: trocar de quadro começa do zero (filtros, janela do cartão aberta, novo
// cartão com a coluna do outro quadro, arrasto em andamento), como a aba do cliente com key={cliente.id). Lê pelo
// quadro_por_id: nulo = não existe ou a pessoa não vê; com cliente_id = quadro de cliente (abre pela página do cliente).
// Os dois saem da memória do navegador; o aberto entra nela (último e recentes). `aoVer` conta ao cabeçalho o que está
// na tela; `ref.reler()` relê depois das ações do cabeçalho.
function QuadroAberto({ quadroId, perfil, aoVer, ref }) {
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  const buscaAtrasada = useAtraso(filtros.busca, 300)
  const [doCliente, setDoCliente] = useState(null)
  const lembrado = useRef(false)

  const ler = useCallback(async () => {
    // Endereço com algo que não é um id: não existe (sem ir ao banco, que recusaria com 22P02).
    if (!ehUuid(quadroId)) return { quadro: null }
    const q = await quadroPorId(quadroId)
    if (!q || q.cliente_id) {
      esquecerQuadro(perfil.id, quadroId)
      if (q) setDoCliente(q.cliente_id)
      return { quadro: null }
    }
    if (!q.arquivado_em && !lembrado.current) {
      lembrado.current = true
      lembrarQuadro(perfil.id, quadroId)
    }
    return { quadro: q }
  }, [quadroId, perfil.id])

  const estado = useQuadro({ ler, chave: quadroId, filtros: { ...filtros, busca: buscaAtrasada } })
  const { quadro, semAcesso, relerQuadro } = estado
  // Depois das ações do cabeçalho (estrela, renomear, arquivar, restaurar) basta reler o quadro: os cartões não mudam (e o
  // canal já relê tudo quando o quadro muda de nome ou é arquivado).
  useImperativeHandle(ref, () => ({ reler: () => relerQuadro() }), [relerQuadro])
  // Antes de pintar: o cabeçalho (nome, estrela, quem vê) muda junto com o quadro, sem um quadro de atraso.
  useLayoutEffect(() => {
    aoVer({ id: quadroId, quadro, semAcesso })
  }, [aoVer, quadroId, quadro, semAcesso])

  if (doCliente) {
    return <SemQuadro para={`/clientes/${doCliente}`} rotulo="Abrir o cliente">Este quadro é de um cliente: abra pela página do cliente.</SemQuadro>
  }
  if (semAcesso) return <SemQuadro>Este quadro foi apagado ou você não tem mais acesso a ele.</SemQuadro>
  if (quadro === null) return <SemQuadro>Este quadro não existe ou você não tem acesso a ele.</SemQuadro>
  return (
    <QuadroKanban estado={estado} filtros={filtros} aoFiltrar={setFiltros} perfil={perfil}
      motivoSomenteLeitura={quadro?.arquivado_em ? 'Quadro arquivado: só para ler.' : null}
      vazio="Este quadro não existe ou você não tem acesso a ele." />
  )
}
