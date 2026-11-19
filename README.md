# BARBER DP — Sistema Web de Gestión para Barbería

Proyecto universitario de Ingeniería de Sistemas diseñado para organizar citas, clientes, barberos, servicios, historial de atención y reportes administrativos de una barbería, evitando citas duplicadas o superpuestas.

## Tecnologías utilizadas

- **HTML5** semántico y accesible (`index.html`).
- **CSS3** modular, responsive y sin frameworks visuales externos (`src/styles/main.css`).
- **JavaScript (ES Modules)** puro sin React, Angular ni Vue (`src/main.js` y `src/js/*`).
- **Supabase (PostgreSQL + Auth + RLS)** mediante `@supabase/supabase-js` y scripts SQL en `supabase/`.
- **Express + Vite (`server.ts`)** como servidor de desarrollo/producción con respaldo local persistente en `/api/*` cuando aún no se configuran credenciales de Supabase.

## Instalación y ejecución local

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. (Opcional) Configurar Supabase copiando `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
   Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores públicos de tu proyecto Supabase y ejecuta en el **SQL Editor** de Supabase los archivos en orden:
   1. `supabase/01_schema.sql`
   2. `supabase/02_rls.sql`
   3. `supabase/03_seed.sql` (datos sintéticos de ejemplo)
3. Iniciar la aplicación:
   ```bash
   npm run dev
   ```
   Abrir `http://localhost:3000`.

## Credenciales de demostración (Modo Local)

Cuando no hay credenciales de Supabase configuradas, el sistema opera con almacenamiento local persistente (`data/barberdp-store.json`) y cuentas de prueba con contraseña cifrada (`scrypt`):

- **Administrador:** `admin@barberdp.local` / `BarberAdmin2026!`
- **Cliente de prueba:** `carlos.demo@barberdp.local` / `ClienteDemo2026!`

## Pruebas y verificación

- Pruebas unitarias de lógica pura:
  ```bash
  npm test
  ```
- Verificación de tipos y compilación:
  ```bash
  npm run lint
  npm run build
  ```

## Estructura de documentación

- `REQUISITOS.md`: Alcance, actores, requisitos funcionales y no funcionales.
- `ARQUITECTURA.md`: Organización de carpetas, capas y flujo de datos.
- `BASE_DE_DATOS.md`: Modelo Entidad-Relación, normalización, concurrencia y RLS.
- `DECISIONES.md`: Decisiones técnicas y justificación para sustentación.
- `PRUEBAS.md`: Casos de prueba unitarios, de integración e interfaz.
- `PENDIENTES.md`: Actividades pendientes para puesta en producción real.
