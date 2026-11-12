import { Building2, Plus, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Cabecalho from '@/components/comum/Cabecalho'
import { GraficoCarregando } from '@/components/comum/Carregando'
import NovaConsultoria from '@/components/consultorias/NovaConsultoria'
import { Button } from '@/components/ui/button'
import NovoAcesso from '@/components/usuarios/NovoAcesso'
import { criarConsultoria, listarConsultorias } from '@/data/consultorias'
import { criarAcesso } from '@/data/usuarios'

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

export default function Consultorias() {
  const [consultorias, setConsultorias] = useState(null)
  const [erro, setErro] = useState(null)
  const [nova, setNova] = useState(false)
  const [novoAdminEm, setNovoAdminEm] = useState(null)
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)

  useEffect(() => {
    let ativo = true
    listarConsultorias()
      .then((lista) => {
        if (!ativo) return
        setConsultorias(lista)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar as consultorias.'))
    return () => {
      ativo = false
    }
  }, [versao])

  async function criar(dados) {
    const resposta = await criarConsultoria(dados)
    if (resposta.consultoriaId) {
      toast.success(`${dados.nome} criada. ${dados.admin.forma === 'convite' ? 'Convite enviado' : 'Acesso criado'} para ${dados.admin.email}.`)
      setNova(false)
      recarregar()
    }
    return resposta
  }

  async function criarAdmin(dados) {
    const resposta = await criarAcesso(dados)
    if (resposta.pessoaId) {
      toast.success(`Administrador ${dados.nome} criado.`)
      setNovoAdminEm(null)
      recarregar()
    }
    return resposta
  }

  return (
    <>
      <Cabecalho titulo="Consultorias"
        descricao={consultorias ? plural(consultorias.length, 'consultoria contratou a plataforma', 'consultorias contrataram a plataforma') : null}>
        <Button onClick={() => setNova(true)}>
          <Plus /> Nova consultoria
        </Button>
      </Cabecalho>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && consultorias === null && <GraficoCarregando texto="Carregando as consultorias…" className="py-12" />}
      {consultorias?.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card/60 p-8 text-center text-sm text-muted-foreground">
          Nenhuma consultoria ainda. Cadastre a primeira em "Nova consultoria".
        </div>
      )}
      {consultorias?.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {consultorias.map((c) => (
            <article key={c.id} className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <Building2 className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{c.nome}</h2>
                  <p className="text-xs text-muted-foreground">
                    {plural(c.pessoas, 'pessoa', 'pessoas')} · {plural(c.times, 'time', 'times')}
                  </p>
                </div>
              </div>
              <div className="grid gap-1 text-sm">
                <p className="text-xs font-medium text-muted-foreground">Administração</p>
                {c.admins.length === 0 && <p className="text-muted-foreground">Sem administrador</p>}
                {c.admins.map((a) => (
                  <p key={a.id} className="truncate">
                    {a.nome} <span className="text-muted-foreground">· {a.email}{a.convite_pendente ? ' · convite pendente' : ''}</span>
                  </p>
                ))}
              </div>
              <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setNovoAdminEm(c.id)}>
                <UserPlus /> Novo administrador
              </Button>
            </article>
          ))}
        </div>
      )}
      <NovaConsultoria aberto={nova} aoFechar={() => setNova(false)} aoCriar={criar} />
      <NovoAcesso key={novoAdminEm ?? 'nenhum'} aberto={Boolean(novoAdminEm)} aoFechar={() => setNovoAdminEm(null)}
        papelDeQuemCria="dono" consultoriaId={novoAdminEm} aoCriar={criarAdmin} />
    </>
  )
}
