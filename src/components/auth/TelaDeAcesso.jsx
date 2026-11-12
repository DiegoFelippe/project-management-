import { useEffect } from 'react'
import Logo from '@/components/shell/Logo'

// Telas fora da moldura (entrar, senha): arte à esquerda e o conteúdo à direita.
// No celular, a arte vira uma faixa em cima.
export default function TelaDeAcesso({ children }) {
  return (
    <div className="grid min-h-dvh bg-moldura md:grid-cols-2">
      <aside className="flex flex-col justify-between gap-6 bg-painel bg-[radial-gradient(120%_90%_at_0%_0%,rgb(37_99_235/0.16),transparent_60%)] px-6 py-6 md:px-10 md:py-10">
        <Logo />
        <div>
          <h2 className="text-xl leading-tight font-bold text-balance md:text-3xl">
            Projetos, times e pessoas no mesmo lugar.
          </h2>
          <p className="mt-3 hidden text-muted-foreground md:block">
            Cada gestor acompanha o próprio time. O administrador vê a consultoria inteira.
          </p>
        </div>
      </aside>
      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  )
}

export function Titulo({ titulo, children }) {
  useEffect(() => {
    document.title = `${titulo} | Consultoria`
  }, [titulo])
  return (
    <div className="mb-6 grid gap-1.5">
      <h1 className="text-3xl font-bold tracking-tight">{titulo}</h1>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}

export function Aviso({ children, tipo = 'erro' }) {
  const cores =
    tipo === 'erro'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : 'border-primary/25 bg-primary/5 text-foreground'
  return (
    <p role={tipo === 'erro' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm text-pretty ${cores}`}>
      {children}
    </p>
  )
}
