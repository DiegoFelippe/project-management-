import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectNativo } from '@/components/ui/select-nativo'
import { cn } from '@/lib/utils'

// Quem cria o quê: gestor → pessoa; administrador → pessoa ou gestor; dono → administrador.
const PAPEIS_POR_QUEM_CRIA = {
  gestor: [{ valor: 'pessoa', rotulo: 'Pessoa' }],
  admin: [
    { valor: 'pessoa', rotulo: 'Pessoa' },
    { valor: 'gestor', rotulo: 'Gestor' },
  ],
  dono: [{ valor: 'admin', rotulo: 'Administrador' }],
}

const FORMAS = [
  { valor: 'convite', rotulo: 'Enviar convite' },
  { valor: 'senha', rotulo: 'Criar com senha' },
]

const vazio = (papel) => ({ forma: 'convite', nome: '', email: '', papel, times: [], senha: '' })

export default function NovoAcesso({ aberto, aoFechar, papelDeQuemCria, times = [], consultoriaId, aoCriar, aoColocarNosTimes }) {
  const papeis = PAPEIS_POR_QUEM_CRIA[papelDeQuemCria] ?? []
  const escolheTimes = papelDeQuemCria !== 'dono'
  const [dados, setDados] = useState(() => vazio(papeis[0]?.valor))
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState(null)
  const [jaExiste, setJaExiste] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const mudar = (campo) => (evento) => setDados((d) => ({ ...d, [campo]: evento.target.value }))

  function alternarTime(id) {
    setDados((d) => ({ ...d, times: d.times.includes(id) ? d.times.filter((t) => t !== id) : [...d.times, id] }))
  }

  function fechar() {
    setDados(vazio(papeis[0]?.valor))
    setErros({})
    setErro(null)
    setJaExiste(null)
    aoFechar()
  }

  function validar() {
    const achados = {}
    if (dados.nome.trim().length < 2) achados.nome = 'Use pelo menos 2 caracteres.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email.trim())) achados.email = 'Digite um e-mail válido.'
    if (dados.forma === 'senha' && dados.senha.length < 8) achados.senha = 'A senha precisa ter pelo menos 8 caracteres.'
    setErros(achados)
    return Object.keys(achados).length === 0
  }

  async function enviar(evento) {
    evento.preventDefault()
    if (enviando || !validar()) return
    setErro(null)
    setJaExiste(null)
    setEnviando(true)
    const pedido = {
      forma: dados.forma,
      nome: dados.nome.trim(),
      email: dados.email.trim(),
      papel: dados.papel,
      times: escolheTimes ? dados.times : [],
    }
    if (dados.forma === 'senha') pedido.senha = dados.senha
    if (papelDeQuemCria === 'dono') pedido.consultoria_id = consultoriaId
    const resposta = await aoCriar(pedido)
    setEnviando(false)
    if (resposta?.codigo === 'ja_na_consultoria') {
      setErro(resposta.erro)
      setJaExiste(resposta.pessoa)
      return
    }
    if (resposta?.erro) return setErro(resposta.erro)
    fechar()
  }

  async function colocarNosTimes() {
    setEnviando(true)
    const resposta = await aoColocarNosTimes(jaExiste.id, dados.times)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    fechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && fechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{papelDeQuemCria === 'dono' ? 'Novo administrador' : 'Novo acesso'}</DialogTitle>
          <DialogDescription>
            {dados.forma === 'convite'
              ? 'A pessoa recebe um e-mail para criar a senha (ou entrar com o Google, se o e-mail for o mesmo).'
              : 'Você passa a senha provisória para a pessoa. No primeiro acesso ela troca por uma senha só dela.'}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={enviar} className="grid gap-4">
          <div role="radiogroup" aria-label="Como criar o acesso" className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm font-semibold">
            {FORMAS.map((f) => (
              <label key={f.valor}
                className={cn('cursor-pointer rounded-md py-1.5 text-center text-muted-foreground transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  dados.forma === f.valor && 'bg-card text-foreground shadow-xs')}>
                <input type="radio" name="forma" value={f.valor} className="sr-only"
                  checked={dados.forma === f.valor} onChange={mudar('forma')} />
                {f.rotulo}
              </label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="acesso-nome">Nome</Label>
              <Input id="acesso-nome" autoComplete="off" maxLength={120} className="h-10"
                aria-invalid={erros.nome ? true : undefined} value={dados.nome} onChange={mudar('nome')} />
              {erros.nome && <p className="text-xs text-destructive">{erros.nome}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acesso-email">E-mail</Label>
              <Input id="acesso-email" type="email" autoComplete="off" className="h-10"
                aria-invalid={erros.email ? true : undefined} value={dados.email} onChange={mudar('email')} />
              {erros.email && <p className="text-xs text-destructive">{erros.email}</p>}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="acesso-papel">Papel</Label>
            <SelectNativo id="acesso-papel" value={dados.papel} onChange={mudar('papel')}>
              {papeis.map((p) => (
                <option key={p.valor} value={p.valor}>{p.rotulo}</option>
              ))}
            </SelectNativo>
          </div>

          {escolheTimes && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Times</legend>
              {times.length === 0 && <p className="text-xs text-muted-foreground">Nenhum time ainda. Dá para colocar a pessoa depois.</p>}
              <div className="flex flex-wrap gap-2">
                {times.map((t) => {
                  const marcado = dados.times.includes(t.id)
                  return (
                    <label key={t.id}
                      className={cn('cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                        marcado ? 'border-transparent bg-accent text-accent-foreground' : 'text-muted-foreground hover:border-primary/40')}>
                      <input type="checkbox" className="sr-only" checked={marcado} onChange={() => alternarTime(t.id)} />
                      {marcado ? '✓ ' : ''}{t.nome}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {dados.forma === 'senha' && (
            <div className="grid gap-2">
              <Label htmlFor="acesso-senha">Senha provisória</Label>
              <Input id="acesso-senha" type="text" autoComplete="off" className="h-10"
                aria-invalid={erros.senha ? true : undefined} value={dados.senha} onChange={mudar('senha')} />
              {erros.senha
                ? <p className="text-xs text-destructive">{erros.senha}</p>
                : <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres. A pessoa troca no primeiro acesso.</p>}
            </div>
          )}

          {erro && <Aviso>{erro}</Aviso>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
            {jaExiste ? (
              <Button type="button" disabled={enviando || dados.times.length === 0} onClick={colocarNosTimes}>
                Colocar nos times marcados
              </Button>
            ) : (
              <Button type="submit" disabled={enviando}>
                {dados.forma === 'convite' ? 'Enviar convite' : 'Criar acesso'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
