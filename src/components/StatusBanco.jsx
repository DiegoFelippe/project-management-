import { useEffect, useState } from 'react'
import { supabaseUrl, verificarConexao } from '../lib/supabase'

// Mostra se o app está falando com o Supabase (local ou na nuvem).
export default function StatusBanco() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let ativo = true
    verificarConexao().then((resultado) => {
      if (ativo) setStatus(resultado)
    })
    return () => {
      ativo = false
    }
  }, [])

  if (!status) return <p className="status-banco">Banco: verificando…</p>
  if (status.ok) {
    return <p className="status-banco ok">Banco: conectado ao Supabase em {supabaseUrl}</p>
  }
  return <p className="status-banco erro">Banco: sem conexão. {status.motivo}</p>
}
