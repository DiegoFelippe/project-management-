// Trilho de ícones (conceito do app de música e do Hub): ícone num quadrado arredondado e o nome
// pequeno embaixo; o item aberto acende no azul. Embaixo, quem está usando e o Sair.
import { LogOut } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { iniciais, primeiroNome } from '@/lib/nomes'
import { cn } from '@/lib/utils'
import Logo from './Logo'
import { itensDoMenu } from './menu'

const rotulo = (aceso) =>
  cn(
    'max-w-[64px] truncate text-[10px] leading-none font-semibold',
    aceso ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
  )

function Quadro({ icone: Icone, aceso, perigo, apagado }) {
  return (
    <span
      className={cn(
        'grid size-9 place-items-center rounded-[11px] transition-[color,background-color,box-shadow] duration-200',
        aceso && 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px] shadow-primary/70',
        !aceso && !perigo && !apagado && 'text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground',
        perigo && 'text-muted-foreground group-hover:bg-destructive/10 group-hover:text-destructive',
        apagado && 'text-muted-foreground/60',
      )}
    >
      <Icone className="size-[18px]" strokeWidth={aceso ? 2.1 : 1.75} />
    </span>
  )
}

function Item({ item, aoNavegar }) {
  return (
    <NavLink to={item.rota} end={item.rota === '/'} title={item.rotulo} onClick={aoNavegar}
      className="group flex w-16 flex-col items-center gap-1 py-0.5 outline-none focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-ring">
      {({ isActive }) => (
        <>
          <Quadro icone={item.icone} aceso={isActive} />
          <span className={rotulo(isActive)}>{item.rotulo}</span>
        </>
      )}
    </NavLink>
  )
}

function ItemEmBreve({ item }) {
  return (
    <div aria-disabled="true" title={`${item.rotulo}: em breve`} className="flex w-16 cursor-default flex-col items-center gap-1 py-0.5">
      <Quadro icone={item.icone} apagado />
      <span className="max-w-[64px] truncate text-[10px] leading-none font-semibold text-muted-foreground/70">{item.rotulo}</span>
      <span className="text-[8px] leading-none font-semibold tracking-wide text-muted-foreground/70 uppercase">em breve</span>
    </div>
  )
}

export default function Trilho({ aoNavegar }) {
  const { perfil, sair } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-full w-[72px] flex-none flex-col bg-moldura">
      <div className="grid h-[56px] flex-none place-items-center">
        <NavLink to="/" onClick={aoNavegar} title="IXC Consult: início" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </NavLink>
      </div>
      <nav aria-label="Seções" className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1.5 [scrollbar-width:none]">
        {itensDoMenu(perfil.papel).map((item) =>
          item.emBreve ? <ItemEmBreve key={item.id} item={item} /> : <Item key={item.id} item={item} aoNavegar={aoNavegar} />,
        )}
      </nav>
      <div className="flex flex-none flex-col items-center gap-1.5 pt-2 pb-3">
        <span aria-hidden="true" className="mb-0.5 h-px w-8 bg-border" />
        <div title={`${perfil.nome} (${perfil.email})`} className="flex w-16 flex-col items-center gap-1 py-0.5">
          <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-[12px] font-bold text-primary ring-1 ring-primary/25">
            {iniciais(perfil.nome)}
          </span>
          <span className={rotulo(false)}>{primeiroNome(perfil.nome)}</span>
        </div>
        <button type="button" title="Sair da conta"
          className="group flex w-16 flex-col items-center gap-1 py-0.5 outline-none focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-ring"
          onClick={async () => { await sair(); navigate('/entrar', { replace: true }) }}>
          <Quadro icone={LogOut} perigo />
          <span className="text-[10px] leading-none font-semibold text-muted-foreground group-hover:text-destructive">Sair</span>
        </button>
      </div>
    </div>
  )
}
