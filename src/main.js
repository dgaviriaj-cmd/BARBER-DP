import '../styles/main.css';
import { api } from './js/services/api.js';
import { renderHomeView } from './js/views/homeView.js';
import { renderBookingView } from './js/views/bookingView.js';
import { renderHistoryView } from './js/views/historyView.js';
import { renderAdminView } from './js/views/adminView.js';

const appState = {
  route: 'inicio',
  preselectedServiceId: null,
  bookingFlash: '',
  adminTab: 'citas',
  loading: true,
  mode: 'local',
  user: null,
  servicios: [],
  barberos: [],
  barbero_servicios: [],
  horarios_barbero: [],
  clientes: [],
  citas: [],
};

const mainEl = document.getElementById('app-main');
const toastRegion = document.getElementById('toast-region');
const dialogEl = document.getElementById('app-dialog');
const dialogTitleEl = document.getElementById('dialog-title');
const dialogBodyEl = document.getElementById('dialog-body');
const dialogCloseBtn = document.getElementById('dialog-close-btn');
const mobileToggle = document.getElementById('mobile-menu-toggle');
const primaryNav = document.getElementById('primary-nav');

function notify(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
  toast.textContent = message;
  toastRegion.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4200);
}

function openModal(title, contentNode) {
  dialogTitleEl.textContent = title;
  dialogBodyEl.innerHTML = '';
  dialogBodyEl.appendChild(contentNode);
  if (typeof dialogEl.showModal === 'function') {
    dialogEl.showModal();
  }
}

function closeModal() {
  if (dialogEl.open) {
    dialogEl.close();
  }
}

dialogCloseBtn?.addEventListener('click', closeModal);
dialogEl?.addEventListener('click', (ev) => {
  if (ev.target === dialogEl) closeModal();
});

mobileToggle?.addEventListener('click', () => {
  const expanded = mobileToggle.getAttribute('aria-expanded') === 'true';
  mobileToggle.setAttribute('aria-expanded', String(!expanded));
  primaryNav.classList.toggle('is-open', !expanded);
});

function closeMobileNav() {
  mobileToggle?.setAttribute('aria-expanded', 'false');
  primaryNav?.classList.remove('is-open');
}

function parseHashRoute() {
  const hash = (window.location.hash || '#inicio').replace('#', '').toLowerCase();
  if (['inicio', 'servicios', 'reservar', 'historial', 'admin'].includes(hash)) {
    return hash;
  }
  return 'inicio';
}

function navigate(route) {
  appState.route = route;
  if (route !== 'reservar') {
    appState.bookingFlash = '';
  }
  if (window.location.hash !== `#${route}`) {
    window.location.hash = `#${route}`;
  } else {
    renderCurrentView();
  }
  closeMobileNav();
}

function updateActiveNav() {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    const target = el.getAttribute('data-nav');
    if (el.classList.contains('nav-link')) {
      el.classList.toggle('is-active', target === appState.route);
    }
  });
}

function renderCurrentView() {
  updateActiveNav();
  mainEl.innerHTML = '';

  if (appState.loading) {
    mainEl.innerHTML = `
      <section class="section">
        <div class="container">
          <div class="surface-card">Cargando información de BARBER DP...</div>
        </div>
      </section>
    `;
    return;
  }

  let viewNode;
  if (appState.route === 'reservar') {
    viewNode = renderBookingView(appState, {
      preselectedServiceId: appState.preselectedServiceId,
      initialSuccessMsg: appState.bookingFlash,
      onBookingCreated: async (msg) => {
        appState.bookingFlash = msg || '';
        await refreshData();
      },
      notify,
    });
  } else if (appState.route === 'historial') {
    viewNode = renderHistoryView(appState, {
      openModal,
      closeModal,
      onRefresh: refreshData,
      notify,
    });
  } else if (appState.route === 'admin') {
    viewNode = renderAdminView(appState, {
      activeTab: appState.adminTab,
      onTabChange: (tab) => {
        appState.adminTab = tab;
      },
      openModal,
      closeModal,
      onRefresh: refreshData,
      notify,
      onNavigate: navigate,
    });
  } else {
    viewNode = renderHomeView(appState, {
      onSelectServiceForBooking: (serviceId) => {
        appState.preselectedServiceId = serviceId;
        navigate('reservar');
      },
      onNavigate: navigate,
    });
  }

  mainEl.appendChild(viewNode);

  if (appState.route === 'servicios') {
    requestAnimationFrame(() => {
      document.getElementById('catalogo-servicios')?.scrollIntoView({ behavior: 'smooth' });
    });
  } else {
    window.scrollTo({ top: 0 });
  }
}

async function refreshData() {
  try {
    const data = await api.bootstrap();
    appState.mode = data.mode;
    appState.user = data.user;
    appState.servicios = data.servicios || [];
    appState.barberos = data.barberos || [];
    appState.barbero_servicios = data.barbero_servicios || [];
    appState.horarios_barbero = data.horarios_barbero || [];
    appState.clientes = data.clientes || [];
    appState.citas = data.citas || [];
  } catch (err) {
    notify(`No se pudo cargar la información: ${err.message}`, 'error');
  } finally {
    appState.loading = false;
    renderCurrentView();
  }
}

window.addEventListener('hashchange', () => {
  appState.route = parseHashRoute();
  if (appState.route !== 'reservar') {
    appState.bookingFlash = '';
  }
  closeMobileNav();
  renderCurrentView();
});

appState.route = parseHashRoute();
renderCurrentView();
refreshData();
