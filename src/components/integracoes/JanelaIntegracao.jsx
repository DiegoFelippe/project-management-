import { Plug, RefreshCw } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'

// Moldura comum dos formulários de integração: título, campos, avisos e o rodapé Cancelar · Testar · Salvar.
// O estado (salvando, testando, erro e o resultado do teste) vem do useEnvioDaIntegracao do formulário. Testar
// (`aoTestar`) testa o que foi digitado sem gravar nada; o resultado aparece aqui. Salvar grava e o servidor testa de
// novo (a situação da linha vem desse teste).
export default function JanelaIntegracao({
  titulo, descricao, aoFechar, aoSalvar, aoTestar, erro, enviando, testando = false, resultado, children,
}) {
  const ocupado = enviando || testando
  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={titulo} descricao={descricao} icone={Plug} largura="lg" enviando={ocupado}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={ocupado}>Cancelar</Button>
          {aoTestar && (
            <Button type="button" variant="outline" onClick={aoTestar} disabled={ocupado}>
              <RefreshCw className={testando ? 'animate-spin' : ''} /> {testando ? 'Testando…' : 'Testar'}
            </Button>
          )}
          <Button type="submit" form="form-integracao" disabled={ocupado}>{enviando ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}>
      <form id="form-integracao" noValidate onSubmit={aoSalvar} className="space-y-5">
        {children}
        {erro && <Aviso>{erro}</Aviso>}
        {!erro && resultado?.erro && <Aviso>{resultado.erro}</Aviso>}
        {!erro && resultado?.mensagem && <Aviso tipo="sucesso">{resultado.mensagem}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
