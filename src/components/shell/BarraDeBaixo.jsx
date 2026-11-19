// Menu do celular (auditoria, G7; pedido do Diego, 17/11): no lugar da gaveta com o trilho, uma barra embaixo com até 5
// itens do papel (os mais usados, escolhidos em menu.js) e um toque para trocar de tela. O ícone fica no mesmo quadrado do
// trilho, com a mesma animação, e o item aberto acende no azul. Embaixo, a área segura do iPhone (a barra de gestos).
// O resto do menu, o perfil, o tema e o Sair ficam no ☰ (MenuDoCelular). Some a partir de md, onde o trilho volta.
import { NavLink } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { cn } from '@/lib/utils'
import { itensDaBarraDeBaixo } from './menu'
import { Quadro } from './Trilho'

function Item({ item }) {
  return (
    <NavLink to={item.rota} end={item.rota === '/'} data-item-trilho=""
      className="group flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-1.5 pb-1 outline-none focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-ring">
      {({ isActive }) => (
        <>
          <Quadro icone={item.icone} animacao={item.animacao} aceso={isActive} />
          <span className={cn('max-w-full truncate px-0.5 text-mini leading-tight font-semibold',
            isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>
            {item.rotulo}
          </span>
        </>
      )}
    </NavLink>
  )
}

export default function BarraDeBaixo() {
  const { perfil } = useAuth()
  return (
    <nav aria-label="Menu principal"
      className="flex flex-none border-t bg-moldura px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_-8px_rgb(15_23_42/0.18)] md:hidden">
      {itensDaBarraDeBaixo(perfil.papel).map((item) => <Item key={item.id} item={item} />)}
    </nav>
  )
}
