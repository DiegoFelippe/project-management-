// Moldura do app: trilho à esquerda, barra fina em cima e o conteúdo num painel rebaixado
// com só o canto superior esquerdo arredondado. No celular (abaixo de md), o trilho dá lugar à barra de baixo (até 5
// itens do papel) e ao ☰ da barra de cima, com o resto do menu, o perfil, o tema e o Sair (auditoria, G7).
// As margens seguras do iPhone (entalhe e barra de gestos; viewport-fit=cover no index.html) ficam por conta dela.
// O check-in aberto de quem está logado vai para o selo da barra de cima, em qualquer tela (auditoria, G2).
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import MinhaFicha from '@/components/usuarios/MinhaFicha'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import BarraDeBaixo from './BarraDeBaixo'
import BarraTopo from './BarraTopo'
import { tituloDaRota } from './menu'
import MenuDoCelular from './MenuDoCelular'
import Trilho from './Trilho'
import { useCheckinAberto } from './useCheckinAberto'

export default function Moldura() {
  const { perfil } = useAuth()
  const [gaveta, setGaveta] = useState(false)
  const [perfilAberto, setPerfilAberto] = useState(false)
  const { pathname } = useLocation()
  const checkin = useCheckinAberto(perfil, pathname)

  useEffect(() => {
    document.title = `${tituloDaRota(pathname)} | IXC Consult`
    document.getElementById('conteudo')?.scrollTo?.({ top: 0 })
  }, [pathname])

  return (
    <div className="flex h-dvh overflow-hidden bg-moldura pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <aside aria-label="Menu principal" className="hidden h-full flex-none md:flex">
        <Trilho />
      </aside>
      <Sheet open={gaveta} onOpenChange={setGaveta}>
        <SheetContent side="left" className="flex-row">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Outras seções, Meu perfil, tema e Sair</SheetDescription>
          <MenuDoCelular aoFechar={() => setGaveta(false)} aoAbrirPerfil={() => setPerfilAberto(true)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <BarraTopo aoAbrirMenu={() => setGaveta(true)} checkin={checkin} />
        <main id="conteudo"
          className="relative min-h-0 flex-1 overflow-y-auto bg-painel shadow-[inset_0_2px_8px_rgb(15_23_42/0.07)] md:rounded-tl-2xl md:border-t md:border-l">
          <div key={pathname.split('/')[1]} className="w-full animate-page-enter p-4 md:p-6">
            <Outlet />
          </div>
        </main>
        <BarraDeBaixo />
      </div>
      {perfilAberto && <MinhaFicha key={perfil.id} aoFechar={() => setPerfilAberto(false)} />}
    </div>
  )
}
