import { lazy, Suspense, useState } from 'react'
import { RotateCcw, SquareKanban } from 'lucide-react'
import { GraficoCarregando } from '@/components/comum/Carregando'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import LimiteDeErro from '@/components/comum/LimiteDeErro'
import { Button } from '@/components/ui/button'
import { carregarJanelaDoCartao } from './carregarJanelaDoCartao'

// A janela já carregada (as próximas aberturas não esperam nem piscam).
let carregada = null
const criarPreguicosa = () => lazy(() => carregarJanelaDoCartao().then((modulo) => {
  carregada = modulo.default
  return modulo
}))

function Reserva({ aoFechar, children }) {
  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Cartão" icone={SquareKanban} largura="7xl">{children}</JanelaFormulario>
  )
}

// Abre a janela do cartão, que vem sob demanda (traz o editor de texto): "Abrindo o cartão…" enquanto chega; se não chegar
// (sem internet, ou o app foi atualizado e a aba é antiga), o aviso com "Tentar de novo" (pede de novo) e "Recarregar a
// página". As props vão para a JanelaDoCartao.
export default function AbrirCartao(props) {
  const [Preguicosa, setPreguicosa] = useState(criarPreguicosa)
  const [tentativa, setTentativa] = useState(0)
  const Janela = carregada ?? Preguicosa
  const fechar = () => props.aoFechar([])

  function tentarDeNovo() {
    setPreguicosa(() => criarPreguicosa())
    setTentativa((n) => n + 1)
  }

  return (
    <LimiteDeErro key={tentativa} reserva={(
      <Reserva aoFechar={fechar}>
        <div className="grid gap-3">
          <p role="alert" className="text-corpo text-destructive">
            Não foi possível abrir o cartão. Confira a internet e tente de novo; se o app acabou de ser atualizado, recarregue
            a página.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={tentarDeNovo}><RotateCcw /> Tentar de novo</Button>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>Recarregar a página</Button>
          </div>
        </div>
      </Reserva>
    )}>
      <Suspense fallback={<Reserva aoFechar={fechar}><GraficoCarregando texto="Abrindo o cartão…" className="py-12" /></Reserva>}>
        <Janela {...props} />
      </Suspense>
    </LimiteDeErro>
  )
}
