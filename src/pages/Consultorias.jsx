import { Archive, ArchiveRestore, Building2, Pencil, Plus, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import Cabecalho from '@/components/comum/Cabecalho'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import NovaConsultoria from '@/components/consultorias/NovaConsultoria'
import EditarConsultoria from '@/components/consultorias/EditarConsultoria'
import { Button } from '@/components/ui/button'
import NovoAcesso from '@/components/usuarios/NovoAcesso'
import { criarConsultoria, gerenciarConsultoria, listarConsultorias } from '@/data/consultorias'
import { tirarLogo, trocarLogo } from '@/data/imagens'
import { urlPublica } from '@/lib/imagem'
import { criarAcesso } from '@/data/usuarios'

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

export default function Consultorias() {
  const [consultorias, setConsultorias] = useState(null)
  const [erro, setErro] = useState(null)
  const [nova, setNova] = useState(false)
  const [novoAdminEm, setNovoAdminEm] = useState(null)
  const [filtro, setFiltro] = useState('ativas')
  const [editando, setEditando] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const lista = useMemo(
    () => (consultorias ?? []).filter((c) => (filtro === 'ativas' ? !c.arquivada : c.arquivada)),
    [consultorias, filtro],
  )

  async function gerenciar(acao, c, extra) {
    const resposta = await gerenciarConsultoria(acao, c.id, extra)
    if (!resposta.erro) {
      const feito = { arquivar: 'arquivada', reativar: 'reativada' }[acao]
      toast.success(`${extra?.nome ?? c.nome} ${feito}.`)
      recarregar()
    }
    return resposta
  }
  async function salvarEdicao(c, { nome, logo }) {
    if (nome !== c.nome) {
      const resposta = await gerenciarConsultoria('renomear', c.id, { nome })
      if (resposta.erro) return resposta
    }
    if (logo?.arquivo || logo?.tirar) {
      const resposta = logo.arquivo ? await trocarLogo(c.id, logo.arquivo, c.logo) : await tirarLogo(c.id, c.logo)
      if (resposta.erro) return resposta
    }
    toast.success(`${nome} atualizada.`)
    recarregar()
    return { erro: null }
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
        <ListaVazia>
          {filtro === 'ativas' ? 'Nenhuma consultoria ainda. Cadastre a primeira em "Nova consultoria".' : 'Nenhuma consultoria arquivada.'}
        </ListaVazia>
      )}
      {lista.length > 0 && (
        <Tabela rotulo="Consultorias" colunas={['Consultoria', 'Administração', 'Pessoas', 'Times']} larguraMinima={880}>
          {lista.map((c) => (
            <Linha key={c.id}>
              <Celula>
                <div className="flex items-center gap-3">
                  {c.logo
                    ? <img src={urlPublica('logos', c.logo)} alt="" loading="lazy" className="size-8 shrink-0 rounded-lg border bg-white object-contain p-0.5" />
                    : (
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                        <Building2 className="size-4" />
                      </span>
                    )}
                  <span className="truncate font-semibold">{c.nome}</span>
                </div>
              </Celula>
              <Celula>
                {c.admins.length === 0 && <span className="text-muted-foreground">Sem administrador</span>}
                {c.admins.map((a) => (
                  <p key={a.id} className="truncate">
                    <span>{a.nome}</span>{' '}
                    <span className="text-xs text-muted-foreground">· {a.email}{a.convite_pendente ? ' · convite pendente' : ''}</span>
                  </p>
                ))}
              </Celula>
              <Celula className="text-muted-foreground tabular-nums">{c.pessoas}</Celula>
              <Celula className="text-muted-foreground tabular-nums">{c.times}</Celula>
              <CelulaAcoes>
                {!c.arquivada && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setNovoAdminEm(c.id)}>
                      <UserPlus /> Novo administrador
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditando(c)}>
                      <Pencil /> Editar
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => setConfirmando({ c, acao: c.arquivada ? 'reativar' : 'arquivar' })}
                  className={c.arquivada ? '' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'}>
                  {c.arquivada ? <><ArchiveRestore /> Reativar</> : <><Archive /> Arquivar</>}
                </Button>
              </CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
      {editando && (
        <EditarConsultoria key={editando.id} aberto consultoria={editando} aoFechar={() => setEditando(null)}
          aoSalvar={(dados) => salvarEdicao(editando, dados)} />
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
