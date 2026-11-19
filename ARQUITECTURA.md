# Arquitectura del Sistema — BARBER DP

## 1. Visión General

El sistema sigue una arquitectura en capas sencilla y comprensible, pensada para un proyecto universitario sin sobre-ingeniería:

1. **Capa de Presentación (`index.html`, `src/styles/main.css`, `src/js/views/*`):**
   - Estructura semántica en HTML5 (`header`, `nav`, `main`, `section`, `footer`, `dialog`).
   - Estilos CSS3 con variables de diseño y media queries responsive.
   - Vistas modulares independientes (`homeView.js`, `bookingView.js`, `historyView.js`, `adminView.js`) orquestadas por `src/main.js`.
2. **Capa de Lógica de Negocio Pura (`src/js/core/scheduling.js`):**
   - Funciones puras desacopladas del DOM y de la base de datos: cálculo de franjas horarias disponibles, detección de solapamientos `[inicio, fin)`, validación de formularios, máquina de estados de citas y cálculo de reportes.
   - Compartida tanto por el frontend como por el servidor (`server.ts`) y probada con `node:test`.
3. **Capa de Acceso a Datos (`src/js/services/api.js` y `supabaseClient.js`):**
   - Abstracción unificada que se conecta directamente a **Supabase** (`@supabase/supabase-js`) cuando `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` están configurados en `.env`.
   - En ausencia de credenciales en `.env`, utiliza la API local `/api/*` en `server.ts` respaldada por persistencia en disco (`data/barberdp-store.json`).
4. **Capa de Base de Datos (`supabase/01_schema.sql`, `02_rls.sql`, `03_seed.sql`):**
   - PostgreSQL relacional en 3FN con integridad referencial, restricción `EXCLUDE USING gist` para concurrencia y políticas Row Level Security (RLS).

## 2. Estructura de Carpetas

```text
/
├── index.html                  # Documento principal HTML5
├── server.ts                   # Servidor Express + Vite y API local /api/*
├── supabase/
│   ├── 01_schema.sql           # Tablas, PK, FK, índices y restricción anti-solapamiento
│   ├── 02_rls.sql              # Políticas Row Level Security por rol
│   └── 03_seed.sql             # Datos sintéticos de demostración
├── src/
│   ├── main.js                 # Enrutador hash, estado global, modales y toasts
│   ├── styles/
│   │   └── main.css            # Estilos CSS3 responsive y accesibles
│   └── js/
│       ├── core/
│       │   ├── scheduling.js       # Lógica pura de horarios, validaciones y reportes
│       │   └── scheduling.test.ts  # Pruebas unitarias automatizadas
│       ├── services/
│       │   ├── supabaseClient.js   # Inicialización del cliente Supabase
│       │   └── api.js              # Adaptador unificado Supabase / API local
│       ├── utils/
│       │   └── formatters.js       # Formateo de moneda, fechas y escape HTML
│       └── views/
│           ├── homeView.js         # Módulo 1: Landing y catálogo
│           ├── bookingView.js      # Módulo 5: Reserva de citas
│           ├── historyView.js      # Módulo 6: Historial y cancelación/reprogramación
│           └── adminView.js        # Módulos 2, 3, 4, 5 y 7: Administración y reportes
└── *.md                        # Documentación obligatoria del proyecto
```
