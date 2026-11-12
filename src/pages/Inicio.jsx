import { useAuth } from '@/auth/useAuth'
import GraficoInicio from '@/components/inicio/GraficoInicio'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { primeiroNome } from '@/lib/nomes'

export default function Inicio() {
  const { perfil } = useAuth()
  const onde = perfil.consultoria ? `em ${perfil.consultoria.nome}` : 'da plataforma'

  return (
    <section className="grid gap-2">
      <h1 className="text-2xl font-bold tracking-tight">Olá, {primeiroNome(perfil.nome)}.</h1>
      <p className="text-muted-foreground">{NOME_DO_PAPEL[perfil.papel]} {onde}.</p>
      <div className="mt-4 grid items-center gap-6 overflow-hidden rounded-2xl border bg-card p-5 shadow-xs md:grid-cols-[1fr_minmax(0,1.2fr)] md:p-7">
        <div className="grid gap-2">
          <h2 className="text-lg font-semibold">Seus projetos vão aparecer aqui</h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Os projetos chegam em breve. Por enquanto, use o menu para cuidar dos times e das pessoas.
          </p>
        </div>
        <GraficoInicio className="w-full max-w-2xl justify-self-end" />
      </div>
    </section>
  )
}
