import { toast } from 'sonner'
import AvisoComAcoes from './AvisoComAcoes'

// avisar(texto, { erro, acoes }): acoes = [{ rotulo, aoClicar } | { rotulo, para }] (para: endereço do app, vira link). A
// primeira é a principal (cheia); as outras, outline.
export function avisar(texto, { erro = false, acoes = [] } = {}) {
  // O sonner não conta o tempo (Infinity): quem conta é o aviso, que para com o mouse e o foco.
  return toast.custom((id) => <AvisoComAcoes id={id} texto={texto} erro={erro} acoes={acoes} />,
    { duration: Infinity, className: 'rounded-[14px]' })
}
