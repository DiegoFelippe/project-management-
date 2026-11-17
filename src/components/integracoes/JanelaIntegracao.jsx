import { Plug, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'

// Moldura comum dos formulários de integração: título, campos, aviso de erro e o rodapé Cancelar · Testar · Salvar.
// Testar (`aoTestar`) testa o que foi digitado sem gravar nada e mostra o resultado aqui na janela; devolve
// { erro, mensagem }, ou null quando o próprio formulário recusou os dados (o aviso é o `erro` do formulário).
// Salvar grava e o servidor testa de novo (a situação da linha vem desse teste).
export default function JanelaIntegracao({ titulo, descricao, aoFechar, aoSalvar, aoTestar, erro, enviando, children }) {
  const [testando, setTestando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const ocupado = enviando || testando

  async function testar() {
    setResultado(null)
    setTestando(true)
    try {
      setResultado(await aoTestar())
    } finally {
      setTestando(false)
    }
  }

  function salvar(evento) {
    setResultado(null)
    return aoSalvar(evento)
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={titulo} descricao={descricao} icone={Plug} largura="lg" enviando={ocupado}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={ocupado}>Cancelar</Button>
          {aoTestar && (
            <Button type="button" variant="outline" onClick={testar} disabled={ocupado}>
              <RefreshCw className={testando ? 'animate-spin' : ''} /> {testando ? 'Testando…' : 'Testar'}
            </Button>
          )}
          <Button type="submit" form="form-integracao" disabled={ocupado}>{enviando ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}>
      <form id="form-integracao" noValidate onSubmit={salvar} className="space-y-5">
        {children}
        {erro && <Aviso>{erro}</Aviso>}
        {!erro && resultado?.erro && <Aviso>{resultado.erro}</Aviso>}
        {!erro && resultado?.mensagem && <Aviso tipo="sucesso">{resultado.mensagem}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
