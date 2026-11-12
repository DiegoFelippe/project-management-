-- Foto das pessoas ("Meu perfil" e Editar acesso) e logo das consultorias (menu Consultorias, do dono).
-- Os arquivos ficam no Storage, na pasta do dono do arquivo: fotos/<id da pessoa>/<uuid>.webp e
-- logos/<id da consultoria>/<uuid>.webp. Os buckets são públicos para a imagem aparecer por endereço
-- (o nome do arquivo não dá para adivinhar); enviar, trocar e apagar passam pelas regras abaixo.
-- O nome (da pessoa e da consultoria) continua mudando só pelas Edge Functions.

alter table public.perfis
  add column foto text check (foto is null or foto ~ ('^' || id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$'));

alter table public.consultorias
  add column logo text check (logo is null or logo ~ ('^' || id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('fotos', 'fotos', true, 1048576, array['image/webp', 'image/jpeg', 'image/png']),
  ('logos', 'logos', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Quem muda a foto de quem: a própria pessoa, e quem pode editá-la (as mesmas regras do gerenciar-acesso):
-- dono → administradores; administrador → gestores e pessoas da consultoria;
-- gestor → pessoas que ele criou ou que estão nos times dele.
create function private.posso_mudar_foto(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.liberado() and (
    p_id = (select auth.uid())
    or exists (
      select 1 from public.perfis p
      where p.id = p_id
        and (
          (private.sou_dono() and p.papel = 'admin')
          or (
            p.consultoria_id = private.consultoria_atual()
            and (
              (private.sou_admin() and p.papel in ('gestor', 'pessoa'))
              or (
                private.papel_atual() = 'gestor' and p.papel = 'pessoa'
                and (
                  p.criado_por = (select auth.uid())
                  or exists (
                    select 1 from public.time_membros m
                    join public.times t on t.id = m.time_id
                    where m.pessoa_id = p.id and t.gestor_id = (select auth.uid())
                  )
                )
              )
            )
          )
        )
    )
  )
$$;

-- Logo: só o dono (é no menu Consultorias).
create function private.posso_mudar_logo(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.sou_dono() and exists (select 1 from public.consultorias where id = p_id)
$$;

-- As mesmas regras pelo caminho do arquivo no Storage (a primeira pasta é o id).
create function private.id_da_pasta(p_caminho text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when (storage.foldername(p_caminho))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(p_caminho))[1])::uuid
  end
$$;

revoke all on function private.posso_mudar_foto(uuid), private.posso_mudar_logo(uuid), private.id_da_pasta(text) from public;
grant execute on function private.posso_mudar_foto(uuid), private.posso_mudar_logo(uuid), private.id_da_pasta(text) to authenticated;

-- Direto no banco, só a foto e a logo mudam (o resto passa pelas Edge Functions).
grant update (foto) on public.perfis to authenticated;
grant update (logo) on public.consultorias to authenticated;

create policy "mudar a foto" on public.perfis
  for update to authenticated
  using (private.posso_mudar_foto(id))
  with check (private.posso_mudar_foto(id));

create policy "dono muda a logo" on public.consultorias
  for update to authenticated
  using (private.posso_mudar_logo(id))
  with check (private.posso_mudar_logo(id));

create policy "fotos e logos: ver as que pode mudar" on storage.objects
  for select to authenticated
  using (
    (bucket_id = 'fotos' and coalesce(private.posso_mudar_foto(private.id_da_pasta(name)), false))
    or (bucket_id = 'logos' and coalesce(private.posso_mudar_logo(private.id_da_pasta(name)), false))
  );

create policy "fotos e logos: enviar" on storage.objects
  for insert to authenticated
  with check (
    (bucket_id = 'fotos' and coalesce(private.posso_mudar_foto(private.id_da_pasta(name)), false))
    or (bucket_id = 'logos' and coalesce(private.posso_mudar_logo(private.id_da_pasta(name)), false))
  );

create policy "fotos e logos: trocar" on storage.objects
  for update to authenticated
  using (
    (bucket_id = 'fotos' and coalesce(private.posso_mudar_foto(private.id_da_pasta(name)), false))
    or (bucket_id = 'logos' and coalesce(private.posso_mudar_logo(private.id_da_pasta(name)), false))
  )
  with check (
    (bucket_id = 'fotos' and coalesce(private.posso_mudar_foto(private.id_da_pasta(name)), false))
    or (bucket_id = 'logos' and coalesce(private.posso_mudar_logo(private.id_da_pasta(name)), false))
  );

create policy "fotos e logos: apagar" on storage.objects
  for delete to authenticated
  using (
    (bucket_id = 'fotos' and coalesce(private.posso_mudar_foto(private.id_da_pasta(name)), false))
    or (bucket_id = 'logos' and coalesce(private.posso_mudar_logo(private.id_da_pasta(name)), false))
  );

-- Preferências de cada pessoa (por enquanto, o tema escolhido no botão da barra de cima).
-- Cada um só lê e grava as suas; ao entrar, o app adota o tema salvo aqui.
create table public.preferencias (
  pessoa_id uuid primary key references public.perfis (id) on delete cascade,
  tema text not null default 'sistema' check (tema in ('sistema', 'claro', 'escuro')),
  atualizado_em timestamptz not null default now()
);

alter table public.preferencias enable row level security;

create policy "cada um vê as próprias preferências" on public.preferencias
  for select to authenticated using (pessoa_id = (select auth.uid()));

create policy "cada um grava as próprias preferências" on public.preferencias
  for insert to authenticated with check (pessoa_id = (select auth.uid()));

create policy "cada um muda as próprias preferências" on public.preferencias
  for update to authenticated
  using (pessoa_id = (select auth.uid()))
  with check (pessoa_id = (select auth.uid()));

-- O upsert do app reescreve a linha inteira (por isso pessoa_id entra no update; a regra acima segura).
grant select, insert, update (pessoa_id, tema, atualizado_em) on public.preferencias to authenticated;
grant all on public.preferencias to service_role;
