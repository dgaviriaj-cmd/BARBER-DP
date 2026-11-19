-- ============================================================================
-- BARBER DP — Esquema Relacional en PostgreSQL / Supabase
-- Incluye extensión btree_gist para impedir citas superpuestas a nivel de BD.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Perfiles de usuario vinculados a Supabase Auth (auth.users)
CREATE TABLE IF NOT EXISTS public.perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL CHECK (char_length(trim(nombre)) >= 2),
  rol TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('admin', 'barbero', 'cliente')),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Clientes (teléfono único obligatorio para prevenir duplicados)
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id UUID UNIQUE REFERENCES public.perfiles(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL CHECK (char_length(trim(nombre)) >= 2),
  telefono TEXT NOT NULL UNIQUE CHECK (char_length(regexp_replace(telefono, '\D', '', 'g')) >= 7),
  correo TEXT UNIQUE,
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Barberos
CREATE TABLE IF NOT EXISTS public.barberos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id UUID UNIQUE REFERENCES public.perfiles(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL CHECK (char_length(trim(nombre)) >= 2),
  especialidad TEXT NOT NULL DEFAULT 'Corte y barba',
  telefono TEXT NOT NULL CHECK (char_length(regexp_replace(telefono, '\D', '', 'g')) >= 7),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Servicios ofrecidos
CREATE TABLE IF NOT EXISTS public.servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE CHECK (char_length(trim(nombre)) >= 2),
  descripcion TEXT NOT NULL DEFAULT '',
  duracion_min INTEGER NOT NULL CHECK (duracion_min > 0 AND duracion_min <= 240),
  precio NUMERIC(10, 2) NOT NULL CHECK (precio >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Relación N:M entre barberos y servicios que atiende cada uno
CREATE TABLE IF NOT EXISTS public.barbero_servicios (
  barbero_id UUID NOT NULL REFERENCES public.barberos(id) ON DELETE CASCADE,
  servicio_id UUID NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  PRIMARY KEY (barbero_id, servicio_id)
);

-- 6. Horarios semanales por barbero (0 = Domingo ... 6 = Sábado)
CREATE TABLE IF NOT EXISTS public.horarios_barbero (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbero_id UUID NOT NULL REFERENCES public.barberos(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  CHECK (hora_fin > hora_inicio),
  UNIQUE (barbero_id, dia_semana)
);

-- 7. Citas (fuente única de verdad para agenda activa e historial de servicios)
CREATE TABLE IF NOT EXISTS public.citas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  barbero_id UUID NOT NULL REFERENCES public.barberos(id) ON DELETE RESTRICT,
  servicio_id UUID NOT NULL REFERENCES public.servicios(id) ON DELETE RESTRICT,
  fecha_hora_inicio TIMESTAMPTZ NOT NULL,
  fecha_hora_fin TIMESTAMPTZ NOT NULL,
  duracion_snapshot INTEGER NOT NULL CHECK (duracion_snapshot > 0),
  precio_snapshot NUMERIC(10, 2) NOT NULL CHECK (precio_snapshot >= 0),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'completada', 'cancelada')),
  motivo_cancelacion TEXT,
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_hora_fin > fecha_hora_inicio)
);

-- Índices para consultas frecuentes de agenda, historial y reportes
CREATE INDEX IF NOT EXISTS idx_citas_barbero_fecha ON public.citas (barbero_id, fecha_hora_inicio);
CREATE INDEX IF NOT EXISTS idx_citas_cliente_fecha ON public.citas (cliente_id, fecha_hora_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_citas_estado ON public.citas (estado);

-- Restricción de exclusión atómica contra reservas simultáneas superpuestas
-- Impide que un mismo barbero tenga dos citas activas ('pendiente' o 'confirmada')
-- cuyos rangos semiabiertos [inicio, fin) se intersecten, incluso bajo concurrencia.
ALTER TABLE public.citas DROP CONSTRAINT IF EXISTS no_citas_superpuestas_barbero;
ALTER TABLE public.citas
  ADD CONSTRAINT no_citas_superpuestas_barbero
  EXCLUDE USING gist (
    barbero_id WITH =,
    tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)') WITH &&
  )
  WHERE (estado IN ('pendiente', 'confirmada'));

-- Trigger para mantener actualizado el campo actualizado_en
CREATE OR REPLACE FUNCTION public.actualizar_timestamp_cita()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_citas_actualizado ON public.citas;
CREATE TRIGGER trg_citas_actualizado
  BEFORE UPDATE ON public.citas
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp_cita();
