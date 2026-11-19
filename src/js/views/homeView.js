import {
  escapeHtml,
  formatCurrency,
  getDayName,
  getInitials,
} from '../utils/formatters.js';

/**
 * Módulo 1: Página principal de BARBER DP, catálogo de servicios y equipo de barberos.
 */
export function renderHomeView(state, { onSelectServiceForBooking, onNavigate }) {
  const activeServices = state.servicios.filter((s) => s.activo);
  const activeBarbers = state.barberos.filter((b) => b.activo);

  const servicesHtml = activeServices.length
    ? activeServices
        .map((svc, idx) => {
          const num = String(idx + 1).padStart(2, '0');
          return `
            <article class="service-item">
              <div>
                <div class="service-top">
                  <div>
                    <span class="service-index">${num}.</span>
                    <h3 class="service-name">${escapeHtml(svc.nombre)}</h3>
                  </div>
                  <span class="service-price">${escapeHtml(formatCurrency(svc.precio))}</span>
                </div>
                <p class="service-desc">${escapeHtml(svc.descripcion)}</p>
              </div>
              <div class="service-footer">
                <div class="meta-inline">
                  <span>Duración estimada</span>
                  <span aria-hidden="true">·</span>
                  <span class="tabular">${svc.duracion_min} min</span>
                </div>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  data-book-service="${escapeHtml(svc.id)}"
                >
                  Reservar ${escapeHtml(svc.nombre)}
                </button>
              </div>
            </article>
          `;
        })
        .join('')
    : `
      <div class="empty-state">
        <p>No hay servicios activos publicados en este momento.</p>
      </div>
    `;

  const barbersHtml = activeBarbers.length
    ? activeBarbers
        .map((barber) => {
          const assignedIds = new Set(
            state.barbero_servicios
              .filter((bs) => bs.barbero_id === barber.id)
              .map((bs) => bs.servicio_id)
          );
          const assignedNames = activeServices
            .filter((s) => assignedIds.has(s.id))
            .map((s) => s.nombre);

          const activeDays = state.horarios_barbero
            .filter((h) => h.barbero_id === barber.id && h.activo)
            .sort((a, b) => a.dia_semana - b.dia_semana)
            .map((h) => getDayName(h.dia_semana).slice(0, 3));

          return `
            <article class="barber-card">
              <div class="barber-avatar" aria-hidden="true">${escapeHtml(getInitials(barber.nombre))}</div>
              <div>
                <h3 class="barber-name">${escapeHtml(barber.nombre)}</h3>
                <p class="barber-specialty">${escapeHtml(barber.especialidad)}</p>
              </div>
              <div class="meta-inline">
                <span>Servicios:</span>
                <span>${assignedNames.length ? escapeHtml(assignedNames.join(' · ')) : 'Por asignar'}</span>
              </div>
              <div class="meta-inline">
                <span>Días:</span>
                <span>${activeDays.length ? escapeHtml(activeDays.join(', ')) : 'Sin horario'}</span>
              </div>
            </article>
          `;
        })
        .join('')
    : `
      <div class="empty-state">
        <p>No hay barberos activos registrados.</p>
      </div>
    `;

  const container = document.createElement('div');
  container.innerHTML = `
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <p class="hero-kicker">Agenda organizada · Sede de demostración</p>
          <h1 class="hero-headline">Reserva tu turno en BARBER DP sin cruces ni esperas</h1>
          <p class="hero-lead">
            Consulta horarios reales por barbero, elige el servicio que necesitas y mantén el
            historial completo de cada atención en un sistema claro y verificable.
          </p>
          <div class="hero-actions">
            <button type="button" class="btn btn-primary" id="hero-book-btn">Reservar cita</button>
            <a href="#servicios" class="btn btn-secondary" id="hero-services-link">Ver servicios</a>
          </div>
          <dl class="hero-facts">
            <div>
              <dt class="fact-label">Horario referencial</dt>
              <dd class="fact-value">Lun–Sáb · 09:00–19:00</dd>
            </div>
            <div>
              <dt class="fact-label">Servicios activos</dt>
              <dd class="fact-value tabular">${activeServices.length}</dd>
            </div>
            <div>
              <dt class="fact-label">Barberos disponibles</dt>
              <dd class="fact-value tabular">${activeBarbers.length}</dd>
            </div>
          </dl>
        </div>

        <aside class="hero-visual" aria-label="Resumen visual del estudio BARBER DP">
          <div class="hero-svg-frame">
            <svg viewBox="0 0 420 260" width="100%" height="100%" role="img" aria-label="Ilustración arquitectónica de tijeras y navaja de barbería">
              <rect x="16" y="16" width="388" height="228" rx="10" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
              <line x1="16" y1="68" x2="404" y2="68" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
              <line x1="210" y1="16" x2="210" y2="244" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
              <circle cx="130" cy="145" r="46" fill="none" stroke="#D97706" stroke-width="2"/>
              <circle cx="130" cy="145" r="32" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
              <path d="M112 127 L148 163 M148 127 L112 163" stroke="#F8FAFC" stroke-width="2.5" stroke-linecap="round"/>
              <rect x="242" y="102" width="128" height="86" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
              <line x1="262" y1="128" x2="350" y2="128" stroke="#D97706" stroke-width="2" stroke-linecap="round"/>
              <line x1="262" y1="146" x2="334" y2="146" stroke="rgba(255,255,255,0.55)" stroke-width="2" stroke-linecap="round"/>
              <line x1="262" y1="164" x2="318" y2="164" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round"/>
              <text x="34" y="48" fill="#F8FAFC" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="700" letter-spacing="2">BARBER DP</text>
              <text x="242" y="48" fill="#CBD5E1" font-family="JetBrains Mono, monospace" font-size="11">AGENDA SIN SOLAPAMIENTOS</text>
            </svg>
          </div>
          <div class="hero-visual-caption">
            <span>Control por barbero y duración</span>
            <span>Datos de demostración académica</span>
          </div>
        </aside>
      </div>
    </section>

    <section class="section" id="catalogo-servicios">
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">Servicios disponibles</h2>
            <p class="section-subtitle">
              Cada servicio calcula automáticamente la duración necesaria para bloquear horarios sin superposiciones.
            </p>
          </div>
          <button type="button" class="btn btn-accent" id="services-book-btn">Agendar ahora</button>
        </div>
        <div class="services-grid">
          ${servicesHtml}
        </div>
      </div>
    </section>

    <section class="section-compact" id="equipo-barberos">
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">Equipo de barberos</h2>
            <p class="section-subtitle">
              Disponibilidad semanal y servicios asignados configurables desde el panel administrativo.
            </p>
          </div>
        </div>
        <div class="barbers-grid">
          ${barbersHtml}
        </div>
      </div>
    </section>
  `;

  container.querySelector('#hero-book-btn')?.addEventListener('click', () => {
    onNavigate('reservar');
  });

  container.querySelector('#services-book-btn')?.addEventListener('click', () => {
    onNavigate('reservar');
  });

  container.querySelector('#hero-services-link')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    container.querySelector('#catalogo-servicios')?.scrollIntoView({ behavior: 'smooth' });
  });

  container.querySelectorAll('[data-book-service]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onSelectServiceForBooking(btn.getAttribute('data-book-service'));
    });
  });

  return container;
}
