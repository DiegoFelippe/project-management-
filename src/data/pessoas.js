import { supabase } from '@/lib/supabase'

// Pessoas que quem olha pode ver (o banco recorta pelo papel).
export async function listarPessoas({ consultoriaId, papeis } = {}) {
  let consulta = supabase.from('perfis').select('id, nome, email, papel, consultoria_id').order('nome')
  if (consultoriaId) consulta = consulta.eq('consultoria_id', consultoriaId)
  if (papeis) consulta = consulta.in('papel', papeis)
  const { data, error } = await consulta
  if (error) throw error
  return data
}
