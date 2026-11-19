import { RotateCw } from 'lucide-react'
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import LimiteDeErro from '@/components/comum/LimiteDeErro'
import { Button } from '@/components/ui/button'

// O que aparece no lugar da tela que quebrou: o menu fica, e a tela diz o que fazer. O erro vai para o console.
function TelaQueQuebrou() {
  useEffect(() => {
    console.error('Uma tela quebrou ao mostrar; o detalhe está no erro logo acima.')
  }, [])
  return (
    <section role="alert" className="card grid gap-3 p-6">
      <h1 className="text-janela font-bold">Algo deu errado nesta tela</h1>
      <p className="text-corpo text-muted-foreground">
        O resto do app continua funcionando: use o menu para ir a outra tela. Se acontecer de novo depois de recarregar,
        avise o suporte.
      </p>
      <div>
        <Button onClick={() => window.location.reload()}>
          <RotateCw /> Recarregar a tela
        </Button>
      </div>
    </section>
  )
}

// Envolve as telas da moldura: um erro numa tela (ex.: um dado que não veio do banco) não derruba o app inteiro.
// Pedido do Diego (18/11), depois de o Início ficar em branco. Trocar de endereço recomeça (sai do erro).
export default function TelaComLimite() {
  const { pathname } = useLocation()
  return (
    <LimiteDeErro key={pathname} reserva={<TelaQueQuebrou />}>
      <Outlet />
    </LimiteDeErro>
  )
}
