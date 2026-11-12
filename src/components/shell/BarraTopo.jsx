import { Download, Menu } from 'lucide-react'
import { useInstalar } from '@/pwa/useInstalar'
import { useLocation } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { NOME_DO_PAPEL, tituloDaRota } from './menu'

// Barra fina de cima: onde a pessoa está ("Consultoria › Times") e o papel dela.
export default function BarraTopo({ aoAbrirMenu }) {
  const { perfil } = useAuth()
  const { pathname } = useLocation()
  const { podeInstalar, instalar } = useInstalar()

  return (
    <header className="barra-topo flex h-[52px] flex-none items-center gap-2 px-3 md:px-5">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir o menu" onClick={aoAbrirMenu}>
        <Menu />
      </Button>
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
      <span className={`${podeInstalar ? '' : 'ml-auto '}shrink-0 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground`}>
        {NOME_DO_PAPEL[perfil.papel]}
      </span>
    </header>
  )
}
