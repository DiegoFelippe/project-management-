import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ESPERA_PARA_FECHAR,
  ESPERA_PARA_REABRIR,
  INTERVALO_SEM_CANAL,
  JUNTAR_PADRAO,
  juntarAvisos,
  ouvirQuadro,
} from './quadroAoVivo'

// Um Realtime falso por teste: guarda os canais abertos e deixa o teste dizer o que o servidor respondeu.
const falso = vi.hoisted(() => ({ realtime: null, auth: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    get realtime() {
      return falso.realtime
    },
    get auth() {
      return falso.auth
    },
  },
}))

let canais
let ordem

function criarRealtime() {
  canais = []
  ordem = []
  return {
    setAuth: vi.fn(async (token) => {
      ordem.push(`setAuth:${token}`)
    }),
    channel: vi.fn((topico, opcoes) => {
      ordem.push(`channel:${topico}`)
      const canal = {
        topico,
        opcoes,
        ouvintes: [],
        aoEstado: null,
        on(tipo, filtro, cb) {
          this.ouvintes.push({ tipo, filtro, cb })
          return this
        },
        subscribe(cb) {
          this.aoEstado = cb
          return this
        },
        // O que o servidor faz com o canal:
        mandar(payload) {
          for (const o of this.ouvintes) {
            if (o.tipo === 'broadcast' && o.filtro.event === 'mudou') o.cb({ type: 'broadcast', event: 'mudou', payload })
          }
        },
        estado(estado, erro) {
          this.aoEstado(estado, erro)
        },
      }
      canais.push(canal)
      return canal
    }),
    removeChannel: vi.fn(async () => 'ok'),
  }
}

const RECUSA = new Error('Unauthorized: You do not have permissions to read from this Channel topic: quadro:q1')
const AVISO = { tabela: 'cartoes', operacao: 'insert', cartoes: ['k1'], colunas: ['c1'] }
const ACESSO = { tabela: 'clientes', operacao: 'update', acesso: true }
const CONECTOU = { motivo: 'conectou' }
const RECONECTOU = { motivo: 'reconectou' }

// Deixa as promessas do ouvirQuadro (sessão, setAuth) andarem.
const andar = () => vi.advanceTimersByTimeAsync(0)

// Ouve o quadro e já deixa o canal no ar (o "conectou" fica fora da conta).
async function noAr(aoMudar, quadroId = 'q1') {
  const parar = ouvirQuadro(quadroId, aoMudar)
  await andar()
  canais.at(-1).estado('SUBSCRIBED')
  aoMudar.mockClear()
  return parar
}

beforeEach(() => {
  vi.useFakeTimers()
  falso.realtime = criarRealtime()
  falso.auth = { getSession: vi.fn(async () => ({ data: { session: { access_token: 'token-1' } } })) }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ouvirQuadro', () => {
  it('entra no canal privado do quadro com o token da sessão (o token antes do canal)', async () => {
    const parar = ouvirQuadro('q1', vi.fn())
    await andar()
    expect(ordem).toEqual(['setAuth:token-1', 'channel:quadro:q1'])
    expect(falso.realtime.channel).toHaveBeenCalledWith('quadro:q1', { config: { private: true } })
    expect(canais[0].ouvintes).toEqual([expect.objectContaining({ tipo: 'broadcast', filtro: { event: 'mudou' } })])
    parar()
  })

  it('o canal no ar avisa "conectou" (a tela relê uma vez e fecha a janela da primeira leitura); depois, cada aviso', async () => {
    const aoMudar = vi.fn()
    const parar = ouvirQuadro('q1', aoMudar)
    await andar()
    expect(aoMudar).not.toHaveBeenCalled()
    canais[0].estado('SUBSCRIBED')
    expect(aoMudar.mock.calls).toEqual([[CONECTOU]])
    canais[0].mandar(AVISO)
    expect(aoMudar.mock.calls).toEqual([[CONECTOU], [AVISO]])
    parar()
  })

  it('quem passa a ouvir um canal que já está no ar recebe "conectou" logo em seguida (só ele)', async () => {
    const primeiro = vi.fn()
    const pararPrimeiro = await noAr(primeiro)
    const segundo = vi.fn()
    const pararSegundo = ouvirQuadro('q1', segundo)
    expect(segundo).not.toHaveBeenCalled()
    await andar()
    expect(segundo.mock.calls).toEqual([[CONECTOU]])
    expect(primeiro).not.toHaveBeenCalled()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(1)
    pararPrimeiro()
    pararSegundo()
  })

  it('sem quadro, não abre nada', async () => {
    const parar = ouvirQuadro(null, vi.fn())
    await andar()
    expect(falso.realtime.channel).not.toHaveBeenCalled()
    parar()
  })

  it('quem ouve o mesmo quadro divide o canal; o canal fecha um pouco depois que o último para', async () => {
    const primeiro = vi.fn()
    const segundo = vi.fn()
    const pararPrimeiro = ouvirQuadro('q1', primeiro)
    const pararSegundo = ouvirQuadro('q1', segundo)
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(1)
    canais[0].estado('SUBSCRIBED')
    canais[0].mandar(AVISO)
    expect(primeiro.mock.calls).toEqual([[CONECTOU], [AVISO]])
    expect(segundo.mock.calls).toEqual([[CONECTOU], [AVISO]])

    pararPrimeiro()
    pararPrimeiro()
    await vi.advanceTimersByTimeAsync(ESPERA_PARA_FECHAR * 2)
    expect(falso.realtime.removeChannel).not.toHaveBeenCalled()
    canais[0].mandar(AVISO)
    expect(primeiro).toHaveBeenCalledTimes(2)
    expect(segundo).toHaveBeenCalledTimes(3)

    pararSegundo()
    await vi.advanceTimersByTimeAsync(ESPERA_PARA_FECHAR - 1)
    expect(falso.realtime.removeChannel).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(falso.realtime.removeChannel).toHaveBeenCalledWith(canais[0])
  })

  it('a tela que sai e volta logo (o StrictMode monta duas vezes) continua no mesmo canal', async () => {
    const aoMudar = vi.fn()
    ouvirQuadro('q1', aoMudar)()
    const parar = ouvirQuadro('q1', aoMudar)
    await vi.advanceTimersByTimeAsync(ESPERA_PARA_FECHAR * 2)
    expect(falso.realtime.channel).toHaveBeenCalledTimes(1)
    expect(falso.realtime.removeChannel).not.toHaveBeenCalled()
    canais[0].estado('SUBSCRIBED')
    canais[0].mandar(AVISO)
    expect(aoMudar.mock.calls).toEqual([[CONECTOU], [AVISO]])
    parar()
  })

  it('quadros diferentes, canais diferentes', async () => {
    const pararUm = ouvirQuadro('q1', vi.fn())
    const pararOutro = ouvirQuadro('q2', vi.fn())
    await andar()
    expect(canais.map((c) => c.topico)).toEqual(['quadro:q1', 'quadro:q2'])
    pararUm()
    pararOutro()
  })

  it('canal recusado: sai do canal, avisa sem_acesso e cai no plano B (relê e tenta o canal a cada 30 s)', async () => {
    const aoMudar = vi.fn()
    const parar = ouvirQuadro('q1', aoMudar)
    await andar()
    canais[0].estado('CHANNEL_ERROR', RECUSA)
    expect(falso.realtime.removeChannel).toHaveBeenCalledWith(canais[0])
    expect(aoMudar).toHaveBeenCalledWith({ motivo: 'sem_acesso' })

    aoMudar.mockClear()
    await vi.advanceTimersByTimeAsync(INTERVALO_SEM_CANAL - 1)
    expect(aoMudar).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(aoMudar).toHaveBeenCalledWith({ motivo: 'plano_b' })
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(2)

    // O canal entrou no ar pela primeira vez: o plano B para e a tela relê ("conectou").
    aoMudar.mockClear()
    canais[1].estado('SUBSCRIBED')
    expect(aoMudar.mock.calls).toEqual([[CONECTOU]])
    aoMudar.mockClear()
    await vi.advanceTimersByTimeAsync(INTERVALO_SEM_CANAL * 3)
    expect(aoMudar).not.toHaveBeenCalled()
    parar()
  })

  it('conexão caída: o realtime-js tenta de novo sozinho; enquanto isso, plano B (30 s e ao voltar para a aba)', async () => {
    const aoMudar = vi.fn()
    const parar = await noAr(aoMudar)
    canais[0].estado('CHANNEL_ERROR', new Error('error'))
    expect(falso.realtime.removeChannel).not.toHaveBeenCalled()
    expect(aoMudar).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(INTERVALO_SEM_CANAL)
    expect(aoMudar).toHaveBeenCalledWith({ motivo: 'plano_b' })
    expect(falso.realtime.channel).toHaveBeenCalledTimes(1)

    aoMudar.mockClear()
    await vi.advanceTimersByTimeAsync(5000)
    window.dispatchEvent(new Event('focus'))
    expect(aoMudar).toHaveBeenCalledWith({ motivo: 'plano_b' })
    // voltar para a aba dispara "focus" e "visibilitychange": uma releitura só
    document.dispatchEvent(new Event('visibilitychange'))
    expect(aoMudar).toHaveBeenCalledTimes(1)

    aoMudar.mockClear()
    canais[0].estado('SUBSCRIBED')
    expect(aoMudar.mock.calls).toEqual([[RECONECTOU]])
    aoMudar.mockClear()
    await vi.advanceTimersByTimeAsync(INTERVALO_SEM_CANAL * 2)
    window.dispatchEvent(new Event('focus'))
    expect(aoMudar).not.toHaveBeenCalled()
    parar()
  })

  it('TIMED_OUT também liga o plano B', async () => {
    const aoMudar = vi.fn()
    const parar = ouvirQuadro('q1', aoMudar)
    await andar()
    canais[0].estado('TIMED_OUT')
    await vi.advanceTimersByTimeAsync(INTERVALO_SEM_CANAL)
    expect(aoMudar).toHaveBeenCalledWith({ motivo: 'plano_b' })
    parar()
  })

  it('canal fechado pelo servidor (token vencido): abre de novo na hora; fechado de novo em menos de 10 s, espera', async () => {
    const aoMudar = vi.fn()
    const parar = await noAr(aoMudar)
    canais[0].estado('CLOSED')
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(2)
    canais[1].estado('SUBSCRIBED')
    expect(aoMudar.mock.calls).toEqual([[RECONECTOU]])

    // Fechou de novo logo em seguida: nada de laço; o plano B (30 s) abre o próximo.
    aoMudar.mockClear()
    await vi.advanceTimersByTimeAsync(ESPERA_PARA_REABRIR - 1000)
    canais[1].estado('CLOSED')
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(INTERVALO_SEM_CANAL)
    expect(aoMudar).toHaveBeenCalledWith({ motivo: 'plano_b' })
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(3)
    canais[2].estado('SUBSCRIBED')
    expect(aoMudar).toHaveBeenLastCalledWith(RECONECTOU)

    // Passados 10 s da última reabertura, abre na hora de novo.
    canais[2].estado('CLOSED')
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(4)
    parar()
  })

  it('sem sessão: não abre canal, só o plano B', async () => {
    falso.auth.getSession.mockResolvedValue({ data: { session: null } })
    const aoMudar = vi.fn()
    const parar = ouvirQuadro('q1', aoMudar)
    await vi.advanceTimersByTimeAsync(INTERVALO_SEM_CANAL)
    expect(falso.realtime.channel).not.toHaveBeenCalled()
    expect(aoMudar).toHaveBeenCalledWith({ motivo: 'plano_b' })
    parar()
  })

  it('aviso de acesso (o cliente mudou de consultor, de consultoria ou foi arquivado): repassa e entra de novo no canal', async () => {
    const aoMudar = vi.fn()
    const parar = await noAr(aoMudar)
    canais[0].mandar(ACESSO)
    expect(aoMudar).toHaveBeenCalledWith(ACESSO)
    expect(falso.realtime.removeChannel).toHaveBeenCalledWith(canais[0])
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(2)
    // O servidor confere de novo: quem perdeu o acesso é recusado.
    canais[1].estado('CHANNEL_ERROR', RECUSA)
    expect(aoMudar).toHaveBeenCalledWith({ motivo: 'sem_acesso' })
    // Aviso que chegue pelo canal antigo não conta mais.
    aoMudar.mockClear()
    canais[0].mandar(AVISO)
    expect(aoMudar).not.toHaveBeenCalled()
    parar()
  })

  it('quem ainda vê o quadro, depois do aviso de acesso, volta ao canal e relê ("reconectou")', async () => {
    const aoMudar = vi.fn()
    const parar = await noAr(aoMudar)
    canais[0].mandar(ACESSO)
    await andar()
    canais[1].estado('SUBSCRIBED')
    expect(aoMudar.mock.calls).toEqual([[ACESSO], [RECONECTOU]])
    parar()
  })

  it('um ouvinte que dá erro não atrapalha os outros nem a nova conferência do canal', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const quebrado = vi.fn(() => {
      throw new Error('tela quebrou')
    })
    const outro = vi.fn()
    const pararQuebrado = ouvirQuadro('q1', quebrado)
    const pararOutro = ouvirQuadro('q1', outro)
    await andar()
    canais[0].estado('SUBSCRIBED')
    expect(outro).toHaveBeenCalledWith(CONECTOU)
    canais[0].mandar(ACESSO)
    expect(outro).toHaveBeenCalledWith(ACESSO)
    expect(falso.realtime.removeChannel).toHaveBeenCalledWith(canais[0])
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(2)
    expect(erro).toHaveBeenCalled()
    pararQuebrado()
    pararOutro()
  })

  it('canal pela metade (o .on falhou): sai dele e o plano B abre outro no próximo tique', async () => {
    const aoMudar = vi.fn()
    const criar = falso.realtime.channel.getMockImplementation()
    falso.realtime.channel.mockImplementationOnce((...args) => {
      const canal = criar(...args)
      canal.on = () => {
        throw new Error('falhou')
      }
      return canal
    })
    const parar = ouvirQuadro('q1', aoMudar)
    await andar()
    expect(falso.realtime.removeChannel).toHaveBeenCalledWith(canais[0])
    await vi.advanceTimersByTimeAsync(INTERVALO_SEM_CANAL)
    expect(aoMudar).toHaveBeenCalledWith({ motivo: 'plano_b' })
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(2)
    canais[1].estado('SUBSCRIBED')
    expect(aoMudar).toHaveBeenLastCalledWith(CONECTOU)
    parar()
  })

  it('quem passa a ouvir um quadro sem canal (recusado antes) tenta o canal na hora', async () => {
    const parar = ouvirQuadro('q1', vi.fn())
    await andar()
    canais[0].estado('CHANNEL_ERROR', RECUSA)
    const outro = ouvirQuadro('q1', vi.fn())
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(2)
    parar()
    outro()
  })

  it('parar desliga o plano B e tudo o mais', async () => {
    const aoMudar = vi.fn()
    const parar = ouvirQuadro('q1', aoMudar)
    await andar()
    canais[0].estado('TIMED_OUT')
    parar()
    await vi.advanceTimersByTimeAsync(ESPERA_PARA_FECHAR + INTERVALO_SEM_CANAL * 3)
    window.dispatchEvent(new Event('focus'))
    expect(aoMudar).not.toHaveBeenCalled()
    expect(falso.realtime.removeChannel).toHaveBeenCalledWith(canais[0])
    // e o que o servidor mande depois não chega
    canais[0].estado('SUBSCRIBED')
    canais[0].mandar(AVISO)
    expect(aoMudar).not.toHaveBeenCalled()
  })

  it('parar antes de o canal abrir: não abre', async () => {
    const parar = ouvirQuadro('q1', vi.fn())
    parar()
    await vi.advanceTimersByTimeAsync(ESPERA_PARA_FECHAR)
    expect(falso.realtime.channel).not.toHaveBeenCalled()
  })

  it('o canal novo do mesmo quadro só abre depois que o antigo terminou de sair', async () => {
    let terminar
    falso.realtime.removeChannel.mockImplementationOnce(() => new Promise((pronto) => (terminar = pronto)))
    const parar = ouvirQuadro('q1', vi.fn())
    await andar()
    parar()
    await vi.advanceTimersByTimeAsync(ESPERA_PARA_FECHAR)
    expect(falso.realtime.removeChannel).toHaveBeenCalledTimes(1)
    const outro = ouvirQuadro('q1', vi.fn())
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(1)
    terminar('ok')
    await andar()
    expect(falso.realtime.channel).toHaveBeenCalledTimes(2)
    outro()
  })

  it('com { juntarMs }, avisos próximos chegam num resumo só; parar descarta o que esperava', async () => {
    const aoMudar = vi.fn()
    const parar = ouvirQuadro('q1', aoMudar, { juntarMs: 200 })
    await andar()
    canais[0].estado('SUBSCRIBED')
    canais[0].mandar(AVISO)
    expect(aoMudar).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(aoMudar).toHaveBeenCalledTimes(1)
    expect(aoMudar.mock.calls[0][0]).toMatchObject({ eventos: [CONECTOU, AVISO], tudo: true, cartoes: ['k1'] })

    canais[0].mandar(AVISO)
    parar()
    await vi.advanceTimersByTimeAsync(ESPERA_PARA_FECHAR)
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })
})

describe('juntarAvisos', () => {
  it('junta o que chega na janela num resumo: tabelas, colunas e cartões sem repetir', async () => {
    const aoMudar = vi.fn()
    const juntar = juntarAvisos(aoMudar)
    // Um arrastar com renumeração: dois avisos.
    juntar({ tabela: 'cartoes', operacao: 'update', cartoes: ['k1', 'k2'], colunas: ['c1'] })
    juntar({ tabela: 'cartoes', operacao: 'update', cartoes: ['k1'], colunas: ['c1', 'c2'] })
    juntar({ tabela: 'cartao_comentarios', operacao: 'insert', cartoes: ['k3'], colunas: ['c2'] })
    await vi.advanceTimersByTimeAsync(JUNTAR_PADRAO - 1)
    expect(aoMudar).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(aoMudar).toHaveBeenCalledTimes(1)
    expect(aoMudar.mock.calls[0][0]).toEqual({
      eventos: expect.any(Array),
      tudo: false,
      acesso: false,
      tabelas: ['cartoes', 'cartao_comentarios'],
      colunas: ['c1', 'c2'],
      cartoes: ['k1', 'k2', 'k3'],
    })
    expect(aoMudar.mock.calls[0][0].eventos).toHaveLength(3)

    // A próxima janela começa vazia.
    juntar(AVISO)
    await vi.advanceTimersByTimeAsync(JUNTAR_PADRAO)
    expect(aoMudar).toHaveBeenCalledTimes(2)
    expect(aoMudar.mock.calls[1][0]).toMatchObject({ eventos: [AVISO], cartoes: ['k1'], colunas: ['c1'] })
  })

  it('aviso de acesso e motivos pedem reler tudo; aviso sem a lista de cartões deixa cartoes nulo', async () => {
    const aoMudar = vi.fn()
    const juntar = juntarAvisos(aoMudar, 100)
    juntar(ACESSO)
    juntar(RECONECTOU)
    juntar({ tabela: 'cartoes', operacao: 'insert', cartoes: null, colunas: ['c1'] })
    juntar(AVISO)
    await vi.advanceTimersByTimeAsync(100)
    expect(aoMudar.mock.calls[0][0]).toMatchObject({ tudo: true, acesso: true, cartoes: null, colunas: ['c1'] })
  })

  it('cancelar descarta o que esperava', async () => {
    const aoMudar = vi.fn()
    const juntar = juntarAvisos(aoMudar, 100)
    juntar(AVISO)
    juntar.cancelar()
    await vi.advanceTimersByTimeAsync(500)
    expect(aoMudar).not.toHaveBeenCalled()
  })
})
