# Registro de Pruebas y Resultados — BARBER DP

Este documento registra las pruebas ejecutadas para validar cada objetivo específico del proyecto.

## 1. Pruebas Unitarias Automatizadas (`node:test`)

Comando ejecutado:
```bash
npx --yes tsx --test src/js/core/scheduling.test.ts
```

| ID | Caso de prueba | Objetivo relacionado | Resultado |
| :--- | :--- | :--- | :--- |
| PU-01 | Conversión de horas (`parseTimeToMinutes`, `minutesToTime`) y rechazo de horas inválidas (`25:00`). | Obj. 4 (Control de horarios) | Aprobada |
| PU-02 | Detección de solapamiento con intervalos semiabiertos `[inicio, fin)`: bloques contiguos (`09:00-09:30` y `09:30-10:00`) permitidos; intersecciones rechazadas. | Obj. 4 (Citas sin cruce) | Aprobada |
| PU-03 | Generación de bloques disponibles (`generateAvailableSlots`): bloquea citas `confirmada`/`pendiente`, libera horarios de citas `cancelada` y evita exceder la hora de cierre. | Obj. 4 (Disponibilidad real) | Aprobada |
| PU-04 | Validación de payload de cliente (normalización de teléfono y formato de correo), servicio y horario (`hora_fin > hora_inicio`). | Obj. 2 y 3 (Clientes y servicios) | Aprobada |
| PU-05 | Máquina de estados de citas (`canTransitionStatus`): bloquea transiciones inválidas desde `completada` o `cancelada`. | Obj. 4 (Flujo de citas) | Aprobada |
| PU-06 | Cálculo de reportes administrativos (`computeReports`): totales por estado, ingresos de citas completadas, top servicios y actividad por barbero. | Obj. 6 (Reportes) | Aprobada |

**Resultado total:** 6 pruebas ejecutadas, 6 aprobadas, 0 fallidas.

## 2. Pruebas de Compilación y Tipado

- `npm run lint` (`tsc --noEmit`): 0 errores de tipos.
- `npm run build` (`vite build`): compilación exitosa.

## 3. Pruebas Funcionales End-to-End en Navegador (Playwright Chromium)

Ejecutadas sobre `http://localhost:3000` en escritorio (`1440×900`) y móvil (`390×844`):

| ID | Flujo probado | Comportamiento observado | Estado |
| :--- | :--- | :--- | :--- |
| PE-01 | Carga de página principal (`#inicio`) | Muestra 4 servicios activos, 3 barberos activos y horario referencial; 0 errores en consola. | Aprobada |
| PE-02 | Reserva de cita y bloqueo anti-solapamiento (`#reservar`) | Selecciona bloque disponible, registra cliente, muestra confirmación y tras recargar la página el bloque reservado aparece deshabilitado/tachado. | Aprobada |
| PE-03 | Consulta de historial (`#historial`) | Búsqueda por teléfono del cliente recién registrado devuelve la cita creada con fecha, hora, barbero, servicio, valor y estado. | Aprobada |
| PE-04 | Autenticación administrativa y reportes (`#admin`) | Inicio de sesión con cuenta admin demo, navegación por pestañas y visualización de métricas en `Reportes` coherentes con los registros persistidos. | Aprobada |
| PE-05 | Adaptabilidad móvil (`390×844`) | Navegación responsive con menú hamburguesa y `scrollWidth <= innerWidth` (sin desbordamiento horizontal). | Aprobada |

## 4. Verificación de Concurrencia en Base de Datos

- **PostgreSQL / Supabase (`supabase/01_schema.sql`):** Restricción `EXCLUDE USING gist (barbero_id WITH =, tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)') WITH &&) WHERE (estado IN ('pendiente', 'confirmada'))` que rechaza inserciones concurrentes superpuestas con SQLSTATE `23P01`.
- **Servidor local (`server.ts`):** Cola secuencial `withWriteLock` que serializa escrituras en `/api/citas` y devuelve HTTP `409 Conflict` ante cualquier intento de cruce horario.
