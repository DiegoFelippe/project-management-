// Quadro em tempo real (Supabase Realtime, canal privado "quadro:<id>"): o banco avisa o que mudou (gatilhos da migração
// 20261117144310_quadro_ao_vivo.sql) e a tela relê o que mudou pelas funções de src/data/quadro.js, que passam pelas
// regras de quem vê. Só entra no canal quem vê o quadro: quem confere é o servidor do Realtime, pela regra do banco.
//
// ouvirQuadro(quadroId, aoMudar) → parar(). aoMudar recebe:
// - { tabela, operacao, cartoes, colunas }: aviso do banco (tabela: quadro_colunas, cartoes, cartao_responsaveis,
//   cartao_checklist, cartao_comentarios ou cartao_anexos; operacao: insert, update ou delete; cartoes e colunas: os ids
//   do que mudou; cartoes nulo = mais de 50, releia as colunas). O aviso nunca traz texto.
// - { tabela: 'clientes', operacao: 'update', acesso: true }: o cliente mudou de consultor, de consultoria ou foi
//   arquivado/reativado. Releia o quadro (pode não vê-lo mais, ou só ler); daqui o canal é conferido de novo.
// - { motivo: 'reconectou' | 'plano_b' | 'sem_acesso' }: releia o quadro todo (o canal voltou depois de cair; o tique do
//   plano B; o servidor recusou o canal).
// O próprio aviso de quem mudou também chega (o banco avisa todos do canal): reler é seguro.
//
// Plano B (desenho, "Tempo real"): sem canal (sem sessão, canal recusado, conexão caída), a tela relê ao voltar para a
// aba e a cada 30 s, e o canal é tentado de novo no mesmo ritmo. Quando o canal volta, o plano B para e a tela relê uma
// vez (pode ter perdido avisos). Com a conexão caída, o realtime-js também tenta voltar sozinho.
//
// Todos que ouvem o mesmo quadro dividem um canal (o realtime-js não abre dois canais com o mesmo tópico). O canal fecha
// um pouco depois que o último para: a tela que sai e volta logo (o StrictMode do React monta duas vezes; a janela do
// cartão que fecha e abre) continua no mesmo canal.
import { supabase } from '@/lib/supabase'

export const INTERVALO_SEM_CANAL = 30_000
export const ESPERA_PARA_FECHAR = 2_000
// "focus" e "visibilitychange" chegam juntos ao voltar para a aba: uma releitura só.
const INTERVALO_MINIMO = 1_000
const EVENTO = 'mudou'
const RECUSADO = /unauthorized|permissions/i

// Por cliente do Supabase (o realtime dele): os canais abertos (quadroId → assinatura) e as saídas em andamento
// (tópico → promessa), para o canal novo de um tópico só abrir depois que o antigo terminou de sair.
const registros = new WeakMap()

function registroDe(realtime) {
  let registro = registros.get(realtime)
  if (!registro) {
    registro = { assinaturas: new Map(), saidas: new Map() }
    registros.set(realtime, registro)
  }
  return registro
}

export function ouvirQuadro(quadroId, aoMudar) {
  if (!quadroId || typeof aoMudar !== 'function') return () => {}
  const realtime = supabase.realtime
  const auth = supabase.auth
  const registro = registroDe(realtime)
  let assinatura = registro.assinaturas.get(quadroId)
  if (!assinatura) {
    assinatura = abrirAssinatura({ realtime, auth, registro, quadroId })
    registro.assinaturas.set(quadroId, assinatura)
  }
  // Cada chamada é um ouvinte (a mesma função duas vezes conta duas).
  const ouvinte = (evento) => aoMudar(evento)
  assinatura.entrar(ouvinte)
  let parado = false
  return function parar() {
    if (parado) return
    parado = true
    assinatura.sair(ouvinte)
  }
}

function abrirAssinatura({ realtime, auth, registro, quadroId }) {
  const topico = `quadro:${quadroId}`
  const ouvintes = new Set()
  let canal = null
  let abrindo = false
  let jaEntrou = false
  let fechada = false
  let relogio = null
  let fechamento = null
  let ultimoTique = 0

  const avisar = (evento) => {
    for (const ouvinte of [...ouvintes]) ouvinte(evento)
  }

  // ── Plano B ──

  function tique() {
    const agora = Date.now()
    if (agora - ultimoTique < INTERVALO_MINIMO) return
    ultimoTique = agora
    avisar({ motivo: 'plano_b' })
    if (!canal) abrirCanal()
  }

  function aoVoltarParaAba() {
    if (document.visibilityState !== 'hidden') tique()
  }

  function ligarPlanoB() {
    if (relogio || fechada) return
    ultimoTique = Date.now()
    relogio = setInterval(tique, INTERVALO_SEM_CANAL)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', tique)
      document.addEventListener('visibilitychange', aoVoltarParaAba)
    }
  }

  function desligarPlanoB() {
    if (!relogio) return
    clearInterval(relogio)
    relogio = null
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', tique)
      document.removeEventListener('visibilitychange', aoVoltarParaAba)
    }
  }

  // ── O canal ──

  async function abrirCanal() {
    if (fechada || canal || abrindo || !ouvintes.size) return
    abrindo = true
    try {
      await registro.saidas.get(topico)
      const { data } = await auth.getSession()
      const token = data?.session?.access_token
      if (fechada || canal || !ouvintes.size) return
      if (!token) {
        ligarPlanoB()
        return
      }
      // O token da sessão antes de entrar: sem ele, o servidor confere o canal como anônimo (e recusa).
      await realtime.setAuth(token)
      if (fechada || canal || !ouvintes.size) return
      const este = realtime.channel(topico, { config: { private: true } })
      canal = este
      este.on('broadcast', { event: EVENTO }, ({ payload }) => {
        if (canal !== este || fechada) return
        avisar(payload)
        // O acesso mudou: entrar de novo faz o servidor conferir outra vez.
        if (payload?.acesso) {
          sairDoCanal()
          abrirCanal()
        }
      })
      este.subscribe((estado, erro) => aoMudarEstado(este, estado, erro))
    } catch {
      ligarPlanoB()
    } finally {
      abrindo = false
    }
  }

  function aoMudarEstado(este, estado, erro) {
    if (canal !== este || fechada) return
    if (estado === 'SUBSCRIBED') {
      const voltou = jaEntrou || relogio !== null
      jaEntrou = true
      desligarPlanoB()
      if (voltou) avisar({ motivo: 'reconectou' })
    } else if (estado === 'CHANNEL_ERROR' && RECUSADO.test(erro?.message ?? '')) {
      // O servidor recusou (quem não vê o quadro): o realtime-js tentaria sem parar; o plano B tenta a cada 30 s.
      sairDoCanal()
      ligarPlanoB()
      avisar({ motivo: 'sem_acesso' })
    } else if (estado === 'CLOSED') {
      // Fechado pelo servidor (o token venceu, por exemplo): o realtime-js não volta sozinho; o plano B abre de novo.
      canal = null
      ligarPlanoB()
    } else {
      // Conexão caída ou demora (CHANNEL_ERROR, TIMED_OUT): o realtime-js tenta de novo; enquanto isso, o plano B.
      ligarPlanoB()
    }
  }

  function sairDoCanal() {
    const este = canal
    if (!este) return
    canal = null
    const saida = realtime.removeChannel(este).catch(() => {})
    registro.saidas.set(topico, saida)
    saida.finally(() => {
      if (registro.saidas.get(topico) === saida) registro.saidas.delete(topico)
    })
  }

  function fechar() {
    fechamento = null
    if (ouvintes.size) return
    fechada = true
    desligarPlanoB()
    sairDoCanal()
    if (registro.assinaturas.get(quadroId) === assinatura) registro.assinaturas.delete(quadroId)
  }

  const assinatura = {
    entrar(ouvinte) {
      ouvintes.add(ouvinte)
      if (fechamento) {
        clearTimeout(fechamento)
        fechamento = null
      }
      abrirCanal()
    },
    sair(ouvinte) {
      ouvintes.delete(ouvinte)
      if (!ouvintes.size && !fechamento) fechamento = setTimeout(fechar, ESPERA_PARA_FECHAR)
    },
  }
  return assinatura
}
