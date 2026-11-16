import { Send, UserCheck, UserCog, UserPlus, UserX } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Caixa from '@/components/campos/Caixa'
import CampoData from '@/components/campos/CampoData'
import CampoNumero from '@/components/campos/CampoNumero'
import Seletor from '@/components/campos/Seletor'
import { GerirAusencias } from '@/components/capacidade/JanelaAusencias'
import { lerHoras } from '@/components/clientes/rotulos'
import CampoImagem from '@/components/comum/CampoImagem'
import EscolhaForma from '@/components/comum/EscolhaForma'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { urlPublica } from '@/lib/imagem'
import { hoje } from '@/lib/mes'
import { iniciais } from '@/lib/nomes'
import { UFS } from '@/lib/ufs'
import { ehPapelDeConsultoria, papeisQuePodeDar, veTudo } from '@/lib/papeis'

const CARGA_PADRAO = 44
const CAMPOS_DE_TEXTO = ['cargo', 'telefone', 'cidade', 'uf', 'data_entrada']

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
        {times.map((t) => (
          <Caixa key={t.id} rotulo={t.nome} marcado={marcados.includes(t.id)} aoMudar={() => aoAlternar(t.id)} />
        ))}
      </div>
    </fieldset>
  )
}

// A ficha do consultor: a mesma janela para criar (Novo acesso) e para editar (pessoa preenchida).
// Blocos: Dados, Contato, Capacidade, Papel e times, Acesso. Quem pode o quê vem de `perfilDeQuem`
// (papéis em src/lib/papeis.js); o banco e as Edge Functions conferem de novo.
//
// Novo: aoCriar(pedido, { carga }) e aoColocarNosTimes(pessoaId, timesIds). `buscarConsultorias(termo)` (só para
// quem vê tudo criando um administrador) devolve { itens: [{ id, nome }], total } do banco: a lista nunca vem inteira.
// Editar: aoSalvar({ mudancas, carga, timesAdicionar, timesRemover, foto }), mais aoReenviar() e
// aoPedirAtivo('desativar' | 'reativar') quando podeReenviar / podeDesativar.
export default function FichaDoConsultor({
  aberto, aoFechar, perfilDeQuem, pessoa = null, times = [], consultoriaId = '', buscarConsultorias,
  titulo, aoCriar, aoColocarNosTimes, aoSalvar, podeReenviar, podeDesativar, aoReenviar, aoPedirAtivo,
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
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState(null)
  const [jaExiste, setJaExiste] = useState(null)
  const [enviando, setEnviando] = useState(false)

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

  function fechar() {
    setErro(null)
    setJaExiste(null)
    aoFechar()
  }

  function validar() {
    const achados = {}
    if (dados.nome.trim().length < 2) achados.nome = 'Use pelo menos 2 caracteres.'
    if (novo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email.trim())) achados.email = 'Digite um e-mail válido.'
    if (novo && dados.forma === 'senha' && dados.senha.length < 8) achados.senha = 'A senha precisa ter pelo menos 8 caracteres.'
    if (mostraCapacidade) {
      const horas = lerHoras(dados.carga)
      if (horas === null || horas > 60) achados.carga = 'Use de 0 a 60 horas.'
    }
    if (dados.data_entrada && dados.data_entrada > hoje()) achados.data_entrada = 'A data de entrada não pode ser no futuro.'
    setErros(achados)
    return Object.keys(achados).length === 0
  }

  // Carga a gravar: no Novo, só se for diferente da padrão; no Editar, só se mudou.
  function cargaNova() {
    if (!mostraCapacidade) return undefined
    const horas = lerHoras(dados.carga)
    const antes = novo ? CARGA_PADRAO : Number(pessoa.carga_semanal ?? CARGA_PADRAO)
    return horas === antes ? undefined : horas
  }

  async function criar() {
    const escolheTimes = mostraTimes
    const consultoria = escolheConsultoria ? dados.consultoria : consultoriaId
    if (papelAtual === 'admin' && !consultoria) {
      return setErro(buscarConsultorias ? 'Escolha uma consultoria para o administrador.' : 'Escolha uma consultoria no filtro da tela para criar o administrador.')
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
    const resposta = await aoCriar(pedido, { carga: cargaNova() })
    setEnviando(false)
    if (resposta?.codigo === 'ja_na_consultoria') {
      setErro(resposta.erro)
      setJaExiste(resposta.pessoa)
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
    })
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    fechar()
  }

  async function enviar() {
    if (enviando || !validar()) return
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

  const mostraAcesso = novo || (podeReenviar && pessoa.convite_pendente) || podeDesativar

  return (
    <JanelaFormulario aberto={aberto} aoFechar={fechar} titulo={titulo ?? (novo ? 'Novo acesso' : `Editar ${pessoa.nome}`)} icone={novo ? UserPlus : UserCog}
      largura="xl" enviando={enviando}
      descricao={!novo
        ? 'O e-mail não muda. Para trocar de e-mail, crie um acesso novo e desative este.'
        : dados.forma === 'convite'
          ? 'A pessoa recebe um e-mail para criar a senha (ou entrar com o Google, se o e-mail for o mesmo).'
          : 'Você passa a senha provisória para a pessoa. No primeiro acesso ela troca por uma senha só dela.'}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={fechar} disabled={enviando}>Cancelar</Button>
          {jaExiste ? (
            <Button type="button" disabled={enviando || marcados.length === 0} onClick={colocarNosTimes}>
              {enviando ? 'Salvando…' : 'Colocar nos times marcados'}
            </Button>
          ) : (
            <Button type="button" disabled={enviando} onClick={enviar}>
              {enviando ? 'Salvando…' : !novo ? 'Salvar' : dados.forma === 'convite' ? 'Enviar convite' : 'Criar acesso'}
            </Button>
          )}
        </>
      )}>
      <div onKeyDown={teclar} className="space-y-5">
        <Bloco titulo="Dados">
          {!novo && (
            <CampoImagem rotulo="foto" atual={urlPublica('fotos', pessoa.foto)} reserva={iniciais(dados.nome || pessoa.nome)}
              valor={foto} aoMudar={setFoto} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="ficha-nome" rotulo="Nome" erro={erros.nome}>
              <Input id="ficha-nome" autoComplete="off" maxLength={120} className="h-10"
                aria-invalid={erros.nome ? true : undefined} value={dados.nome} onChange={mudar('nome')} />
            </Campo>
            <Campo id="ficha-cargo" rotulo="Cargo">
              <Input id="ficha-cargo" autoComplete="off" maxLength={80} className="h-10" value={dados.cargo} onChange={mudar('cargo')} />
            </Campo>
            <Campo id="ficha-entrada" rotulo="Data de entrada" erro={erros.data_entrada}>
              <CampoData id="ficha-entrada" valor={dados.data_entrada} aoMudar={definir('data_entrada')} max={hoje()} />
            </Campo>
          </div>
        </Bloco>

        <Bloco titulo="Contato">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="ficha-email" rotulo="E-mail" erro={erros.email}>
              {novo
                ? <Input id="ficha-email" type="email" autoComplete="off" className="h-10"
                  aria-invalid={erros.email ? true : undefined} value={dados.email} onChange={mudar('email')} />
                : <Input id="ficha-email" className="h-10" value={pessoa.email ?? ''} disabled readOnly />}
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
          </div>
        </Bloco>

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
                <GerirAusencias pessoa={pessoa} />
              </div>
            )}
          </Bloco>
        )}

        {(opcoesDePapel.length > 0 && (novo || mudaPapel)) || mostraTimes ? (
          <Bloco titulo="Papel e times">
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
            {mostraTimes && (
              <EscolhaDeTimes times={times} marcados={marcados} aoAlternar={alternarTime}
                aviso={novo ? 'Nenhum time ainda. Dá para colocar a pessoa depois.' : null} />
            )}
          </Bloco>
        ) : null}

        {mostraAcesso && (
          <Bloco titulo="Acesso">
            {novo ? (
              <>
                <EscolhaForma valor={dados.forma} aoMudar={(forma) => setDados((d) => ({ ...d, forma }))} />
                {dados.forma === 'senha' && (
                  <Campo id="ficha-senha" rotulo="Senha provisória" erro={erros.senha}>
                    <Input id="ficha-senha" type="text" autoComplete="off" className="h-10"
                      aria-invalid={erros.senha ? true : undefined} value={dados.senha} onChange={mudar('senha')} />
                    {!erros.senha && <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres. A pessoa troca no primeiro acesso.</p>}
                  </Campo>
                )}
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                {podeReenviar && pessoa.convite_pendente && (
                  <Button type="button" variant="outline" size="sm" onClick={aoReenviar}><Send /> Reenviar convite</Button>
                )}
                {podeDesativar && (
                  <Button type="button" variant="outline" size="sm"
                    className={pessoa.ativo === false ? '' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'}
                    onClick={() => aoPedirAtivo(pessoa.ativo === false ? 'reativar' : 'desativar')}>
                    {pessoa.ativo === false ? <><UserCheck /> Reativar</> : <><UserX /> Desativar</>}
                  </Button>
                )}
              </div>
            )}
          </Bloco>
        )}

        {erro && <Aviso>{erro}</Aviso>}

      </div>
    </JanelaFormulario>
  )
}
