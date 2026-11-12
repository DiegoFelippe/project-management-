import { supabase } from '@/lib/supabase'

// Para o filtro do dono nas telas Times e Usuários.
export async function listarNomesDeConsultorias() {
  const { data, error } = await supabase.from('consultorias').select('id, nome').order('nome')
  if (error) throw error
  return data
}
