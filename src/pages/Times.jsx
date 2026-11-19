import { Pencil, Plus, Trash2, UserCheck, UserMinus, Users, UsersRound } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Avatar from '@/components/comum/Avatar'
import BarraDeFiltros, { AcaoPrincipal, CampoBusca, NaGaveta } from '@/components/comum/BarraDeFiltros'
import Cabecalho from '@/components/comum/Cabecalho'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import { GraficoCarregando } from '@/components/comum/Carregando'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import { AcaoDaLinha, Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import FormularioDeTime from '@/components/times/FormularioDeTime'
import { useAcoesDoTime } from '@/components/times/useAcoesDoTime'
import { Button } from '@/components/ui/button'
import { indicadoresDeTimes } from '@/data/indicadores'
import { buscarPessoas } from '@/data/pessoas'
import { adicionarMembros, criarTime, listarTimes } from '@/data/times'
import { juntar, plural } from '@/lib/nomes'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'
import { useLeitura } from '@/lib/useLeitura'
import { useListaPaginada } from '@/lib/useListaPaginada'

// Números dos cartões (contados no banco, no recorte de quem vê): seguem a consultoria do filtro, não a busca.
const lerNumeros = ({ consultoriaId }) => indicadoresDeTimes({ consultoriaId })

// Rostos: o gestor e os primeiros membros (amostra que vem do banco); o número é o total contado no banco.
function Rostos({ time }) {
  const visiveis = [time.gestor, ...time.membros.filter((m) => m.id !== time.gestor?.id)].filter(Boolean).slice(0, 4)
  const total = time.totalMembros + (time.gestor ? 1 : 0)
  const resto = total - visiveis.length
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center">
        {visiveis.map((p, i) => (
          <Avatar key={p.id} pessoa={p} className={i ? '-ml-1.5' : ''} />
        ))}
        {resto > 0 && (
          <span className="-ml-1.5 grid size-7 place-items-center rounded-full bg-muted text-mini font-bold text-muted-foreground ring-2 ring-card">
            +{resto > 99 ? '99' : resto}
          </span>
        )}
      </div>
      <span className="text-muted-foreground">{total.toLocaleString('pt-BR')} {total === 1 ? 'pessoa' : 'pessoas'}</span>
    </div>
  )
}

export default function Times() {
  const { perfil } = useAuth()
  const ehDono = veTudo(perfil)
  const navigate = useNavigate()
  const [consultoriaId, setConsultoriaId] = useState(ehDono ? '' : perfil.consultoria_id)
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [novo, setNovo] = useState(false)
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)
  const numeros = useLeitura(lerNumeros, { consultoriaId: consultoriaId || undefined, versao }).dados
  const acoes = useAcoesDoTime({ perfil, aoMudar: recarregar })

  // Uma página por vez, paginada no banco (regra "Escala" no CLAUDE.md); buscar ou trocar a consultoria volta à página 1.
  const { resultado, itens: times, total, erro: falhou, paginacao } = useListaPaginada(listarTimes,
    { consultoriaId: consultoriaId || undefined, busca: buscaAtrasada || undefined }, { versao })
  const erro = falhou ? 'Não foi possível carregar os times.' : null

  // Pessoas para o Novo time: as da consultoria, buscadas no banco pelo nome (o gestor que cria é o gestor, não entra).
  const buscarPessoasDoTime = useCallback((termo, excluirIds) => buscarPessoas({
    consultoriaId: perfil.consultoria_id, termo, excluirIds: perfil.papel === 'gestor' ? [...excluirIds, perfil.id] : excluirIds,
  }), [perfil.consultoria_id, perfil.papel, perfil.id])

  // Criar time com pessoas (usabilidade, U7): o time e, depois, as pessoas numa chamada só (entram todas ou nenhuma). São
  // dois passos no banco: se o time for criado e as pessoas não entrarem, o aviso diz quem ficou de fora e a página do time
  // abre com elas já escolhidas em "Colocar pessoas", para tentar de novo. Criado, a tela abre o time novo.
  async function criar({ pessoas, ...dados }) {
    const resposta = await criarTime({ ...dados, gestorId: dados.gestorId ?? perfil.id, consultoriaId: perfil.consultoria_id })
    if (resposta.erro) return resposta
    const { erro: falha } = await adicionarMembros(resposta.id, pessoas.map((p) => p.id))
    if (falha) {
      const quem = juntar(pessoas.map((p) => p.nome))
      toast.error(`O time ${dados.nome} foi criado, mas ${quem} não ${pessoas.length === 1 ? 'entrou' : 'entraram'} (${falha}). `
        + 'Ficaram escolhidas em "Colocar pessoas", na página do time, para tentar de novo.')
    } else {
      toast.success(pessoas.length ? `Time ${dados.nome} criado com ${plural(pessoas.length, 'pessoa', 'pessoas')}.` : `Time ${dados.nome} criado.`)
    }
    navigate(`/times/${resposta.id}`, { state: falha ? { pessoasQueFaltam: pessoas } : null })
    return { erro: null }
  }

  return (
    <>
      <Cabecalho titulo="Times" descricao={resultado ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'time' : 'times'}` : null} />
      {/* No celular (auditoria, G6), a Consultoria (só a central e o dono a têm) vai para a gaveta; a busca fica. */}
      <BarraDeFiltros ativos={ehDono && consultoriaId ? 1 : 0} aoLimpar={() => setConsultoriaId('')}>
        <CampoBusca rotulo="Buscar times" placeholder="Buscar time" valor={busca} aoMudar={setBusca} />
        {ehDono && <NaGaveta><FiltroConsultoria valor={consultoriaId} aoMudar={setConsultoriaId} /></NaGaveta>}
        {!ehDono && (
          <AcaoPrincipal>
            <Button onClick={() => setNovo(true)}>
              <Plus /> Novo time
            </Button>
          </AcaoPrincipal>
        )}
      </BarraDeFiltros>
      <CartoesDeNumeros rotulo="Indicadores dos times" cartoes={[
        { chave: 'times', rotulo: 'Times', icone: Users, valor: numeros?.times },
        { chave: 'em_times', rotulo: 'Pessoas em times', icone: UserCheck, tom: 'positivo', valor: numeros?.pessoas_em_times },
        { chave: 'sem_time', rotulo: 'Pessoas sem time', icone: UserMinus, tom: 'aviso', valor: numeros?.pessoas_sem_time },
        { chave: 'sem_membros', rotulo: 'Times sem membros', icone: UsersRound, tom: 'neutro', valor: numeros?.times_sem_membros },
      ]} />
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && resultado === null && <GraficoCarregando texto="Carregando os times…" className="py-12" />}
      {times?.length === 0 && (
        <ListaVazia>{buscaAtrasada ? 'Nenhum time encontrado.' : ehDono ? 'Nenhum time por aqui.' : 'Nenhum time ainda. Crie o primeiro em "Novo time".'}</ListaVazia>
      )}
      {times?.length > 0 && (
        <Tabela rotulo="Times" colunas={['Time', 'Gestor', 'Pessoas']} paginacao={paginacao} semAcoes={ehDono}>
          {times.map((t) => (
            <Linha key={t.id}>
              <Celula>
                <Link to={`/times/${t.id}`} className="font-semibold hover:text-primary-texto hover:underline">{t.nome}</Link>
                {t.descricao && <p className="truncate text-rotulo text-muted-foreground">{t.descricao}</p>}
              </Celula>
              <Celula className="text-muted-foreground">{t.gestor?.nome ?? '—'}</Celula>
              <Celula><Rostos time={t} /></Celula>
              {/* O dono só olha: sem a coluna de ações. Nos times de outro gestor, o espaço fica (auditoria, G1). */}
              {!ehDono && (
                <CelulaAcoes>
                  <AcaoDaLinha nome="Editar" icone={Pencil} visivel={acoes.gerencio(t)} onClick={() => acoes.editar(t)} />
                  <AcaoDaLinha nome="Apagar" icone={Trash2} perigo visivel={acoes.gerencio(t)} onClick={() => acoes.apagar(t)} />
                </CelulaAcoes>
              )}
            </Linha>
          ))}
        </Tabela>
      )}
      {acoes.janelas}
      {novo && (
        <FormularioDeTime papel={perfil.papel} buscarGestores={acoes.buscarGestores} buscarPessoas={buscarPessoasDoTime}
          aoFechar={() => setNovo(false)} aoSalvar={criar} />
      )}
    </>
  )
}
