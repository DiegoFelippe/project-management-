import { CheckCircle2, KeyRound, MailCheck, Pencil, Power, RotateCcw, Send, ShieldCheck, UserPlus, UserX, User } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Caixa from '@/components/campos/Caixa'
import CampoData from '@/components/campos/CampoData'
import CampoNumero from '@/components/campos/CampoNumero'
import CampoSenha from '@/components/campos/CampoSenha'
import { avaliarSenha } from '@/lib/senha'
import Seletor from '@/components/campos/Seletor'
import { GerirAusencias } from '@/components/capacidade/GerirAusencias'
import { lerHoras } from '@/components/clientes/rotulos'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import CampoImagem from '@/components/comum/CampoImagem'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import SeletorDeCor from '@/components/comum/SeletorDeCor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { corDe } from '@/lib/cores'
import { urlPublica } from '@/lib/imagem'
import { hoje } from '@/lib/mes'
import { iniciais } from '@/lib/nomes'
import { UFS } from '@/lib/ufs'
import { ehPapelDeConsultoria, papeisQuePodeDar, rotuloDoPapel, veTudo } from '@/lib/papeis'
import { situacao } from '@/lib/situacao'
import { cn } from '@/lib/utils'

const CARGA_PADRAO = 44
const CAMPOS_DE_TEXTO = ['cargo', 'telefone', 'cidade', 'uf', 'data_entrada']

// Em que aba aparece o erro de cada campo (ponto vermelho na aba) e qual campo recebe o foco ao pular para ela.
const ABA_DO_ERRO = { nome: 'dados', email: 'dados', data_entrada: 'dados', consultoria: 'dados', carga: 'dados', senha: 'acesso' }
const CAMPO_DO_ERRO = { nome: 'ficha-nome', email: 'ficha-email', data_entrada: 'ficha-entrada', consultoria: 'ficha-consultoria', carga: 'ficha-carga', senha: 'ficha-senha' }

const OPCOES_DE_UF = UFS.map((uf) => ({ valor: uf, rotulo: uf }))
const comoTexto = (valor) => String(valor ?? '')

const Bloco = SecaoFormulario

function Campo({ id, rotulo, erro, children }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  )
}

function EscolhaDeTimes({ times, marcados, aoAlternar, aviso }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Times</legend>
      {times.length === 0 && aviso && <p className="text-xs text-muted-foreground">{aviso}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {times.map((t, i) => (
          <Caixa key={t.id} id={i === 0 ? 'ficha-times' : undefined} rotulo={t.nome} marcado={marcados.includes(t.id)} aoMudar={() => aoAlternar(t.id)} />
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
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', escolhida ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              <o.icone className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold">{o.titulo}</span>
              <span className="text-muted-foreground block text-[11.5px]">{o.dica}</span>
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

function CartaoDoAcesso({ pessoa, aoReenviar, podeReenviar }) {
  const estado = situacao(pessoa)
  const { icone: Icone, cor, linha } = ESTADOS_DO_ACESSO[estado]
  return (
    <div data-slot="cartao-acesso" className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-2xl border p-4">
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', cor)}><Icone className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{estado}</p>
        <p className="text-muted-foreground text-[12px]">{linha}</p>
        {pessoa.email && <p className="text-muted-foreground text-[12px]">{pessoa.email}</p>}
      </div>
      {podeReenviar && pessoa.convite_pendente && (
        <Button type="button" variant="outline" size="sm" onClick={aoReenviar}><Send /> Reenviar convite</Button>
      )}
    </div>
  )
}

// A ficha do consultor: a mesma janela para criar (Novo acesso) e para editar (pessoa preenchida).
// Layout do Hub (PersonWindow): duas abas no cabeçalho, Dados pessoais e Acesso (esta só quando há o que mostrar).
// Papel e times e Capacidade são seções de Dados pessoais, nas mesmas condições de antes. Desativar/Reativar no
// rodapé à esquerda. Quem pode o quê vem de `perfilDeQuem`
// (papéis em src/lib/papeis.js); o banco e as Edge Functions conferem de novo.
//
// Novo: aoCriar(pedido, { carga, foto, cor }) (a tela envia a foto e grava a cor depois de criar) e aoColocarNosTimes(pessoaId, timesIds). `buscarConsultorias(termo)` (só para
// quem vê tudo criando um administrador) devolve { itens: [{ id, nome }], total } do banco: a lista nunca vem inteira.
// Editar: aoSalvar({ mudancas, carga, timesAdicionar, timesRemover, foto, cor }), mais aoReenviar() e
// aoPedirAtivo('desativar' | 'reativar') quando podeReenviar / podeDesativar.
export default function FichaDoConsultor({
  aberto, aoFechar, perfilDeQuem, pessoa = null, times = [], consultoriaId = '', buscarConsultorias,
  titulo, aoCriar, aoColocarNosTimes, aoSalvar, podeReenviar, podeDesativar, aoReenviar, aoPedirAtivo, aoMudarAusencias,
}) {
  const novo = !pessoa
  const opcoesDePapel = papeisQuePodeDar(perfilDeQuem)
  const quemVeTudo = veTudo(perfilDeQuem)
  const [dados, setDados] = useState(() => ({
    forma: 'convite', senha: '', email: '', consultoria: consultoriaId ?? '',
    nome: pessoa?.nome ?? '',
    papel: pessoa?.papel ?? opcoesDePapel[0]?.valor,
    cargo: comoTexto(pessoa?.cargo),
    data_entrada: comoTexto(pessoa?.data_entrada),
    telefone: comoTexto(pessoa?.telefone),
    cidade: comoTexto(pessoa?.cidade),
    uf: comoTexto(pessoa?.uf),
    carga: String(Number(pessoa?.carga_semanal ?? CARGA_PADRAO)).replace('.', ','),
  }))
  const timesIniciais = (pessoa?.times ?? []).map((t) => t.id).filter((id) => times.some((t) => t.id === id))
  const [marcados, setMarcados] = useState(timesIniciais)
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
  const alternarTime = (id) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))

  const papelAtual = dados.papel
  const consultoriaDaPessoa = !novo && ehPapelDeConsultoria(pessoa.papel)
  const naConsultoria = (novo ? ehPapelDeConsultoria(papelAtual) : consultoriaDaPessoa)
  // Capacidade: só consultores, e só para a central/dono e a administração daquela consultoria.
  const poderDaConsultoria = ['admin', 'gestor'].includes(perfilDeQuem.papel) &&
    (novo || pessoa.consultoria_id === perfilDeQuem.consultoria_id)
  const mostraCapacidade = naConsultoria && (quemVeTudo || poderDaConsultoria)
  const mudaPapel = !novo && perfilDeQuem.papel === 'admin' && opcoesDePapel.length > 1
  const mostraTimes = naConsultoria && !quemVeTudo && (novo || times.length > 0)
  const escolheConsultoria = novo && buscarConsultorias && quemVeTudo && papelAtual === 'admin'

  const mostraPapel = (opcoesDePapel.length > 0 && (novo || mudaPapel)) || mostraTimes
  const mostraAcesso = novo || (podeReenviar && pessoa.convite_pendente) || podeDesativar
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
    if (dados.data_entrada && dados.data_entrada > hoje()) achados.data_entrada = 'A data de entrada não pode ser no futuro.'
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
    for (const campo of CAMPOS_DE_TEXTO) if (dados[campo].trim()) pedido[campo] = dados[campo].trim()
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

  async function editar() {
    const mudancas = {}
    if (dados.nome.trim() !== pessoa.nome) mudancas.nome = dados.nome.trim()
    if (mudaPapel && dados.papel !== pessoa.papel) mudancas.papel = dados.papel
    for (const campo of CAMPOS_DE_TEXTO) {
      if (comoTexto(pessoa[campo]) !== dados[campo].trim()) mudancas[campo] = dados[campo].trim() || null
    }
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar({
      mudancas,
      carga: cargaNova(),
      timesAdicionar: marcados.filter((id) => !timesIniciais.includes(id)),
      timesRemover: timesIniciais.filter((id) => !marcados.includes(id)),
      foto,
      cor: corNova(),
    })
    setEnviando(false)
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

  const acaoEsquerda = !novo && podeDesativar ? (
    pessoa.ativo === false
      ? (
        <Button type="button" variant="ghost" className="text-positive hover:bg-positive-soft hover:text-positive" disabled={enviando}
          onClick={() => aoPedirAtivo('reativar')}><RotateCcw /> Reativar</Button>
      )
      : (
        <Button type="button" variant="ghost" className="text-notice hover:bg-notice-soft hover:text-notice" disabled={enviando}
          onClick={() => aoPedirAtivo('desativar')}><Power /> Desativar</Button>
      )
  ) : null

  return (
    <JanelaFormulario aberto={aberto} aoFechar={fechar} titulo={titulo ?? (novo ? 'Nova pessoa' : `Ficha de ${pessoa.nome}`)} icone={novo ? UserPlus : Pencil}
      largura="5xl" alturaFixa enviando={enviando} acaoEsquerda={acaoEsquerda}
      abas={<AbasSegmentadas rotulo="Seções da ficha" comoAbas idBase={idBase} abas={abas} valor={aba} aoMudar={setAbaEscolhida} />}
      descricao={!novo
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
                      <p className="text-muted-foreground text-[11.5px]">O e-mail não muda. Para trocar, crie um acesso novo e desative este.</p>
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
                <Input id="ficha-cargo" autoComplete="off" maxLength={80} className="h-10" value={dados.cargo} onChange={mudar('cargo')} />
              </Campo>
              <Campo id="ficha-entrada" rotulo="Data de entrada" erro={erros.data_entrada}>
                <CampoData id="ficha-entrada" valor={dados.data_entrada} aoMudar={definir('data_entrada')} max={hoje()} />
              </Campo>
            </div>

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
                  <p className="mt-2 text-xs text-muted-foreground">De 0 a 60. Com 0, a pessoa sai da sugestão de consultor.</p>
                </div>
                {!novo && (
                  <div className="grid gap-2">
                    <h4 className="text-sm font-medium">Ausências</h4>
                    <GerirAusencias pessoa={pessoa} aoMudar={aoMudarAusencias} />
                  </div>
                )}
              </Bloco>
            )}
          </>
        ))}

        {painel('acesso', novo ? (
          <Bloco titulo="Como a pessoa entra">
            <EscolhaDeAcesso valor={dados.forma} aoMudar={(forma) => setDados((d) => ({ ...d, forma }))} />
            {dados.forma === 'senha' && (
              <div className="max-w-sm">
                <Campo id="ficha-senha" rotulo="Senha provisória" erro={erros.senha}>
                  <CampoSenha id="ficha-senha" valor={dados.senha} invalido={!!erros.senha}
                    aoMudar={(senha) => setDados((d) => ({ ...d, senha }))} />
                  {!erros.senha && <p className="text-xs text-muted-foreground">Só senha forte é aceita. A pessoa troca no primeiro acesso.</p>}
                </Campo>
              </div>
            )}
            <p className="text-muted-foreground text-[11.5px]">O acesso é criado quando você clica em {dados.forma === 'convite' ? 'Enviar convite' : 'Criar pessoa'}.</p>
          </Bloco>
        ) : (
          <CartaoDoAcesso pessoa={pessoa} podeReenviar={podeReenviar} aoReenviar={aoReenviar} />
        ))}

        {erro && <Aviso>{erro}</Aviso>}

      </div>
    </JanelaFormulario>
  )
}
