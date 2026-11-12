import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import Cabecalho from '@/components/comum/Cabecalho'
import { GraficoCarregando } from '@/components/comum/Carregando'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import CartaoTime from '@/components/times/CartaoTime'
import NovoTime from '@/components/times/NovoTime'
import { Button } from '@/components/ui/button'
import { listarPessoas } from '@/data/pessoas'
import { criarTime, listarTimes } from '@/data/times'

function resumo(times) {
  const pessoas = new Set()
  for (const t of times) {
    if (t.gestor) pessoas.add(t.gestor.id)
    for (const m of t.membros) pessoas.add(m.id)
  }
  const nTimes = `${times.length} ${times.length === 1 ? 'time' : 'times'}`
  return `${nTimes} · ${pessoas.size} ${pessoas.size === 1 ? 'pessoa' : 'pessoas'}`
}

export default function Times() {
  const { perfil } = useAuth()
  const ehDono = perfil.papel === 'dono'
  const [consultoriaId, setConsultoriaId] = useState(ehDono ? '' : perfil.consultoria_id)
  const [times, setTimes] = useState(null)
  const [erro, setErro] = useState(null)
  const [novo, setNovo] = useState(false)
  const [gestores, setGestores] = useState([])
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)

  useEffect(() => {
    let ativo = true
    listarTimes({ consultoriaId: consultoriaId || undefined })
      .then((lista) => {
        if (!ativo) return
        setTimes(lista)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os times.'))
    return () => {
      ativo = false
    }
  }, [consultoriaId, versao])

  useEffect(() => {
    if (perfil.papel !== 'admin') return
    listarPessoas({ consultoriaId: perfil.consultoria_id, papeis: ['gestor', 'admin'] })
      .then(setGestores)
      .catch(() => setGestores([]))
  }, [perfil.papel, perfil.consultoria_id])

  async function criar(dados) {
    const resposta = await criarTime({
      ...dados,
      gestorId: dados.gestorId ?? perfil.id,
      consultoriaId: perfil.consultoria_id,
    })
    if (resposta.erro) return resposta
    toast.success(`Time ${dados.nome} criado.`)
    setNovo(false)
    recarregar()
    return resposta
  }

  return (
    <>
      <Cabecalho titulo="Times" descricao={times ? resumo(times) : null}>
        {!ehDono && (
          <Button onClick={() => setNovo(true)}>
            <Plus /> Novo time
          </Button>
        )}
      </Cabecalho>
      {ehDono && <FiltroConsultoria valor={consultoriaId} aoMudar={setConsultoriaId} />}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && times === null && <GraficoCarregando texto="Carregando os times…" className="py-12" />}
      {times?.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card/60 p-8 text-center text-sm text-muted-foreground">
          {ehDono ? 'Nenhum time por aqui.' : 'Nenhum time ainda. Crie o primeiro em "Novo time".'}
        </div>
      )}
      {times?.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {times.map((t) => (
            <CartaoTime key={t.id} time={t} />
          ))}
        </div>
      )}
      <NovoTime aberto={novo} aoFechar={() => setNovo(false)} papelDeQuemCria={perfil.papel}
        gestores={gestores} aoCriar={criar} />
    </>
  )
}
