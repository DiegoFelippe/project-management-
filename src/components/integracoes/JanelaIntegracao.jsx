import { Plug } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'

// Moldura comum dos formulários de integração: título, campos, aviso de erro e "Salvar e testar".
export default function JanelaIntegracao({ titulo, descricao, aoFechar, aoSalvar, erro, enviando, children }) {
  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={titulo} descricao={descricao} icone={Plug} largura="lg" enviando={enviando}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-integracao" disabled={enviando}>{enviando ? 'Testando…' : 'Salvar e testar'}</Button>
        </>
      )}>
      <form id="form-integracao" noValidate onSubmit={aoSalvar} className="space-y-5">
        {children}
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
