import { cn } from '@/lib/utils'

const FORMAS = [
  { valor: 'convite', rotulo: 'Enviar convite' },
  { valor: 'senha', rotulo: 'Criar com senha' },
]

// Escolha entre duas formas, em controle segmentado (rádios). O padrão é a chave "Enviar convite / Criar com senha" das
// janelas de criar acesso; `opcoes` ([{ valor, rotulo, desabilitada? }]) e `rotulo` (o nome do grupo) servem a outras
// escolhas (ex.: "Só eu / Um time" do Novo quadro). A opção desabilitada aparece apagada e não se escolhe.
export default function EscolhaForma({ valor, aoMudar, nome = 'forma', opcoes = FORMAS, rotulo = 'Como criar o acesso' }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="grid grid-cols-2 rounded-lg bg-muted p-1 text-corpo font-semibold">
      {opcoes.map((f) => (
        <label key={f.valor}
          className={cn('rounded-md py-1.5 text-center text-muted-foreground transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
            f.desabilitada ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            valor === f.valor && 'bg-card text-foreground shadow-xs')}>
          <input type="radio" name={nome} value={f.valor} className="sr-only" disabled={f.desabilitada}
            checked={valor === f.valor} onChange={(e) => aoMudar(e.target.value)} />
          {f.rotulo}
        </label>
      ))}
    </div>
  )
}
