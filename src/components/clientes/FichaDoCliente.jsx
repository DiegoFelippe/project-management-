import { useId, useState } from 'react'
import { Building2, ChevronDown, MapPin, Timer } from 'lucide-react'
import Avatar from '@/components/comum/Avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarCnpj } from '@/lib/cnpj'
import { formatarHoras } from '@/lib/horas'
import { cn } from '@/lib/utils'

function situacaoDe(c) {
  if (c.arquivado) return { rotulo: 'Arquivado', variante: 'secondary' }
  if (!c.consultoria_id) return { rotulo: 'Aguardando distribuição', variante: 'notice' }
  if (!c.consultor_id) return { rotulo: 'Aguardando consultor', variante: 'notice' }
  return { rotulo: 'Em atendimento', variante: 'positive' }
}

// Os itens da linha: os separadores somem no celular, onde os itens quebram linha.
function Item({ icone: Icone, children }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground/85 sm:not-first-of-type:before:mr-2 sm:not-first-of-type:before:h-4 sm:not-first-of-type:before:w-px sm:not-first-of-type:before:bg-border">
      {Icone && <Icone aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
      {children}
    </span>
  )
}

function Dado({ rotulo, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-rotulo font-medium text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium [overflow-wrap:anywhere]">{children || '—'}</dd>
    </div>
  )
}

// Ficha compacta da aba Geral (design 2026-11-17-graficos-do-inicio-e-do-cliente, "Ficha compacta"): uma linha com a
// situação, a consultoria, o consultor, a previsão e a cidade; "Empresa e contato" abre, no mesmo cartão, CNPJ, razão
// social, observações e contato ("—" no vazio). Nada além do que buscarCliente já traz.
export default function FichaDoCliente({ cliente }) {
  const [aberta, setAberta] = useState(false)
  const idDoDetalhe = useId()
  const situacao = situacaoDe(cliente)
  const cidade = cliente.cidade && `${cliente.cidade}${cliente.uf ? `/${cliente.uf}` : ''}`
  return (
    <section aria-label="Resumo do cliente" className="card flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-3.5 py-2.5">
      <Badge variant={situacao.variante}>{situacao.rotulo}</Badge>
      <span className="contents">
        {cliente.consultoria && <Item icone={Building2}><span className="truncate">{cliente.consultoria.nome}</span></Item>}
        {cliente.consultor && (
          <Item>
            <Avatar pessoa={cliente.consultor} className="size-5 ring-0" />
            <span className="truncate">{cliente.consultor.nome}</span>
            {cliente.consultor.ativo === false && <span className="text-rotulo text-muted-foreground">(desativado)</span>}
          </Item>
        )}
        <Item icone={Timer}><span className="whitespace-nowrap tabular-nums">{`${formatarHoras(Number(cliente.horas_mes))}/mês previstas`}</span></Item>
        {cidade && <Item icone={MapPin}><span className="truncate">{cidade}</span></Item>}
      </span>
      <Button type="button" variant="ghost" size="sm" className="ml-auto" aria-expanded={aberta} aria-controls={idDoDetalhe}
        onClick={() => setAberta((v) => !v)}>
        Empresa e contato <ChevronDown aria-hidden="true" className={cn('transition-transform', aberta && 'rotate-180')} />
      </Button>
      {aberta && (
        <dl id={idDoDetalhe} className="mt-1 grid basis-full grid-cols-1 gap-x-6 gap-y-3 border-t pt-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Dado rotulo="CNPJ">{cliente.cnpj && <span className="tabular-nums">{formatarCnpj(cliente.cnpj)}</span>}</Dado>
          <Dado rotulo="Razão social">{cliente.razao_social}</Dado>
          <Dado rotulo="Observações">{cliente.observacoes}</Dado>
          <Dado rotulo="Contato">{cliente.contato_nome}</Dado>
          <Dado rotulo="Telefone">{cliente.contato_telefone && <span className="tabular-nums">{cliente.contato_telefone}</span>}</Dado>
          <Dado rotulo="E-mail">{cliente.contato_email}</Dado>
        </dl>
      )}
    </section>
  )
}
