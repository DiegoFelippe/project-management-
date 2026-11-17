import { Check, Copy, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cancelarCadastro, concluirCadastro, iniciarCadastro } from '@/data/verificacao'
import { codigoCompleto } from '@/lib/verificacao'
import { cn } from '@/lib/utils'
import CampoCodigo from './CampoCodigo'

const agrupar = (chave) => chave.match(/.{1,4}/g)?.join(' ') ?? chave

// Cadastro do app autenticador (Meu perfil e a tela de configurar no entrar): QR code (a imagem SVG que o Auth
// devolve), a chave para digitar ou copiar e o primeiro código de 6 dígitos. O segredo só passa pela tela: quem
// guarda é o Auth do Supabase. `aoConcluir()` depois do código certo (a sessão já é aal2); `aoCancelar()` opcional.
// `aoEnviando(true | false)` (opcional) avisa quando o código vai para o Auth e quando volta recusado.
export default function CadastroDoAutenticador({ aoConcluir, aoCancelar, aoEnviando, rotuloConfirmar = 'Confirmar e ativar', idCodigo = 'codigo-do-app', focar = false }) {
  const [cadastro, setCadastro] = useState(null)
  const [erroInicio, setErroInicio] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [copia, setCopia] = useState(null)
  const iniciado = useRef(false)

  // Uma vez só (o modo estrito do React monta duas vezes em desenvolvimento).
  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true
    iniciarCadastro().then((r) => (r.erro ? setErroInicio(r.erro) : setCadastro(r)))
  }, [])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(cadastro.segredo)
      setCopia('ok')
    } catch {
      setCopia('falhou')
    }
  }

  async function confirmar(evento) {
    evento.preventDefault()
    if (enviando) return
    if (!codigoCompleto(codigo)) return setErro('Digite os 6 dígitos que aparecem no app.')
    setErro(null)
    setEnviando(true)
    aoEnviando?.(true)
    const { erro: falha } = await concluirCadastro(cadastro.fatorId, codigo)
    setEnviando(false)
    if (falha) {
      aoEnviando?.(false)
      return setErro(falha)
    }
    aoConcluir()
  }

  async function cancelar() {
    if (cadastro) await cancelarCadastro(cadastro.fatorId)
    aoCancelar()
  }

  if (erroInicio) {
    return (
      <div className="grid gap-3">
        <Aviso>{erroInicio}</Aviso>
        {aoCancelar && <div><Button type="button" variant="outline" size="sm" onClick={aoCancelar}>Voltar</Button></div>}
      </div>
    )
  }

  if (!cadastro) {
    return (
      <p role="status" className="text-muted-foreground flex items-center gap-2 text-corpo">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Preparando o QR code…
      </p>
    )
  }

  return (
    <form noValidate onSubmit={confirmar} aria-label="Ativar o app autenticador" className="grid gap-4">
      <ol className="grid gap-4 text-corpo">
        <li className="grid gap-2">
          <p className="font-medium">1. Abra o app autenticador do celular e leia o QR code.</p>
          <p className="text-muted-foreground text-rotulo">Serve o Google Authenticator, o Microsoft Authenticator, o 1Password e outros.</p>
          <img src={cadastro.qr} alt="QR code para o app autenticador" className="size-44 rounded-xl border bg-white p-2" />
          <p className="text-muted-foreground text-rotulo">Não dá para ler? Digite esta chave no app:</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="bg-muted rounded-lg border px-2.5 py-1.5 font-mono text-corpo tracking-wider break-all">{agrupar(cadastro.segredo)}</code>
            <Button type="button" variant="outline" size="sm" aria-label="Copiar a chave" onClick={copiar}>
              {copia === 'ok' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} Copiar
            </Button>
          </div>
          <p role="status" className={cn('min-h-4 text-rotulo', copia === 'ok' ? 'text-positive' : 'text-destructive')}>
            {copia === 'ok' ? 'Chave copiada.' : copia === 'falhou' ? 'Não deu para copiar: selecione a chave e copie com o teclado.' : ''}
          </p>
        </li>
        <li className="grid gap-2">
          <p className="font-medium">2. Digite o código de 6 dígitos que aparece no app.</p>
          <Label htmlFor={idCodigo}>Código do app</Label>
          <CampoCodigo id={idCodigo} valor={codigo} aoMudar={setCodigo} invalido={!!erro} autoFocus={focar} />
        </li>
      </ol>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap justify-end gap-2">
        {aoCancelar && <Button type="button" variant="outline" disabled={enviando} onClick={cancelar}>Cancelar ativação</Button>}
        <Button type="submit" disabled={enviando}>{enviando ? 'Confirmando…' : rotuloConfirmar}</Button>
      </div>
    </form>
  )
}
