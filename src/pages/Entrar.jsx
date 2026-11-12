import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import TelaDeAcesso, { Aviso, Titulo } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { codigoDeErroNoEndereco } from '@/lib/endereco'
import { traduzirErroAuth } from '@/lib/erros'

// Só o e-mail fica guardado neste navegador. A senha nunca: quem guarda é o gerenciador de senhas
// do próprio navegador, que oferece salvar porque os campos dizem o que são (username / current-password).
export const CHAVE_EMAIL_LEMBRADO = 'consultoria:email-lembrado'

function lerEmailLembrado() {
  try {
    return localStorage.getItem(CHAVE_EMAIL_LEMBRADO) ?? ''
  } catch {
    return ''
  }
}

function guardarEmail(email, lembrar) {
  try {
    if (lembrar) localStorage.setItem(CHAVE_EMAIL_LEMBRADO, email.trim().toLowerCase())
    else localStorage.removeItem(CHAVE_EMAIL_LEMBRADO)
  } catch {
    // navegador sem armazenamento: só não lembra
  }
}

// O Google (e o SSO) devolvem a pessoa para /entrar; se o Supabase recusou, o motivo vem no endereço.
function erroDoEndereco() {
  const codigo = codigoDeErroNoEndereco()
  return codigo ? traduzirErroAuth({ code: codigo }) : null
}

function IconeGoogle() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-[18px]">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export default function Entrar() {
  const { sessao, perfil, carregando, entrarComSenha, entrarComGoogle, entrarComSso } = useAuth()
  const [email, setEmail] = useState(lerEmailLembrado)
  const [lembrar, setLembrar] = useState(() => Boolean(lerEmailLembrado()))
  const [senha, setSenha] = useState('')
  const [emailSso, setEmailSso] = useState('')
  const [mostrarSso, setMostrarSso] = useState(false)
  const [erro, setErro] = useState(erroDoEndereco)
  const [enviando, setEnviando] = useState(null)

  useEffect(() => {
    if (window.location.hash || window.location.search) window.history.replaceState(null, '', '/entrar')
  }, [])

  if (!carregando && sessao && perfil) return <Navigate to="/" replace />

  async function agir(qual, acao) {
    setErro(null)
    setEnviando(qual)
    const { erro: falha } = await acao()
    if (falha) setErro(falha)
    setEnviando(null)
  }

  return (
    <TelaDeAcesso>
      <Titulo titulo="Entrar">Use o acesso que o seu gestor criou.</Titulo>

      <form noValidate className="grid gap-4" aria-label="Entrar com e-mail"
        onSubmit={(e) => {
          e.preventDefault()
          agir('senha', async () => {
            const resposta = await entrarComSenha(email, senha)
            if (!resposta.erro) guardarEmail(email, lembrar)
            return resposta
          })
        }}>
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="username" autoFocus={!email} className="h-10"
            placeholder="voce@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" name="password" type="password" autoComplete="current-password" autoFocus={Boolean(email)}
            className="h-10" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
            <input type="checkbox" className="size-4 accent-primary" checked={lembrar}
              onChange={(e) => setLembrar(e.target.checked)} />
            Lembrar meu e-mail
          </label>
          <Link to="/esqueci-senha" className="text-sm font-semibold text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        <Button type="submit" size="lg" disabled={enviando !== null}>Entrar</Button>
      </form>

      <p className="my-5 flex items-center gap-3 text-[13px] text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
        ou
      </p>

      <div className="grid gap-2.5">
        <Button type="button" variant="outline" size="lg" disabled={enviando !== null}
          onClick={() => agir('google', entrarComGoogle)}>
          <IconeGoogle /> Entrar com Google
        </Button>
        <Button type="button" variant="outline" size="lg" disabled={enviando !== null} aria-expanded={mostrarSso}
          onClick={() => { setErro(null); setMostrarSso((v) => !v) }}>
          <KeyRound /> Entrar com SSO da empresa
        </Button>
        {mostrarSso && (
          <form noValidate className="grid gap-2 rounded-lg border bg-painel/60 p-3" aria-label="Entrar com SSO"
            onSubmit={(e) => { e.preventDefault(); agir('sso', () => entrarComSso(emailSso)) }}>
            <Label htmlFor="email-sso">E-mail do trabalho</Label>
            <Input id="email-sso" type="email" autoComplete="email" className="h-10 bg-card"
              value={emailSso} onChange={(e) => setEmailSso(e.target.value)} />
            <Button type="submit" disabled={enviando !== null}>Continuar com SSO</Button>
          </form>
        )}
      </div>
    </TelaDeAcesso>
  )
}
