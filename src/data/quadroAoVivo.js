// Quadro em tempo real (Supabase Realtime, canal privado "quadro:<id>"): o banco avisa o que mudou (gatilhos da migração
// 20261117144310_quadro_ao_vivo.sql) e a tela relê o que mudou pelas funções de src/data/quadro.js, que passam pelas
// regras de quem vê. Só entra no canal quem vê o quadro: quem confere é o servidor do Realtime, pela regra do banco.
//
// ouvirQuadro(quadroId, aoMudar, { juntarMs }) → parar(). aoMudar recebe:
// - { motivo: 'conectou' }: o canal está no ar para este ouvinte (uma vez, quando entra; se o canal já estava no ar, logo
//   em seguida). Releia o quadro uma vez: fecha a janela entre a primeira leitura e a entrada no canal (de ~20 ms a
//   alguns segundos), em que um aviso pode ter se perdido.
// - { tabela, operacao, cartoes, colunas }: aviso do banco (tabela: quadro_colunas, cartoes, cartao_responsaveis,
//   cartao_checklist, cartao_comentarios ou cartao_anexos; operacao: insert, update ou delete; cartoes e colunas: os ids
//   do que mudou; cartoes nulo = mais de 50, releia as colunas). O aviso nunca traz texto.
// - { tabela: 'clientes', operacao: 'update', acesso: true }: o cliente mudou de consultor, de consultoria ou foi
//   arquivado/reativado. Releia o quadro (pode não vê-lo mais, ou só ler); o canal já está sendo conferido de novo.
// - { motivo: 'reconectou' | 'plano_b' | 'sem_acesso' }: releia o quadro todo (o canal voltou depois de cair ou de ser
//   conferido de novo; o tique do plano B; o servidor recusou o canal).
// O próprio aviso de quem mudou também chega (o banco avisa todos do canal): reler é seguro.
// Com { juntarMs }, aoMudar recebe o resumo de juntarAvisos (abaixo) em vez de cada aviso.
//
// Plano B (desenho, "Tempo real"): sem canal (sem sessão, canal recusado, conexão caída), a tela relê ao voltar para a
// aba e a cada 30 s, e o canal é tentado de novo no mesmo ritmo. Quando o canal volta, o plano B para e a tela relê uma
// vez (pode ter perdido avisos). Com a conexão caída, o realtime-js também tenta voltar sozinho; com o canal fechado
// pelo servidor (o token venceu, por exemplo), o canal é aberto de novo na hora (no máximo uma vez a cada 10 s; depois,
// no ritmo do plano B).
//
// Todos que ouvem o mesmo quadro dividem um canal (o realtime-js não abre dois canais com o mesmo tópico). O canal fecha
// um pouco depois que o último para: a tela que sai e volta logo (o StrictMode do React monta duas vezes; a janela do
// cartão que fecha e abre) continua no mesmo canal. Um ouvinte que dá erro não atrapalha os outros.
import { supabase } from '@/lib/supabase'

export const INTERVALO_SEM_CANAL = 30_000
export const ESPERA_PARA_FECHAR = 2_000
export const ESPERA_PARA_REABRIR = 10_000
export const JUNTAR_PADRAO = 300
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

// Chama o ouvinte sem deixar o erro dele atrapalhar os outros (nem o canal).
function chamar(ouvinte, evento) {
  try {
    ouvinte(evento)
  } catch (erro) {
    console.error('ouvirQuadro: erro de quem ouve o quadro', erro)
  }
}

// Junta os avisos que chegam perto um do outro (um arrastar com renumeração manda dois; o aviso de acesso vem seguido
// do "reconectou") numa releitura só. Devolve a função para passar ao ouvirQuadro, com .cancelar() (descarta o que
// estiver esperando). Depois de `ms` do primeiro aviso, aoMudar recebe o resumo:
// { eventos (na ordem), tudo (algum motivo ou aviso de acesso: releia o quadro todo), acesso, tabelas, colunas (ids),
//   cartoes (ids; nulo se algum aviso veio sem a lista) }.
export function juntarAvisos(aoMudar, ms = JUNTAR_PADRAO) {
  let eventos = []
  let relogio = null

  function entregar() {
    relogio = null
    const juntos = eventos
    eventos = []
    if (juntos.length) chamar(aoMudar, resumir(juntos))
  }

  function juntar(evento) {
    eventos.push(evento)
    if (!relogio) relogio = setTimeout(entregar, ms)
  }
  juntar.cancelar = () => {
    if (relogio) clearTimeout(relogio)
    relogio = null
    eventos = []
  }
  return juntar
}

function resumir(eventos) {
  const tabelas = new Set()
  const colunas = new Set()
  let cartoes = new Set()
  let tudo = false
  let acesso = false
  for (const evento of eventos) {
    if (evento?.motivo) tudo = true
    if (evento?.acesso) {
      tudo = true
      acesso = true
    }
    if (evento?.tabela) tabelas.add(evento.tabela)
    for (const id of evento?.colunas ?? []) colunas.add(id)
    if (evento?.tabela && evento.cartoes === null) cartoes = null
    else if (cartoes) for (const id of evento?.cartoes ?? []) cartoes.add(id)
  }
  return {
    eventos,
    tudo,
    acesso,
    tabelas: [...tabelas],
    colunas: [...colunas],
    cartoes: cartoes ? [...cartoes] : null,
  }
}

export function ouvirQuadro(quadroId, aoMudar, { juntarMs } = {}) {
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
  const destino = juntarMs ? juntarAvisos(aoMudar, juntarMs) : aoMudar
  const ouvinte = (evento) => destino(evento)
  assinatura.entrar(ouvinte)
  let parado = false
  return function parar() {
    if (parado) return
    parado = true
    assinatura.sair(ouvinte)
    if (juntarMs) destino.cancelar()
  }
}

function abrirAssinatura({ realtime, auth, registro, quadroId }) {
  const topico = `quadro:${quadroId}`
  const ouvintes = new Set()
  // Ouvintes que já receberam "conectou" (os outros recebem "conectou" quando o canal entra no ar).
  const conectados = new WeakSet()
  let canal = null
  let aoVivo = false
  let abrindo = false
  let fechada = false
  let relogio = null
  let fechamento = null
  let ultimoTique = 0
  let ultimaReabertura = -Infinity

  const avisar = (evento) => {
    for (const ouvinte of [...ouvintes]) chamar(ouvinte, evento)
  }

  // O canal entrou no ar: "conectou" para quem ainda não recebeu, "reconectou" para quem já estava.
  function avisarConexao() {
    for (const ouvinte of [...ouvintes]) {
      if (conectados.has(ouvinte)) {
        chamar(ouvinte, { motivo: 'reconectou' })
      } else {
        conectados.add(ouvinte)
        chamar(ouvinte, { motivo: 'conectou' })
      }
    }
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
        // O acesso mudou: sair e entrar de novo faz o servidor conferir outra vez (antes de avisar, para nenhum
        // ouvinte atrapalhar).
        if (payload?.acesso) {
          sairDoCanal()
          abrirCanal()
        }
        avisar(payload)
      })
      este.subscribe((estado, erro) => aoMudarEstado(este, estado, erro))
    } catch {
      // Canal pela metade (o .on ou o .subscribe falharam): sai dele, para o plano B abrir outro no próximo tique.
      sairDoCanal()
      ligarPlanoB()
    } finally {
      abrindo = false
    }
  }

  function aoMudarEstado(este, estado, erro) {
    if (canal !== este || fechada) return
    if (estado === 'SUBSCRIBED') {
      aoVivo = true
      desligarPlanoB()
      avisarConexao()
      return
    }
    aoVivo = false
    if (estado === 'CHANNEL_ERROR' && RECUSADO.test(erro?.message ?? '')) {
      // O servidor recusou (quem não vê o quadro): o realtime-js tentaria sem parar; o plano B tenta a cada 30 s.
      sairDoCanal()
      ligarPlanoB()
      avisar({ motivo: 'sem_acesso' })
    } else if (estado === 'CLOSED') {
      // Fechado pelo servidor (o token venceu, por exemplo): o realtime-js não volta sozinho. Abre de novo na hora (com
      // a sessão de agora), no máximo uma vez a cada 10 s; o plano B fica de reserva.
      canal = null
      ligarPlanoB()
      const agora = Date.now()
      if (agora - ultimaReabertura >= ESPERA_PARA_REABRIR) {
        ultimaReabertura = agora
        abrirCanal()
      }
    } else {
      // Conexão caída ou demora (CHANNEL_ERROR, TIMED_OUT): o realtime-js tenta de novo; enquanto isso, o plano B.
      ligarPlanoB()
    }
  }

  function sairDoCanal() {
    const este = canal
    if (!este) return
    canal = null
    aoVivo = false
    let saida
    try {
      saida = Promise.resolve(realtime.removeChannel(este)).catch(() => {})
    } catch {
      saida = Promise.resolve()
    }
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
      if (aoVivo) {
        // O canal já está no ar: "conectou" logo em seguida, só para este ouvinte.
        queueMicrotask(() => {
          if (!ouvintes.has(ouvinte) || !aoVivo || conectados.has(ouvinte)) return
          conectados.add(ouvinte)
          chamar(ouvinte, { motivo: 'conectou' })
        })
      } else {
        abrirCanal()
      }
    },
    sair(ouvinte) {
      ouvintes.delete(ouvinte)
      if (!ouvintes.size && !fechamento) fechamento = setTimeout(fechar, ESPERA_PARA_FECHAR)
    },
  }
  return assinatura
}
