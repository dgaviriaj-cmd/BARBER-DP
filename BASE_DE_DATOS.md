# Diseño de Base de Datos — BARBER DP

## 1. Modelo Entidad-Relación (ER)

```text
auth.users (Supabase)
   │ 1:1
   ▼
perfiles (id PK/FK, nombre, rol, activo)
   ├── 1:0..1 ──▶ clientes (id PK, perfil_id FK UNIQUE, nombre, telefono UNIQUE, correo UNIQUE)
   └── 1:0..1 ──▶ barberos (id PK, perfil_id FK UNIQUE, nombre, especialidad, telefono, activo)

barberos ◀── N:M (barbero_servicios) ──▶ servicios
                                           (id PK, nombre UNIQUE, descripcion, duracion_min, precio, activo)

barberos ── 1:N ──▶ horarios_barbero (id PK, barbero_id FK, dia_semana, hora_inicio, hora_fin, activo)

clientes ── 1:N ──┐
barberos ── 1:N ──┼──▶ citas (id PK, cliente_id FK, barbero_id FK, servicio_id FK,
servicios ─ 1:N ──┘           fecha_hora_inicio, fecha_hora_fin, duracion_snapshot,
                              precio_snapshot, estado, motivo_cancelacion, notas)
```

## 2. Explicación de Relaciones y Claves

- **`perfiles`:** Extiende `auth.users` con `rol` (`admin`, `barbero`, `cliente`). `id` es PK y FK hacia `auth.users(id)`.
- **`clientes`:** `id` UUID PK. `telefono` tiene restricción `UNIQUE NOT NULL` (y `correo` `UNIQUE`) para impedir clientes duplicados. `perfil_id` permite vincular opcionalmente una cuenta de usuario si el cliente se registra.
- **`barberos`:** `id` UUID PK. Almacena los datos del barbero y su estado `activo`.
- **`servicios`:** `id` UUID PK. `nombre` es `UNIQUE`. `duracion_min` tiene `CHECK (duracion_min > 0 AND duracion_min <= 240)` y `precio` `CHECK (precio >= 0)`.
- **`barbero_servicios`:** Tabla intermedia N:M con clave primaria compuesta `(barbero_id, servicio_id)` para indicar qué servicios presta cada barbero.
- **`horarios_barbero`:** Define la franja horaria semanal por barbero (`dia_semana` 0 a 6, `UNIQUE (barbero_id, dia_semana)`, `CHECK (hora_fin > hora_inicio)`).
- **`citas`:** Relaciona `cliente_id`, `barbero_id` y `servicio_id` con `ON DELETE RESTRICT` para conservar el historial intacto. Almacena `duracion_snapshot` y `precio_snapshot` para que cambios futuros de tarifa no alteren el historial ni los reportes pasados.

## 3. Normalización Básica

- **1FN:** Todos los atributos son atómicos; no existen listas separadas por comas (los servicios de cada barbero están en `barbero_servicios` y sus días en `horarios_barbero`).
- **2FN:** En tablas de clave simple (`id`) y en la tabla asociativa `(barbero_id, servicio_id)`, todos los atributos no clave dependen de toda la clave primaria.
- **3FN:** No existen dependencias transitivas; no se crea una tabla redundante `historial_servicios` porque el historial se obtiene directamente consultando `citas` junto con `precio_snapshot` y `duracion_snapshot`.

## 4. Prevención de Citas Duplicadas bajo Concurrencia

Incluso si dos usuarios envían una reserva al mismo instante para el mismo barbero y horario:

1. **En PostgreSQL / Supabase (`01_schema.sql`):**
   Se utiliza la extensión `btree_gist` y una restricción de exclusión atómica:
   ```sql
   ALTER TABLE public.citas
     ADD CONSTRAINT no_citas_superpuestas_barbero
     EXCLUDE USING gist (
       barbero_id WITH =,
       tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)') WITH &&
     )
     WHERE (estado IN ('pendiente', 'confirmada'));
   ```
   - El rango `[)` (cerrado al inicio, abierto al final) permite citas consecutivas exactas (ej. `09:00–09:30` y `09:30–10:00`) pero rechaza cualquier intersección parcial o total.
   - Si dos transacciones concurrentes intentan insertar horarios superpuestos, PostgreSQL serializa la verificación del índice GiST y aborta la segunda con el error `23P01`.
2. **En modo local (`server.ts`):**
   Las escrituras en `/api/citas` pasan por una cola secuencial (`withWriteLock`) que verifica el intervalo `[inicio, fin)` antes de persistir, devolviendo HTTP `409 Conflict` a la segunda petición.

## 5. Seguridad (RLS en Supabase)

En `supabase/02_rls.sql` se activa Row Level Security en todas las tablas:
- Lectura pública limitada a catálogo activo (`servicios`, `barberos`, `barbero_servicios`, `horarios_barbero`).
- Los clientes autenticados solo pueden leer y modificar su propia ficha y sus propias citas.
- Solo el rol `admin` tiene permisos completos de gestión sobre todas las tablas.
