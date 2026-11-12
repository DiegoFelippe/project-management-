import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { SelectNativo } from '@/components/ui/select-nativo'
import { listarNomesDeConsultorias } from '@/data/consultorias'

// Só o dono vê: escolhe de qual consultoria olhar ("" = todas).
export default function FiltroConsultoria({ valor, aoMudar }) {
  const [consultorias, setConsultorias] = useState([])

  useEffect(() => {
    listarNomesDeConsultorias().then(setConsultorias).catch(() => setConsultorias([]))
  }, [])

  return (
    <div className="mb-4 flex max-w-sm items-center gap-3">
      <Label htmlFor="filtro-consultoria" className="shrink-0 text-muted-foreground">Consultoria</Label>
      <SelectNativo id="filtro-consultoria" className="flex-1" value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">Todas</option>
        {consultorias.map((c) => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
      </SelectNativo>
    </div>
  )
}
