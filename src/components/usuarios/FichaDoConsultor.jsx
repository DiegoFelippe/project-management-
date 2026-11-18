import { AtSign, CheckCircle2, KeyRound, MailCheck, Pencil, Power, RotateCcw, RotateCcwKey, Send, ShieldAlert, ShieldCheck, ShieldOff, Smartphone, UserPlus, UserRound, UserX, User } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Caixa from '@/components/campos/Caixa'
import CampoData from '@/components/campos/CampoData'
import CampoNumero from '@/components/campos/CampoNumero'
import CampoSenha from '@/components/campos/CampoSenha'
import CartaoChave from '@/components/campos/CartaoChave'
import { avaliarSenha } from '@/lib/senha'
import Seletor from '@/components/campos/Seletor'
import { GerirAusencias } from '@/components/capacidade/GerirAusencias'
import { lerHoras } from '@/components/clientes/rotulos'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import CampoImagem from '@/components/comum/CampoImagem'
import JanelaFormulario, { CartaoDaSecao, SecaoFormulario } from '@/components/comum/JanelaFormulario'
import SeletorDeCor from '@/components/comum/SeletorDeCor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import VerificacaoDoPerfil from '@/components/verificacao/VerificacaoDoPerfil'
import { corDe } from '@/lib/cores'
import { formatarHoras } from '@/lib/horas'
import { urlPublica } from '@/lib/imagem'
import { hoje } from '@/lib/mes'
import { iniciais } from '@/lib/nomes'
import { TIPOS_DE_CONSULTORIA } from '@/lib/tiposDeConsultoria'
import { UFS } from '@/lib/ufs'
import { ehPapelDeConsultoria, papeisQuePodeDar, rotuloDoPapel, veTudo } from '@/lib/papeis'
import { situacao } from '@/lib/situacao'
import { situacaoNaFicha } from '@/lib/verificacao'
import { cn } from '@/lib/utils'

const CARGA_PADRAO = 44
const CAMPOS_DE_TEXTO = ['cargo', 'telefone', 'cidade', 'uf', 'data_entrada']
const CAMPOS_DE_CONTATO = ['telefone', 'cidade', 'uf']

// Em que aba aparece o erro de cada campo (ponto vermelho na aba) e qual campo recebe o foco ao pular para ela.
const ABA_DO_ERRO = { nome: 'dados', email: 'dados', data_entrada: 'dados', consultoria: 'dados', carga: 'dados', senha: 'acesso', repetida: 'acesso' }
const CAMPO_DO_ERRO = {
  nome: 'ficha-nome', email: 'ficha-email', data_entrada: 'ficha-entrada', consultoria: 'ficha-consultoria', carga: 'ficha-carga',
  senha: 'ficha-senha', repetida: 'ficha-senha-repetida',
}

const OPCOES_DE_UF = UFS.map((uf) => ({ valor: uf, rotulo: uf }))
const comoTexto = (valor) => String(valor ?? '')

const Bloco = SecaoFormulario

function Campo({ id, rotulo, erro, children }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro && <p className="text-rotulo text-destructive">{erro}</p>}
    </div>
  )
}

function EscolhaDeTimes({ times, marcados, aoAlternar, aviso }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-corpo font-medium">Times</legend>
      {times.length === 0 && aviso && <p className="text-rotulo text-muted-foreground">{aviso}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {times.map((t, i) => (
          <Caixa key={t.id} id={i === 0 ? 'ficha-times' : undefined} rotulo={t.nome} marcado={marcados.includes(t.id)} aoMudar={() => aoAlternar(t.id)} />
        ))}
      </div>
    </fieldset>
  )
}

// Tipo de consultoria: pode ter mais de um (ou nenhum); desmarcar tudo é o "apagar".
function EscolhaDeTipos({ marcados, aoAlternar, desabilitado }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Tipo de consultoria</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {TIPOS_DE_CONSULTORIA.map((t, i) => (
          <Caixa key={t.valor} id={i === 0 ? 'ficha-tipos' : undefined} rotulo={t.rotulo} marcado={marcados.includes(t.valor)} aoMudar={() => aoAlternar(t.valor)}
            desabilitado={desabilitado} />
        ))}
      </div>
    </fieldset>
  )
}

const OPCOES_DE_ACESSO = [
  { valor: 'convite', icone: MailCheck, titulo: 'Enviar convite por e-mail', dica: 'A pessoa recebe um link para criar a própria senha.' },
  { valor: 'senha', icone: KeyRound, titulo: 'Definir senha provisória', dica: 'Você passa a senha; a pessoa troca no primeiro acesso.' },
]

// Cartões de opção (role="radio"), um de cada vez: o escolhido ganha a borda e o anel da cor principal.
function EscolhaDeAcesso({ valor, aoMudar }) {
  function teclar(evento, indice) {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[evento.key]
    if (!passo) return
    evento.preventDefault()
    const proxima = OPCOES_DE_ACESSO[(indice + passo + OPCOES_DE_ACESSO.length) % OPCOES_DE_ACESSO.length]
    aoMudar(proxima.valor)
    document.getElementById(`ficha-acesso-${proxima.valor}`)?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Como a pessoa entra" className="grid gap-2 sm:grid-cols-2">
      {OPCOES_DE_ACESSO.map((o, i) => {
        const escolhida = valor === o.valor
        return (
          <button key={o.valor} id={`ficha-acesso-${o.valor}`} type="button" role="radio" aria-checked={escolhida}
            tabIndex={escolhida ? 0 : -1} onClick={() => aoMudar(o.valor)} onKeyDown={(e) => teclar(e, i)}
            className={cn('botao-animado flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow,translate,scale] outline-none hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50',
              escolhida ? 'border-primary bg-primary/5 ring-primary/15 ring-2' : 'bg-card hover:border-primary/40')}>
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', escolhida ? 'bg-primary-cheio text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              <o.icone className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-rotulo font-semibold">{o.titulo}</span>
              <span className="text-muted-foreground block text-legenda">{o.dica}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Cartão com o estado do acesso de quem já existe (Ativo, Convite pendente, Senha provisória, Desativado).
const ESTADOS_DO_ACESSO = {
  Ativo: { icone: CheckCircle2, cor: 'bg-positive-soft text-positive', linha: 'Pode entrar no app.' },
  'Convite pendente': { icone: MailCheck, cor: 'bg-primary/10 text-primary', linha: 'O convite foi enviado e a pessoa ainda não criou a senha.' },
  'Senha provisória': { icone: KeyRound, cor: 'bg-notice-soft text-notice', linha: 'Ela ainda vai trocar a senha provisória no primeiro acesso.' },
  Desativado: { icone: UserX, cor: 'bg-muted text-muted-foreground', linha: 'Não entra no app enquanto estiver desativada.' },
}

// Seção Situação: um cartão com duas linhas, o estado (e Reenviar convite, se cabe) e o e-mail de acesso.
function CartaoDoAcesso({ pessoa, aoReenviar, podeReenviar }) {
  const estado = situacao(pessoa)
  const { icone: Icone, cor, linha } = ESTADOS_DO_ACESSO[estado]
  return (
    <Bloco titulo="Situação">
      <CartaoDaSecao data-slot="cartao-acesso" className="divide-y overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', cor)}><Icone className="size-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-rotulo font-semibold">{estado}</p>
            <p className="text-muted-foreground text-legenda">{linha}</p>
          </div>
          {podeReenviar && pessoa.convite_pendente && (
            <Button type="button" variant="outline" size="sm" onClick={aoReenviar}><Send /> Reenviar convite</Button>
          )}
        </div>
        {pessoa.email && (
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg"><AtSign className="size-4" aria-hidden="true" /></span>
            <dl className="min-w-0 flex-1">
              <dt className="text-muted-foreground text-legenda">E-mail de acesso</dt>
              <dd className="text-rotulo font-medium break-all">{pessoa.email}</dd>
            </dl>
          </div>
        )}
      </CartaoDaSecao>
    </Bloco>
  )
}

// Verificação em duas etapas da pessoa (aba Acesso), para quem pode editar o acesso dela, num cartão só: a chave
// "Exigir" (salva com a ficha) em cima e, depois do traço, a situação (Ativa desde…, Ainda não configurada, Desligada)
// com "Zerar" (celular perdido), que a página confirma antes. Sem o app ativo não há o que zerar.
const SITUACAO_DA_VERIFICACAO = {
  ativa: { icone: ShieldCheck, cor: 'bg-positive-soft text-positive', linha: 'A pessoa entra com a senha e o código do app autenticador.' },
  pendente: { icone: ShieldAlert, cor: 'bg-notice-soft text-notice', linha: 'No próximo acesso, a pessoa configura o app autenticador antes de entrar.' },
  desligada: { icone: ShieldOff, cor: 'bg-muted text-muted-foreground', linha: 'A pessoa entra só com a senha (ou o Google). Ela pode ativar o app em Meu perfil.' },
}

function VerificacaoDaPessoa({ exigida, aoMudarExigida, verificacaoDesde, aoZerar }) {
  const { estado, rotulo } = situacaoNaFicha({ verificacaoDesde, exigida })
  const { icone: Icone, cor, linha } = SITUACAO_DA_VERIFICACAO[estado]
  return (
    <Bloco titulo="Verificação em duas etapas">
      <CartaoDaSecao className={cn('divide-y overflow-hidden', exigida && 'border-primary/50')}>
        <CartaoChave embutido titulo="Exigir verificação em duas etapas" icone={Smartphone} ligada={exigida} aoMudar={aoMudarExigida}
          dica="A pessoa só entra com o código de 6 dígitos do app autenticador do celular (Google Authenticator, Microsoft Authenticator…)." />
        <div data-slot="situacao-2fa" className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', cor)}><Icone className="size-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-rotulo font-semibold">{rotulo}</p>
            <p className="text-muted-foreground text-legenda">{linha}</p>
          </div>
          {verificacaoDesde && aoZerar && (
            <Button type="button" variant="outline" size="sm" onClick={aoZerar}><RotateCcwKey /> Zerar verificação em duas etapas</Button>
          )}
        </div>
      </CartaoDaSecao>
    </Bloco>
  )
}

// A ficha do consultor: a mesma janela para criar (Novo acesso), para editar (pessoa preenchida) e para a própria pessoa
// (Meu perfil, quando `pessoa.id === perfilDeQuem.id`: pela bolinha do trilho ou pela própria linha em Usuários).
// Layout do Hub (PersonWindow): duas abas no cabeçalho, Dados pessoais e Acesso (esta só quando há o que mostrar).
// Papel e times e Capacidade são seções de Dados pessoais, nas mesmas condições de antes. Desativar/Reativar no
// rodapé à esquerda. Quem pode o quê vem de `perfilDeQuem`
// (papéis em src/lib/papeis.js); o banco e as Edge Functions conferem de novo.
//
// Novo: aoCriar(pedido, { carga, foto, cor }) (a tela envia a foto e grava a cor depois de criar) e aoColocarNosTimes(pessoaId, timesIds). `buscarConsultorias(termo)` (só para
// quem vê tudo criando um administrador) devolve { itens: [{ id, nome }], total } do banco: a lista nunca vem inteira.
// Editar: aoSalvar({ mudancas, carga, timesAdicionar, timesRemover, foto, cor }), mais aoReenviar() e
// aoPedirAtivo('desativar' | 'reativar') quando podeReenviar / podeDesativar. podeDesativar também é quem edita o
// acesso: ganha a verificação em duas etapas (exige_2fa nas mudanças e aoPedirZerar2fa({ exigida }), com a chave "Exigir"
// como está na ficha, mesmo antes de salvar). No Novo, a chave "Exigir"
// aparece para quem vai editar o acesso da pessoa depois (dono, central, administrador) e vai no pedido de criar.
// Modo próprio (título "Meu perfil"): muda só o que o banco aceita da própria pessoa (gerenciar-acesso em si mesmo
// muda só o nome; contato por atualizar_meu_contato; foto e cor pelo Storage; senha pelo Auth). E-mail, papel,
// consultoria, cargo, data de entrada, carga semanal e tipos aparecem só para ler; sem times, ausências, Desativar,
// Zerar e sem a chave "Exigir" (ninguém exige de si mesmo). Na aba Acesso, a troca de senha e a verificação em duas
// etapas da própria pessoa (`aoMudarVerificacao()` depois de ativar ou desativar).
// aoSalvar({ mudancas: { nome? }, contato?: { telefone, cidade, uf }, foto, cor, senha? }): contato só se mudou, inteiro.
// Em qualquer modo, a resposta pode trazer `erros` ({ campo: motivo }, ex.: a senha recusada pelo servidor): a ficha
// marca o campo e a aba dele e vai até lá, como na validação.
export default function FichaDoConsultor({
  aberto, aoFechar, perfilDeQuem, pessoa = null, times = [], consultoriaId = '', buscarConsultorias,
  titulo, aoCriar, aoColocarNosTimes, aoSalvar, podeReenviar, podeDesativar, aoReenviar, aoPedirAtivo, aoMudarAusencias,
  aoPedirZerar2fa, aoMudarVerificacao,
}) {
  const novo = !pessoa
  const propria = !novo && pessoa.id === perfilDeQuem?.id
  const opcoesDePapel = papeisQuePodeDar(perfilDeQuem)
  const quemVeTudo = veTudo(perfilDeQuem)
  const [dados, setDados] = useState(() => ({
    forma: 'convite', senha: '', repetida: '', email: '', consultoria: consultoriaId ?? '',
    nome: pessoa?.nome ?? '',
    papel: pessoa?.papel ?? opcoesDePapel[0]?.valor,
    cargo: comoTexto(pessoa?.cargo),
    data_entrada: comoTexto(pessoa?.data_entrada),
    telefone: comoTexto(pessoa?.telefone),
    cidade: comoTexto(pessoa?.cidade),
    uf: comoTexto(pessoa?.uf),
    carga: String(Number(pessoa?.carga_semanal ?? CARGA_PADRAO)).replace('.', ','),
    exige_2fa: !!pessoa?.exige_2fa,
  }))
  const timesIniciais = (pessoa?.times ?? []).map((t) => t.id).filter((id) => times.some((t) => t.id === id))
  const [marcados, setMarcados] = useState(timesIniciais)
  const tiposIniciais = TIPOS_DE_CONSULTORIA.map((t) => t.valor).filter((v) => (pessoa?.tipos_de_consultoria ?? []).includes(v))
  const [tipos, setTipos] = useState(tiposIniciais)
  const [foto, setFoto] = useState(null)
  const [corEscolhida, setCorEscolhida] = useState(undefined) // undefined = não mexeu; null = automática
  const focar = useRef(null)
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState(null)
  const [jaExiste, setJaExiste] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [abaEscolhida, setAbaEscolhida] = useState('dados')
  const idBase = `ficha${useId()}`
  const corGuardada = pessoa?.cor ?? null
  const corMarcada = corEscolhida === undefined ? corGuardada : corEscolhida
  const reservaCor = corMarcada ?? corDe(pessoa ? pessoa.id : 'nova-pessoa')

  const mudar = (campo) => (evento) => setDados((d) => ({ ...d, [campo]: evento.target.value }))
  const definir = (campo) => (valor) => setDados((d) => ({ ...d, [campo]: valor }))
  const buscarOpcoesDeConsultoria = useCallback(async (termo) => {
    const { itens, total } = await buscarConsultorias(termo)
    return { itens: itens.map((c) => ({ valor: c.id, rotulo: c.nome })), total }
  }, [buscarConsultorias])
  // Sempre na ordem do pedido (a mesma da lista e do filtro), qualquer que seja a ordem dos cliques.
  const alternarTipo = (valor) => setTipos((atuais) => TIPOS_DE_CONSULTORIA.map((t) => t.valor)
    .filter((v) => (v === valor ? !atuais.includes(v) : atuais.includes(v))))
  const alternarTime = (id) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))

  const papelAtual = dados.papel
  const consultoriaDaPessoa = !novo && ehPapelDeConsultoria(pessoa.papel)
  const naConsultoria = (novo ? ehPapelDeConsultoria(papelAtual) : consultoriaDaPessoa)
  // Capacidade: só consultores, e só para a central/dono e a administração daquela consultoria.
  const poderDaConsultoria = ['admin', 'gestor'].includes(perfilDeQuem.papel) &&
    (novo || pessoa.consultoria_id === perfilDeQuem.consultoria_id)
  // Na própria ficha a carga e as ausências não mudam (aparecem só para ler); papel e times também não.
  const mostraCapacidade = !propria && naConsultoria && (quemVeTudo || poderDaConsultoria)
  const mudaPapel = !novo && !propria && perfilDeQuem.papel === 'admin' && opcoesDePapel.length > 1
  const mostraTimes = !propria && naConsultoria && !quemVeTudo && (novo || times.length > 0)
  const escolheConsultoria = novo && buscarConsultorias && quemVeTudo && papelAtual === 'admin'
  // Exigir a verificação em duas etapas: quem edita o acesso da pessoa (o gestor só cria e muda o nome).
  const podeExigir2fa = novo ? ['dono', 'central', 'admin'].includes(perfilDeQuem.papel) : !propria && !!podeDesativar

  const mostraPapel = (opcoesDePapel.length > 0 && (novo || mudaPapel)) || mostraTimes
  const mostraAcesso = novo || propria || (podeReenviar && pessoa.convite_pendente) || podeDesativar
  const abas = [
    { valor: 'dados', rotulo: 'Dados pessoais', icone: User },
    ...(mostraAcesso ? [{ valor: 'acesso', rotulo: 'Acesso', icone: ShieldCheck }] : []),
  ].map((a) => ({ ...a, erro: Object.keys(erros).some((campo) => ABA_DO_ERRO[campo] === a.valor) }))
  const aba = abas.some((a) => a.valor === abaEscolhida) ? abaEscolhida : 'dados'

  // Depois de pular de aba por causa de um erro, o foco vai para o primeiro campo com erro (o painel já está montado).
  useEffect(() => {
    if (!focar.current) return
    document.getElementById(focar.current)?.focus()
    focar.current = null
  }, [aba])

  // Vai para a aba do campo e o foca (se a aba já é a atual, o painel está montado e foca na hora).
  function irParaOCampo(abaDoCampo, idDoCampo) {
    if (abaDoCampo === aba) return document.getElementById(idDoCampo)?.focus()
    focar.current = idDoCampo
    setAbaEscolhida(abaDoCampo)
  }

  function fechar() {
    setErro(null)
    setJaExiste(null)
    aoFechar()
  }

  function validar() {
    const achados = {}
    if (dados.nome.trim().length < 2) achados.nome = 'Use pelo menos 2 caracteres.'
    if (novo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email.trim())) achados.email = 'Digite um e-mail válido.'
    if (novo && dados.forma === 'senha' && !avaliarSenha(dados.senha).forte) achados.senha = 'A senha provisória precisa ser forte: confira as regras abaixo do campo.'
    if (mostraCapacidade) {
      const horas = lerHoras(dados.carga)
      if (horas === null || horas > 60) achados.carga = 'Use de 0 a 60 horas.'
    }
    // A data de entrada da própria pessoa é só para ler (e não vai no pedido): não barra o salvar.
    if (!propria && dados.data_entrada && dados.data_entrada > hoje()) achados.data_entrada = 'A data de entrada não pode ser no futuro.'
    if (propria && (dados.senha || dados.repetida)) {
      if (!avaliarSenha(dados.senha).forte) achados.senha = 'A senha precisa ser forte: confira as regras abaixo do campo.'
      else if (dados.senha !== dados.repetida) achados.repetida = 'As senhas não são iguais.'
    }
    setErros(achados)
    return achados
  }

  // Cada erro pertence a uma aba; ao salvar com erro a ficha vai para a primeira aba (na ordem) que tem um.
  function irParaPrimeiraAbaComErro(achados) {
    const destino = abas.find((a) => Object.keys(achados).some((campo) => ABA_DO_ERRO[campo] === a.valor))
    if (!destino) return
    const campo = Object.keys(achados).find((c) => ABA_DO_ERRO[c] === destino.valor)
    irParaOCampo(destino.valor, CAMPO_DO_ERRO[campo])
  }

  // Carga a gravar: no Novo, só se for diferente da padrão; no Editar, só se mudou.
  function cargaNova() {
    if (!mostraCapacidade) return undefined
    const horas = lerHoras(dados.carga)
    const antes = novo ? CARGA_PADRAO : Number(pessoa.carga_semanal ?? CARGA_PADRAO)
    return horas === antes ? undefined : horas
  }

  // Cor a gravar: undefined se não mudou; null volta para a automática (limpa a cor guardada).
  function corNova() {
    return corMarcada !== corGuardada ? corMarcada : undefined
  }

  function avisarConsultoria(mensagem) {
    setErros({ consultoria: true })
    irParaOCampo('dados', 'ficha-consultoria')
    setErro(mensagem)
  }

  async function criar() {
    const escolheTimes = mostraTimes
    const consultoria = escolheConsultoria ? dados.consultoria : consultoriaId
    if (papelAtual === 'admin' && !consultoria) {
      return avisarConsultoria(buscarConsultorias ? 'Escolha uma consultoria para o administrador.' : 'Escolha uma consultoria no filtro da tela para criar o administrador.')
    }
    setErro(null)
    setJaExiste(null)
    setEnviando(true)
    const pedido = {
      forma: dados.forma,
      nome: dados.nome.trim(),
      email: dados.email.trim(),
      papel: papelAtual,
      times: escolheTimes ? marcados : [],
    }
    if (dados.forma === 'senha') pedido.senha = dados.senha
    if (podeExigir2fa && dados.exige_2fa) pedido.exige_2fa = true
    for (const campo of CAMPOS_DE_TEXTO) if (dados[campo].trim()) pedido[campo] = dados[campo].trim()
    if (tipos.length) pedido.tipos_de_consultoria = tipos
    if (papelAtual === 'admin') pedido.consultoria_id = consultoria
    const resposta = await aoCriar(pedido, { carga: cargaNova(), foto: foto ?? undefined, cor: corNova() })
    setEnviando(false)
    if (resposta?.codigo === 'ja_na_consultoria') {
      setErro(resposta.erro)
      setJaExiste(resposta.pessoa)
      // "Colocar nos times marcados" depende das caixas de times: volta para Dados pessoais e foca a primeira.
      if (mostraTimes) irParaOCampo('dados', 'ficha-times')
      return
    }
    if (resposta?.erro) return setErro(resposta.erro)
    fechar()
  }

  // Quem administra: só o que mudou (o nome, o papel, a exigência, os tipos e os campos da ficha), a carga e os times.
  function pedidoDaFicha() {
    const mudancas = {}
    if (dados.nome.trim() !== pessoa.nome) mudancas.nome = dados.nome.trim()
    if (mudaPapel && dados.papel !== pessoa.papel) mudancas.papel = dados.papel
    if (podeExigir2fa && dados.exige_2fa !== !!pessoa.exige_2fa) mudancas.exige_2fa = dados.exige_2fa
    if (tipos.join() !== tiposIniciais.join()) mudancas.tipos_de_consultoria = tipos
    for (const campo of CAMPOS_DE_TEXTO) {
      if (comoTexto(pessoa[campo]) !== dados[campo].trim()) mudancas[campo] = dados[campo].trim() || null
    }
    return {
      mudancas,
      carga: cargaNova(),
      timesAdicionar: marcados.filter((id) => !timesIniciais.includes(id)),
      timesRemover: timesIniciais.filter((id) => !marcados.includes(id)),
      foto,
      cor: corNova(),
    }
  }

  // A própria pessoa: o nome (se mudou), o contato inteiro (se algum dos três mudou; vazio limpa), a foto, a cor e a
  // senha nova (se digitada). Nada do que só a administração muda.
  function pedidoProprio() {
    const mudancas = {}
    if (dados.nome.trim() !== pessoa.nome) mudancas.nome = dados.nome.trim()
    const contato = { telefone: dados.telefone.trim(), cidade: dados.cidade.trim(), uf: dados.uf }
    const contatoMudou = CAMPOS_DE_CONTATO.some((campo) => contato[campo] !== comoTexto(pessoa[campo]))
    return { mudancas, contato: contatoMudou ? contato : undefined, foto, cor: corNova(), senha: dados.senha || undefined }
  }

  async function editar() {
    const pedido = propria ? pedidoProprio() : pedidoDaFicha()
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar(pedido)
    setEnviando(false)
    if (resposta?.erros) {
      setErros(resposta.erros)
      irParaPrimeiraAbaComErro(resposta.erros)
    }
    if (resposta?.erro) return setErro(resposta.erro)
    fechar()
  }

  async function enviar() {
    if (enviando) return
    const achados = validar()
    if (Object.keys(achados).length > 0) return irParaPrimeiraAbaComErro(achados)
    return novo ? criar() : editar()
  }

  // Esta janela não é um <form> (as ausências têm o delas); o Enter nos campos de texto da ficha salva. A busca
  // das listas dos campos (sem id da ficha) não conta.
  function teclar(evento) {
    const { target } = evento
    if (evento.key !== 'Enter' || target.tagName !== 'INPUT' || target.closest('form') || !target.id.startsWith('ficha-')) return
    if (!['text', 'email'].includes(target.type)) return
    evento.preventDefault()
    enviar()
  }

  async function colocarNosTimes() {
    setEnviando(true)
    const resposta = await aoColocarNosTimes(jaExiste.id, marcados)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    fechar()
  }

  const estado = novo ? null : situacao(pessoa)
  // Com foto (a atual ou a escolhida agora) a cor não aparece; ela só vale para as iniciais.
  const semFoto = foto?.arquivo ? false : foto?.tirar ? true : !pessoa?.foto
  const ativa = (valor) => aba === valor
  const painel = (valor, children) => ativa(valor) && (
    <div role="tabpanel" id={`${idBase}-painel-${valor}`} aria-labelledby={`${idBase}-aba-${valor}`} className="space-y-5">{children}</div>
  )

  // No celular (360 px) o rodapé não cabe com o texto: fica só o ícone, e o nome continua para o leitor de tela.
  const acaoEsquerda = !novo && !propria && podeDesativar ? (
    pessoa.ativo === false
      ? (
        <Button type="button" variant="ghost" className="text-positive hover:bg-positive-soft hover:text-positive" disabled={enviando}
          onClick={() => aoPedirAtivo('reativar')}><RotateCcw /> <span className="max-sm:sr-only">Reativar</span></Button>
      )
      : (
        <Button type="button" variant="ghost" className="text-notice hover:bg-notice-soft hover:text-notice" disabled={enviando}
          onClick={() => aoPedirAtivo('desativar')}><Power /> <span className="max-sm:sr-only">Desativar</span></Button>
      )
  ) : null

  return (
    <JanelaFormulario aberto={aberto} aoFechar={fechar} titulo={titulo ?? (novo ? 'Nova pessoa' : propria ? 'Meu perfil' : `Ficha de ${pessoa.nome}`)}
      icone={novo ? UserPlus : propria ? UserRound : Pencil}
      largura="5xl" alturaFixa enviando={enviando} acaoEsquerda={acaoEsquerda}
      abas={<AbasSegmentadas rotulo="Seções da ficha" comoAbas idBase={idBase} abas={abas} valor={aba} aoMudar={setAbaEscolhida} />}
      descricao={propria
        ? 'Sua foto, seu nome, seu contato, sua senha e a verificação em duas etapas. O que aparece apagado quem muda é a administração.'
        : !novo
          ? 'Os dados, o papel, a capacidade e o acesso.'
          : dados.forma === 'convite'
            ? 'A pessoa recebe um e-mail para criar a senha (ou entrar com o Google, se o e-mail for o mesmo).'
            : 'Você passa a senha provisória para a pessoa. No primeiro acesso ela troca por uma senha só dela.'}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={fechar} disabled={enviando}>Cancelar</Button>
          {jaExiste ? (
            <Button type="button" className="min-w-[150px]" disabled={enviando || marcados.length === 0} onClick={colocarNosTimes}>
              {enviando ? 'Salvando…' : 'Colocar nos times marcados'}
            </Button>
          ) : (
            <Button type="button" className="min-w-[150px]" disabled={enviando} onClick={enviar}>
              {enviando ? 'Salvando…' : !novo ? 'Salvar alterações' : dados.forma === 'convite' ? 'Enviar convite' : 'Criar pessoa'}
            </Button>
          )}
        </>
      )}>
      <div onKeyDown={teclar} className="space-y-5">
        {painel('dados', (
          <>
            <div role="group" aria-label="Identificação" className="bg-muted/40 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:gap-6">
              <div className="self-center">
                <CampoImagem aparencia="cartao" rotulo="foto" atual={novo ? null : urlPublica('fotos', pessoa.foto)}
                  reserva={iniciais(dados.nome || pessoa?.nome) || <User className="size-9" aria-hidden="true" />}
                  reservaCor={reservaCor} valor={foto} aoMudar={setFoto} />
              </div>
              <div className="grid min-w-0 flex-1 gap-3">
                <Campo id="ficha-nome" rotulo="Nome" erro={erros.nome}>
                  <Input id="ficha-nome" autoComplete="off" maxLength={120} className="h-10"
                    aria-invalid={erros.nome ? true : undefined} value={dados.nome} onChange={mudar('nome')} />
                </Campo>
                <div className="flex flex-wrap gap-1.5">
                  {estado && estado !== 'Ativo' && <Badge variant={estado === 'Desativado' ? 'outline' : estado === 'Senha provisória' ? 'secondary' : 'notice'}>{estado}</Badge>}
                  {dados.papel && <Badge variant="outline">{rotuloDoPapel(dados.papel)}</Badge>}
                </div>
                {semFoto && <SeletorDeCor valor={corMarcada} aoMudar={setCorEscolhida} />}
              </div>
            </div>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <Campo id="ficha-email" rotulo="E-mail" erro={erros.email}>
                {novo
                  ? <Input id="ficha-email" type="email" autoComplete="off" className="h-10"
                    aria-invalid={erros.email ? true : undefined} value={dados.email} onChange={mudar('email')} />
                  : (
                    <>
                      <Input id="ficha-email" className="h-10" value={pessoa.email ?? ''} disabled readOnly />
                      <p className="text-muted-foreground text-legenda">
                        {propria ? 'O e-mail não muda. Para trocar, fale com a administração.' : 'O e-mail não muda. Para trocar, crie um acesso novo e desative este.'}
                      </p>
                    </>
                  )}
              </Campo>
              <Campo id="ficha-telefone" rotulo="Telefone">
                <Input id="ficha-telefone" type="text" inputMode="tel" autoComplete="off" maxLength={30} className="h-10"
                  value={dados.telefone} onChange={mudar('telefone')} />
              </Campo>
              <Campo id="ficha-cidade" rotulo="Cidade">
                <Input id="ficha-cidade" autoComplete="off" maxLength={120} className="h-10" value={dados.cidade} onChange={mudar('cidade')} />
              </Campo>
              <Campo id="ficha-uf" rotulo="UF">
                <Seletor id="ficha-uf" valor={dados.uf} aoMudar={definir('uf')} rotuloTodos="—" opcoes={OPCOES_DE_UF} />
              </Campo>
              <Campo id="ficha-cargo" rotulo="Cargo">
                <Input id="ficha-cargo" autoComplete="off" maxLength={80} className="h-10" value={dados.cargo} onChange={mudar('cargo')}
                  disabled={propria} readOnly={propria} />
              </Campo>
              <Campo id="ficha-entrada" rotulo="Data de entrada" erro={erros.data_entrada}>
                <CampoData id="ficha-entrada" valor={dados.data_entrada} aoMudar={definir('data_entrada')} max={hoje()} desabilitado={propria} />
              </Campo>
            </div>

            <Bloco titulo="Tipo de consultoria">
              <EscolhaDeTipos marcados={tipos} aoAlternar={alternarTipo} desabilitado={propria} />
            </Bloco>

            {propria && (
              <Bloco titulo={pessoa.consultoria?.nome ? 'Papel e consultoria' : 'Papel'}>
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <Campo id="ficha-papel" rotulo="Papel">
                    <Input id="ficha-papel" className="h-10" value={rotuloDoPapel(pessoa.papel)} disabled readOnly />
                  </Campo>
                  {pessoa.consultoria?.nome && (
                    <Campo id="ficha-consultoria" rotulo="Consultoria">
                      <Input id="ficha-consultoria" className="h-10" value={pessoa.consultoria.nome} disabled readOnly />
                    </Campo>
                  )}
                </div>
              </Bloco>
            )}

            {propria && consultoriaDaPessoa && pessoa.carga_semanal != null && (
              <Bloco titulo="Capacidade">
                <div className="max-w-xs">
                  <Campo id="ficha-carga" rotulo="Carga semanal">
                    <Input id="ficha-carga" className="h-10" value={`${formatarHoras(Number(pessoa.carga_semanal))} por semana`} disabled readOnly />
                  </Campo>
                  <p className="mt-2 text-rotulo text-muted-foreground">
                    {['admin', 'gestor'].includes(pessoa.papel)
                      ? 'Só para consulta aqui. Para mudar a sua carga e as suas ausências, use Capacidade na sua linha em Usuários.'
                      : 'Só para consulta: a carga e as ausências quem muda é a gestão da consultoria.'}
                  </p>
                </div>
              </Bloco>
            )}

            {mostraPapel && (
              <Bloco titulo="Papel e times">
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  {(novo || mudaPapel) && (
                    <Campo id="ficha-papel" rotulo="Papel">
                      <Seletor id="ficha-papel" valor={dados.papel} aoMudar={definir('papel')} opcoes={opcoesDePapel} />
                    </Campo>
                  )}
                  {escolheConsultoria && (
                    <Campo id="ficha-consultoria" rotulo="Consultoria">
                      <Seletor id="ficha-consultoria" valor={dados.consultoria} aoMudar={definir('consultoria')} buscar={buscarOpcoesDeConsultoria} placeholder="Escolha…" />
                    </Campo>
                  )}
                </div>
                {mostraTimes && (
                  <EscolhaDeTimes times={times} marcados={marcados} aoAlternar={alternarTime}
                    aviso={novo ? 'Nenhum time ainda. Dá para colocar a pessoa depois.' : null} />
                )}
              </Bloco>
            )}

            {mostraCapacidade && (
              <Bloco titulo="Capacidade">
                <div className="max-w-xs">
                  <Campo id="ficha-carga" rotulo="Carga semanal (horas)" erro={erros.carga}>
                    <CampoNumero id="ficha-carga" valor={dados.carga} aoMudar={definir('carga')} min={0} max={99} passo={0.5} decimal unidade="h" />
                  </Campo>
                  <p className="mt-2 text-rotulo text-muted-foreground">De 0 a 60. Com 0, a pessoa sai da sugestão de consultor.</p>
                </div>
                {!novo && (
                  <div className="grid gap-2">
                    <h4 className="text-corpo font-medium">Ausências</h4>
                    <GerirAusencias pessoa={pessoa} aoMudar={aoMudarAusencias} />
                  </div>
                )}
              </Bloco>
            )}
          </>
        ))}

        {/* Aba Acesso: cada bloco é um rótulo de seção e um cartão só (Situação, Como a pessoa entra ou Trocar senha,
            Verificação em duas etapas), no mesmo espaçamento. */}
        {painel('acesso', novo ? (
          <>
            <Bloco titulo="Como a pessoa entra">
              <EscolhaDeAcesso valor={dados.forma} aoMudar={(forma) => setDados((d) => ({ ...d, forma }))} />
              {dados.forma === 'senha' && (
                <CartaoDaSecao className="p-3">
                  <Campo id="ficha-senha" rotulo="Senha provisória" erro={erros.senha}>
                    <CampoSenha id="ficha-senha" valor={dados.senha} invalido={!!erros.senha}
                      aoMudar={(senha) => setDados((d) => ({ ...d, senha }))}
                      dica={erros.senha ? undefined : 'Só senha forte é aceita. A pessoa troca no primeiro acesso.'} />
                  </Campo>
                </CartaoDaSecao>
              )}
            </Bloco>
            {podeExigir2fa && (
              <Bloco titulo="Verificação em duas etapas">
                <CartaoDaSecao className={cn('overflow-hidden', dados.exige_2fa && 'border-primary/50')}>
                  <CartaoChave embutido titulo="Exigir verificação em duas etapas" icone={Smartphone} ligada={dados.exige_2fa}
                    aoMudar={definir('exige_2fa')}
                    dica="No primeiro acesso, a pessoa configura o app autenticador do celular antes de entrar." />
                </CartaoDaSecao>
              </Bloco>
            )}
            {/* Nota da última seção: o -mt-2 encosta a nota no cartão de cima (as margens do space-y se juntam). */}
            <p className="text-muted-foreground -mt-2 text-legenda">O acesso é criado quando você clica em {dados.forma === 'convite' ? 'Enviar convite' : 'Criar pessoa'}.</p>
          </>
        ) : propria ? (
          <>
            <Bloco titulo="Trocar senha (opcional)">
              <CartaoDaSecao className="grid items-start gap-x-4 gap-y-3 p-3 sm:grid-cols-2">
                <Campo id="ficha-senha" rotulo="Senha nova" erro={erros.senha}>
                  <CampoSenha id="ficha-senha" valor={dados.senha} invalido={!!erros.senha} aoMudar={definir('senha')}
                    dica="Só senha forte é aceita. Deixe em branco para manter a atual; ela muda quando você salva." />
                </Campo>
                <Campo id="ficha-senha-repetida" rotulo="Repita a senha nova" erro={erros.repetida}>
                  <Input id="ficha-senha-repetida" type="password" autoComplete="new-password" className="h-10"
                    aria-invalid={erros.repetida ? true : undefined} value={dados.repetida} onChange={mudar('repetida')} />
                </Campo>
              </CartaoDaSecao>
            </Bloco>
            <VerificacaoDoPerfil perfil={pessoa} aoMudar={aoMudarVerificacao} />
          </>
        ) : (
          <>
            <CartaoDoAcesso pessoa={pessoa} podeReenviar={podeReenviar} aoReenviar={aoReenviar} />
            {podeExigir2fa && (
              <VerificacaoDaPessoa exigida={dados.exige_2fa} aoMudarExigida={definir('exige_2fa')}
                verificacaoDesde={pessoa.verificacao_desde}
                aoZerar={aoPedirZerar2fa && (() => aoPedirZerar2fa({ exigida: dados.exige_2fa }))} />
            )}
          </>
        ))}

        {erro && <Aviso>{erro}</Aviso>}

      </div>
    </JanelaFormulario>
  )
}
