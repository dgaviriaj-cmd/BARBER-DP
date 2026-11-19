# Actividades Pendientes — BARBER DP

Lista de actividades pendientes para pasar del entorno académico de demostración a la operación real de la barbería:

1. **Configuración de instancia real en Supabase:**
   - Crear el proyecto en Supabase y configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env`.
   - Ejecutar en orden `supabase/01_schema.sql` y `supabase/02_rls.sql`.
   - Crear el usuario administrador real en Supabase Auth y asignarle `rol = 'admin'` en la tabla `public.perfiles`.
2. **Carga de datos reales autorizados del negocio:**
   - Definir dirección física, teléfono de contacto oficial y horario real de apertura/cierre de BARBER DP en `homeView.js`.
   - Reemplazar los registros sintéticos marcados como `(Demo)` por servicios, barberos y horarios reales.
3. **Publicación en repositorio remoto (GitHub) y despliegue:**
   - Inicializar/vincular el repositorio remoto en GitHub (`git remote add origin ...` y `git push`) cuando el estudiante indique la URL de su repositorio.
   - Desplegar bajo autorización en el servicio elegido (por ejemplo, Vercel/Netlify para frontend conectado a Supabase, o servidor Node).
4. **Mejoras opcionales posteriores al MVP:**
   - Notificaciones por correo o recordatorios de cita.
   - Bloqueos de días festivos o vacaciones puntuales por barbero.
