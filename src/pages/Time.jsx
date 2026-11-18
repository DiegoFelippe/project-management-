import { Pencil, RotateCcw, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Avatar from '@/components/comum/Avatar'
import Cabecalho, { Voltar } from '@/components/comum/Cabecalho'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { AcaoDaLinha, Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { NOME_DO_PAPEL } from '@/components/shell/menu'
import EscolhaDePessoas from '@/components/times/EscolhaDePessoas'
import { useAcoesDoTime } from '@/components/times/useAcoesDoTime'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { buscarPessoas } from '@/data/pessoas'
import { adicionarMembros, buscarTime, idsDosMembros, listarMembros, removerMembro } from '@/data/times'
import { juntar, plural } from '@/lib/nomes'
import { useListaPaginada } from '@/lib/useListaPaginada'

const lerMembros = ({ id, pagina }) => listarMembros(id, { pagina })
const VOLTAR = { caminho: '/times', rotulo: 'Times' }

function Pessoa({ pessoa }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar pessoa={pessoa} className="size-8 text-legenda" />
      <div className="min-w-0">
        <p className="truncate font-semibold">{pessoa.nome}</p>
        {pessoa.email && <p className="truncate text-rotulo text-muted-foreground">{pessoa.email}</p>}
      </div>
    </div>
  )
}

export default function Time() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Vindo do Novo time com pessoas que não entraram: elas já chegam escolhidas em "Colocar pessoas" (usabilidade, U7).
  // Lidas uma vez e tiradas do histórico, para recarregar ou voltar não as escolher de novo.
  const { pathname, state } = useLocation()
  const { perfil } = useAuth()
  const [time, setTime] = useState(undefined)
  const [noTime, setNoTime] = useState(new Set())
  const [escolhidas, setEscolhidas] = useState(() => state?.pessoasQueFaltam ?? [])
  const [ocupado, setOcupado] = useState(false)
  const [versao, setVersao] = useState(0)
  const carregar = () => setVersao((v) => v + 1)
  const acoes = useAcoesDoTime({ perfil, aoMudar: carregar, aoApagar: () => navigate('/times', { replace: true }) })
  const vieramDoNovoTime = Boolean(state?.pessoasQueFaltam)

  useEffect(() => {
    if (vieramDoNovoTime) navigate(pathname, { replace: true, state: null })
  }, [vieramDoNovoTime, navigate, pathname])

  useEffect(() => {
    let ativo = true
    buscarTime(id)
      .then((achado) => ativo && setTime(achado))
      .catch(() => ativo && setTime(null))
    return () => {
      ativo = false
    }
  }, [id, versao])

  // Pessoas do time: uma página por vez, em ordem de nome (regra "Escala" no CLAUDE.md).
  const {
    resultado: membros, erro: erroDosMembros, recarregar: lerMembrosDeNovo, paginacao,
  } = useListaPaginada(lerMembros, { id }, { versao })

  const gerencio = Boolean(time) && acoes.gerencio(time)

  // Para o "Colocar pessoas": só os ids de quem já está (não a lista inteira de membros).
  useEffect(() => {
    if (!gerencio) return
    idsDosMembros(id).then(setNoTime).catch(() => setNoTime(new Set()))
  }, [gerencio, id, versao])

  // Pessoas para o "Colocar pessoas": busca no banco pelo nome, nunca a lista inteira. Quem já está no time e o gestor não
  // são oferecidos de novo.
  const gestorId = time?.gestor_id
  const buscarDisponiveis = useCallback(
    (termo) => buscarPessoas({ consultoriaId: perfil.consultoria_id, termo, excluirIds: [...noTime, gestorId].filter(Boolean) }),
    [perfil.consultoria_id, noTime, gestorId],
  )

  // Várias de uma vez, numa chamada só (entram todas ou nenhuma). Deu certo: aviso e a lista relida; não deu: o aviso diz
  // quem não entrou, e elas continuam escolhidas para tentar de novo.
  async function colocar() {
    if (!escolhidas.length) return
    setOcupado(true)
    const { erro } = await adicionarMembros(time.id, escolhidas.map((p) => p.id))
    setOcupado(false)
    const quem = juntar(escolhidas.map((p) => p.nome))
    if (erro) return toast.error(`${quem} não ${escolhidas.length === 1 ? 'entrou' : 'entraram'} no time: ${erro}`)
    toast.success(`${quem} ${escolhidas.length === 1 ? 'entrou' : 'entraram'} no time.`)
    setEscolhidas([])
    carregar()
  }

  async function tirar(pessoa) {
    setOcupado(true)
    const { erro } = await removerMembro(time.id, pessoa.id)
    setOcupado(false)
    if (erro) return toast.error(erro)
    toast.success(`${pessoa.nome} saiu do time.`)
    carregar()
  }

  if (time === undefined) return <GraficoCarregando texto="Carregando o time…" className="py-12" />
  if (time === null) {
    return (
      <>
        <Voltar para={VOLTAR.caminho}>{VOLTAR.rotulo}</Voltar>
        <p className="text-corpo text-muted-foreground">Esse time não existe ou você não tem acesso a ele.</p>
      </>
    )
  }

  // O gestor também é do time (a lista de times o conta): ele vem na primeira linha da primeira página, com o papel
  // "Gestor do time" e sem "Tirar do time" (auditoria, R8). Se ele também estiver entre os membros, não aparece duas vezes.
  // As contas fecham: a paginação ("1–15 de N") conta as pessoas do time, sem o gestor, e o subtítulo diz "Gestor e N
  // pessoas" (o "N + 1 pessoas" da lista de times).
  const membrosSemGestor = membros?.itens.filter((p) => p.id !== time.gestor_id) ?? []
  const comGestor = Boolean(time.gestor) && paginacao.pagina === 1
  const subtitulo = !membros ? null
    : !time.gestor ? plural(membros.total, 'pessoa', 'pessoas')
      : membros.total === 0 ? 'Só o gestor, por enquanto' : `Gestor e ${plural(membros.total, 'pessoa', 'pessoas')}`

  return (
    <>
      <Cabecalho voltarPara={VOLTAR} titulo={time.nome} descricao={subtitulo}>
        {gerencio && (
          <>
            <Button variant="outline" onClick={() => acoes.editar(time)}>
              <Pencil /> Editar
            </Button>
            <Button variant="outline" onClick={() => acoes.apagar(time)}
              className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
              <Trash2 /> Apagar time
            </Button>
          </>
        )}
      </Cabecalho>
      {acoes.janelas}
      {time.descricao && <p className="-mt-3 mb-5 text-corpo text-muted-foreground">{time.descricao}</p>}

      {gerencio && (
        <div className="mb-5 card grid gap-1.5 p-3">
          <Label htmlFor="colocar-pessoas">Colocar pessoas</Label>
          <EscolhaDePessoas id="colocar-pessoas" escolhidas={escolhidas} aoMudar={setEscolhidas} buscar={buscarDisponiveis}>
            <Button onClick={colocar} disabled={!escolhidas.length || ocupado}>
              <UserPlus /> Colocar no time
            </Button>
          </EscolhaDePessoas>
        </div>
      )}

      {erroDosMembros && (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 text-corpo text-destructive">
          Não foi possível carregar as pessoas do time.
          <Button type="button" variant="outline" onClick={lerMembrosDeNovo}><RotateCcw /> Tentar de novo</Button>
        </div>
      )}
      {!erroDosMembros && membros === null && <GraficoCarregando texto="Carregando as pessoas do time…" className="py-8" />}
      {membros && !comGestor && membrosSemGestor.length === 0 && <ListaVazia>Ninguém no time ainda.</ListaVazia>}
      {membros && (comGestor || membrosSemGestor.length > 0) && (
        <Tabela rotulo="Pessoas do time" colunas={['Nome', 'Papel']} larguraMinima={560} semAcoes={!gerencio} paginacao={paginacao}>
          {comGestor && (
            <Linha>
              <Celula><Pessoa pessoa={time.gestor} /></Celula>
              <Celula className="text-muted-foreground">Gestor do time</Celula>
              {gerencio && <CelulaAcoes><AcaoDaLinha nome="Tirar do time" icone={UserMinus} visivel={false} /></CelulaAcoes>}
            </Linha>
          )}
          {membrosSemGestor.map((p) => (
            <Linha key={p.id}>
              <Celula><Pessoa pessoa={p} /></Celula>
              <Celula className="text-muted-foreground">{NOME_DO_PAPEL[p.papel]}</Celula>
              {gerencio && (
                <CelulaAcoes>
                  <AcaoDaLinha nome="Tirar do time" icone={UserMinus} perigo disabled={ocupado} onClick={() => tirar(p)} />
                </CelulaAcoes>
              )}
            </Linha>
          ))}
        </Tabela>
      )}
    </>
  )
}
