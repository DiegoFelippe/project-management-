import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import BarraDeFiltros from '@/components/comum/BarraDeFiltros'
import { GraficoCarregando } from '@/components/comum/Carregando'
import NavegacaoDoMes from '@/components/comum/NavegacaoDoMes'
import ClientesEsperando from '@/components/inicio/ClientesEsperando'
import Extremos from '@/components/inicio/Extremos'
import HorasPorMes from '@/components/inicio/HorasPorMes'
import Indicadores from '@/components/inicio/Indicadores'
import MeusClientes from '@/components/inicio/MeusClientes'
import RankingDeOcupacao from '@/components/inicio/RankingDeOcupacao'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { painelDoInicio } from '@/data/painel'
import { mesAtual } from '@/lib/mes'
import { primeiroNome } from '@/lib/nomes'

export default function Inicio() {
  const { perfil } = useAuth()
  const onde = perfil.consultoria ? `em ${perfil.consultoria.nome}` : 'da plataforma'
  const [mes, setMes] = useState(mesAtual)
  const [painel, setPainel] = useState(null)
  const [erro, setErro] = useState(false)

  // Uma chamada por mês; a resposta de um mês antigo nunca sobrescreve a do mês novo.
  useEffect(() => {
    let ativo = true
    painelDoInicio(mes)
      .then((p) => {
        if (!ativo) return
        setPainel(p)
        setErro(false)
      })
      .catch(() => {
        if (!ativo) return
        // Sem os números do mês pedido, não deixa os do mês anterior sob o rótulo novo.
        setPainel(null)
        setErro(true)
      })
    return () => {
      ativo = false
    }
  }, [mes])

  const atualizando = painel && painel.mes !== mes && !erro
  const veEquipe = painel && painel.recorte !== 'pessoa'

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-titulo font-bold">Olá, {primeiroNome(perfil.nome)}.</h1>
          <p className="text-subtitulo text-muted-foreground">{NOME_DO_PAPEL[perfil.papel]} {onde}.</p>
        </div>
      </div>
      <BarraDeFiltros className="mb-0">
        <NavegacaoDoMes mes={mes} aoMudar={(novo) => { setErro(false); setMes(novo) }} />
      </BarraDeFiltros>

      {erro && <p role="alert" className="card border-destructive/40 p-4 text-corpo text-destructive">Não foi possível carregar o painel. Tente novamente em instantes.</p>}
      {!painel && !erro && <GraficoCarregando texto="Carregando o painel…" className="min-h-64 justify-center" />}

      {painel && (
        <div aria-busy={atualizando ? 'true' : undefined} className={`grid grid-cols-[minmax(0,1fr)] gap-5 transition-opacity ${atualizando ? 'opacity-60' : ''}`}>
          <Indicadores painel={painel} />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
            <HorasPorMes meses={painel.horas_por_mes} previsao={painel.previsao_atual} />
            {veEquipe ? <RankingDeOcupacao recorte={painel.recorte} passado={painel.passado} ranking={painel.ranking} mes={painel.mes} />
              : <MeusClientes passado={painel.passado} clientes={painel.meus_clientes} />}
            {veEquipe && <ClientesEsperando recorte={painel.recorte} esperando={painel.esperando} passado={painel.passado} />}
            {veEquipe && <Extremos recorte={painel.recorte} extremos={painel.extremos} passado={painel.passado} mes={painel.mes} />}
          </div>
        </div>
      )}
    </section>
  )
}
