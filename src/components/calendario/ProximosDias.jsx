import { CalendarDays } from 'lucide-react'
import { diaCurtoComSemana } from '@/lib/calendario'
import ChipDoEvento from './ChipDoEvento'

// "Próximos 7 dias", como no Hub: os dias que têm algo, cada um com os chips e a hora. O nome do dia seleciona o dia
// (o detalhe ao lado mostra).
export default function ProximosDias({ dias, porDia, deVariasPessoas, aoSelecionar, aoAbrir }) {
  const comItens = dias.filter((dia) => porDia.get(dia)?.length)
  return (
    <section aria-label="Próximos 7 dias" className="card flex h-full min-w-0 flex-col p-4">
      <h2 className="section-label mb-3 flex items-center gap-1.5">
        <CalendarDays className="size-3" aria-hidden="true" /> Próximos 7 dias
      </h2>
      {comItens.length === 0 && <p className="text-rotulo text-muted-foreground">Nada marcado para a próxima semana.</p>}
      {comItens.length > 0 && (
        <div className="grid max-h-80 gap-3 overflow-y-auto pr-1">
          {comItens.map((dia) => (
            <div key={dia}>
              <button type="button" onClick={() => aoSelecionar(dia)}
                className="botao-animado mb-1 rounded text-legenda font-semibold text-muted-foreground transition-[color,translate,scale] outline-none hover:-translate-y-px hover:text-primary focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]">
                {diaCurtoComSemana(dia)}
              </button>
              <div className="grid gap-1">
                {porDia.get(dia).map((item) => (
                  <ChipDoEvento key={`${item.tipo}-${item.id}`} item={item} dia={dia} deVariasPessoas={deVariasPessoas} comHora tamanho="rotulo" aoAbrir={aoAbrir} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
