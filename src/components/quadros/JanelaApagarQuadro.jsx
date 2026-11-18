import { useEffect, useState } from 'react'
import { Archive, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import JanelaFormulario, { BotaoCancelar, SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
import { Button } from '@/components/ui/button'
import { quadroPorId } from '@/data/quadro'
import { apagarQuadro } from '@/data/quadros'
import { oQuadro, OQuadro } from './nomeDoQuadro'

const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

// Apagar o quadro (só quem administra): diz o que some junto, contado agora no banco (colunas e cartões, os arquivados
// também, com checklist, comentários e anexos) e oferece Arquivar ao lado, explicando a diferença (regra do CRUD: no
// quadro do time, apagar tira o trabalho do time inteiro). `aoArquivar()` → { erro } (só no quadro aberto; o arquivado
// não tem). Depois de apagar, os anexos saem do armazenamento; o que não sair vira um aviso. `aoApagado()`: quem chama
// sai do quadro (ou relê a lista).
export default function JanelaApagarQuadro({ quadro, aoFechar, aoApagado, aoArquivar }) {
  const [contagem, setContagem] = useState(undefined) // undefined = contando; null = não deu para contar
  const [acao, setAcao] = useState(null) // 'apagar' | 'arquivar'
  const { erro, enviando, enviar } = useEnvio()

  useEffect(() => {
    let vale = true
    quadroPorId(quadro.id)
      .then((q) => {
        if (!vale) return
        const colunas = q?.colunas ?? []
        setContagem(q ? { colunas: colunas.length, cartoes: colunas.reduce((soma, c) => soma + (c.cartoes ?? 0) + (c.arquivados ?? 0), 0) } : null)
      })
      .catch(() => vale && setContagem(null))
    return () => {
      vale = false
    }
  }, [quadro.id])

  function fazer(qual, executar) {
    setAcao(qual)
    enviar(executar)
  }

  const apagar = () => fazer('apagar', async () => {
    const resposta = await apagarQuadro(quadro.id)
    if (resposta.erro) return resposta
    if (resposta.aviso) toast.warning(`${OQuadro(quadro.nome)} apagado, mas: ${resposta.aviso}`)
    else toast.success(`${OQuadro(quadro.nome)} apagado.`)
    aoApagado()
    return resposta
  })

  const arquivar = () => fazer('arquivar', aoArquivar)

  const oQueSome = contagem
    ? `${plural(contagem.colunas, 'coluna', 'colunas')} e ${plural(contagem.cartoes, 'cartão', 'cartões')}, com checklist, comentários e anexos. Não dá para desfazer.`
    : contagem === null
      ? 'Todas as colunas e cartões, com checklist, comentários e anexos. Não dá para desfazer.'
      : 'Contando o que some junto…'

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={`Apagar o ${oQuadro(quadro.nome)}?`} icone={Trash2} enviando={enviando}
      rodape={(
        <>
          <BotaoCancelar />
          {aoArquivar && (
            <Button type="button" variant="outline" onClick={arquivar} disabled={enviando}>
              <Archive /> {enviando && acao === 'arquivar' ? 'Arquivando…' : 'Arquivar'}
            </Button>
          )}
          <Button type="button" variant="destructive" onClick={apagar} disabled={enviando || contagem === undefined}>
            <Trash2 /> {enviando && acao === 'apagar' ? 'Apagando…' : 'Apagar quadro'}
          </Button>
        </>
      )}>
      <SecaoFormulario titulo="Some junto">
        <p className="text-corpo">{oQueSome}</p>
        {quadro.tipo === 'time' && quadro.time && (
          <p className="text-corpo text-muted-foreground">
            É um quadro do time {quadro.time.nome}: apagar tira o trabalho do time inteiro.
          </p>
        )}
        {aoArquivar && (
          <p className="text-corpo text-muted-foreground">
            Arquivar guarda tudo, só para ler, e dá para restaurar depois, em Quadros arquivados.
          </p>
        )}
      </SecaoFormulario>
      {erro && <Aviso>{erro}</Aviso>}
    </JanelaFormulario>
  )
}
