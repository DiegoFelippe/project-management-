import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MENSAGEM_SSO, erroDeRecuperacao, traduzirErroAuth } from '@/lib/erros'
import { provedorLigado, supabase } from '@/lib/supabase'
import { adotarTemaDoPerfil } from '@/tema/tema'
import { AuthContext } from './useAuth'

const CAMPOS_PERFIL =
  'id, nome, email, foto, papel, consultoria_id, precisa_trocar_senha, consultoria:consultorias(nome, logo), preferencias(tema)'

const resultado = (error) => ({ erro: error ? traduzirErroAuth(error) : null })

// Guarda a sessão do Supabase e o perfil (papel, consultoria, senha provisória) de quem entrou.
export default function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const usuarioAtual = useRef(undefined)

  const carregarPerfil = useCallback(async (s) => {
    if (!s) {
      setPerfil(null)
      return
    }
    const { data } = await supabase.from('perfis').select(CAMPOS_PERFIL).eq('id', s.user.id).maybeSingle()
    if (!data) {
      // login sem perfil não usa o sistema
      await supabase.auth.signOut()
      setPerfil(null)
      return
    }
    // o tema salvo no perfil vira o padrão deste navegador
    const preferencias = Array.isArray(data.preferencias) ? data.preferencias[0] : data.preferencias
    adotarTemaDoPerfil(preferencias?.tema)
    setPerfil(data)
  }, [])

  useEffect(() => {
    let ativo = true
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      if (!ativo) return
      setSessao(s)
      // Mesma pessoa (token renovado, voltou para a aba): só atualiza a sessão, sem recarregar o app.
      const id = s?.user?.id ?? null
      if (id === usuarioAtual.current) return
      usuarioAtual.current = id
      setCarregando(true)
      // fora do callback: chamar o Supabase aqui dentro trava o cliente
      setTimeout(async () => {
        await carregarPerfil(s)
        if (ativo) setCarregando(false)
      }, 0)
    })
    return () => {
      ativo = false
      data.subscription.unsubscribe()
    }
  }, [carregarPerfil])

  const valor = useMemo(() => {
    const origem = window.location.origin
    return {
      sessao,
      perfil,
      carregando,
      async entrarComSenha(email, senha) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha })
        return resultado(error)
      },
      async entrarComGoogle() {
        if (!(await provedorLigado('google'))) return resultado({ code: 'provider_disabled' })
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${origem}/entrar` },
        })
        return resultado(error)
      },
      async entrarComSso(email) {
        const dominio = email.trim().toLowerCase().split('@')[1]
        if (!dominio) return { erro: MENSAGEM_SSO }
        const { data, error } = await supabase.auth.signInWithSSO({
          domain: dominio,
          options: { redirectTo: `${origem}/entrar` },
        })
        if (error || !data?.url) return { erro: MENSAGEM_SSO }
        window.location.assign(data.url)
        return { erro: null }
      },
      // Mesma resposta exista ou não o e-mail; só o limite de tentativas aparece.
      async enviarRecuperacao(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: `${origem}/definir-senha`,
        })
        return { erro: erroDeRecuperacao(error) }
      },
      async definirSenha(senha) {
        const { error } = await supabase.auth.updateUser({ password: senha })
        return resultado(error)
      },
      async recarregarPerfil() {
        const { data } = await supabase.auth.getSession()
        await carregarPerfil(data.session)
      },
      async sair() {
        await supabase.auth.signOut()
      },
    }
  }, [sessao, perfil, carregando, carregarPerfil])

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}
