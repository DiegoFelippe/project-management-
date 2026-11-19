import { useCallback, useEffect, useState } from 'react'
import { SquareKanban } from 'lucide-react'
import Campo from '@/components/campos/Campo'
import Seletor from '@/components/campos/Seletor'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import EscolhaForma from '@/components/comum/EscolhaForma'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { useEnvio } from '@/components/comum/useEnvio'
import { Input } from '@/components/ui/input'
import { criarQuadro, timesParaNovoQuadro } from '@/data/quadros'
import { veTudo } from '@/lib/papeis'

const DE_QUEM = { pessoa: 'Só você vê e mexe neste quadro.', time: 'Os membros e o gestor do time veem e mexem. Renomear, arquivar e apagar ficam com o gestor do time e o administrador.' }

// "Novo quadro" (menu ⋯ da tela Quadros): nome (até 80) e de quem é — "Só eu" ou "Um time" (o time num Seletor que busca
// no banco, times_para_novo_quadro). Central e dono não estão em times: só quadro pessoal, sem a escolha. Quem não está
// em nenhum time vê "Um time" desligado, com a explicação. O quadro nasce com "A fazer", "Em andamento" e "Concluído".
// `aoCriado(id, nome)`: quem chama abre o quadro novo. Os erros ficam embaixo de cada campo, todos de uma vez, e fechar
// com algo digitado pergunta antes (usabilidade, U2 e U4).
export default function JanelaNovoQuadro({ perfil, aoFechar, aoCriado }) {
  const soPessoal = veTudo(perfil)
  const [nome, setNome] = useState('')
  const [dono, setDono] = useState('pessoa')
  const [time, setTime] = useState(null) // { valor, rotulo }
  const [semTimes, setSemTimes] = useState(false)
  const { erro, erros, tentativa, conferir, enviando, enviar } = useEnvio(undefined, { validar: errosDoQuadro })
  const alterado = useAlterado({ nome, dono, time: time?.valor ?? null })

  // Está em algum time? (só para desligar "Um time" com a explicação; a lista vem do banco ao abrir o Seletor)
  useEffect(() => {
    if (soPessoal) return undefined
    let vale = true
    timesParaNovoQuadro({ limite: 1 })
      .then(({ total }) => vale && setSemTimes(total === 0))
      .catch(() => {})
    return () => {
      vale = false
    }
  }, [soPessoal])

  const buscarTimes = useCallback(async (termo) => {
    const { itens, total } = await timesParaNovoQuadro({ termo })
    return { itens: itens.map((t) => ({ valor: t.id, rotulo: t.nome })), total }
  }, [])

  function errosDoQuadro() {
    const achados = {}
    if (!nome.trim()) achados.nome = 'Dê um nome ao quadro.'
    if (dono === 'time' && !time?.valor) achados.time = 'Escolha o time.'
    return achados
  }

  function aoEnviar(evento) {
    evento.preventDefault()
    const limpo = nome.trim()
    const timeId = dono === 'time' ? time?.valor : null
    if (!conferir()) return
    enviar(async () => {
      const resposta = await criarQuadro({ nome: limpo, timeId })
      if (!resposta.erro) aoCriado(resposta.id, limpo)
      return resposta
    })
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Novo quadro" icone={SquareKanban} enviando={enviando} tentativa={tentativa} alterado={alterado}
      descricao="Já vem com as colunas A fazer, Em andamento e Concluído."
      form="form-novo-quadro" rotuloEnviar="Criar quadro" rotuloEnviando="Criando…">
      <form id="form-novo-quadro" noValidate onSubmit={aoEnviar} className="space-y-5">
        <SecaoFormulario>
          <Campo id="novo-quadro-nome" rotulo="Nome" erro={erros.nome}>
            <Input id="novo-quadro-nome" className="h-10" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
        </SecaoFormulario>
        <SecaoFormulario titulo="De quem é">
          {soPessoal ? (
            <p className="text-rotulo text-muted-foreground">Quadro pessoal: só você vê.</p>
          ) : (
            <>
              <EscolhaForma nome="dono-do-quadro" rotulo="De quem é o quadro" valor={dono} aoMudar={setDono}
                opcoes={[{ valor: 'pessoa', rotulo: 'Só eu' }, { valor: 'time', rotulo: 'Um time', desabilitada: semTimes }]} />
              <p className="text-rotulo text-muted-foreground">
                {semTimes ? 'Você não está em nenhum time: por enquanto, só quadros pessoais.' : DE_QUEM[dono]}
              </p>
              {dono === 'time' && (
                <Campo id="novo-quadro-time" rotulo="Time" erro={erros.time}>
                  <Seletor id="novo-quadro-time" valor={time?.valor ?? ''} opcoes={time ? [time] : []} buscar={buscarTimes}
                    placeholder="Escolha o time" aoMudar={(_valor, opcao) => setTime(opcao ?? null)} />
                </Campo>
              )}
            </>
          )}
        </SecaoFormulario>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
