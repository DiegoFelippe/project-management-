import { Download, Menu } from 'lucide-react'
import { useLocation } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { salvarTema } from '@/data/preferencias'
import { urlPublica } from '@/lib/imagem'
import { useInstalar } from '@/pwa/useInstalar'
import BotaoTema from '@/tema/BotaoTema'
import { NOME_DO_PAPEL, tituloDaRota } from './menu'

// Barra fina de cima: onde a pessoa está (logo e nome da consultoria › Times), o tema e o papel dela.
export default function BarraTopo({ aoAbrirMenu }) {
  const { perfil } = useAuth()
  const { pathname } = useLocation()
  const { podeInstalar, instalar } = useInstalar()
  const logo = urlPublica('logos', perfil.consultoria?.logo)
  // a escolha vira o padrão da pessoa (vale em qualquer computador em que ela entrar)
  const guardarNoPerfil = (tema) => salvarTema(perfil.id, tema).catch(() => {})

  return (
    <header className="barra-topo flex h-[52px] flex-none items-center gap-2 px-3 md:px-5">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir o menu" onClick={aoAbrirMenu}>
        <Menu />
      </Button>
      {logo && <img src={logo} alt="" className="size-7 shrink-0 rounded-md border bg-white object-contain p-0.5" />}
      <p className="min-w-0 truncate text-sm text-muted-foreground">
        {perfil.consultoria?.nome ?? 'Plataforma'} <span aria-hidden="true">›</span>{' '}
        <span className="font-semibold text-foreground">{tituloDaRota(pathname)}</span>
      </p>
      {podeInstalar && (
        <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={instalar} aria-label="Instalar app"
          title="Instalar o IXC Consult como aplicativo">
          <Download /> <span className="hidden sm:inline">Instalar app</span>
        </Button>
      )}
      <BotaoTema aoTrocar={guardarNoPerfil} className={podeInstalar ? 'shrink-0' : 'ml-auto shrink-0'} />
      <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
        {NOME_DO_PAPEL[perfil.papel]}
      </span>
    </header>
  )
}
