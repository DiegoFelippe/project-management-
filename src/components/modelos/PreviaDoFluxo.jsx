import { useEffect, useRef, useState } from 'react'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import Fluxograma from '@/components/checkins/Fluxograma'
import { ehCelular } from '@/components/checkins/fluxo'

const ORIENTACOES = [{ valor: 'deitado', rotulo: 'Deitado' }, { valor: 'em-pe', rotulo: 'Em pé' }]
const NOME_DO_QUADRO = 'Prévia do fluxograma, role para ver tudo'

// No modelo, toda tarefa ainda está "a fazer": a caixa diz o dia do prazo e se é obrigatória.
const infoDoModelo = (t) => ({
  cor: 'livre', sub: `Dia ${t.prazo_dias} · ${t.obrigatoria ? 'obrigatória' : 'opcional'}`, rotulo: `dia ${t.prazo_dias}`,
})

// O fluxograma do modelo (prévia do editor e aba Fluxograma do Ver), deitado ou em pé (no celular começa em pé).
// `etapas`: [{ id, nome }]; `tarefas`: todas, na ordem do modelo, com etapa_id e depende_de. Sem `aoEscolher`, o
// Fluxograma é só desenho e nada nele recebe foco; para quem usa o teclado rolar o quadro, esta tela dá ao quadro
// (o elemento que rola) o foco, o papel de região e o nome — o Fluxograma continua o mesmo.
export default function PreviaDoFluxo({ etapas, tarefas, rotulo, dica }) {
  const [vertical, setVertical] = useState(ehCelular)
  const cartao = useRef(null)

  useEffect(() => {
    const quadro = cartao.current?.querySelector('[data-caixa-do-fluxo]')
    if (!quadro || quadro.getAttribute('aria-label') === NOME_DO_QUADRO) return
    quadro.setAttribute('tabindex', '0')
    quadro.setAttribute('role', 'region')
    quadro.setAttribute('aria-label', NOME_DO_QUADRO)
  })

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {dica && <p className="text-muted-foreground min-w-0 flex-1 basis-60 text-rotulo">{dica}</p>}
        <AbasSegmentadas rotulo="Orientação do fluxograma" abas={ORIENTACOES} valor={vertical ? 'em-pe' : 'deitado'}
          aoMudar={(valor) => setVertical(valor === 'em-pe')} />
      </div>
      <div ref={cartao} className="card min-w-0 overflow-hidden [&_[data-caixa-do-fluxo]:focus-visible]:-outline-offset-2">
        <Fluxograma etapas={etapas} tarefas={tarefas} vertical={vertical} infoDaTarefa={infoDoModelo} rotulo={rotulo} />
      </div>
    </div>
  )
}
