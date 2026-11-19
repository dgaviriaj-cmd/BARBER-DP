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

## Publicación gratuita en GitHub Pages (sin workflow de compilación)

GitHub Actions está bloqueado actualmente por una restricción de facturación de la cuenta. Este proyecto puede compilarse **en tu computador** y enviar los archivos estáticos resultantes a la rama `gh-pages`, sin ejecutar nuestro antiguo workflow de Actions.

**Requisitos:** Node.js 22 o superior, Git, acceso de escritura al repositorio y una sesión GitHub autenticada desde Git. La conexión a Supabase usa exclusivamente la URL y la **clave pública publishable**; nunca coloques `service_role` o `sb_secret` en el navegador.

1. Descarga el repositorio y abre una terminal en su carpeta.
2. Crea un archivo local `.env.production.local` (está excluido por `.gitignore`):

   ```dotenv
   VITE_SUPABASE_URL=https://pavekklbjaplfbqvhmiy.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA_SUPABASE
   ```

   Usa la clave `sb_publishable_...` de **barber-dp**. Las variables guardadas en GitHub Actions no llegan automáticamente a la compilación local.

3. Ejecuta:

   ```bash
   npm install
   npm run deploy:pages
   ```

   Este comando compila con Vite, comprueba que exista `dist/index.html` y publica su contenido en `gh-pages`. No modifica la rama `main` ni las tablas de Supabase. Si `gh-pages` ya existía pero no fue generada por este comando, se detiene para evitar sobrescribirla.

4. En [Settings → Pages](https://github.com/dgaviriaj-cmd/BARBER-DP/settings/pages), selecciona **Deploy from a branch**, la rama **gh-pages**, carpeta **/(root)**, y guarda.
5. Comprueba [BARBER-DP](https://dgaviriaj-cmd.github.io/BARBER-DP/).

**Limitación importante:** aunque no hay un workflow de compilación personalizado, GitHub puede seguir utilizando su infraestructura interna para publicar Pages. Si la cuenta tiene un bloqueo de facturación general para Actions, la publicación desde una rama también podría quedar bloqueada. El comando no elimina ni esquiva las restricciones de GitHub. En ese caso, se necesita resolver el bloqueo con GitHub o elegir otro hosting estático gratuito.

**Nota funcional:** GitHub Pages no ejecuta `server.ts` ni la API local `/api/*`. En producción deben existir las tablas, políticas y usuarios de Supabase, y se deben probar autenticación, disponibilidad y creación de citas antes de dar el sistema por operativo.
