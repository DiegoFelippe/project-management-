import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MENSAGEM_SSO, erroDeRecuperacao, traduzirErroAuth } from '@/lib/erros'
import { EVENTO_CONFERIR_ACESSO, provedorLigado, supabase } from '@/lib/supabase'
import { nivelDaSessao, situacaoDaVerificacao } from '@/lib/verificacao'
import { adotarTemaDoPerfil } from '@/tema/tema'
import { AuthContext } from './useAuth'

const CAMPOS_PERFIL =
  'id, nome, email, foto, cor, papel, consultoria_id, precisa_trocar_senha, exige_2fa, verificacao_desde, telefone, cidade, uf, cargo, data_entrada, carga_semanal, consultoria:consultorias(nome, logo), preferencias(tema)'
// O que pode mudar com a sessão aberta (quem administra exige a verificação ou zera o app): conferido de novo a cada
// tela, ao voltar para a aba e quando algo é recusado. A própria pessoa sempre lê o próprio perfil, mesmo com aal1.
const CAMPOS_DA_VERIFICACAO = 'exige_2fa, verificacao_desde'
const INTERVALO_ENTRE_CONFERENCIAS = 2000

const resultado = (error) => ({ erro: error ? traduzirErroAuth(error) : null })

// Guarda a sessão do Supabase e o perfil (papel, consultoria, senha provisória) de quem entrou, e a situação da
// verificação em duas etapas: 'ok' | 'codigo' (tem o app e a sessão é aal1) | 'configurar' (exigida e sem o app).
export default function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const usuarioAtual = useRef(undefined)
  const conferindo = useRef(false)
  const pendente = useRef(false)
  const agendada = useRef(null)
  const ultimaConferencia = useRef(0)

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

  // Uma conferência por vez e no máximo uma a cada 2 s: a própria consulta recusada não dispara outra. O que chega
  // dentro da janela (ou com uma conferência em andamento) não se perde: fica uma só marcada para o fim da janela.
  const conferirVerificacao = useCallback(async function conferir() {
    const id = usuarioAtual.current
    if (!id) return
    if (conferindo.current) {
      pendente.current = true
      return
    }
    const espera = ultimaConferencia.current + INTERVALO_ENTRE_CONFERENCIAS - Date.now()
    if (espera > 0) {
      agendada.current ??= setTimeout(() => {
        agendada.current = null
        conferir()
      }, espera)
      return
    }
    conferindo.current = true
    ultimaConferencia.current = Date.now()
    try {
      const { data } = await supabase.from('perfis').select(CAMPOS_DA_VERIFICACAO).eq('id', id).maybeSingle()
      if (!data || usuarioAtual.current !== id) return
      setPerfil((atual) => {
        if (!atual || atual.id !== id) return atual
        const mudou = Boolean(atual.exige_2fa) !== Boolean(data.exige_2fa) || (atual.verificacao_desde ?? null) !== (data.verificacao_desde ?? null)
        return mudou ? { ...atual, exige_2fa: data.exige_2fa, verificacao_desde: data.verificacao_desde } : atual
      })
    } finally {
      conferindo.current = false
      if (pendente.current) {
        pendente.current = false
        conferir()
      }
    }
  }, [])

  useEffect(() => {
    const conferir = () => conferirVerificacao()
    const aoVoltar = () => document.visibilityState === 'visible' && conferirVerificacao()
    window.addEventListener(EVENTO_CONFERIR_ACESSO, conferir)
    window.addEventListener('focus', conferir)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.removeEventListener(EVENTO_CONFERIR_ACESSO, conferir)
      window.removeEventListener('focus', conferir)
      document.removeEventListener('visibilitychange', aoVoltar)
      clearTimeout(agendada.current)
      agendada.current = null
    }
  }, [conferirVerificacao])

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

  const verificacao = useMemo(
    () => situacaoDaVerificacao({ perfil, nivel: nivelDaSessao(sessao?.access_token) }),
    [perfil, sessao],
  )

  const valor = useMemo(() => {
    const origem = window.location.origin
    return {
      sessao,
      perfil,
      carregando,
      verificacao,
      conferirVerificacao,
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
  }, [sessao, perfil, carregando, verificacao, conferirVerificacao, carregarPerfil])

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}
