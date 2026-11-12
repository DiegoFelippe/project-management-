// Respostas JSON com CORS e o tratamento comum de erros das funções.
// O acesso é pelo token no cabeçalho Authorization (sem cookies), por isso a origem pode ser qualquer uma.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class Falha extends Error {
  constructor(
    public status: number,
    public codigo: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(codigo)
  }
}

export function responder(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

export function falha(status: number, codigo: string, extra: Record<string, unknown> = {}): Response {
  return responder(status, { codigo, ...extra })
}

export async function lerJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const corpo = await req.json()
    if (corpo && typeof corpo === 'object' && !Array.isArray(corpo)) return corpo
  } catch {
    // cai no erro abaixo
  }
  throw new Falha(400, 'dados_invalidos', { campo: 'corpo' })
}

export function servir(tratar: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
    if (req.method !== 'POST') return falha(405, 'metodo_invalido')
    try {
      return await tratar(req)
    } catch (erro) {
      if (erro instanceof Falha) return falha(erro.status, erro.codigo, erro.extra)
      console.error(erro)
      return falha(500, 'erro_interno')
    }
  })
}
