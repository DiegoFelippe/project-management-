import { ShieldAlert, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CartaoChave from '@/components/campos/CartaoChave'
import { CartaoDaSecao } from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import CadastroDoAutenticador from './CadastroDoAutenticador'
import CampoCodigo from './CampoCodigo'
import { desativarVerificacao } from '@/data/verificacao'
import { codigoCompleto, situacaoNaFicha } from '@/lib/verificacao'
import { cn } from '@/lib/utils'

const APARENCIA = {
  ativa: { icone: ShieldCheck, cor: 'bg-positive-soft text-positive', linha: 'Ao entrar, além da senha, o app pede o código de 6 dígitos do celular.' },
  pendente: { icone: ShieldAlert, cor: 'bg-notice-soft text-notice', linha: 'A verificação é exigida para o seu acesso: ative o app autenticador.' },
  desligada: { icone: ShieldOff, cor: 'bg-muted text-muted-foreground', linha: 'Ative para entrar com a senha e um código do app autenticador do celular: sem o celular, ninguém usa a sua senha.' },
}

// Meu perfil (aba Acesso da ficha no modo próprio) → Verificação em duas etapas: a própria pessoa ativa (QR code +
// chave + código) ou desativa (com um código atual; se a verificação for exigida para ela, não desativa). A chave
// "Exigir" aparece só para ler: quem exige é a administração, nunca a própria pessoa. Tudo num cartão só (chave, situação
// e, quando abertos, os formulários de ativar ou desativar, separados por traços). Os formulários daqui têm os
// próprios botões e o Enter no código não salva a ficha.
export default function VerificacaoDoPerfil({ perfil, aoMudar }) {
  const id = useId()
  const [modo, setModo] = useState('parado')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const { estado, rotulo } = situacaoNaFicha({ verificacaoDesde: perfil.verificacao_desde, exigida: perfil.exige_2fa })
  const { icone: Icone, cor, linha } = APARENCIA[estado]
  const ativa = estado === 'ativa'

  function parar() {
    setModo('parado')
    setCodigo('')
    setErro(null)
  }

  async function ativada() {
    parar()
    await aoMudar?.()
    toast.success('Verificação em duas etapas ativada.')
  }

  async function desativar(evento) {
    evento.preventDefault()
    if (enviando) return
    if (!codigoCompleto(codigo)) return setErro('Digite os 6 dígitos que aparecem no app.')
    setErro(null)
    setEnviando(true)
    const { erro: falha } = await desativarVerificacao(codigo)
    setEnviando(false)
    if (falha) return setErro(falha)
    parar()
    await aoMudar?.()
    toast.success('Verificação em duas etapas desativada.')
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-3">
      <h3 id={`${id}-titulo`} className="section-label">Verificação em duas etapas</h3>
      <CartaoDaSecao className="divide-y overflow-hidden">
        <CartaoChave embutido titulo="Exigir verificação em duas etapas" icone={Smartphone} ligada={!!perfil.exige_2fa} aoMudar={() => {}} desabilitado
          dica={perfil.exige_2fa
            ? 'A administração exige o código do app autenticador para o seu acesso.'
            : 'A administração não exige. Você pode ativar por conta própria, logo abaixo.'} />
        <div data-slot="situacao-2fa" className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', cor)}><Icone className="size-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-rotulo font-semibold">{rotulo}</p>
            <p className="text-muted-foreground text-legenda">{linha}</p>
            {ativa && perfil.exige_2fa && (
              <p className="text-muted-foreground text-legenda">A verificação é exigida para o seu acesso: não dá para desativar.</p>
            )}
          </div>
          {modo === 'parado' && !ativa && (
            <Button type="button" variant="outline" size="sm" onClick={() => setModo('ativando')}><Smartphone /> Ativar</Button>
          )}
          {modo === 'parado' && ativa && !perfil.exige_2fa && (
            <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setModo('desativando')}>
              <ShieldOff /> Desativar
            </Button>
          )}
        </div>

        {modo === 'ativando' && (
          <div className="p-3">
            <CadastroDoAutenticador idCodigo={`${id}-codigo-cadastro`} focar aoConcluir={ativada} aoCancelar={parar} />
          </div>
        )}

        {modo === 'desativando' && (
          <form noValidate onSubmit={desativar} aria-label="Desativar a verificação em duas etapas" className="grid gap-3 p-3">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-codigo-atual`}>Código atual do app</Label>
              <CampoCodigo id={`${id}-codigo-atual`} valor={codigo} aoMudar={setCodigo} invalido={!!erro} autoFocus />
              <p className="text-muted-foreground text-rotulo">Para desativar, confirme com o código que aparece agora no app.</p>
            </div>
            {erro && <Aviso>{erro}</Aviso>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={enviando} onClick={parar}>Manter ativa</Button>
              <Button type="submit" variant="destructive" disabled={enviando}>{enviando ? 'Desativando…' : 'Desativar verificação'}</Button>
            </div>
          </form>
        )}
      </CartaoDaSecao>
    </section>
  )
}
