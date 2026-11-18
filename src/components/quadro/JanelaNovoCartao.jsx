import { useCallback, useState } from 'react'
import { SquarePlus, X } from 'lucide-react'
import CampoData from '@/components/campos/CampoData'
import Seletor from '@/components/campos/Seletor'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Avatar from '@/components/comum/Avatar'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { criarCartao, pessoasDoQuadro } from '@/data/quadro'
import { atalhosDoPrazo, OPCOES_DE_PRIORIDADE } from './cores'

const PRIORIDADES = [{ valor: '', rotulo: 'Sem prioridade' }, ...OPCOES_DE_PRIORIDADE]

// "Novo cartão" (como no Mochi): título, coluna, prioridade, prazo e responsáveis (quem pode ser responsável no quadro; a
// lista vem do banco). Cria no fim da coluna. `aoCriado(id, colunaId, aviso?)`: o cartão já existe (aviso = um
// responsável que o banco recusou; o cartão abre para corrigir). `aoRecusado()`: o banco recusou o cartão (sem
// permissão, coluna que saiu); a janela mostra o motivo e quem chama relê o quadro.
export default function JanelaNovoCartao({ quadro, colunaId, aoFechar, aoCriado, aoRecusado = () => {} }) {
  const [titulo, setTitulo] = useState('')
  const [coluna, setColuna] = useState(colunaId ?? quadro.colunas[0]?.id ?? '')
  const [prioridade, setPrioridade] = useState('')
  const [prazo, setPrazo] = useState('')
  const [responsaveis, setResponsaveis] = useState([])
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [atalhos] = useState(() => atalhosDoPrazo())

  const buscar = useCallback(async (termo) => {
    const { itens, total } = await pessoasDoQuadro({ quadroId: quadro.id, termo })
    return { itens: itens.map((p) => ({ valor: p.id, rotulo: p.nome, avatar: p })), total }
  }, [quadro.id])

  function incluir(_valor, opcao) {
    const pessoa = opcao?.avatar
    if (pessoa) setResponsaveis((lista) => (lista.some((p) => p.id === pessoa.id) ? lista : [...lista, pessoa]))
  }

  async function enviar(evento) {
    evento.preventDefault()
    if (enviando) return
    if (!titulo.trim()) return setErro('Dê um título ao cartão.')
    setErro(null)
    setEnviando(true)
    const resposta = await criarCartao({
      colunaId: coluna, titulo: titulo.trim(), prioridade: prioridade || null, prazo: prazo || null,
      responsaveis: responsaveis.map((p) => p.id), quadro,
    })
    setEnviando(false)
    if (resposta.erro && !resposta.cartao) {
      setErro(resposta.erro)
      aoRecusado()
      return
    }
    if (resposta.erro) aoCriado(resposta.cartao.id, coluna, resposta.erro)
    else aoCriado(resposta.cartao.id, coluna)
    aoFechar()
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Novo cartão" icone={SquarePlus} largura="lg" enviando={enviando}
      descricao="Entra no fim da coluna. Descrição, checklist e anexos ficam no cartão, depois de criado."
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-novo-cartao" disabled={enviando}>{enviando ? 'Criando…' : 'Criar cartão'}</Button>
        </>
      )}>
      <form id="form-novo-cartao" noValidate onSubmit={enviar} className="space-y-5">
        <SecaoFormulario>
          <div className="grid gap-2">
            <Label htmlFor="novo-cartao-titulo">Título</Label>
            <Input id="novo-cartao-titulo" className="h-10" maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="novo-cartao-coluna">Coluna</Label>
              <Seletor id="novo-cartao-coluna" valor={coluna} aoMudar={setColuna}
                opcoes={quadro.colunas.map((c) => ({ valor: c.id, rotulo: c.nome }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="novo-cartao-prioridade">Prioridade</Label>
              <Seletor id="novo-cartao-prioridade" valor={prioridade} aoMudar={setPrioridade} opcoes={PRIORIDADES} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="novo-cartao-prazo">Prazo</Label>
              <CampoData id="novo-cartao-prazo" valor={prazo} aoMudar={setPrazo} atalhos={atalhos} placeholder="Sem prazo" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="novo-cartao-responsavel">Responsáveis</Label>
              <Seletor id="novo-cartao-responsavel" valor="" aoMudar={incluir} buscar={buscar} placeholder="Adicionar responsável" />
            </div>
          </div>
          {responsaveis.length > 0 && (
            <ul aria-label="Responsáveis escolhidos" className="flex flex-wrap gap-2">
              {responsaveis.map((p) => (
                <li key={p.id} className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pr-1 pl-0.5 text-rotulo">
                  <Avatar pessoa={p} className="size-6 ring-0" />
                  {p.nome}
                  <button type="button" aria-label={`Tirar ${p.nome}`} onClick={() => setResponsaveis((lista) => lista.filter((x) => x.id !== p.id))}
                    className="botao-animado grid size-6 place-items-center rounded-full text-muted-foreground outline-none transition-[color,background-color,translate,scale] hover:-translate-y-px hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97]">
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SecaoFormulario>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
