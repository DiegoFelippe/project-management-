// Preferências de cada pessoa (por enquanto, o tema). Cada um só lê e grava as suas.
import { supabase } from '@/lib/supabase'

export async function salvarTema(pessoaId, tema) {
  const { error } = await supabase
    .from('preferencias')
    .upsert({ pessoa_id: pessoaId, tema, atualizado_em: new Date().toISOString() })
  if (error) throw error
}
