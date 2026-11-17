import CampoData from '@/components/campos/CampoData'
import Seletor from '@/components/campos/Seletor'
import NavegacaoDoMes from '@/components/comum/NavegacaoDoMes'
import { Label } from '@/components/ui/label'
import { TIPOS_DE_PERIODO, descreverPeriodo, ultimoDiaPermitido } from '@/lib/periodo'

// Período do painel, na barra de filtros (depois de "Filtros"): o tipo (Mês, Últimos 30 e 90 dias, Este ano,
// Personalizado) e, ao lado, a navegação do mês (Mês), as datas do atalho ou os campos De e Até (Personalizado).
// `periodo`: { tipo, mes?, de, ate } de lerPeriodo. `aoTrocarTipo(tipo)`, `aoMudarMes(mes)`, `aoMudarDatas({ de, ate })`.
// `erro`: a frase do período inválido (vem de validarPeriodo), mostrada numa linha só dela. No celular, De e Até
// ocupam a linha inteira cada um (a data em 16 px não cabe nos 176 px do computador).
// Mesma altura da NavegacaoDoMes (42 px), para a barra não pular ao trocar o tipo de período.
const ALTURA = 'flex min-h-[42px] items-center'

export default function FiltroDePeriodo({ periodo, hoje, erro, aoTrocarTipo, aoMudarMes, aoMudarDatas }) {
  const limite = ultimoDiaPermitido(hoje)
  // De depois do Até leva o Até junto, e Até antes do De leva o De: o período nunca fica de trás para a frente.
  const mudarDe = (de) => aoMudarDatas({ de, ate: de > periodo.ate ? de : periodo.ate })
  const mudarAte = (ate) => aoMudarDatas({ de: ate < periodo.de ? ate : periodo.de, ate })
  return (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="filtro-periodo" className="shrink-0 text-muted-foreground">Período</Label>
        <div className="w-44">
          <Seletor id="filtro-periodo" tamanho="sm" valor={periodo.tipo} aoMudar={aoTrocarTipo} opcoes={TIPOS_DE_PERIODO} />
        </div>
      </div>
      {periodo.tipo === 'mes' && <NavegacaoDoMes mes={periodo.mes} aoMudar={aoMudarMes} />}
      {periodo.tipo !== 'mes' && periodo.tipo !== 'personalizado' && (
        <span aria-live="polite" className={`${ALTURA} text-rotulo text-muted-foreground tabular-nums`}>{descreverPeriodo(periodo.de, periodo.ate)}</span>
      )}
      {periodo.tipo === 'personalizado' && (
        <>
          <div className={`${ALTURA} w-full gap-2 sm:w-auto`}>
            <Label htmlFor="periodo-de" className="w-7 shrink-0 text-muted-foreground">De</Label>
            <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
              <CampoData id="periodo-de" valor={periodo.de} aoMudar={mudarDe} max={limite} obrigatorio />
            </div>
          </div>
          <div className={`${ALTURA} w-full gap-2 sm:w-auto`}>
            <Label htmlFor="periodo-ate" className="w-7 shrink-0 text-muted-foreground">Até</Label>
            <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
              <CampoData id="periodo-ate" valor={periodo.ate} aoMudar={mudarAte} max={limite} obrigatorio />
            </div>
          </div>
        </>
      )}
      {erro && <p role="alert" className="basis-full text-rotulo font-medium text-destructive">{erro}</p>}
    </>
  )
}
