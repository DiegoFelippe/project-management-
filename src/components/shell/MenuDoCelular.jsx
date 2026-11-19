// O ☰ do celular (auditoria, G7): abre pela barra de cima e tem o que não coube na barra de baixo — as outras seções do
// papel —, o Meu perfil (a bolinha, que abre a mesma ficha do trilho), o tema e o Sair. Cada linha tem o ícone com a
// animação do trilho (classe `group` e `data-item-trilho`, como lá). Ir a uma seção ou abrir o perfil fecha o menu; trocar
// o tema não (a pessoa vê a troca na hora).
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { salvarTema } from '@/data/preferencias'
import { cn } from '@/lib/utils'
import { NOME_DO_TEMA, useTema } from '@/tema/useTema'
import Logo from './Logo'
import { NOME_DO_PAPEL, itensDoMenuDoCelular } from './menu'
import { Bolinha, Quadro } from './Trilho'

const ICONE_DO_TEMA = { claro: Sun, escuro: Moon, sistema: Monitor }
const LINHA = 'group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring'

function Secao({ item, aoFechar }) {
  return (
    <NavLink to={item.rota} end={item.rota === '/'} onClick={aoFechar} data-item-trilho="" className={LINHA}>
      {({ isActive }) => (
        <>
          <Quadro icone={item.icone} animacao={item.animacao} aceso={isActive} />
          <span className={cn('text-corpo font-semibold', isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>
            {item.rotulo}
          </span>
        </>
      )}
    </NavLink>
  )
}

export default function MenuDoCelular({ aoFechar, aoAbrirPerfil }) {
  const { perfil, sair } = useAuth()
  const navigate = useNavigate()
  // a escolha vira o padrão da pessoa (vale em qualquer computador em que ela entrar), como no botão da barra de cima
  const { tema, trocarTema } = useTema({ aoTrocar: (novo) => salvarTema(perfil.id, novo).catch(() => {}) })
  const outras = itensDoMenuDoCelular(perfil.papel)

  return (
    <div className="flex h-full w-72 max-w-[85vw] flex-col bg-moldura pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <Logo className="size-9" />
        <div className="min-w-0">
          <p className="truncate text-subtitulo font-semibold">{perfil.consultoria?.nome ?? 'IXC Consult'}</p>
          <p className="text-rotulo text-muted-foreground">{NOME_DO_PAPEL[perfil.papel]}</p>
        </div>
      </div>
      {outras.length > 0 && (
        <nav aria-label="Mais seções" className="grid gap-0.5 px-2 py-1">
          {outras.map((item) => <Secao key={item.id} item={item} aoFechar={aoFechar} />)}
        </nav>
      )}
      <div className="mt-auto grid gap-0.5 border-t px-2 pt-2 pb-3">
        <button type="button" data-item-trilho="" className={LINHA} aria-label={`Meu perfil (${perfil.nome})`}
          onClick={() => { aoFechar(); aoAbrirPerfil() }}>
          <span className="grid size-9 place-items-center"><Bolinha perfil={perfil} /></span>
          <span className="min-w-0">
            <span className="block truncate text-corpo font-semibold">{perfil.nome}</span>
            <span className="block truncate text-rotulo text-muted-foreground">Meu perfil</span>
          </span>
        </button>
        <button type="button" data-item-trilho="" className={LINHA} onClick={trocarTema} title="Claro → Escuro → Sistema">
          <Quadro icone={ICONE_DO_TEMA[tema]} animacao="balancar" />
          <span className="text-corpo font-semibold text-muted-foreground group-hover:text-foreground">Tema: {NOME_DO_TEMA[tema]}</span>
        </button>
        <button type="button" data-item-trilho="" className={LINHA} aria-label="Sair da conta"
          onClick={async () => { await sair(); navigate('/entrar', { replace: true }) }}>
          <Quadro icone={LogOut} animacao="sair" perigo />
          <span className="text-corpo font-semibold text-muted-foreground group-hover:text-destructive">Sair</span>
        </button>
      </div>
    </div>
  )
}
