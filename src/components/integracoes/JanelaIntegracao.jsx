import { Plug, RefreshCw } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import JanelaFormulario, { BotaoCancelar } from '@/components/comum/JanelaFormulario'
import BotaoComResultado from '@/components/comum/BotaoComResultado'
import { Button } from '@/components/ui/button'

// Moldura comum dos formulários de integração: título, campos, avisos e o rodapé Cancelar · Testar · Salvar.
// O estado (salvando, testando, erro, a tentativa com erro e o resultado do teste) vem do useEnvioDaIntegracao do
// formulário. Testar (`aoTestar`) testa o que foi digitado sem gravar nada; o resultado aparece aqui. Salvar grava e o
// servidor testa de novo (a situação da linha vem desse teste). `tentativa` leva o foco ao primeiro campo marcado e
// `alterado` faz o Cancelar, o Esc e o X perguntarem antes de descartar (usabilidade, U2 e U4).
export default function JanelaIntegracao({
  titulo, descricao, aoFechar, aoSalvar, aoTestar, erro, tentativa = 0, alterado = false, enviando, testando = false, resultado, children,
}) {
  const ocupado = enviando || testando
  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={titulo} descricao={descricao} icone={Plug} largura="lg" enviando={ocupado}
      tentativa={tentativa} alterado={alterado}
      rodape={(
        <>
          <BotaoCancelar />
          {aoTestar && (
            <BotaoComResultado variant="outline" acao={aoTestar} rotulo="Testar" rotuloFeito="✓ Testado" rotuloIndo="Testando…"
              icone={<RefreshCw aria-hidden="true" />} aoErro={() => {}} disabled={enviando} />
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
