import { Archive, ArchiveRestore, Building2, Pencil, Plus, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import NavegacaoDoMes from '@/components/comum/NavegacaoDoMes'
import BarraDeFiltros, { AcaoPrincipal, CampoBusca } from '@/components/comum/BarraDeFiltros'
import Cabecalho from '@/components/comum/Cabecalho'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { frase, juntar, useClientesAtivos } from '@/components/clientes/useClientesAtivos'
import NovaConsultoria from '@/components/consultorias/NovaConsultoria'
import EditarConsultoria from '@/components/consultorias/EditarConsultoria'
import { Button } from '@/components/ui/button'
import FichaDoConsultor from '@/components/usuarios/FichaDoConsultor'
import { consultoriasPorOcupacao, definirCarga } from '@/data/capacidade'
import { criarConsultoria, gerenciarConsultoria, listarConsultorias } from '@/data/consultorias'
import { tirarLogo, trocarLogo } from '@/data/imagens'
import { useAuth } from '@/auth/useAuth'
import { POR_PAGINA } from '@/data/paginar'
import { colunasDoMes, formatarHoras, formatarOcupacao } from '@/lib/horas'
import { mesAtual } from '@/lib/mes'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'
import { urlPublica } from '@/lib/imagem'
import { criarAcesso } from '@/data/usuarios'

const ABAS = [{ valor: 'ativas', rotulo: 'Ativas' }, { valor: 'arquivadas', rotulo: 'Arquivadas' }]
const ABA_OCUPACAO = { valor: 'ocupacao', rotulo: 'Ocupação do mês' }
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

export default function Consultorias() {
  const { perfil } = useAuth()
  const abas = veTudo(perfil) ? [...ABAS, ABA_OCUPACAO] : ABAS
  const [mes, setMes] = useState(mesAtual)
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [resultado, setResultado] = useState(null)
  const [pagina, setPagina] = useState(1)
  const [erro, setErro] = useState(null)
  const [nova, setNova] = useState(false)
  const [novoAdminEm, setNovoAdminEm] = useState(null)
  // ?aba=ocupacao abre direto a aba do mês (só quem vê todas as consultorias; os outros caem em Ativas).
  const [parametros] = useSearchParams()
  const [filtro, setFiltro] = useState(() => (parametros.get('aba') === 'ocupacao' && veTudo(perfil) ? 'ocupacao' : 'ativas'))
  const [editando, setEditando] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const emOcupacao = filtro === 'ocupacao'
  const passado = mes < mesAtual()
  const lista = resultado?.itens ?? []
  const total = resultado?.total ?? 0
  // Arquivar: os clientes ativos dela voltam para a central (o banco conta quantos).
  const clientesAtivos = useClientesAtivos(confirmando?.acao === 'arquivar' ? { consultoriaId: confirmando.c.id } : null)
  const sobreOsClientes = frase(clientesAtivos, {
    um: '1 cliente ativo volta para a central (A distribuir) e não volta ao reativar.',
    varios: '{n} clientes ativos voltam para a central (A distribuir) e não voltam ao reativar.',
    semNumero: 'Os clientes ativos dela voltam para a central (A distribuir) e não voltam ao reativar.',
  })

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

  // Uma página por vez, ativas ou arquivadas, filtrada no banco (regra "Escala" no CLAUDE.md).
  useEffect(() => {
    let ativo = true
    // "Ocupação do mês": uma página do resumo por consultoria, calculado no banco.
    const pedido = emOcupacao
      ? consultoriasPorOcupacao({ limite: POR_PAGINA, deslocamento: (pagina - 1) * POR_PAGINA, mes, busca: buscaAtrasada || undefined })
        .then((r) => ({ ...r, foraDaFaixa: r.itens.length === 0 }))
      : listarConsultorias({ arquivadas: filtro === 'arquivadas', pagina })
    pedido
      .then((r) => {
        if (!ativo) return
        if (r.foraDaFaixa && pagina > 1) return setPagina(1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro(emOcupacao ? 'Não foi possível carregar a capacidade.' : 'Não foi possível carregar as consultorias.'))
    return () => {
      ativo = false
    }
  }, [filtro, emOcupacao, mes, buscaAtrasada, pagina, versao])

  async function criar(dados) {
    const resposta = await criarConsultoria(dados)
    if (resposta.consultoriaId) {
      toast.success(`${dados.nome} criada. ${dados.admin.forma === 'convite' ? 'Convite enviado' : 'Acesso criado'} para ${dados.admin.email}.`)
      setNova(false)
      recarregar()
    }
    return resposta
  }

  async function criarAdmin(dados, { carga } = {}) {
    const resposta = await criarAcesso(dados)
    if (resposta.pessoaId && carga !== undefined) {
      const { erro: falha } = await definirCarga(resposta.pessoaId, carga)
      if (falha) toast.error(`O acesso foi criado, mas a carga semanal não foi salva: ${falha}`)
    }
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
        descricao={resultado && !emOcupacao
          ? (filtro === 'ativas' ? plural(total, 'consultoria ativa', 'consultorias ativas') : plural(total, 'consultoria arquivada', 'consultorias arquivadas'))
          : null} />
      <BarraDeFiltros>
        <AbasSegmentadas rotulo="Mostrar" abas={abas} valor={filtro} aoMudar={(valor) => { setFiltro(valor); setPagina(1); setResultado(null) }} />
        {emOcupacao && <NavegacaoDoMes mes={mes} aoMudar={(m) => { setMes(m); setPagina(1); setResultado(null) }} />}
        {emOcupacao && (
          <CampoBusca rotulo="Buscar consultorias" placeholder="Buscar consultoria" valor={busca}
            aoMudar={(texto) => { setBusca(texto); setPagina(1) }} />
        )}
        {!emOcupacao && (
          <AcaoPrincipal>
            <Button onClick={() => setNova(true)}>
              <Plus /> Nova consultoria
            </Button>
          </AcaoPrincipal>
        )}
      </BarraDeFiltros>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && resultado === null && <GraficoCarregando texto="Carregando as consultorias…" className="py-12" />}
      {resultado && lista.length === 0 && (
        <ListaVazia>
          {emOcupacao ? (buscaAtrasada ? 'Nenhuma consultoria encontrada.' : 'Nenhuma consultoria ainda.') : filtro === 'ativas' ? 'Nenhuma consultoria ainda. Cadastre a primeira em "Nova consultoria".' : 'Nenhuma consultoria arquivada.'}
        </ListaVazia>
      )}
      {lista.length > 0 && emOcupacao && (
        <Tabela rotulo="Ocupação do mês" larguraMinima={880}
          colunas={['Consultoria', 'Consultores', ...colunasDoMes(passado), 'Clientes', 'Aguardando']}
          paginacao={{ pagina, total, aoMudar: setPagina }}>
          {lista.map((c) => (
            <Linha key={c.id}>
              <Celula className="font-semibold">{c.nome}</Celula>
              <Celula className="tabular-nums">{c.consultores}</Celula>
              <Celula className="tabular-nums">{formatarHoras(c.capacidade)}</Celula>
              {!passado && <Celula className="tabular-nums">{formatarHoras(c.reservado)}</Celula>}
              <Celula className="tabular-nums">{formatarHoras(c.realizado)}</Celula>
              <Celula className="tabular-nums font-semibold">{formatarOcupacao(c.ocupacao)}</Celula>
              <Celula className="tabular-nums">{c.clientes}</Celula>
              <Celula className="tabular-nums">{c.aguardando}</Celula>
              <CelulaAcoes />
            </Linha>
          ))}
        </Tabela>
      )}
      {lista.length > 0 && !emOcupacao && (
        <Tabela rotulo="Consultorias" colunas={['Consultoria', 'Administração', 'Pessoas', 'Times']} larguraMinima={880}
          paginacao={{ pagina, total, aoMudar: setPagina }}>
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
              <Celula className="text-muted-foreground tabular-nums">{c.pessoas.toLocaleString('pt-BR')}</Celula>
              <Celula className="text-muted-foreground tabular-nums">{c.times.toLocaleString('pt-BR')}</Celula>
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
            ? juntar('Ninguém dela entra mais e ela some das listas. Nada é apagado: pessoas, times e histórico ficam, e dá para reativar depois.', sobreOsClientes)
            : 'As pessoas ativas dela voltam a entrar. Quem foi desativado individualmente continua desativado.'}
          rotuloConfirmar={confirmando.acao === 'arquivar' ? 'Arquivar' : 'Reativar'}
          aoConfirmar={() => gerenciar(confirmando.acao, confirmando.c)} />
      )}
      <NovaConsultoria aberto={nova} aoFechar={() => setNova(false)} aoCriar={criar} />
      {novoAdminEm && (
        <FichaDoConsultor aberto titulo="Novo administrador" perfilDeQuem={{ papel: 'central' }}
          consultoriaId={novoAdminEm} aoFechar={() => setNovoAdminEm(null)} aoCriar={criarAdmin} />
      )}
    </>
  )
}
