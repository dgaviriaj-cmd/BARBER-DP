# Requisitos del Sistema — BARBER DP

## 1. Propósito y Alcance (MVP)

BARBER DP automatiza la gestión operativa básica de una barbería mediante siete módulos integrados:

1. **Página principal:** Presentación del negocio, listado de servicios activos y equipo de barberos.
2. **Clientes:** Registro, consulta, edición y control anti-duplicados por teléfono único (y correo único opcional).
3. **Barberos:** Registro, asignación de servicios (`barbero_servicios`) y configuración de horario semanal.
4. **Servicios:** Administración de nombre, descripción, duración (en minutos), precio y estado (`activo`/`inactivo`).
5. **Citas:** Reserva con consulta real de disponibilidad, bloqueo de horarios superpuestos, cancelación y reprogramación.
6. **Historial:** Consulta cronológica de citas y servicios previos por cliente.
7. **Administración y Reportes:** Panel protegido por rol `admin` con filtros, métricas por período, servicios más solicitados y actividad por barbero.

## 2. Actores

- **Visitante / Cliente:** Consulta servicios y disponibilidad, agenda citas, consulta su historial y puede cancelar o reprogramar sus citas activas.
- **Administrador:** Gestiona clientes, barberos, horarios, servicios, cambia estados de citas y consulta reportes administrativos.
- **Barbero (en esquema RLS):** Puede consultar sus citas asignadas y actualizar su estado de atención en Supabase.

## 3. Requisitos Funcionales (RF)

| Código | Requisito | Módulo | Estado |
| :--- | :--- | :--- | :--- |
| RF-01 | Mostrar catálogo dinámico de servicios activos y barberos disponibles. | Página principal | Implementado |
| RF-02 | Registrar y actualizar clientes validando nombre, teléfono (7–15 dígitos) y correo. | Clientes | Implementado |
| RF-03 | Impedir registro de clientes duplicados por teléfono o correo. | Clientes | Implementado |
| RF-04 | Registrar y editar barberos, asignarles servicios y configurar horarios por día de semana. | Barberos | Implementado |
| RF-05 | Crear, editar y activar/desactivar servicios con duración y precio. | Servicios | Implementado |
| RF-06 | Calcular bloques horarios libres según horario del barbero, duración del servicio y citas activas. | Citas | Implementado |
| RF-07 | Impedir reservas simultáneas o superpuestas para un mismo barbero. | Citas | Implementado |
| RF-08 | Permitir confirmar, completar, reprogramar y cancelar citas con motivo. | Citas | Implementado |
| RF-09 | Consultar historial de servicios por teléfono, correo o nombre del cliente. | Historial | Implementado |
| RF-10 | Generar reportes por rango de fechas (citas, ingresos, ranking de servicios y por barbero). | Administración | Implementado |

## 4. Requisitos No Funcionales (RNF)

- **RNF-01 (Tecnología):** Frontend en HTML5, CSS3 y JavaScript modular puro sin frameworks SPA.
- **RNF-02 (Seguridad):** Contraseñas cifradas (Supabase Auth o `crypto.scryptSync` en modo local), políticas RLS y saneamiento HTML contra XSS.
- **RNF-03 (Adaptabilidad):** Diseño responsive utilizable en pantallas de escritorio, tableta y móvil.
- **RNF-04 (Usabilidad):** Mensajes claros de validación, error y confirmación en cada formulario.
