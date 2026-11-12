import { useAuth } from '@/auth/useAuth'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import { primeiroNome } from '@/lib/nomes'

export default function Inicio() {
  const { perfil } = useAuth()
  const onde = perfil.consultoria ? `em ${perfil.consultoria.nome}` : 'da plataforma'

  return (
    <section className="grid gap-2">
      <h1 className="text-2xl font-bold tracking-tight">Olá, {primeiroNome(perfil.nome)}.</h1>
      <p className="text-muted-foreground">{NOME_DO_PAPEL[perfil.papel]} {onde}.</p>
      <div className="mt-4 rounded-xl border bg-card p-5 text-sm text-muted-foreground shadow-xs">
        Os projetos chegam em breve. Por enquanto, use o menu para cuidar dos times e das pessoas.
      </div>
    </section>
  )
}
