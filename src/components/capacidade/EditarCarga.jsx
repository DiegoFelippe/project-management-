import { Timer } from 'lucide-react'
import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoNumero from '@/components/campos/CampoNumero'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { lerHoras } from '@/components/clientes/rotulos'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

// Carga semanal de uma pessoa (horas por semana). aoSalvar(horas) devolve { erro }. O campo vai até 99 (e não 60)
// para o aviso "Use de 0 a 60 horas." continuar valendo: o CampoNumero corta no máximo ao sair do campo.
export default function EditarCarga({ aberto, pessoa, aoFechar, aoSalvar }) {
  const [horas, setHoras] = useState(String(pessoa.carga_semanal ?? '').replace('.', ','))
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(evento) {
    evento.preventDefault()
    const valor = lerHoras(horas)
    if (valor === null || valor > 60) return setErro('Use de 0 a 60 horas.')
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar(valor)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo={`Carga semanal de ${pessoa.nome}`} icone={Timer} enviando={enviando}
      descricao="Quantas horas por semana esta pessoa atende clientes. Com 0, ela sai da sugestão de consultor."
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-carga" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}>
      <form id="form-carga" noValidate onSubmit={salvar} className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="carga-horas">Carga semanal (horas)</Label>
          <CampoNumero id="carga-horas" valor={horas} aoMudar={setHoras} min={0} max={99} passo={0.5} decimal unidade="h" />
        </div>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
