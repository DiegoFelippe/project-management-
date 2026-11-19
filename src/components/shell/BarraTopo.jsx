import { Download, Menu } from 'lucide-react'
import { useLocation } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { salvarTema } from '@/data/preferencias'
import { urlPublica } from '@/lib/imagem'
import { cn } from '@/lib/utils'
import { useInstalar } from '@/pwa/useInstalar'
import BotaoTema from '@/tema/BotaoTema'
import { NOME_DO_PAPEL, tituloDaRota } from './menu'
import SeloDoCheckin from './SeloDoCheckin'

// Barra fina de cima: onde a pessoa está (logo e nome da consultoria › Times), o tema e o papel dela. No celular, o ☰ abre
// o resto do menu, o perfil, o tema e o Sair (o tema sai daqui: auditoria, G7). Com check-in aberto (`checkin`), o selo
// dele (auditoria, G2); no celular ele fica no lugar do caminho e do papel, que também está no ☰.
export default function BarraTopo({ aoAbrirMenu, checkin = null }) {
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
      <p className={cn('mr-auto min-w-0 truncate text-corpo text-muted-foreground', checkin && 'max-sm:hidden')}>
        {perfil.consultoria?.nome ?? 'Plataforma'} <span aria-hidden="true">›</span>{' '}
        <span className="font-semibold text-foreground">{tituloDaRota(pathname)}</span>
      </p>
      {checkin && <SeloDoCheckin key={checkin.id} aberto={checkin} />}
      {podeInstalar && (
        <Button variant="outline" size="sm" className="shrink-0" onClick={instalar} aria-label="Instalar app"
          title="Instalar o IXC Consult como aplicativo">
          <Download /> <span className="hidden sm:inline">Instalar app</span>
        </Button>
      )}
      <BotaoTema aoTrocar={guardarNoPerfil} className="shrink-0 max-md:hidden" />
      <span className={cn('shrink-0 rounded-full border px-3 py-1 text-rotulo font-medium text-muted-foreground', checkin && 'max-sm:hidden')}>
        {NOME_DO_PAPEL[perfil.papel]}
      </span>
    </header>
  )
}
