import { cn } from '@/lib/utils'

// Cor do quadradinho do ícone.
const TONS = {
  azul: 'bg-primary/10 text-primary-texto',
  ceu: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
  aviso: 'bg-notice-soft text-notice',
  positivo: 'bg-positive-soft text-positive',
  perigo: 'bg-destructive/10 text-destructive',
  neutro: 'bg-muted text-muted-foreground',
  // Paleta de 19/11: fundo suave e ícone no tom de texto.
  turquesa: 'bg-cor-turquesa-suave text-cor-turquesa-texto',
  violeta: 'bg-cor-violeta-suave text-cor-violeta-texto',
  mostarda: 'bg-cor-mostarda-suave text-cor-mostarda-texto',
  rosa: 'bg-cor-rosa-suave text-cor-rosa-texto',
  verde: 'bg-cor-verde-suave text-cor-verde-texto',
  laranja: 'bg-cor-laranja-suave text-cor-laranja-texto',
  indigo: 'bg-cor-indigo-suave text-cor-indigo-texto',
  grafite: 'bg-cor-grafite-suave text-cor-grafite-texto',
}

// Cor opcional do número (quando ele pede atenção).
const DESTAQUES = { atencao: 'text-notice', perigo: 'text-destructive' }

// Cor da seta e do número da variação: verde quando o movimento é bom, vermelho quando é ruim, cinza quando igual.
const TONS_DA_VARIACAO = { bom: 'text-positive', ruim: 'text-destructive', neutro: 'text-muted-foreground' }

const texto = (valor) => {
  if (valor === null || valor === undefined) return '—'
  return typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor
}

// "▲ 12% vs out." (variação contra o período anterior; src/lib/variacao.js e rotuloDaComparacao). A seta e as cores são
// só para os olhos; o leitor de tela ouve "subiu 12% vs out.". Só recebe objeto ou nulo: nulo = a comparação ainda
// carrega ("—"); undefined não chega aqui (o cartão fica sem a linha).
function Variacao({ variacao }) {
  if (variacao === null) {
    return (
      <span data-variacao="" className="mt-1 block text-legenda text-muted-foreground max-sm:col-span-full max-sm:mt-0">
        <span aria-hidden="true">—</span><span className="sr-only">Carregando a comparação</span>
      </span>
    )
  }
  const { texto: mostrado, tom, paraLeitor, comparado } = variacao
  return (
    <span data-variacao="" className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-legenda max-sm:col-span-full max-sm:mt-0">
      <span aria-hidden="true" className={cn('font-semibold whitespace-nowrap tabular-nums', TONS_DA_VARIACAO[tom] ?? TONS_DA_VARIACAO.neutro)}>{mostrado}</span>
      {comparado && <span aria-hidden="true" className="text-muted-foreground">{comparado}</span>}
      <span className="sr-only">{comparado ? `${paraLeitor} ${comparado}` : paraLeitor}</span>
    </span>
  )
}

// Cartões de números de toda tela do menu, logo abaixo da barra de filtros (CLAUDE.md, Padrão Hub): até 4, cada um com
// ícone, o número grande (já contado no banco) e o rótulo; 2 colunas no celular e 4 no largo. O conteúdo alinha pelo topo
// (auditoria, R6): com ou sem a linha de baixo, os números da fileira ficam na mesma altura. No celular o cartão fica mais
// baixo (auditoria, G6): o ícone, menor, vai ao lado do rótulo na linha de cima e o número desce para a linha de baixo,
// com a largura toda ("1.234,5 h" não caberia ao lado do ícone a 360 px); a caixa do texto vira `contents` e as linhas
// entram na grade do cartão. A linha de cima tem a altura de dois rótulos: os números da fileira ficam na mesma altura. Animam ao passar o mouse (pedido do Diego, 17/11): o cartão sobe 1px com sombra e o ícone
// dá o pulinho dos botões (.cartao-animado em src/index.css; "reduzir movimento" para).
// `cartoes`: [{ chave, rotulo, valor (número, texto pronto, ou nulo = "—" enquanto carrega), icone, tom (cor do ícone, azul
// se não disser), destaque ('atencao' | 'perigo', cor do número), detalhe (linha pequena embaixo), variacao: { texto, tom,
// paraLeitor, comparado } = a linha "▲ 12% vs out."; null = a comparação ainda carrega ("—"); ausente ou undefined = sem a
// linha (é o que variacao() devolve quando falta um dos números, ex.: ocupação nula com capacidade 0; também quando a
// comparação falhou), destino, ativo }].
// `destino` (usabilidade, U5; pedido do Diego, 18/11): função que aplica, na lista da tela, o filtro daquele número (e a
// tela volta à página 1, porque o filtro mudou). Só o cartão cujo número a lista sabe filtrar no banco tem destino: ele
// vira um botão ("Aguardando consultor: 16. Mostrar na lista"), com o foco à vista e o afundar dos botões; `ativo` marca o
// do filtro que está valendo (aria-current). Os outros continuam só número, sem foco.
export default function CartoesDeNumeros({ rotulo, cartoes, className }) {
  return (
    <section aria-label={rotulo} className={cn('mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {cartoes.map(({ chave, rotulo: nome, valor, icone: Icone, tom, destaque, detalhe, variacao, destino, ativo }) => {
        const classes = cn('card cartao-animado grid items-start gap-x-3 px-4 py-3 transition-[translate,box-shadow] duration-200',
          Icone ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1',
          'hover:-translate-y-px hover:shadow-md max-sm:grid-rows-[2.25rem] max-sm:gap-x-2 max-sm:gap-y-1.5 max-sm:px-3 max-sm:py-2.5')
        const conteudo = (
          <>
            {Icone && (
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl max-sm:col-start-1 max-sm:row-start-1 max-sm:size-7 max-sm:self-center max-sm:rounded-lg',
                TONS[tom] ?? TONS.azul)}>
                <Icone className="icone-do-cartao size-[17px] max-sm:size-[15px]" aria-hidden="true" />
              </span>
            )}
            <span className={cn('flex min-w-0 flex-col max-sm:contents', Icone && 'col-start-2')}>
              <span data-numero className={cn('block text-destaque leading-none font-bold tabular-nums max-sm:col-span-full max-sm:row-start-2',
                DESTAQUES[destaque])}>{texto(valor)}</span>
              <span title={nome} className={cn('mt-1 block text-rotulo text-muted-foreground max-sm:row-start-1 max-sm:mt-0 max-sm:self-center max-sm:line-clamp-2 sm:truncate',
                Icone && 'max-sm:col-start-2')}>{nome}</span>
              {detalhe && (
                <span className="mt-0.5 block text-legenda text-muted-foreground max-sm:col-span-full max-sm:mt-0 max-sm:line-clamp-2 sm:truncate"
                  title={detalhe}>{detalhe}</span>
              )}
              {variacao !== undefined && <Variacao variacao={variacao} />}
            </span>
          </>
        )
        if (!destino) return <div key={chave} data-cartao={chave} className={classes}>{conteudo}</div>
        return (
          <button key={chave} type="button" data-cartao={chave} onClick={destino} aria-current={ativo ? 'true' : undefined}
            aria-label={`${nome}: ${texto(valor)}. Mostrar na lista`} title="Mostrar na lista"
            className={cn(classes, 'botao-animado text-left outline-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring',
              ativo && 'ring-2 ring-primary/40')}>
            {conteudo}
          </button>
        )
      })}
    </section>
  )
}
