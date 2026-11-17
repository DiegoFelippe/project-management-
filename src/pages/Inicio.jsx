import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import BarraDeFiltros from '@/components/comum/BarraDeFiltros'
import { GraficoCarregando } from '@/components/comum/Carregando'
import ClientesEsperando from '@/components/inicio/ClientesEsperando'
import Extremos from '@/components/inicio/Extremos'
import FiltroDePeriodo from '@/components/inicio/FiltroDePeriodo'
import HorasPorMes from '@/components/inicio/HorasPorMes'
import Indicadores from '@/components/inicio/Indicadores'
import MeusClientes from '@/components/inicio/MeusClientes'
import RankingDeOcupacao from '@/components/inicio/RankingDeOcupacao'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { painelDoInicio } from '@/data/painel'
import { hoje as hojeEmSP, mesAtual } from '@/lib/mes'
import { lerPeriodo, paraEndereco, periodoAoTrocar, validarPeriodo } from '@/lib/periodo'
import { primeiroNome } from '@/lib/nomes'

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
  const [painel, setPainel] = useState(null)
  const [erro, setErro] = useState(false)

  function irPara(novo) {
    setErro(false)
    setParametros(paraEndereco({ ...periodo, ...novo }), { replace: true })
  }

  // Uma chamada por período; a resposta de um período antigo nunca sobrescreve a do novo. Período inválido não vai
  // ao banco (o aviso fica na barra).
  useEffect(() => {
    if (erroDoPeriodo) return undefined
    let ativo = true
    painelDoInicio(noMes ? mes : { de, ate })
      .then((p) => {
        if (!ativo) return
        setPainel(p)
        setErro(false)
      })
      .catch(() => {
        if (!ativo) return
        // Sem os números do período pedido, não deixa os do anterior sob o rótulo novo.
        setPainel(null)
        setErro(true)
      })
    return () => {
      ativo = false
    }
  }, [noMes, mes, de, ate, erroDoPeriodo])

  const doPedido = painel && (noMes ? !painel.intervalo && painel.mes === mes : painel.intervalo && painel.de === de && painel.ate === ate)
  const atualizando = painel && !doPedido && !erro
  const veEquipe = painel && painel.recorte !== 'pessoa'
  const intervalo = painel?.intervalo ?? false

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-titulo font-bold">Olá, {primeiroNome(perfil.nome)}.</h1>
          <p className="text-subtitulo text-muted-foreground">{NOME_DO_PAPEL[perfil.papel]} {onde}.</p>
        </div>
      </div>
      <BarraDeFiltros className="mb-0">
        <FiltroDePeriodo periodo={periodo} hoje={hoje} erro={erroDoPeriodo}
          aoTrocarTipo={(novoTipo) => irPara(periodoAoTrocar(periodo, novoTipo, hoje))}
          aoMudarMes={(novo) => irPara({ mes: novo })}
          aoMudarDatas={(datas) => irPara(datas)} />
      </BarraDeFiltros>

      {erroDoPeriodo && <p className="card p-4 text-corpo text-muted-foreground">Ajuste as datas na barra de filtros para ver o painel.</p>}

      {/* Os números do período logo abaixo da barra ("—" enquanto o pedido carrega); com erro, só o aviso. */}
      {!erroDoPeriodo && (
        <>
          {!erro && <Indicadores painel={atualizando ? null : painel} pessoa={perfil.papel === 'pessoa'}
            passado={noMes ? mes < mesAtual() : true} intervalo={!noMes} />}
          {erro && <p role="alert" className="card border-destructive/40 p-4 text-corpo text-destructive">Não foi possível carregar o painel. Tente novamente em instantes.</p>}
          {!painel && !erro && <GraficoCarregando texto="Carregando o painel…" className="min-h-64 justify-center" />}

          {painel && (
            <div aria-busy={atualizando ? 'true' : undefined}
              className={`grid grid-cols-[minmax(0,1fr)] gap-5 transition-opacity xl:grid-cols-[repeat(2,minmax(0,1fr))] ${atualizando ? 'opacity-60' : ''}`}>
              <HorasPorMes meses={painel.horas_por_mes} previsao={painel.previsao_atual} intervalo={intervalo} />
              {veEquipe ? <RankingDeOcupacao recorte={painel.recorte} passado={painel.passado} intervalo={intervalo} ranking={painel.ranking} mes={painel.mes} />
                : <MeusClientes passado={painel.passado} intervalo={intervalo} clientes={painel.meus_clientes} />}
              {veEquipe && <ClientesEsperando recorte={painel.recorte} esperando={painel.esperando} passado={painel.passado} intervalo={intervalo} />}
              {veEquipe && <Extremos recorte={painel.recorte} extremos={painel.extremos} passado={painel.passado} mes={painel.mes} />}
            </div>
          )}
        </>
      )}
    </section>
  )
}
