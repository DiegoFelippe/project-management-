import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Seletor from '@/components/campos/Seletor'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const contar = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

function quantos(coluna) {
  const arquivados = coluna.arquivados ?? 0
  const todos = (coluna.cartoes ?? 0) + arquivados
  return `A coluna tem ${contar(todos, 'cartão', 'cartões')}${arquivados ? ` (${contar(arquivados, 'arquivado', 'arquivados')})` : ''}.`
}

// Apagar coluna (só a gestão; a última coluna do quadro não se apaga). Com cartões (arquivados também), nada some sem a
// escolha explícita: mover para outra coluna (a anterior por padrão; a seguinte, se for a primeira) ou apagar os cartões
// junto, dizendo quantos e com o quê. Coluna vazia: só ela some. `colunas`: as do quadro, com as contagens
// (quadro_do_cliente). `aoApagar(opcoes)` recebe { destinoId } | { apagarCartoes: true } | {} e devolve { erro }.
export default function ApagarColuna({ coluna, colunas, aoFechar, aoApagar }) {
  const indice = colunas.findIndex((c) => c.id === coluna.id)
  const outras = colunas.filter((c) => c.id !== coluna.id)
  const [escolha, setEscolha] = useState('mover')
  const [destino, setDestino] = useState((colunas[indice - 1] ?? colunas[indice + 1])?.id ?? '')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const todos = (coluna.cartoes ?? 0) + (coluna.arquivados ?? 0)

  async function enviar(evento) {
    evento.preventDefault()
    if (enviando) return
    setErro(null)
    setEnviando(true)
    const opcoes = todos === 0 ? {} : escolha === 'mover' ? { destinoId: destino } : { apagarCartoes: true }
    const resposta = await aoApagar(opcoes)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={`Apagar a coluna ${coluna.nome}?`} icone={Trash2}
      descricao="Apagar não se desfaz." enviando={enviando}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-apagar-coluna" variant="destructive" disabled={enviando}>
            {enviando ? 'Apagando…' : 'Apagar coluna'}
          </Button>
        </>
      )}>
      <form id="form-apagar-coluna" noValidate onSubmit={enviar} className="space-y-5">
        {todos === 0 ? (
          <p className="text-corpo text-muted-foreground">A coluna está vazia; só ela some.</p>
        ) : (
          <>
            <p className="text-corpo">{quantos(coluna)} O que fazer com eles?</p>
            <AbasSegmentadas rotulo="O que fazer com os cartões" valor={escolha} aoMudar={setEscolha}
              abas={[{ valor: 'mover', rotulo: 'Mover para outra coluna' }, { valor: 'apagar', rotulo: 'Apagar os cartões junto' }]} />
            {escolha === 'mover' ? (
              <div className="grid gap-2">
                <Label htmlFor="apagar-coluna-destino">Para qual coluna</Label>
                <Seletor id="apagar-coluna-destino" valor={destino} aoMudar={setDestino}
                  opcoes={outras.map((c) => ({ valor: c.id, rotulo: c.nome }))} />
                <p className="text-rotulo text-muted-foreground">Os cartões vão para o fim dessa coluna, na mesma ordem (os arquivados também).</p>
              </div>
            ) : (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-corpo text-destructive">
                {todos === 1 ? 'O cartão some' : `Os ${todos.toLocaleString('pt-BR')} cartões somem`} de vez, com checklist, comentários e anexos.
              </p>
            )}
          </>
        )}
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
