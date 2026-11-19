import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import BarraDeFiltros from '@/components/comum/BarraDeFiltros'
import Cabecalho from '@/components/comum/Cabecalho'
import CheckinsPorSemana from '@/components/inicio/CheckinsPorSemana'
import ClientesEmRisco from '@/components/inicio/ClientesEmRisco'
import ClientesPorCidade from '@/components/inicio/ClientesPorCidade'
import FilaDeClientes from '@/components/inicio/FilaDeClientes'
import FiltroDePeriodo from '@/components/inicio/FiltroDePeriodo'
import GraficoDeMeses from '@/components/inicio/GraficoDeMeses'
import HorasNoPeriodoDoPainel from '@/components/inicio/HorasNoPeriodoDoPainel'
import HorasPorCliente from '@/components/inicio/HorasPorCliente'
import HorasPorUnidade from '@/components/inicio/HorasPorUnidade'
import Indicadores from '@/components/inicio/Indicadores'
import OcupacaoPorUnidade from '@/components/inicio/OcupacaoPorUnidade'
import QuandoOsCheckins from '@/components/inicio/QuandoOsCheckins'
import TarefasDosChecklists from '@/components/inicio/TarefasDosChecklists'
import { useLeituraDoBloco } from '@/components/inicio/useLeituraDoBloco'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { meuCheckinAberto } from '@/data/checkins'
import {
  checkinsPorDiaEHora, checkinsPorSemana, clientesPorCidade, comparacaoDoInicio, filaDeClientes, horasDoPainelPorDia, horasPorUnidadePorSemana,
  painelDoInicio, tarefasPorSituacao,
} from '@/data/painel'
import { hoje as hojeEmSP, mesAtual } from '@/lib/mes'
import { lerPeriodo, paraEndereco, periodoAoTrocar, validarPeriodo } from '@/lib/periodo'
import { primeiroNome } from '@/lib/nomes'
import { useLeitura } from '@/lib/useLeitura'
import { cn } from '@/lib/utils'

// Leituras do módulo (estáveis para o useLeitura). O painel devolve a frase do banco quando ele recusa o período
// (periodo_invalido, já em português), para a tela mostrar só ela.
const lerPainel = ({ periodo }) => painelDoInicio(periodo).catch((e) => {
  if (e?.message === 'periodo_invalido' && e.details) return { periodoInvalido: e.details }
  throw e
})
const lerComparacao = ({ periodo }) => comparacaoDoInicio(periodo)
const lerFila = ({ periodo }) => filaDeClientes(periodo)
const lerSemanas = ({ periodo }) => checkinsPorSemana(periodo)
const lerPorDia = ({ periodo }) => horasDoPainelPorDia(periodo)
const lerUnidades = ({ periodo }) => horasPorUnidadePorSemana(periodo)
const lerCalor = ({ periodo }) => checkinsPorDiaEHora(periodo)
const lerTarefas = () => tarefasPorSituacao()
const lerCidades = () => clientesPorCidade()
const lerAberto = ({ id }) => meuCheckinAberto(id)

// Grade de 12 colunas (design "Início"): a partir de 1280 px, 8+4 e 6+6; de 1024 a 1279, o de 8 e o de 4 ocupam a
// linha e os de 6 ficam lado a lado; abaixo de 1024, uma coluna.
const LARGURA = { 8: 'lg:col-span-12 xl:col-span-8', 4: 'lg:col-span-12 xl:col-span-4', 6: 'lg:col-span-6', 12: 'lg:col-span-12' }

// Nenhum bloco sozinho numa linha (pedido do Diego, 19/11): só 8 + 4 e 6 + 6 fazem par; o que fica sem par ocupa a
// largura toda.
function semSozinho(blocos) {
  const saida = []
  for (let i = 0; i < blocos.length; i++) {
    const [a, b] = [blocos[i], blocos[i + 1]]
    if ((a.largura === 8 && b?.largura === 4) || (a.largura === 6 && b?.largura === 6)) saida.push(a, blocos[++i])
    else saida.push({ ...a, largura: 12 })
  }
  return saida
}

export default function Inicio() {
  const { perfil } = useAuth()
  const onde = perfil.consultoria ? `em ${perfil.consultoria.nome}` : 'da plataforma'
  // O período fica no endereço (?periodo=…): volta igual depois de abrir um cliente ou uma pessoa e dá para mandar o link.
  const [parametros, setParametros] = useSearchParams()
  const hoje = hojeEmSP()
  const periodo = lerPeriodo(parametros, hoje)
  const { tipo, mes, de, ate } = periodo
  const noMes = tipo === 'mes'
  const erroDoPeriodo = noMes ? null : validarPeriodo(de, ate, hoje)
  const consultor = perfil.papel === 'pessoa'
  // `versao` muda depois de um check-in ou check-out feito no Início (relê o que muda com ele); cada bloco tem a própria
  // tentativa ("Tentar de novo" relê só ele).
  const [versao, setVersao] = useState(0)
  const [tentativas, setTentativas] = useState({ painel: 0, comparacao: 0, fila: 0, semanas: 0, porDia: 0, unidades: 0, calor: 0, tarefas: 0, cidades: 0 })
  const tentarDeNovo = (bloco) => () => setTentativas((t) => ({ ...t, [bloco]: t[bloco] + 1 }))

  function irPara(novo) {
    setParametros(paraEndereco({ ...periodo, ...novo }), { replace: true })
  }

  // Uma leitura por função, todas em paralelo; a chave é o período (período inválido não vai ao banco). O risco não
  // depende do período (ClientesEmRisco lê sozinho) e as horas por cliente também se leem no bloco delas; as tarefas e as
  // cidades são de hoje (a chave não tem o período: trocar o período não relê). `versao` relê o que um check-in muda.
  const argumento = erroDoPeriodo ? null : noMes ? mes : { de, ate }
  const com = (extra) => (argumento ? { periodo: argumento, ...extra } : null)
  const deHoje = (extra) => (argumento ? extra : null)
  const painel = useLeituraDoBloco(lerPainel, com({ versao, tentativa: tentativas.painel }))
  const comparacao = useLeituraDoBloco(lerComparacao, com({ tentativa: tentativas.comparacao }))
  const fila = useLeituraDoBloco(lerFila, consultor ? null : com({ tentativa: tentativas.fila }))
  const semanas = useLeituraDoBloco(lerSemanas, com({ versao, tentativa: tentativas.semanas }))
  const porDia = useLeituraDoBloco(lerPorDia, com({ versao, tentativa: tentativas.porDia }))
  const unidades = useLeituraDoBloco(lerUnidades, consultor ? null : com({ tentativa: tentativas.unidades }))
  const calor = useLeituraDoBloco(lerCalor, com({ versao, tentativa: tentativas.calor }))
  const tarefas = useLeituraDoBloco(lerTarefas, deHoje({ versao, tentativa: tentativas.tarefas }))
  const cidades = useLeituraDoBloco(lerCidades, consultor ? null : deHoje({ tentativa: tentativas.cidades }))
  const aberto = useLeitura(lerAberto, consultor && argumento ? { id: perfil.id, versao } : null).dados ?? null

  const recusado = painel.dados?.periodoInvalido
  const dadosDoPainel = recusado ? null : painel.dados ?? null
  const recorte = dadosDoPainel?.recorte ?? (consultor ? 'pessoa' : perfil.papel === 'central' || perfil.papel === 'dono' ? 'tudo' : 'consultoria')
  // Os cartões só mostram a variação quando o painel e a comparação são do mesmo período (nenhum dos dois atualizando).
  const comparacaoDosCartoes = comparacao.erro ? undefined
    : comparacao.dados && !comparacao.atualizando && !painel.atualizando ? comparacao.dados : null
  const recarregar = () => setVersao((v) => v + 1)

  const blocoDoPainel = { erro: Boolean(painel.erro), atualizando: Boolean(painel.atualizando), aoTentarDeNovo: tentarDeNovo('painel') }
  // O que todo bloco lido aqui recebe da leitura dele.
  const doBloco = (leitura, bloco) => ({ dados: leitura.dados ?? null, erro: Boolean(leitura.erro), atualizando: Boolean(leitura.atualizando),
    aoTentarDeNovo: tentarDeNovo(bloco) })
  const bloco = {
    porDia: <HorasNoPeriodoDoPainel periodo={periodo} {...doBloco(porDia, 'porDia')} />,
    risco: <ClientesEmRisco recorte={recorte} versao={versao} />,
    semanas: <CheckinsPorSemana periodo={periodo} {...doBloco(semanas, 'semanas')} />,
    calor: <QuandoOsCheckins periodo={periodo} {...doBloco(calor, 'calor')} />,
    tarefas: <TarefasDosChecklists recorte={recorte} {...doBloco(tarefas, 'tarefas')} />,
    meses: <GraficoDeMeses painel={dadosDoPainel} periodo={periodo} {...blocoDoPainel} />,
  }
  // A ordem e as larguras do desenho de 19/11 (o protótipo aprovado): o consultor não vê fila, ocupação, horas por
  // unidade nem cidades; o que sobrar sem par ocupa a linha toda.
  const blocos = semSozinho(consultor
    ? [
      { chave: 'horas-no-periodo', largura: 8, bloco: bloco.porDia },
      { chave: 'risco', largura: 4, bloco: bloco.risco },
      { chave: 'horas', largura: 6, bloco: <HorasPorCliente periodo={periodo} recorte={recorte} aberto={aberto} aoMudar={recarregar} versao={versao} /> },
      { chave: 'semanas', largura: 6, bloco: bloco.semanas },
      { chave: 'calor', largura: 6, bloco: bloco.calor },
      { chave: 'tarefas', largura: 6, bloco: bloco.tarefas },
      { chave: 'meses', largura: 8, bloco: bloco.meses },
    ]
    : [
      { chave: 'horas-no-periodo', largura: 8, bloco: bloco.porDia },
      { chave: 'fila', largura: 4, bloco: <FilaDeClientes fila={fila.dados} recorte={recorte} periodo={periodo} erro={Boolean(fila.erro)}
        atualizando={Boolean(fila.atualizando)} aoTentarDeNovo={tentarDeNovo('fila')} /> },
      { chave: 'unidades', largura: 6, bloco: <HorasPorUnidade recorte={recorte} periodo={periodo} {...doBloco(unidades, 'unidades')} /> },
      { chave: 'calor', largura: 6, bloco: bloco.calor },
      { chave: 'ocupacao', largura: 6, bloco: <OcupacaoPorUnidade painel={dadosDoPainel} recorte={recorte} {...blocoDoPainel} /> },
      { chave: 'tarefas', largura: 6, bloco: bloco.tarefas },
      { chave: 'horas', largura: 6, bloco: <HorasPorCliente periodo={periodo} recorte={recorte} versao={versao} /> },
      { chave: 'cidades', largura: 6, bloco: <ClientesPorCidade {...doBloco(cidades, 'cidades')} /> },
      { chave: 'meses', largura: 8, bloco: bloco.meses },
      { chave: 'risco', largura: 4, bloco: bloco.risco },
      { chave: 'semanas', largura: 6, bloco: bloco.semanas },
    ])

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Cabecalho className="mb-0" titulo={`Olá, ${primeiroNome(perfil.nome)}.`} descricao={`${NOME_DO_PAPEL[perfil.papel]} ${onde}.`} />
      <BarraDeFiltros className="mb-0">
        <FiltroDePeriodo periodo={periodo} hoje={hoje} erro={erroDoPeriodo}
          aoTrocarTipo={(novoTipo) => irPara(periodoAoTrocar(periodo, novoTipo, hoje))}
          aoMudarMes={(novo) => irPara({ mes: novo })}
          aoMudarDatas={(datas) => irPara(datas)} />
      </BarraDeFiltros>

      {erroDoPeriodo && <p className="card p-4 text-corpo text-muted-foreground">Ajuste as datas na barra de filtros para ver o painel.</p>}

      {/* Barra → cartões (com a variação) → gráficos. Cada bloco carrega e falha sozinho. */}
      {!erroDoPeriodo && (
        <>
          <Indicadores painel={dadosDoPainel} comparacao={comparacaoDosCartoes} papel={perfil.papel} atualizando={Boolean(painel.atualizando)}
            passado={noMes ? mes < mesAtual() : true} intervalo={!noMes} />
          {recusado ? (
            <p role="alert" className="card border-destructive/40 p-4 text-corpo text-destructive">{recusado}</p>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 max-sm:gap-3 lg:grid-cols-12">
              {blocos.map(({ chave, largura, bloco }) => (
                <div key={chave} data-bloco={chave} className={cn('grid min-w-0', LARGURA[largura])}>{bloco}</div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
