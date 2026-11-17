import { cn } from '@/lib/utils'

// Cor do quadradinho do ícone.
const TONS = {
  azul: 'bg-primary/10 text-primary',
  ceu: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
  aviso: 'bg-notice-soft text-notice',
  positivo: 'bg-positive-soft text-positive',
  perigo: 'bg-destructive/10 text-destructive',
  neutro: 'bg-muted text-muted-foreground',
}

// Cor opcional do número (quando ele pede atenção).
const DESTAQUES = { atencao: 'text-notice', perigo: 'text-destructive' }

const texto = (valor) => {
  if (valor === null || valor === undefined) return '—'
  return typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor
}

// Cartões de números de toda tela do menu, logo abaixo da barra de filtros (CLAUDE.md, Padrão Hub): até 4, cada um com
// ícone, o número grande (já contado no banco) e o rótulo; 2 colunas no celular e 4 no largo. No celular o ícone vai
// para cima do número (a 360 px, ao lado dele, o número teria uns 76 px). Animam ao passar o mouse (pedido do Diego,
// 17/11): o cartão sobe 1px com sombra e o ícone dá o pulinho dos botões (.cartao-animado em src/index.css; "reduzir
// movimento" para). Não são clicáveis nem focáveis, então não há animação de foco. `cartoes`: [{ chave, rotulo, valor (número, texto pronto, ou nulo = "—"
// enquanto carrega), icone, tom (cor do ícone, azul se não disser), destaque ('atencao' | 'perigo', cor do número),
// detalhe (linha pequena embaixo) }].
export default function CartoesDeNumeros({ rotulo, cartoes, className }) {
  return (
    <section aria-label={rotulo} className={cn('mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {cartoes.map(({ chave, rotulo: nome, valor, icone: Icone, tom, destaque, detalhe }) => (
        <div key={chave} data-cartao={chave}
          className={cn('card cartao-animado flex items-center gap-3 px-4 py-3 transition-[translate,box-shadow] duration-200',
            'hover:-translate-y-px hover:shadow-md max-sm:flex-col max-sm:items-start max-sm:gap-2 max-sm:px-3')}>
          {Icone && (
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', TONS[tom] ?? TONS.azul)}>
              <Icone className="icone-do-cartao size-[17px]" aria-hidden="true" />
            </span>
          )}
          <div className="flex min-w-0 flex-col">
            <p data-numero className={cn('text-destaque leading-none font-bold tabular-nums', DESTAQUES[destaque])}>{texto(valor)}</p>
            <p className="mt-1 text-rotulo text-muted-foreground max-sm:line-clamp-2 sm:truncate" title={nome}>{nome}</p>
            {detalhe && <p className="mt-0.5 text-legenda text-muted-foreground max-sm:line-clamp-2 sm:truncate" title={detalhe}>{detalhe}</p>}
          </div>
        </div>
      ))}
    </section>
  )
}
