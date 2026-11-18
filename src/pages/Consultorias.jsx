import { Archive, ArchiveRestore, Building2, Gauge, Pencil, Plus, RadioTower, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import NavegacaoDoMes from '@/components/comum/NavegacaoDoMes'
import BarraDeFiltros, { AcaoPrincipal, CampoBusca, NaGaveta } from '@/components/comum/BarraDeFiltros'
import Cabecalho from '@/components/comum/Cabecalho'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { AcaoDaLinha, Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { frase, juntar, useClientesAtivos } from '@/components/clientes/useClientesAtivos'
import NovaConsultoria from '@/components/consultorias/NovaConsultoria'
import EditarConsultoria from '@/components/consultorias/EditarConsultoria'
import { Button } from '@/components/ui/button'
import FichaDoConsultor from '@/components/usuarios/FichaDoConsultor'
import { consultoriasPorOcupacao, definirCarga } from '@/data/capacidade'
import { criarConsultoria, gerenciarConsultoria, listarConsultorias } from '@/data/consultorias'
import { indicadoresDeConsultorias } from '@/data/indicadores'
import { tirarLogo, trocarLogo } from '@/data/imagens'
import { useAuth } from '@/auth/useAuth'
import { POR_PAGINA } from '@/data/paginar'
import { colunasDoMes, formatarHoras, formatarOcupacao } from '@/lib/horas'
import { mesAtual, rotuloCurto } from '@/lib/mes'
import { veTudo } from '@/lib/papeis'
import { useAtraso } from '@/lib/useAtraso'
import { useLeitura } from '@/lib/useLeitura'
import { useListaPaginada } from '@/lib/useListaPaginada'
import { urlPublica } from '@/lib/imagem'
import { criarAcesso } from '@/data/usuarios'

const ABAS = [{ valor: 'ativas', rotulo: 'Ativas' }, { valor: 'arquivadas', rotulo: 'Arquivadas' }]
const ABA_OCUPACAO = { valor: 'ocupacao', rotulo: 'Ocupação do mês' }
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

// Cartões da plataforma (só quem vê todas; contados no banco): seguem o mês da aba Ocupação; as abas e a busca, não.
const lerNumeros = ({ mes }) => indicadoresDeConsultorias({ mes })
// A lista de cada aba, uma página por vez, filtrada no banco (regra "Escala" no CLAUDE.md). "Ocupação do mês": uma página
// do resumo por consultoria, calculado no banco.
const lerConsultorias = ({ filtro, mes, busca, pagina }) => (filtro === 'ocupacao'
  ? consultoriasPorOcupacao({ limite: POR_PAGINA, deslocamento: (pagina - 1) * POR_PAGINA, mes, busca })
    .then((r) => ({ ...r, foraDaFaixa: r.itens.length === 0 }))
  : listarConsultorias({ arquivadas: filtro === 'arquivadas', pagina }))
// "Consultorias ativas" leva à aba Ativas (usabilidade, U5: a lista é exatamente essas); os outros ficam só número.
const cartoesDoMes = (n, passado, mes, { irParaAtivas, filtro } = {}) => [
  { chave: 'ativas', rotulo: 'Consultorias ativas', icone: Building2, valor: n?.consultorias_ativas,
    ...(irParaAtivas && { destino: irParaAtivas, ativo: filtro === 'ativas' }) },
  { chave: 'clientes', rotulo: 'Clientes ativos', icone: RadioTower, tom: 'positivo', valor: n?.clientes_ativos },
  { chave: 'consultores', rotulo: 'Consultores', icone: Users, tom: 'ceu', valor: n?.consultores },
  { chave: 'ocupacao', rotulo: passado ? 'Utilização média do mês' : 'Ocupação média do mês', icone: Gauge, tom: 'aviso',
    valor: n ? formatarOcupacao(n.ocupacao_media) : null, detalhe: `média por consultoria · ${rotuloCurto(mes)}` },
]

export default function Consultorias() {
  const { perfil } = useAuth()
  const abas = veTudo(perfil) ? [...ABAS, ABA_OCUPACAO] : ABAS
  // ?mes=AAAA-MM-01 (vindo do painel do Início) só vale para quem vê a aba de ocupação; mês inválido cai no atual.
  const [parametros] = useSearchParams()
  const [mes, setMes] = useState(() => {
    const pedido = parametros.get('mes')
    return veTudo(perfil) && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(pedido ?? '') ? pedido : mesAtual()
  })
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [nova, setNova] = useState(false)
  const [novoAdminEm, setNovoAdminEm] = useState(null)
  // ?aba=ocupacao abre direto a aba do mês (só quem vê todas as consultorias; os outros caem em Ativas).
  const [filtro, setFiltro] = useState(() => (parametros.get('aba') === 'ocupacao' && veTudo(perfil) ? 'ocupacao' : 'ativas'))
  const [editando, setEditando] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const emOcupacao = filtro === 'ocupacao'
  const passado = mes < mesAtual()
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)
  const numeros = useLeitura(lerNumeros, veTudo(perfil) ? { mes, versao } : null).dados
  // Trocar de aba ou de mês mostra o carregando (as colunas e os números mudam); a busca mantém a lista até chegar a nova.
  const { resultado, total, erro: falhou, paginacao } = useListaPaginada(lerConsultorias,
    { filtro, mes: emOcupacao ? mes : undefined, busca: emOcupacao ? buscaAtrasada || undefined : undefined },
    { versao, limparAoMudar: ['filtro', 'mes'] })
  const erro = falhou ? (emOcupacao ? 'Não foi possível carregar a capacidade.' : 'Não foi possível carregar as consultorias.') : null
  const lista = resultado?.itens ?? []
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
      {/* No celular (auditoria, G6), as abas trocam a tela (a Ocupação do mês é outra tabela) e ficam à vista; o mês vai
          para a gaveta. */}
      <BarraDeFiltros ativos={emOcupacao && mes !== mesAtual() ? 1 : 0} aoLimpar={() => setMes(mesAtual())}>
        <AbasSegmentadas rotulo="Mostrar" abas={abas} valor={filtro} aoMudar={setFiltro} />
        {emOcupacao && <NaGaveta><NavegacaoDoMes mes={mes} aoMudar={setMes} /></NaGaveta>}
        {emOcupacao && (
          <CampoBusca rotulo="Buscar consultorias" placeholder="Buscar consultoria" valor={busca}
            aoMudar={setBusca} />
        )}
        {!emOcupacao && (
          <AcaoPrincipal>
            <Button onClick={() => setNova(true)}>
              <Plus /> Nova consultoria
            </Button>
          </AcaoPrincipal>
        )}
      </BarraDeFiltros>
      {veTudo(perfil) && (
        <CartoesDeNumeros rotulo="Indicadores das consultorias"
          cartoes={cartoesDoMes(numeros, numeros ? numeros.passado : passado, mes, { irParaAtivas: () => setFiltro('ativas'), filtro })} />
      )}
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && resultado === null && <GraficoCarregando texto="Carregando as consultorias…" className="py-12" />}
      {resultado && lista.length === 0 && (
        <ListaVazia>
          {emOcupacao ? (buscaAtrasada ? 'Nenhuma consultoria encontrada.' : 'Nenhuma consultoria ainda.') : filtro === 'ativas' ? 'Nenhuma consultoria ainda. Cadastre a primeira em "Nova consultoria".' : 'Nenhuma consultoria arquivada.'}
        </ListaVazia>
      )}
      {lista.length > 0 && emOcupacao && (
        <Tabela rotulo="Ocupação do mês" larguraMinima={880} semAcoes
          colunas={['Consultoria', 'Consultores', ...colunasDoMes(passado), 'Clientes', 'Aguardando']}
          paginacao={paginacao}>
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
            </Linha>
          ))}
        </Tabela>
      )}
      {lista.length > 0 && !emOcupacao && (
        <Tabela rotulo="Consultorias" colunas={['Consultoria', 'Administração', 'Pessoas', 'Times']} larguraMinima={880}
          paginacao={paginacao}>
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
                    <span className="text-rotulo text-muted-foreground">· {a.email}{a.convite_pendente ? ' · convite pendente' : ''}</span>
                  </p>
                ))}
              </Celula>
              <Celula className="text-muted-foreground tabular-nums">{c.pessoas.toLocaleString('pt-BR')}</Celula>
              <Celula className="text-muted-foreground tabular-nums">{c.times.toLocaleString('pt-BR')}</Celula>
              <CelulaAcoes>
                <AcaoDaLinha nome="Editar" icone={Pencil} visivel={!c.arquivada} onClick={() => setEditando(c)} />
                <AcaoDaLinha nome="Novo administrador" icone={UserPlus} visivel={!c.arquivada} onClick={() => setNovoAdminEm(c.id)} />
                <AcaoDaLinha nome={c.arquivada ? 'Reativar' : 'Arquivar'} icone={c.arquivada ? ArchiveRestore : Archive} perigo={!c.arquivada}
                  onClick={() => setConfirmando({ c, acao: c.arquivada ? 'reativar' : 'arquivar' })} />
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
