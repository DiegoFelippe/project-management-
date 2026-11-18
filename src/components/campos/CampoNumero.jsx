import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCampo } from './contextoDoCampo'
import { BotaoCampo } from './Flutuante'

// "7,5" -> 7.5 (vazio ou inválido vira null).
const ler = (texto) => {
  const n = Number(String(texto ?? '').replace(',', '.'))
  return texto === '' || texto == null || Number.isNaN(n) ? null : n
}
const escrever = (n) => String(Number(n.toFixed(6))).replace('.', ',')

// Campo de número do padrão Hub no lugar do <input type="number">: menos e mais nos lados, o valor no meio
// (dá para digitar e usar as setas do teclado) e a unidade dentro do campo. Trabalha com TEXTO em pt-BR,
// como os formulários: `valor` é texto e `aoMudar(texto)` recebe, por exemplo, "7,5". Menos, mais e as setas
// mantêm o valor entre `min` e `max`; o que foi digitado NÃO é cortado ao sair do campo (a validação do formulário avisa). `atalhos`: números prontos (ex.: [4, 8]).
export default function CampoNumero({ id, valor, aoMudar, min = 0, max = 9999, passo = 1, unidade, atalhos, decimal = false, desabilitado = false }) {
  const n = ler(valor)
  const campo = useCampo(id) // dentro de um Campo com erro: a moldura fica vermelha e o número, marcado (usabilidade, U2)
  const limitar = (v) => Math.min(max, Math.max(min, v))
  const mudar = (v) => aoMudar(escrever(limitar(v)))
  const somar = (dir) => mudar(n == null ? min : n + dir * passo)
  // No toque (pointer-coarse), o campo tem 44 px de altura, menos e mais 44 px de largura e os atalhos 44 px, com 8 px entre eles.
  const lado = 'text-muted-foreground hover:bg-accent hover:text-foreground flex w-9 items-center justify-center disabled:pointer-events-none disabled:opacity-35 pointer-coarse:min-w-11'

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div data-slot="moldura-numero" className={cn('bg-card inline-flex w-fit items-stretch overflow-hidden rounded-xl border transition-[box-shadow,border-color] focus-within:ring-2 pointer-coarse:min-h-11',
        campo.invalido ? 'border-destructive ring-destructive/20 focus-within:ring-destructive/20' : 'border-input hover:border-primary/40 focus-within:border-primary/60 focus-within:ring-primary/15',
        desabilitado && 'opacity-60')}>
        <BotaoCampo onClick={() => somar(-1)} disabled={desabilitado || (n != null && n <= min)} aria-label="Diminuir" title="Diminuir" className={lado}>
          <Minus className="size-3.5" aria-hidden="true" />
        </BotaoCampo>
        <span className="border-input flex items-baseline gap-1.5 border-x px-2.5">
          <input id={id} value={valor ?? ''} inputMode={decimal ? 'decimal' : 'numeric'} disabled={desabilitado} placeholder="0"
            aria-invalid={campo.invalido || undefined} aria-describedby={campo.descritoPor}
            onChange={(e) => aoMudar(decimal ? e.target.value.replace('.', ',').replace(/[^\d,]/g, '').replace(/,(?=.*,)/g, '').slice(0, 12) : e.target.value.replace(/\D/g, '').slice(0, String(max).length))}
            onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); somar(e.key === 'ArrowUp' ? 1 : -1) } }}
            className="text-foreground placeholder:text-muted-foreground/50 w-12 bg-transparent py-2 texto-de-campo text-center font-semibold tabular-nums outline-none" />
          {unidade && <span className="text-muted-foreground text-rotulo select-none">{unidade}</span>}
        </span>
        <BotaoCampo onClick={() => somar(1)} disabled={desabilitado || (n != null && n >= max)} aria-label="Aumentar" title="Aumentar" className={lado}>
          <Plus className="size-3.5" aria-hidden="true" />
        </BotaoCampo>
      </div>
      {atalhos?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pointer-coarse:gap-2" role="group" aria-label="Atalhos">
          {atalhos.map((a) => (
            <BotaoCampo key={a} onClick={() => aoMudar(escrever(a))} disabled={desabilitado} aria-pressed={n === a} title={unidade ? `${a} ${unidade}` : String(a)}
              className={cn('min-w-9 rounded-md px-2 py-1 text-rotulo font-medium tabular-nums pointer-coarse:min-h-11 pointer-coarse:min-w-11', n === a ? 'bg-primary/10 text-primary-texto ring-primary/30 ring-1' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground')}>
              {a}
            </BotaoCampo>
          ))}
        </div>
      )}
    </div>
  )
}
