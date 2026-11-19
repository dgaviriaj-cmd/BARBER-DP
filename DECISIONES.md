# Decisiones Técnicas — BARBER DP

Este documento resume las decisiones arquitectónicas tomadas y su justificación para facilitar la sustentación del proyecto.

## 1. HTML5, CSS3 y JavaScript modular puro sin frameworks SPA
- **Decisión:** Implementar el frontend con HTML5 semántico, CSS3 con variables personalizadas y JavaScript ES Modules (`src/main.js` y vistas en `src/js/views/`), utilizando Vite únicamente como servidor de desarrollo y empaquetador.
- **Justificación:** Cumple estrictamente la restricción académica de no usar React, Angular ni Vue, reduce la complejidad conceptual y permite explicar cada línea de manipulación del DOM, eventos y consumo de APIs de forma directa.

## 2. Prevención de solapamientos con `EXCLUDE USING gist` y rango `[)`
- **Decisión:** Resolver el cruce de citas tanto en la UI (cálculo de disponibilidad) como en PostgreSQL mediante `EXCLUDE USING gist` sobre `tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)')`.
- **Justificación:** Validar solo en el navegador falla cuando dos personas reservan al mismo tiempo. La restricción en base de datos garantiza consistencia atómica sin necesidad de lógica compleja de bloqueos manuales.

## 3. Eliminación de tabla redundante de historial (`precio_snapshot` en `citas`)
- **Decisión:** No crear una tabla adicional `historial_servicios`; consultar el historial directamente desde `citas` almacenando `precio_snapshot` y `duracion_snapshot`.
- **Justificación:** Evita duplicar datos que representan el mismo evento (una cita completada o cancelada) y protege los reportes financieros históricos frente a futuros cambios de precio en `servicios`.

## 4. Teléfono normalizado como identificador anti-duplicado de clientes
- **Decisión:** Exigir un teléfono único normalizado (solo dígitos, 7 a 15 caracteres) y correo único opcional para cada cliente.
- **Justificación:** En una barbería es el dato más práctico y confiable para identificar clientes recurrentes sin exigir obligatoriamente documento de identidad ni cuenta previa.

## 5. Adaptador dual (`Supabase` + respaldo local `/api/*`)
- **Decisión:** Centralizar el acceso a datos en `src/js/services/api.js`, que usa `@supabase/supabase-js` cuando existen credenciales `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, o el servidor Express local (`/api/*`) en su defecto.
- **Justificación:** Permite probar y demostrar toda la aplicación inmediatamente en local sin bloquear el desarrollo ni exponer llaves privadas, manteniendo scripts SQL listos para producción en Supabase.

## 6. Cifrado de contraseñas con `scrypt` / Supabase Auth
- **Decisión:** Delegar la autenticación en Supabase Auth en producción y utilizar `crypto.scryptSync` con sal aleatoria + `timingSafeEqual` en las cuentas de prueba del servidor local.
- **Justificación:** Cumple la regla de nunca almacenar contraseñas en texto plano.
