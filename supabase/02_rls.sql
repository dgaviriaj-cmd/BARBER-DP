-- ============================================================================
-- BARBER DP — Políticas de Seguridad por Fila (Row Level Security - RLS)
-- ============================================================================

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barberos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbero_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horarios_barbero ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;

-- Función auxiliar para validar si el usuario autenticado es administrador
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = auth.uid() AND rol = 'admin' AND activo = true
  );
$$;

-- Función auxiliar para obtener el cliente_id vinculado al usuario actual
CREATE OR REPLACE FUNCTION public.mi_cliente_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clientes WHERE perfil_id = auth.uid() LIMIT 1;
$$;

-- Función auxiliar para obtener el barbero_id vinculado al usuario actual
CREATE OR REPLACE FUNCTION public.mi_barbero_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.barberos WHERE perfil_id = auth.uid() LIMIT 1;
$$;

-- 1. PERFILES
DROP POLICY IF EXISTS "perfiles_lectura_propia_o_admin" ON public.perfiles;
CREATE POLICY "perfiles_lectura_propia_o_admin" ON public.perfiles
  FOR SELECT USING (id = auth.uid() OR public.es_admin());

DROP POLICY IF EXISTS "perfiles_admin_todo" ON public.perfiles;
CREATE POLICY "perfiles_admin_todo" ON public.perfiles
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

-- 2. SERVICIOS (catálogo público de lectura, administración exclusiva de admin)
DROP POLICY IF EXISTS "servicios_lectura_publica" ON public.servicios;
CREATE POLICY "servicios_lectura_publica" ON public.servicios
  FOR SELECT USING (activo = true OR public.es_admin());

DROP POLICY IF EXISTS "servicios_admin_escritura" ON public.servicios;
CREATE POLICY "servicios_admin_escritura" ON public.servicios
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

-- 3. BARBEROS (lectura pública de activos, administración por admin)
DROP POLICY IF EXISTS "barberos_lectura_publica" ON public.barberos;
CREATE POLICY "barberos_lectura_publica" ON public.barberos
  FOR SELECT USING (activo = true OR public.es_admin());

DROP POLICY IF EXISTS "barberos_admin_escritura" ON public.barberos;
CREATE POLICY "barberos_admin_escritura" ON public.barberos
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

-- 4. BARBERO_SERVICIOS y HORARIOS_BARBERO (lectura pública para consultar disponibilidad)
DROP POLICY IF EXISTS "barbero_servicios_lectura_publica" ON public.barbero_servicios;
CREATE POLICY "barbero_servicios_lectura_publica" ON public.barbero_servicios
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "barbero_servicios_admin_escritura" ON public.barbero_servicios;
CREATE POLICY "barbero_servicios_admin_escritura" ON public.barbero_servicios
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "horarios_lectura_publica" ON public.horarios_barbero;
CREATE POLICY "horarios_lectura_publica" ON public.horarios_barbero
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "horarios_admin_escritura" ON public.horarios_barbero;
CREATE POLICY "horarios_admin_escritura" ON public.horarios_barbero
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

-- 5. CLIENTES
DROP POLICY IF EXISTS "clientes_lectura" ON public.clientes;
CREATE POLICY "clientes_lectura" ON public.clientes
  FOR SELECT USING (
    public.es_admin()
    OR perfil_id = auth.uid()
  );

DROP POLICY IF EXISTS "clientes_insercion_autenticada_o_admin" ON public.clientes;
CREATE POLICY "clientes_insercion_autenticada_o_admin" ON public.clientes
  FOR INSERT WITH CHECK (
    public.es_admin()
    OR (auth.uid() IS NOT NULL AND perfil_id = auth.uid())
  );

DROP POLICY IF EXISTS "clientes_actualizacion" ON public.clientes;
CREATE POLICY "clientes_actualizacion" ON public.clientes
  FOR UPDATE USING (
    public.es_admin()
    OR perfil_id = auth.uid()
  )
  WITH CHECK (
    public.es_admin()
    OR perfil_id = auth.uid()
  );

-- 6. CITAS
DROP POLICY IF EXISTS "citas_lectura_autorizada" ON public.citas;
CREATE POLICY "citas_lectura_autorizada" ON public.citas
  FOR SELECT USING (
    public.es_admin()
    OR cliente_id = public.mi_cliente_id()
    OR barbero_id = public.mi_barbero_id()
  );

DROP POLICY IF EXISTS "citas_insercion_autorizada" ON public.citas;
CREATE POLICY "citas_insercion_autorizada" ON public.citas
  FOR INSERT WITH CHECK (
    public.es_admin()
    OR cliente_id = public.mi_cliente_id()
  );

DROP POLICY IF EXISTS "citas_actualizacion_autorizada" ON public.citas;
CREATE POLICY "citas_actualizacion_autorizada" ON public.citas
  FOR UPDATE USING (
    public.es_admin()
    OR cliente_id = public.mi_cliente_id()
    OR barbero_id = public.mi_barbero_id()
  )
  WITH CHECK (
    public.es_admin()
    OR (cliente_id = public.mi_cliente_id() AND estado IN ('pendiente', 'cancelada'))
    OR (barbero_id = public.mi_barbero_id() AND estado IN ('confirmada', 'completada', 'cancelada'))
  );
