-- Arquivos do cliente: objetos sem linha em cliente_arquivos (órfãos). Ao apagar o cliente, as linhas saem em
-- cascata e os objetos ficam no Storage; o app chama limparPastaDoCliente logo depois (src/data/arquivos.js).
-- - A central vê todos: também vê e tira qualquer objeto órfão do bucket, a qualquer tempo (antes, só por 1 dia,
--   pela lembrança de quem apagou).
-- - Quem subiu o objeto só o alcança enquanto ainda pode enviar arquivo àquele cliente: quem saiu da consultoria,
--   deixou de ser o consultor, ou cujo cliente foi apagado, arquivado ou movido não vê mais as próprias sobras.
-- Continua valendo: enquanto a linha existe, o objeto só sai pela regra da linha (primeiro a linha, depois o
-- objeto), nem pela central. vejo_objeto_de_arquivo usa esta função para os órfãos e não muda.

create or replace function private.posso_tirar_objeto_de_arquivo(p_caminho text, p_dono text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and not exists (select 1 from public.cliente_arquivos a where a.caminho = p_caminho)
    and (private.sou_central()
         or (p_dono = (select auth.uid())::text
             and private.posso_enviar_arquivo(private.id_da_pasta(p_caminho)))
         or exists (
           select 1 from private.arquivos_apagados x
           where x.caminho = p_caminho
             and x.apagado_por = (select auth.uid())
             and x.apagado_em > now() - interval '1 day')),
    false)
$$;

revoke all on function private.posso_tirar_objeto_de_arquivo(text, text) from public, anon;
grant execute on function private.posso_tirar_objeto_de_arquivo(text, text) to authenticated;
