// Moldura do app: trilho à esquerda, barra fina em cima e o conteúdo num painel rebaixado
// com só o canto superior esquerdo arredondado. No celular, o trilho vira uma gaveta.
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import BarraTopo from './BarraTopo'
import { tituloDaRota } from './menu'
import Trilho from './Trilho'

export default function Moldura() {
  const [gaveta, setGaveta] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = `${tituloDaRota(pathname)} | IXC Consult`
    document.getElementById('conteudo')?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="flex h-dvh overflow-hidden bg-moldura">
      <aside aria-label="Menu principal" className="hidden h-full flex-none md:flex">
        <Trilho />
      </aside>
      <Sheet open={gaveta} onOpenChange={setGaveta}>
        <SheetContent side="left" className="flex-row">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Seções da Consultoria</SheetDescription>
          <Trilho aoNavegar={() => setGaveta(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <BarraTopo aoAbrirMenu={() => setGaveta(true)} />
        <main id="conteudo"
          className="relative min-h-0 flex-1 overflow-y-auto bg-painel shadow-[inset_0_2px_8px_rgb(15_23_42/0.07)] md:rounded-tl-2xl md:border-t md:border-l">
          <div key={pathname.split('/')[1]} className="mx-auto w-full max-w-[1400px] animate-page-enter p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
