import { useCallback, useEffect, useState } from 'react'
import { SquareKanban } from 'lucide-react'
import Seletor from '@/components/campos/Seletor'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import EscolhaForma from '@/components/comum/EscolhaForma'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { criarQuadro, timesParaNovoQuadro } from '@/data/quadros'
import { veTudo } from '@/lib/papeis'

const DE_QUEM = { pessoa: 'Só você vê e mexe neste quadro.', time: 'Os membros e o gestor do time veem e mexem. Renomear, arquivar e apagar ficam com o gestor do time e o administrador.' }

// "Novo quadro" (menu ⋯ da tela Quadros): nome (até 80) e de quem é — "Só eu" ou "Um time" (o time num Seletor que busca
// no banco, times_para_novo_quadro). Central e dono não estão em times: só quadro pessoal, sem a escolha. Quem não está
// em nenhum time vê "Um time" desligado, com a explicação. O quadro nasce com "A fazer", "Em andamento" e "Concluído".
// `aoCriado(id, nome)`: quem chama abre o quadro novo.
export default function JanelaNovoQuadro({ perfil, aoFechar, aoCriado }) {
  const soPessoal = veTudo(perfil)
  const [nome, setNome] = useState('')
  const [dono, setDono] = useState('pessoa')
  const [time, setTime] = useState(null) // { valor, rotulo }
  const [semTimes, setSemTimes] = useState(false)
  const { erro, setErro, enviando, enviar } = useEnvio()

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

  function aoEnviar(evento) {
    evento.preventDefault()
    const limpo = nome.trim()
    if (!limpo) return setErro('Dê um nome ao quadro.')
    const timeId = dono === 'time' ? time?.valor : null
    if (dono === 'time' && !timeId) return setErro('Escolha o time.')
    enviar(async () => {
      const resposta = await criarQuadro({ nome: limpo, timeId })
      if (!resposta.erro) aoCriado(resposta.id, limpo)
      return resposta
    })
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Novo quadro" icone={SquareKanban} enviando={enviando}
      descricao="Já vem com as colunas A fazer, Em andamento e Concluído."
      form="form-novo-quadro" rotuloEnviar="Criar quadro" rotuloEnviando="Criando…">
      <form id="form-novo-quadro" noValidate onSubmit={aoEnviar} className="space-y-5">
        <SecaoFormulario>
          <div className="grid gap-2">
            <Label htmlFor="novo-quadro-nome">Nome</Label>
            <Input id="novo-quadro-nome" className="h-10" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
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
                <div className="grid gap-2">
                  <Label htmlFor="novo-quadro-time">Time</Label>
                  <Seletor id="novo-quadro-time" valor={time?.valor ?? ''} opcoes={time ? [time] : []} buscar={buscarTimes}
                    placeholder="Escolha o time" aoMudar={(_valor, opcao) => setTime(opcao ?? null)} />
                </div>
              )}
            </>
          )}
        </SecaoFormulario>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
