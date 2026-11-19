-- ============================================================================
-- BARBER DP — Datos de Prueba Sintéticos (Demostración Universitaria)
-- NOTA: Todos los nombres, teléfonos y precios son ficticios para pruebas.
-- ============================================================================

-- Servicios de ejemplo
INSERT INTO public.servicios (id, nombre, descripcion, duracion_min, precio, activo)
VALUES
  ('11111111-1111-1111-1111-111111111101', 'Corte Clásico', 'Corte a tijera y máquina con terminación limpia en nuca y patillas.', 30, 25000, true),
  ('11111111-1111-1111-1111-111111111102', 'Degradado (Fade)', 'Corte degradado de precisión con navaja y acabado natural.', 45, 32000, true),
  ('11111111-1111-1111-1111-111111111103', 'Perfilado de Barba', 'Diseño, rebaje y delineado con toalla tibia y bálsamo hidratante.', 30, 20000, true),
  ('11111111-1111-1111-1111-111111111104', 'Combo Corte + Barba', 'Servicio completo de corte personalizado y perfilado de barba.', 60, 45000, true)
ON CONFLICT (nombre) DO NOTHING;

-- Barberos de ejemplo (datos sintéticos)
INSERT INTO public.barberos (id, nombre, especialidad, telefono, activo)
VALUES
  ('22222222-2222-2222-2222-222222222201', 'Andrés Morales (Demo)', 'Degradados y cortes modernos', '3001110001', true),
  ('22222222-2222-2222-2222-222222222202', 'Julián Herrera (Demo)', 'Corte clásico y barba a navaja', '3001110002', true),
  ('22222222-2222-2222-2222-222222222203', 'Camilo Rojas (Demo)', 'Estilismo integral y diseño de barba', '3001110003', true)
ON CONFLICT DO NOTHING;

-- Asignación de servicios a barberos
INSERT INTO public.barbero_servicios (barbero_id, servicio_id)
VALUES
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101'),
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102'),
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111104'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111101'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111103'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111104'),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111102'),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111103'),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111104')
ON CONFLICT DO NOTHING;

-- Horarios de ejemplo: Lunes (1) a Sábado (6) de 09:00 a 19:00
INSERT INTO public.horarios_barbero (barbero_id, dia_semana, hora_inicio, hora_fin, activo)
SELECT b.id, d.dia, '09:00'::TIME, '19:00'::TIME, true
FROM public.barberos b
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6)) AS d(dia)
ON CONFLICT (barbero_id, dia_semana) DO NOTHING;

-- Clientes de ejemplo (datos sintéticos)
INSERT INTO public.clientes (id, nombre, telefono, correo, notas)
VALUES
  ('33333333-3333-3333-3333-333333333301', 'Carlos Mendoza (Demo)', '3105550101', 'carlos.demo@barberdp.local', 'Prefiere corte clásico con tijera.'),
  ('33333333-3333-3333-3333-333333333302', 'Mateo Vargas (Demo)', '3105550102', 'mateo.demo@barberdp.local', 'Degradado medio sin navaja en cuello.'),
  ('33333333-3333-3333-3333-333333333303', 'Santiago Díaz (Demo)', '3105550103', 'santiago.demo@barberdp.local', 'Combo corte y barba cada 15 días.')
ON CONFLICT (telefono) DO NOTHING;
