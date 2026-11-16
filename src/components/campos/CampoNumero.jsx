import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BotaoCampo } from './Flutuante'

// "7,5" -> 7.5 (vazio ou inválido vira null).
const ler = (texto) => {
  const n = Number(String(texto ?? '').replace(',', '.'))
  return texto === '' || texto == null || Number.isNaN(n) ? null : n
}
const escrever = (n) => String(Number(n.toFixed(6))).replace('.', ',')

// Campo de número do padrão Hub no lugar do <input type="number">: menos e mais nos lados, o valor no meio
// (dá para digitar e usar as setas do teclado) e a unidade dentro do campo. Trabalha com TEXTO em pt-BR,
// como os formulários: `valor` é texto e `aoMudar(texto)` recebe, por exemplo, "7,5". Menos, mais e o fim da
// digitação mantêm o valor entre `min` e `max`. `atalhos`: números prontos (ex.: [4, 8]).
export default function CampoNumero({ id, valor, aoMudar, min = 0, max = 9999, passo = 1, unidade, atalhos, decimal = false, desabilitado = false }) {
  const n = ler(valor)
  const limitar = (v) => Math.min(max, Math.max(min, v))
  const mudar = (v) => aoMudar(escrever(limitar(v)))
  const somar = (dir) => mudar(n == null ? min : n + dir * passo)
  const lado = 'text-muted-foreground hover:bg-accent hover:text-foreground flex w-9 items-center justify-center disabled:pointer-events-none disabled:opacity-35'

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className={cn('bg-card border-input hover:border-primary/40 focus-within:border-primary/60 focus-within:ring-primary/15 inline-flex w-fit items-stretch overflow-hidden rounded-xl border transition-[box-shadow,border-color] focus-within:ring-2', desabilitado && 'opacity-60')}>
        <BotaoCampo onClick={() => somar(-1)} disabled={desabilitado || (n != null && n <= min)} aria-label="Diminuir" title="Diminuir" className={lado}>
          <Minus className="size-3.5" aria-hidden="true" />
        </BotaoCampo>
        <span className="border-input flex items-baseline gap-1.5 border-x px-2.5">
          <input id={id} value={valor ?? ''} inputMode={decimal ? 'decimal' : 'numeric'} disabled={desabilitado} placeholder="0"
            onChange={(e) => aoMudar(decimal ? e.target.value.replace('.', ',').replace(/[^\d,]/g, '').replace(/,(?=.*,)/g, '').slice(0, 12) : e.target.value.replace(/\D/g, '').slice(0, String(max).length))}
            onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); somar(e.key === 'ArrowUp' ? 1 : -1) } }}
            onBlur={() => { if (n != null && escrever(limitar(n)) !== valor) mudar(n) }}
            className="text-foreground placeholder:text-muted-foreground/50 w-12 bg-transparent py-2 text-center text-[14px] font-semibold tabular-nums outline-none" />
          {unidade && <span className="text-muted-foreground text-[12.5px] select-none">{unidade}</span>}
        </span>
        <BotaoCampo onClick={() => somar(1)} disabled={desabilitado || (n != null && n >= max)} aria-label="Aumentar" title="Aumentar" className={lado}>
          <Plus className="size-3.5" aria-hidden="true" />
        </BotaoCampo>
      </div>
      {atalhos?.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atalhos">
          {atalhos.map((a) => (
            <BotaoCampo key={a} onClick={() => aoMudar(escrever(a))} disabled={desabilitado} aria-pressed={n === a} title={unidade ? `${a} ${unidade}` : String(a)}
              className={cn('min-w-9 rounded-md px-2 py-1 text-[12px] font-medium tabular-nums', n === a ? 'bg-primary/10 text-primary ring-primary/30 ring-1' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground')}>
              {a}
            </BotaoCampo>
          ))}
        </div>
      )}
    </div>
  )
}
