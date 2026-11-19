BEGIN;
CREATE SCHEMA IF NOT EXISTS barber_private;
REVOKE ALL ON SCHEMA barber_private FROM PUBLIC;
GRANT USAGE ON SCHEMA barber_private TO anon, authenticated;

-- PostgreSQL preserves policy dependencies when moving these functions.
ALTER FUNCTION public.es_admin() SET SCHEMA barber_private;
ALTER FUNCTION public.mi_cliente_id() SET SCHEMA barber_private;
ALTER FUNCTION public.mi_barbero_id() SET SCHEMA barber_private;
ALTER FUNCTION barber_private.es_admin() SET search_path = '';
ALTER FUNCTION barber_private.mi_cliente_id() SET search_path = '';
ALTER FUNCTION barber_private.mi_barbero_id() SET search_path = '';
REVOKE EXECUTE ON FUNCTION barber_private.es_admin(), barber_private.mi_cliente_id(),
  barber_private.mi_barbero_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION barber_private.es_admin(), barber_private.mi_cliente_id(),
  barber_private.mi_barbero_id() TO anon, authenticated;

ALTER FUNCTION public.actualizar_timestamp_cita() SET search_path = '';
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;

CREATE FUNCTION barber_private.activar_cliente()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  usuario auth.users%ROWTYPE;
  registro_nombre text;
  registro_telefono text;
BEGIN
  SELECT * INTO usuario FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Confirma el correo antes de activar tu cuenta.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.perfiles WHERE id = usuario.id
    AND (rol <> 'cliente' OR NOT activo);
  IF FOUND OR EXISTS (SELECT 1 FROM public.clientes WHERE perfil_id = usuario.id) THEN
    RETURN;
  END IF;

  registro_nombre := trim(usuario.raw_user_meta_data ->> 'nombre');
  registro_telefono := regexp_replace(usuario.raw_user_meta_data ->> 'telefono', '[^0-9]', '', 'g');
  IF registro_nombre IS NULL OR char_length(registro_nombre) < 2 OR registro_telefono IS NULL
    OR char_length(registro_telefono) NOT BETWEEN 7 AND 15 THEN
    RAISE EXCEPTION 'Faltan el nombre o el teléfono de registro.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.perfiles (id, nombre, rol) VALUES (usuario.id, registro_nombre, 'cliente')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.clientes (perfil_id, nombre, telefono, correo)
    SELECT usuario.id, registro_nombre, registro_telefono, lower(usuario.email)
    FROM public.perfiles p WHERE p.id = usuario.id AND p.rol = 'cliente' AND p.activo
    ON CONFLICT (perfil_id) DO NOTHING;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'El teléfono o correo ya está registrado. Contacta a la administración.' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION public.activar_cliente()
RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT barber_private.activar_cliente();
$$;
REVOKE ALL ON FUNCTION barber_private.activar_cliente(), public.activar_cliente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION barber_private.activar_cliente(), public.activar_cliente() TO authenticated;

CREATE FUNCTION barber_private.franjas_ocupadas(barbero uuid, dia date, ignorar uuid)
RETURNS TABLE (fecha_hora_inicio timestamptz, fecha_hora_fin timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.fecha_hora_inicio, c.fecha_hora_fin
  FROM public.citas c JOIN public.barberos b ON b.id = c.barbero_id
  WHERE b.id = barbero AND (b.activo OR barber_private.es_admin())
    AND c.estado IN ('pendiente', 'confirmada')
    AND c.fecha_hora_inicio < ((dia + 1)::timestamp AT TIME ZONE 'America/Bogota')
    AND c.fecha_hora_fin > (dia::timestamp AT TIME ZONE 'America/Bogota')
    AND NOT (c.id IS NOT DISTINCT FROM ignorar AND
      (barber_private.es_admin() OR c.cliente_id IS NOT DISTINCT FROM barber_private.mi_cliente_id()
        OR c.barbero_id IS NOT DISTINCT FROM barber_private.mi_barbero_id()));
$$;

CREATE FUNCTION public.franjas_ocupadas(barbero uuid, dia date, ignorar uuid DEFAULT NULL)
RETURNS TABLE (fecha_hora_inicio timestamptz, fecha_hora_fin timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM barber_private.franjas_ocupadas(barbero, dia, ignorar);
$$;
REVOKE ALL ON FUNCTION barber_private.franjas_ocupadas(uuid,date,uuid),
  public.franjas_ocupadas(uuid,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION barber_private.franjas_ocupadas(uuid,date,uuid),
  public.franjas_ocupadas(uuid,date,uuid) TO anon, authenticated;

CREATE FUNCTION barber_private.validar_cita()
RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  inicio timestamp := NEW.fecha_hora_inicio AT TIME ZONE 'America/Bogota';
  fin timestamp;
  servicio public.servicios%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NOT barber_private.es_admin() AND NEW.estado <> 'pendiente' THEN
      RAISE EXCEPTION 'Una reserva nueva debe estar pendiente.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO servicio FROM public.servicios WHERE id = NEW.servicio_id AND activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El servicio no está disponible.' USING ERRCODE = '23514';
    END IF;
    NEW.duracion_snapshot := servicio.duracion_min;
    NEW.precio_snapshot := servicio.precio;
  ELSE
    IF ROW(NEW.id, NEW.cliente_id, NEW.servicio_id, NEW.duracion_snapshot,
           NEW.precio_snapshot, NEW.creado_en)
      IS DISTINCT FROM ROW(OLD.id, OLD.cliente_id, OLD.servicio_id, OLD.duracion_snapshot,
                           OLD.precio_snapshot, OLD.creado_en) THEN
      RAISE EXCEPTION 'Los datos originales de la cita son inmutables.' USING ERRCODE = '42501';
    END IF;
    IF NEW.estado <> OLD.estado AND NOT (
      (OLD.estado = 'pendiente' AND NEW.estado IN ('confirmada', 'completada', 'cancelada')) OR
      (OLD.estado = 'confirmada' AND NEW.estado IN ('completada', 'cancelada'))
    ) THEN
      RAISE EXCEPTION 'El cambio de estado no está permitido.' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.barbero_id, NEW.fecha_hora_inicio, NEW.fecha_hora_fin)
      IS NOT DISTINCT FROM ROW(OLD.barbero_id, OLD.fecha_hora_inicio, OLD.fecha_hora_fin) THEN
      RETURN NEW;
    END IF;
    IF OLD.estado NOT IN ('pendiente', 'confirmada') OR NEW.estado NOT IN ('pendiente', 'confirmada') THEN
      RAISE EXCEPTION 'Solo se pueden reprogramar citas activas.' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.fecha_hora_fin := NEW.fecha_hora_inicio + make_interval(mins => NEW.duracion_snapshot);
  fin := NEW.fecha_hora_fin AT TIME ZONE 'America/Bogota';
  IF NEW.fecha_hora_inicio < now() OR fin::date <> inicio::date OR NOT EXISTS (
    SELECT 1 FROM public.horarios_barbero h
    JOIN public.barberos b ON b.id = h.barbero_id
    JOIN public.barbero_servicios bs ON bs.barbero_id = b.id AND bs.servicio_id = NEW.servicio_id
    WHERE h.barbero_id = NEW.barbero_id AND b.activo AND h.activo
      AND h.dia_semana = extract(dow FROM inicio)
      AND inicio::time >= h.hora_inicio AND fin::time <= h.hora_fin
      AND mod(extract(epoch FROM (inicio::time - h.hora_inicio)), 900) = 0
  ) THEN
    RAISE EXCEPTION 'El barbero no ofrece ese servicio en el horario elegido.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION barber_private.validar_cita() FROM PUBLIC;
CREATE TRIGGER trg_validar_cita BEFORE INSERT OR UPDATE ON public.citas
  FOR EACH ROW EXECUTE FUNCTION barber_private.validar_cita();
COMMIT;
