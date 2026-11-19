-- BARBER-DP | Migración incremental aplicada en Supabase remoto
-- Permite al usuario autenticado crear exclusivamente su propio perfil de cliente.
-- No concede administración, no desactiva RLS y no modifica datos existentes.
alter table public.perfiles enable row level security;

drop policy if exists perfiles_registro_cliente_propio on public.perfiles;
create policy perfiles_registro_cliente_propio
on public.perfiles
for insert
to authenticated
with check (
  id = (select auth.uid())
  and rol = 'cliente'
  and activo = true
);
