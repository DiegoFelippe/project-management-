import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import BarraDeFiltros from '@/components/comum/BarraDeFiltros'
import Cabecalho from '@/components/comum/Cabecalho'
import CheckinsPorSemana from '@/components/inicio/CheckinsPorSemana'
import ClientesEmRisco from '@/components/inicio/ClientesEmRisco'
import FilaDeClientes from '@/components/inicio/FilaDeClientes'
import FiltroDePeriodo from '@/components/inicio/FiltroDePeriodo'
import GraficoDeMeses from '@/components/inicio/GraficoDeMeses'
import HorasPorCliente from '@/components/inicio/HorasPorCliente'
import Indicadores from '@/components/inicio/Indicadores'
import OcupacaoPorUnidade from '@/components/inicio/OcupacaoPorUnidade'
import { useLeituraDoBloco } from '@/components/inicio/useLeituraDoBloco'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { meuCheckinAberto } from '@/data/checkins'
import { checkinsPorSemana, comparacaoDoInicio, filaDeClientes, painelDoInicio } from '@/data/painel'
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
const lerAberto = ({ id }) => meuCheckinAberto(id)

// Grade de 12 colunas (design "Início"): a partir de 1280 px, 8+4 e 6+6; de 1024 a 1279, o de 8 e o de 4 ocupam a
// linha e os de 6 ficam lado a lado; abaixo de 1024, uma coluna.
const LARGURA = { 8: 'lg:col-span-12 xl:col-span-8', 4: 'lg:col-span-12 xl:col-span-4', 6: 'lg:col-span-6' }

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
  const [tentativas, setTentativas] = useState({ painel: 0, comparacao: 0, fila: 0, semanas: 0 })
  const tentarDeNovo = (bloco) => () => setTentativas((t) => ({ ...t, [bloco]: t[bloco] + 1 }))

  function irPara(novo) {
    setParametros(paraEndereco({ ...periodo, ...novo }), { replace: true })
  }

  // Uma leitura por função, todas em paralelo; a chave é o período (período inválido não vai ao banco). O risco não
  // depende do período (ClientesEmRisco lê sozinho) e as horas por cliente também se leem no bloco delas.
  const argumento = erroDoPeriodo ? null : noMes ? mes : { de, ate }
  const com = (extra) => (argumento ? { periodo: argumento, ...extra } : null)
  const painel = useLeituraDoBloco(lerPainel, com({ versao, tentativa: tentativas.painel }))
  const comparacao = useLeituraDoBloco(lerComparacao, com({ tentativa: tentativas.comparacao }))
  const fila = useLeituraDoBloco(lerFila, consultor ? null : com({ tentativa: tentativas.fila }))
  const semanas = useLeituraDoBloco(lerSemanas, com({ versao, tentativa: tentativas.semanas }))
  const aberto = useLeitura(lerAberto, consultor && argumento ? { id: perfil.id, versao } : null).dados ?? null

  const recusado = painel.dados?.periodoInvalido
  const dadosDoPainel = recusado ? null : painel.dados ?? null
  const recorte = dadosDoPainel?.recorte ?? (consultor ? 'pessoa' : perfil.papel === 'central' || perfil.papel === 'dono' ? 'tudo' : 'consultoria')
  // Os cartões só mostram a variação quando o painel e a comparação são do mesmo período (nenhum dos dois atualizando).
  const comparacaoDosCartoes = comparacao.erro ? undefined
    : comparacao.dados && !comparacao.atualizando && !painel.atualizando ? comparacao.dados : null
  const recarregar = () => setVersao((v) => v + 1)

  const blocoDoPainel = { erro: Boolean(painel.erro), atualizando: Boolean(painel.atualizando), aoTentarDeNovo: tentarDeNovo('painel') }
  const blocos = consultor
    ? [
      { chave: 'meses', largura: 8, bloco: <GraficoDeMeses painel={dadosDoPainel} periodo={periodo} {...blocoDoPainel} /> },
      { chave: 'risco', largura: 4, bloco: <ClientesEmRisco recorte={recorte} versao={versao} /> },
      { chave: 'horas', largura: 6, bloco: <HorasPorCliente periodo={periodo} recorte={recorte} aberto={aberto} aoMudar={recarregar} versao={versao} /> },
      { chave: 'semanas', largura: 6, bloco: <CheckinsPorSemana dados={semanas.dados} periodo={periodo} erro={Boolean(semanas.erro)}
        atualizando={Boolean(semanas.atualizando)} aoTentarDeNovo={tentarDeNovo('semanas')} /> },
    ]
    : [
      { chave: 'meses', largura: 8, bloco: <GraficoDeMeses painel={dadosDoPainel} periodo={periodo} {...blocoDoPainel} /> },
      { chave: 'fila', largura: 4, bloco: <FilaDeClientes fila={fila.dados} recorte={recorte} periodo={periodo} erro={Boolean(fila.erro)}
        atualizando={Boolean(fila.atualizando)} aoTentarDeNovo={tentarDeNovo('fila')} /> },
      { chave: 'ocupacao', largura: 6, bloco: <OcupacaoPorUnidade painel={dadosDoPainel} recorte={recorte} {...blocoDoPainel} /> },
      { chave: 'risco', largura: 6, bloco: <ClientesEmRisco recorte={recorte} versao={versao} /> },
      { chave: 'horas', largura: 6, bloco: <HorasPorCliente periodo={periodo} recorte={recorte} versao={versao} /> },
      { chave: 'semanas', largura: 6, bloco: <CheckinsPorSemana dados={semanas.dados} periodo={periodo} erro={Boolean(semanas.erro)}
        atualizando={Boolean(semanas.atualizando)} aoTentarDeNovo={tentarDeNovo('semanas')} /> },
    ]

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
