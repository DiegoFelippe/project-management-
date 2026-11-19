import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Eye, EyeOff, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { avaliarSenha, gerarSenha, mensagemDeValidacao, NOME_DAS_FORCAS } from '@/lib/senha'
import { cn } from '@/lib/utils'

const COR_DA_FORCA = { fraca: 'bg-destructive-cheio', media: 'bg-notice-cheio', forte: 'bg-positive-cheio' }
const COR_DO_TEXTO = { fraca: 'text-destructive', media: 'text-notice', forte: 'text-positive' }

// Campo de senha forte: mostrar/esconder, medidor Fraca/Média/Forte (da largura do campo, com o nome na mesma linha),
// regras em duas colunas, Gerar senha, Copiar e Validar (por último: as regras já mudam ao digitar; o Validar explica
// numa frase, inclusive o espaço nas pontas, que a lista não mostra). `dica` (opcional): texto de apoio logo abaixo
// dos botões. Só senha Forte deve ser salva: quem usa o campo confere com `avaliarSenha(valor).forte`.
export default function CampoSenha({ id, valor, aoMudar, gerador = true, invalido, autoFocus, autoComplete = 'new-password', dica }) {
  const [visivel, setVisivel] = useState(false)
  const [validacao, setValidacao] = useState(null)
  const [copiada, setCopiada] = useState(false)
  const relogio = useRef(null)
  useEffect(() => () => clearTimeout(relogio.current), [])

  const analise = avaliarSenha(valor)
  const mudar = (nova) => { setValidacao(null); aoMudar(nova) }

  function gerar() {
    setVisivel(true)
    mudar(gerarSenha())
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiada(true)
      clearTimeout(relogio.current)
      relogio.current = setTimeout(() => setCopiada(false), 2000)
    } catch {
      setValidacao('Não deu para copiar: selecione a senha e copie com o teclado.')
    }
  }

  return (
    <div className="grid min-w-0 gap-2.5">
      <div className="relative">
        <Input id={id} type={visivel ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus} spellCheck={false}
          className="h-10 pr-11" aria-invalid={invalido ? true : undefined} value={valor} onChange={(e) => mudar(e.target.value)} />
        <button type="button" onClick={() => setVisivel((v) => !v)} aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'}
          className="botao-animado text-muted-foreground hover:text-foreground hover:bg-accent absolute inset-y-1 right-1 flex w-8 items-center justify-center rounded-lg transition-[color,background-color,translate,scale] hover:-translate-y-px active:scale-[0.97]">
          {visivel ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>

      <div className="flex items-center gap-2.5">
        <div role="meter" aria-label="Força da senha" aria-valuemin={0} aria-valuemax={5} aria-valuenow={analise.cumpridas}
          aria-valuetext={NOME_DAS_FORCAS[analise.forca]} className="bg-muted flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={cn('h-full flex-1 transition-colors', i < analise.cumpridas ? COR_DA_FORCA[analise.forca] : 'bg-transparent')} />
          ))}
        </div>
        <span className={cn('w-12 text-right text-rotulo font-semibold', COR_DO_TEXTO[analise.forca])}>{NOME_DAS_FORCAS[analise.forca]}</span>
      </div>

      <ul aria-label="Regras da senha" className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {analise.regras.map((r) => (
          <li key={r.id} data-ok={r.ok} className={cn('flex items-center gap-1.5 text-rotulo', r.ok ? 'text-positive' : 'text-muted-foreground')}>
            {r.ok ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <X className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />}
            <span>{r.texto}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        {gerador && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={gerar}>
              <Sparkles aria-hidden="true" /> Gerar senha
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={copiar} disabled={!valor}>
              {copiada ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copiada ? 'Copiada' : 'Copiar'}
            </Button>
          </>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setValidacao(mensagemDeValidacao(valor))}>
          <ShieldCheck aria-hidden="true" /> Validar
        </Button>
      </div>

      {/* Com a dica embaixo, a linha do Validar só ocupa espaço quando tem o que dizer (a dica segura o lugar). */}
      <div>
        <p role="status" className={cn('text-rotulo', !dica && 'min-h-4', validacao && (analise.forte && !validacao.startsWith('Não deu') ? 'text-positive' : 'text-destructive'))}>{validacao}</p>
        {dica && <p className={cn('text-muted-foreground text-legenda', validacao && 'mt-1')}>{dica}</p>}
      </div>
    </div>
  )
}
