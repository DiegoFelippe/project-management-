import { Archive, ArchiveRestore, Building2, Pencil, Plus, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import Cabecalho from '@/components/comum/Cabecalho'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import NovaConsultoria from '@/components/consultorias/NovaConsultoria'
import RenomearConsultoria from '@/components/consultorias/RenomearConsultoria'
import { Button } from '@/components/ui/button'
import NovoAcesso from '@/components/usuarios/NovoAcesso'
import { criarConsultoria, gerenciarConsultoria, listarConsultorias } from '@/data/consultorias'
import { criarAcesso } from '@/data/usuarios'

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

export default function Consultorias() {
  const [consultorias, setConsultorias] = useState(null)
  const [erro, setErro] = useState(null)
  const [nova, setNova] = useState(false)
  const [novoAdminEm, setNovoAdminEm] = useState(null)
  const [filtro, setFiltro] = useState('ativas')
  const [renomeando, setRenomeando] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const lista = useMemo(
    () => (consultorias ?? []).filter((c) => (filtro === 'ativas' ? !c.arquivada : c.arquivada)),
    [consultorias, filtro],
  )

  async function gerenciar(acao, c, extra) {
    const resposta = await gerenciarConsultoria(acao, c.id, extra)
    if (!resposta.erro) {
      const feito = { renomear: 'renomeada', arquivar: 'arquivada', reativar: 'reativada' }[acao]
      toast.success(`${extra?.nome ?? c.nome} ${feito}.`)
      recarregar()
    }
    return resposta
  }
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
      <div role="group" aria-label="Mostrar" className="mb-4 inline-flex rounded-lg bg-muted p-1 text-sm font-semibold">
        {[['ativas', 'Ativas'], ['arquivadas', 'Arquivadas']].map(([valor, rotulo]) => (
          <button key={valor} type="button" aria-pressed={filtro === valor} onClick={() => setFiltro(valor)}
            className={`botao-animado rounded-md px-3 py-1 transition-[background-color,color,translate,scale] hover:-translate-y-px active:scale-[0.97] ${filtro === valor ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}>
            {rotulo}
          </button>
        ))}
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && consultorias === null && <GraficoCarregando texto="Carregando as consultorias…" className="py-12" />}
      {consultorias && lista.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card/60 p-8 text-center text-sm text-muted-foreground">
          {filtro === 'ativas' ? 'Nenhuma consultoria ainda. Cadastre a primeira em "Nova consultoria".' : 'Nenhuma consultoria arquivada.'}
        </div>
      )}
      {lista.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {lista.map((c) => (
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
              <div className="flex flex-wrap gap-2">
                {!c.arquivada && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setNovoAdminEm(c.id)}>
                      <UserPlus /> Novo administrador
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRenomeando(c)}>
                      <Pencil /> Renomear
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => setConfirmando({ c, acao: c.arquivada ? 'reativar' : 'arquivar' })}
                  className={c.arquivada ? '' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'}>
                  {c.arquivada ? <><ArchiveRestore /> Reativar</> : <><Archive /> Arquivar</>}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {renomeando && (
        <RenomearConsultoria key={renomeando.id} aberto consultoria={renomeando} aoFechar={() => setRenomeando(null)}
          aoSalvar={(nome) => gerenciar('renomear', renomeando, { nome })} />
      )}
      {confirmando && (
        <ConfirmarAcao aberto aoFechar={() => setConfirmando(null)} perigo={confirmando.acao === 'arquivar'}
          titulo={confirmando.acao === 'arquivar' ? `Arquivar ${confirmando.c.nome}?` : `Reativar ${confirmando.c.nome}?`}
          descricao={confirmando.acao === 'arquivar'
            ? 'Ninguém dela entra mais e ela some das listas. Nada é apagado: pessoas, times e histórico ficam, e dá para reativar depois.'
            : 'As pessoas ativas dela voltam a entrar. Quem foi desativado individualmente continua desativado.'}
          rotuloConfirmar={confirmando.acao === 'arquivar' ? 'Arquivar' : 'Reativar'}
          aoConfirmar={() => gerenciar(confirmando.acao, confirmando.c)} />
      )}
      <NovaConsultoria aberto={nova} aoFechar={() => setNova(false)} aoCriar={criar} />
      <NovoAcesso key={novoAdminEm ?? 'nenhum'} aberto={Boolean(novoAdminEm)} aoFechar={() => setNovoAdminEm(null)}
        papelDeQuemCria="dono" consultoriaId={novoAdminEm} aoCriar={criarAdmin} />
    </>
  )
}
