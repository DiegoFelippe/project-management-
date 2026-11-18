// Trilho de ícones (conceito do app de música e do Hub): ícone num quadrado arredondado e o nome
// pequeno embaixo; o item aberto acende no azul. Embaixo, quem está usando (abre o Meu perfil: a mesma ficha de
// Usuários, no modo próprio) e o Sair.
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import MinhaFicha from '@/components/usuarios/MinhaFicha'
import { corDaPessoa, corDoTextoSobre } from '@/lib/cores'
import { urlPublica } from '@/lib/imagem'
import { iniciais, primeiroNome } from '@/lib/nomes'
import { cn } from '@/lib/utils'
import Logo from './Logo'
import { itensDoMenu } from './menu'

// O nome que não cabe em 64 px quebra em duas linhas (com hífen do português e pelo menos 5 letras de cada lado:
// "Consul-torias", não "Consultori-as"), sem mudar a letra e sem reticências (auditoria, R3).
const rotulo = (aceso) =>
  cn(
    'line-clamp-2 max-w-[64px] text-center text-mini leading-tight font-semibold hyphens-auto [hyphenate-limit-chars:auto_5_5] [overflow-wrap:anywhere]',
    aceso ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
  )

function Quadro({ icone: Icone, animacao, aceso, perigo }) {
  return (
    <span
      className={cn(
        'grid size-9 place-items-center rounded-[11px] transition-[color,background-color,box-shadow] duration-200',
        aceso && 'bg-primary-cheio text-primary-foreground shadow-[0_6px_16px_-6px] shadow-primary/70',
        !aceso && !perigo && 'text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground',
        perigo && 'text-muted-foreground group-hover:bg-destructive/10 group-hover:text-destructive',
      )}
    >
      <Icone className={cn('size-[18px]', `anim-${animacao}`)} strokeWidth={aceso ? 2.1 : 1.75} />
    </span>
  )
}

function Item({ item, aoNavegar }) {
  return (
    <NavLink to={item.rota} end={item.rota === '/'} title={item.rotulo} onClick={aoNavegar} data-item-trilho=""
      className="group flex w-16 flex-col items-center gap-1 py-0.5 outline-none focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-ring">
      {({ isActive }) => (
        <>
          <Quadro icone={item.icone} animacao={item.animacao} aceso={isActive} />
          <span className={rotulo(isActive)}>{item.rotulo}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Trilho({ aoNavegar }) {
  const { perfil, sair } = useAuth()
  const navigate = useNavigate()
  const [perfilAberto, setPerfilAberto] = useState(false)
  const foto = urlPublica('fotos', perfil.foto)
  const cor = corDaPessoa(perfil)

  return (
    <div className="trilho flex h-full w-[72px] flex-none flex-col bg-moldura">
      <div className="grid h-[56px] flex-none place-items-center">
        <NavLink to="/" onClick={aoNavegar} title="IXC Consult: início" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </NavLink>
      </div>
      <nav aria-label="Seções" className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1.5 [scrollbar-width:none]">
        {itensDoMenu(perfil.papel).map((item) => <Item key={item.id} item={item} aoNavegar={aoNavegar} />)}
      </nav>
      <div className="flex flex-none flex-col items-center gap-1.5 pt-2 pb-3">
        <span aria-hidden="true" className="mb-0.5 h-px w-8 bg-border" />
        <button type="button" title={`Meu perfil: ${perfil.nome} (${perfil.email})`} aria-label={`Meu perfil (${perfil.nome})`}
          data-item-trilho="" onClick={() => setPerfilAberto(true)}
          className="group flex w-16 flex-col items-center gap-1 py-0.5 outline-none focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-ring">
          <span style={foto ? undefined : { backgroundColor: cor, color: corDoTextoSobre(cor) }}
            className={cn('anim-pulsar grid size-8 place-items-center overflow-hidden rounded-full text-rotulo font-bold ring-1 ring-primary/25 transition-shadow group-hover:ring-2 group-hover:ring-primary/50', foto && 'bg-primary/10 text-primary-texto')}>
            {foto ? <img src={foto} alt="" className="size-full object-cover" /> : iniciais(perfil.nome)}
          </span>
          <span className={rotulo(false)}>{primeiroNome(perfil.nome)}</span>
        </button>
        <button type="button" title="Sair da conta" data-item-trilho=""
          className="group flex w-16 flex-col items-center gap-1 py-0.5 outline-none focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-ring"
          onClick={async () => { await sair(); navigate('/entrar', { replace: true }) }}>
          <Quadro icone={LogOut} animacao="sair" perigo />
          <span className="text-mini leading-none font-semibold text-muted-foreground group-hover:text-destructive">Sair</span>
        </button>
      </div>
      {perfilAberto && <MinhaFicha key={perfil.id} aoFechar={() => setPerfilAberto(false)} />}
    </div>
  )
}
