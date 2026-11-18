// Integrações da consultoria (desenho em docs/superpowers/specs/2026-11-12-integracoes-design.md):
// IA, e-mail (SMTP), Google, Slack e WhatsApp. Aqui só se conecta; o resto do sistema usa a mesma conexão.
// O administrador conecta, edita, testa e desconecta; o dono escolhe a consultoria e só olha.
import {
  Calendar, CircleAlert, CircleCheck, History, Mail, MessageCircle, MessageSquare, Pencil, Plug, PlugZap, RefreshCw, Sparkles, Unplug,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import BarraDeFiltros from '@/components/comum/BarraDeFiltros'
import Cabecalho from '@/components/comum/Cabecalho'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import { GraficoCarregando } from '@/components/comum/Carregando'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import FormularioIa from '@/components/integracoes/FormularioIa'
import FormularioSlack from '@/components/integracoes/FormularioSlack'
import FormularioSmtp from '@/components/integracoes/FormularioSmtp'
import FormularioWhatsapp from '@/components/integracoes/FormularioWhatsapp'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  desconectarIntegracao,
  iniciarGoogle,
  listarIntegracoes,
  salvarIntegracao,
  testarIntegracao,
  testarRascunho,
} from '@/data/integracoes'
import { indicadoresDeIntegracoes } from '@/data/indicadores'
import { veTudo } from '@/lib/papeis'
import { useLeitura } from '@/lib/useLeitura'

const INTEGRACOES = [
  { tipo: 'ia', nome: 'Inteligência artificial', descricao: 'Claude (Anthropic) ou OpenAI, para os recursos de IA.', icone: Sparkles },
  { tipo: 'smtp', nome: 'E-mail (SMTP)', descricao: 'Servidor que manda as mensagens do sistema.', icone: Mail },
  { tipo: 'google', nome: 'Google', descricao: 'Agenda e Drive da conta da consultoria.', icone: Calendar },
  { tipo: 'slack', nome: 'Slack', descricao: 'Mensagens num workspace do Slack, pelo app da consultoria.', icone: MessageSquare },
  { tipo: 'whatsapp', nome: 'WhatsApp', descricao: 'Mensagens pelo WhatsApp Business (API oficial da Meta).', icone: MessageCircle },
]

// Filtro da barra: o catálogo tem só cinco integrações fixas, então o recorte é feito aqui, sem ir ao banco.
const ABAS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'conectadas', rotulo: 'Conectadas' },
  { valor: 'nao_conectadas', rotulo: 'Não conectadas' },
]

// Janela de cada integração (o Google não tem: conecta pelo OAuth). Testar na janela testa sem salvar.
const JANELAS = { ia: FormularioIa, smtp: FormularioSmtp, slack: FormularioSlack, whatsapp: FormularioWhatsapp }

const SITUACAO = {
  conectada: { rotulo: 'Conectada', variante: 'positive' },
  com_erro: { rotulo: 'Com erro', variante: 'notice' },
}

function detalhes(tipo, config) {
  if (!config) return '—'
  if (tipo === 'ia') return `${config.provedor === 'openai' ? 'OpenAI' : 'Anthropic'} · ${config.modelo}`
  if (tipo === 'smtp') return `${config.host}:${config.porta} · ${config.remetente}`
  // Slack e WhatsApp: o que o último teste que deu certo leu do serviço (workspace; número e nome verificado).
  if (tipo === 'slack') return [config.workspace && `Workspace ${config.workspace}`, config.canal].filter(Boolean).join(' · ') || '—'
  if (tipo === 'whatsapp') return [config.numero || `ID ${config.phone_number_id}`, config.nome_verificado].filter(Boolean).join(' · ')
  return config.email ?? '—'
}

const quando = (data) =>
  data ? new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

// Cartões (contados no banco): a consultoria escolhida (o dono, antes de escolher, vê todas); o filtro
// Conectadas/Não conectadas não muda os números. "Último teste": o dia/mês do teste mais recente no número e a hora
// embaixo (a 360 px, data e hora juntas não cabem no número).
const lerNumeros = ({ consultoriaId }) => indicadoresDeIntegracoes({ consultoriaId })
const diaDoTeste = (data) => (data ? new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'Nenhum')
const horaDoTeste = (data) => (data ? `às ${new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : null)
const cartoesDasIntegracoes = (n) => [
  { chave: 'conectadas', rotulo: 'Conectadas', icone: CircleCheck, tom: 'positivo', valor: n?.conectadas },
  { chave: 'com_erro', rotulo: 'Com erro', icone: CircleAlert, tom: 'perigo', valor: n?.com_erro,
    destaque: n?.com_erro > 0 ? 'perigo' : null },
  { chave: 'nao_configuradas', rotulo: 'Não configuradas', icone: Plug, tom: 'neutro', valor: n?.nao_configuradas },
  { chave: 'ultimo_teste', rotulo: 'Último teste', icone: History, tom: 'ceu', valor: n ? diaDoTeste(n.ultimo_teste) : null,
    detalhe: horaDoTeste(n?.ultimo_teste) },
]

function avisarResultado(resposta, sucesso) {
  if (resposta.erro) return toast.error(resposta.erro)
  if (resposta.integracao?.situacao === 'conectada') return toast.success(sucesso)
  toast.error(`Salvo, mas a conexão falhou: ${resposta.integracao?.ultimo_erro ?? 'erro desconhecido'}`)
}

export default function Integracoes() {
  const { perfil } = useAuth()
  const ehDono = veTudo(perfil)
  const [consultoriaId, setConsultoriaId] = useState(ehDono ? '' : perfil.consultoria_id)
  const [integracoes, setIntegracoes] = useState(null)
  const [erro, setErro] = useState(null)
  const [situacaoFiltro, setSituacaoFiltro] = useState('todas')
  const [aviso, setAviso] = useState(null)
  const [editando, setEditando] = useState(null)
  const [desconectando, setDesconectando] = useState(null)
  const [ocupado, setOcupado] = useState(null)
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)
  const [busca, setBusca] = useSearchParams()
  const numeros = useLeitura(lerNumeros, { consultoriaId: consultoriaId || undefined, versao }).dados

  // volta do "Conectar com Google"
  useEffect(() => {
    const google = busca.get('google')
    if (!google) return
    if (google === 'conectado') toast.success('Conta do Google conectada.')
    else toast.error('Não foi possível conectar a conta do Google. Tente de novo.')
    setBusca({}, { replace: true })
  }, [busca, setBusca])

  useEffect(() => {
    if (!consultoriaId) return
    let ativo = true
    listarIntegracoes({ consultoriaId })
      .then((lista) => {
        if (!ativo) return
        setIntegracoes(Object.fromEntries(lista.map((i) => [i.tipo, i])))
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar as integrações.'))
    return () => {
      ativo = false
    }
  }, [consultoriaId, versao])

  async function salvar(tipo, config, segredo) {
    const resposta = await salvarIntegracao(tipo, config, segredo)
    if (resposta.erro) return resposta
    setEditando(null)
    avisarResultado(resposta, 'Conectada e funcionando.')
    recarregar()
    return resposta
  }

  async function testar(integracao) {
    setOcupado(integracao.id)
    const resposta = await testarIntegracao(integracao.id)
    setOcupado(null)
    avisarResultado(resposta, 'Conexão funcionando.')
    recarregar()
  }

  async function conectarGoogle() {
    setAviso(null)
    setOcupado('google')
    const resposta = await iniciarGoogle(`${window.location.origin}/integracoes`)
    setOcupado(null)
    if (resposta.erro) return setAviso(resposta.erro)
    window.location.assign(resposta.url)
  }

  async function desconectar(integracao) {
    const resposta = await desconectarIntegracao(integracao.id)
    if (!resposta.erro) {
      toast.success('Integração desconectada.')
      recarregar()
    }
    return resposta
  }

  const visiveis = INTEGRACOES.filter((item) => {
    const conectada = Boolean(integracoes?.[item.tipo])
    return situacaoFiltro === 'todas' || (situacaoFiltro === 'conectadas') === conectada
  })
  const abrir = (item) => (item.tipo === 'google' ? conectarGoogle() : setEditando(item.tipo))
  const Janela = JANELAS[editando] ?? null

  return (
    <>
      <Cabecalho titulo="Integrações"
        descricao="Conexões que o sistema usa. Cada consultoria conecta as suas; todos da consultoria usam a mesma conexão." />
      <BarraDeFiltros>
        <AbasSegmentadas rotulo="Mostrar" abas={ABAS} valor={situacaoFiltro} aoMudar={setSituacaoFiltro} />
        {ehDono && <FiltroConsultoria valor={consultoriaId} aoMudar={(id) => { setConsultoriaId(id); setIntegracoes(null) }} />}
      </BarraDeFiltros>
      <CartoesDeNumeros rotulo="Indicadores das integrações" cartoes={cartoesDasIntegracoes(numeros)} />
      {aviso && <div className="mb-4"><Aviso>{aviso}</Aviso></div>}
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {ehDono && !consultoriaId && <ListaVazia>Escolha uma consultoria para ver as integrações dela.</ListaVazia>}
      {consultoriaId && !erro && integracoes === null && <GraficoCarregando texto="Carregando as integrações…" className="py-12" />}
      {consultoriaId && integracoes && visiveis.length === 0 && <ListaVazia>Nenhuma integração neste filtro.</ListaVazia>}
      {consultoriaId && integracoes && visiveis.length > 0 && (
        <Tabela rotulo="Integrações" colunas={['Integração', 'Situação', 'Conexão', 'Último teste']} larguraMinima={760}>
          {visiveis.map((item) => {
            const integracao = integracoes[item.tipo]
            const situacao = integracao ? SITUACAO[integracao.situacao] : { rotulo: 'Não conectada', variante: 'outline' }
            const Icone = item.icone
            return (
              <Linha key={item.tipo}>
                <Celula>
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                      <Icone className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">{item.nome}</p>
                      <p className="truncate text-rotulo text-muted-foreground">{item.descricao}</p>
                    </div>
                  </div>
                </Celula>
                <Celula>
                  <Badge variant={situacao.variante}>{situacao.rotulo}</Badge>
                  {integracao?.ultimo_erro && <p className="mt-1 max-w-64 text-rotulo text-muted-foreground">{integracao.ultimo_erro}</p>}
                </Celula>
                <Celula className="text-muted-foreground">{detalhes(item.tipo, integracao?.config)}</Celula>
                <Celula className="text-muted-foreground tabular-nums">{quando(integracao?.ultimo_teste_em)}</Celula>
                <CelulaAcoes>
                  {!ehDono && !integracao && (
                    <Button variant="outline" size="sm" disabled={ocupado === item.tipo} onClick={() => abrir(item)}>
                      <PlugZap /> Conectar
                    </Button>
                  )}
                  {!ehDono && integracao && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => abrir(item)}>
                        <Pencil /> {item.tipo === 'google' ? 'Reconectar' : 'Editar'}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={ocupado === integracao.id} onClick={() => testar(integracao)}>
                        <RefreshCw className={ocupado === integracao.id ? 'animate-spin' : ''} /> Testar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDesconectando({ item, integracao })}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Unplug /> Desconectar
                      </Button>
                    </>
                  )}
                </CelulaAcoes>
              </Linha>
            )
          })}
        </Tabela>
      )}
      {Janela && (
        <Janela integracao={integracoes?.[editando]} aoFechar={() => setEditando(null)}
          aoSalvar={(config, segredo) => salvar(editando, config, segredo)}
          aoTestar={(config, segredo, extras) => testarRascunho(editando, config, segredo, extras)} />
      )}
      {desconectando && (
        <ConfirmarAcao aberto perigo aoFechar={() => setDesconectando(null)} titulo={`Desconectar ${desconectando.item.nome}?`}
          descricao="A conexão e o segredo guardado (chave, senha ou token) são apagados. O que usa essa integração para de funcionar até alguém conectar de novo."
          rotuloConfirmar="Desconectar" aoConfirmar={() => desconectar(desconectando.integracao)} />
      )}
    </>
  )
}
