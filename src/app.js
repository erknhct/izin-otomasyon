import { downloadUdfFile, buildUdfXml, generateDocumentPreviewHtml, formatDateTR } from './udfGenerator.js';
import {
  initStorage, initLiveSync, exportDbJsonFile, importDbJsonData,
  getPersonnelList, savePersonnelList,
  getLeaveTypes, saveLeaveTypes,
  getSignatories, saveSignatories,
  getLeaveRecords, addLeaveRecord, updateLeaveRecord, deleteLeaveRecord,
  getAdminPasswordStored, setAdminPasswordStored,
  getStaffPasswordStored, setStaffPasswordStored,
  getMesaiSettingsDB, saveMesaiSettingsDB,
  getAliciMakamlar, saveAliciMakamlar
} from './storage.js';
import { calculateExpectedReturn, calculateDaysFromReturn, getReturnReasonNotu, checkLeaveConflict, getPendingReturnRecords, getDashboardStats, isWeekendOrHoliday } from './leaveTracker.js';
import {
  generateMesaiForMonth, renderMesaiTable, clearMesaiForMonth,
  getMesaiSignatories, saveMesaiSignatories, hasMesaiDataForMonth,
  updateMesaiCell, exportMesaiToExcelFile, printMesaiView,
  renderMesaiArchiveSection
} from './mesai.js';

// Custom Search Normalizer for Turkish Characters and Whitespaces
export function normalizeSearch(str) {
  if (!str) return '';
  return str.toString()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

// Multi-word and token-based search matching helper
export function matchesSearchQuery(target, query) {
  if (!query) return true;
  const normQuery = normalizeSearch(query);
  if (!normQuery) return true;
  const normTarget = normalizeSearch(target);
  if (!normTarget) return false;

  // Direct substring match
  if (normTarget.includes(normQuery)) return true;

  // Multi-token match (all words in search query must be present in target)
  const tokens = normQuery.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every(token => normTarget.includes(token));
  }
  return false;
}

function getPersonnelTitleMap() {
  const map = {};
  getPersonnelList().forEach(p => {
    if (p.id) map[p.id] = p.title;
    if (p.name) map[p.name] = p.title;
  });
  return map;
}

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const viewSections = document.querySelectorAll('.view-section');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const toastContainer = document.getElementById('toast-container');
const modalOverlay = document.getElementById('global-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

// App State
let currentTheme = localStorage.getItem('udf_theme') || 'dark';
document.documentElement.setAttribute('data-theme', currentTheme);
updateThemeToggleUI();

let dueLeavesState = {
  currentPage: 1,
  pageSize: 10
};

let upcomingLeavesState = {
  currentPage: 1,
  pageSize: 10
};

let completedLeavesState = {
  currentPage: 1,
  pageSize: 10
};

let dashboardActiveTab = 'due';

// =============================================
// GÜVENLİK & ROL TABANLI GİRİŞ SİSTEMİ
// =============================================
const SESSION_KEY = 'udf_session_auth';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 saat (ms)

function isSessionValid() {
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  if (!session) return false;
  return (Date.now() - session.ts) < SESSION_DURATION;
}

function createSession(role = 'staff') {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now(), role }));
}

function destroySession() {
  localStorage.removeItem(SESSION_KEY);
}

function getCurrentRole() {
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  return session?.role || 'staff';
}

function isAdmin() {
  return getCurrentRole() === 'admin';
}

function updateUserRoleUI() {
  const pillEl = document.getElementById('top-user-pill');
  const avatarEl = document.getElementById('top-user-avatar');
  const textEl = document.getElementById('top-user-role-text');

  if (isAdmin()) {
    if (avatarEl) {
      avatarEl.innerHTML = '<i class="fa-solid fa-crown" style="color: #f59e0b;"></i>';
      avatarEl.style.background = 'rgba(245, 158, 11, 0.25)';
    }
    if (textEl) {
      textEl.textContent = 'Sistem Yöneticisi';
    }
    if (pillEl) {
      pillEl.style.background = 'rgba(245, 158, 11, 0.12)';
      pillEl.style.border = '1px solid rgba(245, 158, 11, 0.3)';
      pillEl.style.color = '#f59e0b';
    }
  } else {
    if (avatarEl) {
      avatarEl.innerHTML = '<i class="fa-solid fa-user-gear" style="color: #3b82f6;"></i>';
      avatarEl.style.background = 'rgba(59, 130, 246, 0.25)';
    }
    if (textEl) {
      textEl.textContent = 'Yönetici';
    }
    if (pillEl) {
      pillEl.style.background = 'rgba(59, 130, 246, 0.12)';
      pillEl.style.border = '1px solid rgba(59, 130, 246, 0.3)';
      pillEl.style.color = '#3b82f6';
    }
  }
}

window.handleLogin = function () {
  const input = document.getElementById('login-password-input');
  const errEl = document.getElementById('login-error');
  const enteredPw = (input.value || '').trim();

  const adminPw = getAdminPasswordStored();
  const staffPw = getStaffPasswordStored();

  if (enteredPw === adminPw) {
    createSession('admin');
    completeLogin();
  } else if (enteredPw === staffPw) {
    createSession('staff');
    completeLogin();
  } else {
    errEl.style.display = 'block';
    input.value = '';
    input.focus();
    input.style.borderColor = 'rgba(239,68,68,0.6)';
    setTimeout(() => input.style.borderColor = 'rgba(255,255,255,0.15)', 1500);
  }

  function completeLogin() {
    const loginScreen = document.getElementById('login-screen');
    loginScreen.style.opacity = '0';
    loginScreen.style.transition = 'opacity 0.4s ease';
    setTimeout(() => {
      loginScreen.style.display = 'none';
      initApp();
    }, 400);
    input.value = '';
    errEl.style.display = 'none';
  }
};

window.logoutApp = function () {
  showConfirmModal({
    title: '🔒 Oturumu Kapat',
    message: 'Sistemden çıkış yapmak üzeresiniz. Devam etmek istediğinizden emin misiniz?',
    confirmText: 'Evet, Oturumu Kapat',
    cancelText: 'Vazgeç',
    onConfirm: () => {
      destroySession();
      location.reload();
    }
  });
};

window.changeAppPassword = function () {
  const targetRole = document.getElementById('sec-target-role')?.value || 'admin';
  const current = document.getElementById('sec-current-pw')?.value || '';
  const newPw = document.getElementById('sec-new-pw')?.value || '';
  const newPw2 = document.getElementById('sec-new-pw2')?.value || '';

  const activeRolePw = isAdmin() ? getAdminPasswordStored() : getStaffPasswordStored();
  if (current !== activeRolePw) {
    showToast('Mevcut oturum şifreniz hatalı!', 'danger');
    return;
  }
  if (!isAdmin() && targetRole === 'admin') {
    showToast('Yönetici şifresini değiştirmek için Sistem Yöneticisi olarak giriş yapmalısınız!', 'danger');
    return;
  }
  if (newPw.length < 4) {
    showToast('Yeni şifre en az 4 karakter olmalıdır!', 'warning');
    return;
  }
  if (newPw !== newPw2) {
    showToast('Yeni şifreler eşleşmiyor!', 'warning');
    return;
  }

  if (targetRole === 'admin') {
    setAdminPasswordStored(newPw);
    showToast('✅ Sistem Yöneticisi (Admin) şifresi başarıyla güncellendi!', 'success');
  } else {
    setStaffPasswordStored(newPw);
    showToast('✅ Yönetici şifresi başarıyla güncellendi!', 'success');
  }

  document.getElementById('sec-current-pw').value = '';
  document.getElementById('sec-new-pw').value = '';
  document.getElementById('sec-new-pw2').value = '';
};

async function initApp() {
  setupNavigation();
  setupThemeToggle();
  setupModalEvents();
  setupLeavesTableFilters();
  setupNotificationBell();
  await initStorage();
  updateUserRoleUI();
  renderDashboard();
  setupWizardForm();
  renderPersonnelTable();
  renderLeavesTable();

  // Set default report filter to "Bu Yıl"
  const rStart = document.getElementById('report-global-start');
  const rEnd = document.getElementById('report-global-end');
  if (rStart && rEnd) {
    const y = new Date().getFullYear();
    rStart.value = `${y}-01-01`;
    rEnd.value = `${y}-12-31`;
  }

  renderReports();
  renderSettings();
  initMesaiView();

  // Initialize LAN real-time live sync across devices
  initLiveSync((isFromRemote) => {
    refreshUIFromStorage(isFromRemote);
  });

  // Global delegation for PDF report button & Yol Yardımı Excel button
  document.addEventListener('click', (e) => {
    const btnPdf = e.target.closest('#btn-export-reports-pdf');
    if (btnPdf) {
      e.preventDefault();
      exportReportsPdf();
      return;
    }
    const btnExcel = e.target.closest('#btn-export-yol-yardimi-excel');
    if (btnExcel) {
      e.preventDefault();
      exportYolYardimiExcel();
      showToast('📊 Yol Yardımı Kesintisi İzin Listesi Excel olarak indirildi!', 'success');
      return;
    }
  });
}

async function refreshUIFromStorage(showNotification = false) {
  await initStorage();
  updateUserRoleUI();
  renderDashboard();
  populateWizardOptions(true);
  renderPersonnelTable();
  renderLeavesTable();
  renderReports();
  renderSettings();
  if (typeof renderMesaiView === 'function') {
    renderMesaiView(false);
  }
  if (showNotification) {
    showToast('🔄 Ağdaki başka bir bilgisayardan değişiklik yapıldı (Veriler yenilendi).', 'info');
  }
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Veri tabanını (db.json) ilk olarak yükle
  await initStorage();

  // 2. Güvenlik ve oturum kontrolü
  const loginScreen = document.getElementById('login-screen');
  if (!isSessionValid()) {
    loginScreen.style.display = 'flex';
    setTimeout(() => document.getElementById('login-password-input').focus(), 100);
    return;
  }
  if (loginScreen) loginScreen.style.display = 'none';
  await initApp();
});

// Toast System
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'warning' ? 'fa-triangle-exclamation' : type === 'danger' ? 'fa-circle-xmark' : 'fa-circle-info'}"></i>
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 5000);
}

// Navigation
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const viewName = item.getAttribute('data-view');
      switchView(viewName);
    });
  });

  document.getElementById('top-settings-btn')?.addEventListener('click', () => {
    switchView('settings');
  });
}

function switchView(viewName) {
  navItems.forEach(nav => {
    if (nav.getAttribute('data-view') === viewName) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });

  const topSettingsBtn = document.getElementById('top-settings-btn');
  if (topSettingsBtn) {
    if (viewName === 'settings') {
      topSettingsBtn.style.background = 'rgba(99, 102, 241, 0.3)';
      topSettingsBtn.style.borderColor = 'rgba(99, 102, 241, 0.6)';
      topSettingsBtn.style.boxShadow = '0 0 12px rgba(99, 102, 241, 0.35)';
    } else {
      topSettingsBtn.style.background = 'rgba(99, 102, 241, 0.12)';
      topSettingsBtn.style.borderColor = 'rgba(99, 102, 241, 0.3)';
      topSettingsBtn.style.boxShadow = 'none';
    }
  }

  viewSections.forEach(sec => {
    if (sec.id === `view-${viewName}`) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  const viewTitles = {
    dashboard: '<i class="fa-solid fa-house" style="color: var(--accent-primary);"></i> Ana Sayfa',
    leaves: '<i class="fa-solid fa-calendar-check" style="color: var(--accent-primary);"></i> İzin Kayıtları Geçmişi',
    personnel: '<i class="fa-solid fa-users" style="color: var(--accent-primary);"></i> Personel Listesi',
    reports: '<i class="fa-solid fa-chart-pie" style="color: var(--accent-primary);"></i> Raporlar & Analizler',
    settings: '<i class="fa-solid fa-sliders" style="color: var(--accent-primary);"></i> Şablon & İzin Türü Ayarları',
    mesai: '<i class="fa-solid fa-business-time" style="color: var(--accent-primary);"></i> Aylık Mesai Cetveli'
  };
  const topTitle = document.getElementById('top-view-title');
  if (topTitle && viewTitles[viewName]) {
    topTitle.innerHTML = viewTitles[viewName];
  }

  if (viewName === 'dashboard') renderDashboard(true);
  if (viewName === 'leaves') renderLeavesTable();
  if (viewName === 'personnel') renderPersonnelTable();
  if (viewName === 'reports') renderReports();
  if (viewName === 'settings') renderSettings();
  if (viewName === 'mesai') renderMesaiView();
}

// Theme Toggle
function setupThemeToggle() {
  themeToggleBtn.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('udf_theme', currentTheme);
    updateThemeToggleUI();
  });
}

function updateThemeToggleUI() {
  if (currentTheme === 'dark') {
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i> <span>Aydınlık Mod</span>';
  } else {
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i> <span>Karanlık Mod</span>';
  }
}

// Modal Events
let isMouseDownOnOverlay = false;

function setupModalEvents() {
  modalClose.addEventListener('click', closeModal);

  modalOverlay.addEventListener('mousedown', (e) => {
    isMouseDownOnOverlay = (e.target === modalOverlay);
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay && isMouseDownOnOverlay) {
      closeModal();
    }
    isMouseDownOnOverlay = false;
  });
}

function openModal(title, contentHtml) {
  modalTitle.textContent = title;
  modalBody.innerHTML = contentHtml;
  modalOverlay.classList.add('active');
}

function closeModal() {
  modalOverlay.classList.remove('active');
}

function showConfirmModal({ title, message, confirmText = 'Evet, Onayla', cancelText = 'Vazgeç', type = 'danger', onConfirm }) {
  let iconHtml = `<i class="fa-solid fa-triangle-exclamation" style="font-size: 1.8rem; color: #ef4444;"></i>`;
  let iconWrapperStyle = `background: rgba(239, 68, 68, 0.12); border: 2px solid rgba(239, 68, 68, 0.3); box-shadow: 0 0 25px rgba(239, 68, 68, 0.3);`;
  let confirmBtnStyle = `background: linear-gradient(135deg, #ef4444, #dc2626); border: none; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);`;

  if (type === 'warning') {
    iconHtml = `<i class="fa-solid fa-triangle-exclamation" style="font-size: 1.8rem; color: #f59e0b;"></i>`;
    iconWrapperStyle = `background: rgba(245, 158, 11, 0.12); border: 2px solid rgba(245, 158, 11, 0.3); box-shadow: 0 0 25px rgba(245, 158, 11, 0.3);`;
    confirmBtnStyle = `background: linear-gradient(135deg, #f59e0b, #d97706); border: none; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);`;
  } else if (type === 'success') {
    iconHtml = `<i class="fa-solid fa-circle-check" style="font-size: 1.8rem; color: #10b981;"></i>`;
    iconWrapperStyle = `background: rgba(16, 185, 129, 0.12); border: 2px solid rgba(16, 185, 129, 0.3); box-shadow: 0 0 25px rgba(16, 185, 129, 0.3);`;
    confirmBtnStyle = `background: linear-gradient(135deg, #10b981, #059669); border: none; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);`;
  } else if (type === 'info') {
    iconHtml = `<i class="fa-solid fa-paper-plane" style="font-size: 1.8rem; color: #6366f1;"></i>`;
    iconWrapperStyle = `background: rgba(99, 102, 241, 0.12); border: 2px solid rgba(99, 102, 241, 0.3); box-shadow: 0 0 25px rgba(99, 102, 241, 0.3);`;
    confirmBtnStyle = `background: linear-gradient(135deg, #6366f1, #4f46e5); border: none; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);`;
  }

  const html = `
    <div style="text-align: center; padding: 1rem 0.5rem;">
      <div style="width: 64px; height: 64px; border-radius: 50%; ${iconWrapperStyle} display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto;">
        ${iconHtml}
      </div>
      <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 0.6rem; color: var(--text-main);">${title}</h3>
      <div style="font-size: 0.92rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1.75rem;">${message}</div>
      <div style="display: flex; gap: 0.75rem; justify-content: center;">
        <button class="btn btn-secondary" id="confirm-modal-cancel" style="min-width: 110px; font-weight: 600;">${cancelText}</button>
        <button class="btn btn-danger" id="confirm-modal-ok" style="min-width: 125px; font-weight: 800; color: #ffffff !important; ${confirmBtnStyle}">
          ${confirmText}
        </button>
      </div>
    </div>
  `;

  openModal(title || 'İşlem Onayı', html);

  document.getElementById('confirm-modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('confirm-modal-ok')?.addEventListener('click', () => {
    closeModal();
    if (typeof onConfirm === 'function') onConfirm();
  });
}

// Notification Bell System
function renderNotificationBell() {
  const pendingList = getPendingReturnRecords();
  const dueList = pendingList.filter(r => r.isDue);

  const bellBadge = document.getElementById('notif-bell-badge');
  const countTag = document.getElementById('notif-count-tag');
  const dropdownBody = document.getElementById('notif-dropdown-body');

  if (!bellBadge || !countTag || !dropdownBody) return;

  if (dueList.length > 0) {
    bellBadge.textContent = dueList.length;
    bellBadge.style.display = 'flex';
    countTag.textContent = `${dueList.length} Acil`;
    countTag.className = 'notif-count-tag badge badge-danger';

    dropdownBody.innerHTML = dueList.map(item => `
      <div class="notif-item">
        <div class="notif-item-header">
          <strong>${item.personnelName}</strong>
          <span class="badge badge-danger">${item.leaveTypeName}</span>
        </div>
        <div class="notif-item-sub">Sicil: ${item.sicil} | Ayrılış: ${formatDateTR(item.ayrilisDate)}</div>
        <div class="notif-item-due"><i class="fa-solid fa-triangle-exclamation"></i> Beklenen: ${formatDateTR(item.expectedReturnDate)} (SÜRESİ DOLDU)</div>
        <button class="btn btn-sm btn-success btn-notif-baslayis" data-record-id="${item.id}" style="width: 100%; margin-top: 0.4rem; font-weight: 700;">
          <i class="fa-solid fa-paper-plane"></i> BAŞLAYIŞ YAZISI ÇIKAR & TAMAMLA
        </button>
      </div>
    `).join('');

    dropdownBody.querySelectorAll('.btn-notif-baslayis').forEach(btn => {
      btn.addEventListener('click', async () => {
        const recId = btn.getAttribute('data-record-id');
        const notifDropdown = document.getElementById('notif-dropdown');
        if (notifDropdown) notifDropdown.style.display = 'none';
        await startBaslayisWizardForRecord(recId);
      });
    });
  } else {
    bellBadge.style.display = 'none';
    countTag.textContent = 'Acil Yok';
    countTag.className = 'notif-count-tag badge badge-success';
    dropdownBody.innerHTML = `
      <div style="padding: 1.5rem 1rem; text-align: center; color: var(--text-muted);">
        <i class="fa-solid fa-circle-check" style="font-size: 1.8rem; color: var(--accent-success); margin-bottom: 0.5rem;"></i>
        <p style="font-size: 0.85rem; margin: 0;">Şu anda günü geçen veya acil başlayış bekleyen personel bulunmamaktadır.</p>
      </div>
    `;
  }

  // Sync left sidebar nav badge with dueList count
  const navBadge = document.getElementById('nav-pending-badge');
  if (navBadge) {
    if (dueList.length > 0) {
      navBadge.textContent = dueList.length;
      navBadge.style.display = 'inline-block';
    } else {
      navBadge.style.display = 'none';
    }
  }
}

function setupNotificationBell() {
  const bellBtn = document.getElementById('notif-bell-btn');
  const dropdown = document.getElementById('notif-dropdown');

  if (bellBtn && dropdown) {
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === 'flex';
      dropdown.style.display = isVisible ? 'none' : 'flex';
    });

    document.addEventListener('click', () => {
      dropdown.style.display = 'none';
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
}

// 1. DASHBOARD
function renderDashboard(forceResetTab = false) {
  renderNotificationBell();
  const stats = getDashboardStats();
  document.getElementById('stat-active-leaves').textContent = stats.totalActiveLeaves;
  document.getElementById('stat-pending-returns').textContent = stats.pendingReturnsCount;
  document.getElementById('stat-completed-returns').textContent = stats.completedCount;
  document.getElementById('stat-total-personnel').textContent = getPersonnelList().length;

  // Pending returns badge on sidebar nav
  const pendingList = getPendingReturnRecords();
  const dueList = pendingList.filter(r => r.isDue);
  const upcomingList = pendingList.filter(r => !r.isDue);
  const allRecords = getLeaveRecords();
  const completedList = allRecords.filter(r => r.status === 'baslayis_yapildi' && !r.hiddenFromDashboard);

  const sortByAyrilisDateDesc = (list) => {
    list.sort((a, b) => {
      if (a.ayrilisDate !== b.ayrilisDate) {
        return a.ayrilisDate < b.ayrilisDate ? 1 : -1;
      }
      return (b.id || '') > (a.id || '') ? 1 : -1;
    });
  };

  sortByAyrilisDateDesc(dueList);
  sortByAyrilisDateDesc(upcomingList);
  sortByAyrilisDateDesc(completedList);

  // Due leaves pagination calculations
  const totalDueRecords = dueList.length;
  const totalDuePages = Math.ceil(totalDueRecords / dueLeavesState.pageSize) || 1;
  if (dueLeavesState.currentPage > totalDuePages) dueLeavesState.currentPage = totalDuePages;
  if (dueLeavesState.currentPage < 1) dueLeavesState.currentPage = 1;

  const dueStartIndex = (dueLeavesState.currentPage - 1) * dueLeavesState.pageSize;
  const dueEndIndex = Math.min(dueStartIndex + dueLeavesState.pageSize, totalDueRecords);
  const paginatedDueList = dueList.slice(dueStartIndex, dueEndIndex);

  // Upcoming leaves pagination calculations
  const totalUpcomingRecords = upcomingList.length;
  const totalUpcomingPages = Math.ceil(totalUpcomingRecords / upcomingLeavesState.pageSize) || 1;
  if (upcomingLeavesState.currentPage > totalUpcomingPages) upcomingLeavesState.currentPage = totalUpcomingPages;
  if (upcomingLeavesState.currentPage < 1) upcomingLeavesState.currentPage = 1;

  const upcomingStartIndex = (upcomingLeavesState.currentPage - 1) * upcomingLeavesState.pageSize;
  const upcomingEndIndex = Math.min(upcomingStartIndex + upcomingLeavesState.pageSize, totalUpcomingRecords);
  const paginatedUpcomingList = upcomingList.slice(upcomingStartIndex, upcomingEndIndex);

  // Completed leaves pagination calculations
  const totalCompletedRecords = completedList.length;
  const totalCompletedPages = Math.ceil(totalCompletedRecords / completedLeavesState.pageSize) || 1;
  if (completedLeavesState.currentPage > totalCompletedPages) completedLeavesState.currentPage = totalCompletedPages;
  if (completedLeavesState.currentPage < 1) completedLeavesState.currentPage = 1;

  const completedStartIndex = (completedLeavesState.currentPage - 1) * completedLeavesState.pageSize;
  const completedEndIndex = Math.min(completedStartIndex + completedLeavesState.pageSize, totalCompletedRecords);
  const paginatedCompletedList = completedList.slice(completedStartIndex, completedEndIndex);

  const badge = document.getElementById('nav-pending-badge');
  if (badge) {
    if (dueList.length > 0) {
      badge.textContent = dueList.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  // Pending and Completed returns list
  const pendingContainer = document.getElementById('pending-returns-container');


  if (pendingList.length === 0 && completedList.length === 0) {
    pendingContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <i class="fa-solid fa-circle-check" style="font-size: 2rem; color: var(--accent-success); margin-bottom: 0.5rem;"></i>
        <p>Şu anda takipte olan veya göreve başlayış yazısı bekleyen izin kaydı bulunmamaktadır.</p>
      </div>
    `;
    return;
  }

  if (forceResetTab || !dashboardActiveTab) {
    dashboardActiveTab = dueList.length > 0 ? 'due' : (upcomingList.length > 0 ? 'upcoming' : 'completed');
  }

  const activeTab = dashboardActiveTab;

  const titles = {
    'due': '<span><i class="fa-solid fa-triangle-exclamation" style="color: var(--accent-danger); margin-right: 8px;"></i> GÜNÜ GELEN / TARİHİ GEÇENLER (ACİL BAŞLAYIŞ YAZISI GEREKLİ)</span>',
    'upcoming': '<span><i class="fa-solid fa-calendar-days" style="color: var(--accent-primary); margin-right: 8px;"></i> DEVAM EDEN İZİNLER (Gelecek Başlayışlar)</span>',
    'completed': '<span><i class="fa-solid fa-circle-check" style="color: var(--accent-success); margin-right: 8px;"></i> BAŞLAYIŞI YAPILAN VE TAMAMLANAN İZİNLER</span>'
  };

  const activeTitleHtml = titles[activeTab] || titles['due'];

  let html = `
    <div class="dashboard-tabs-container">
      <div class="dashboard-tabs" style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; overflow-x: auto;">
        <button class="btn ${activeTab === 'due' ? 'btn-danger active' : 'btn-secondary'} tab-btn" data-target="tab-due" data-type="danger" style="flex-shrink: 0; display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.25rem; font-size: 1rem; font-weight: 600;">
          🚨 Günü Gelenler <span class="badge ${activeTab === 'due' ? 'badge-light' : 'badge-danger'}">${dueList.length}</span>
        </button>
        <button class="btn ${activeTab === 'upcoming' ? 'btn-primary active' : 'btn-secondary'} tab-btn" data-target="tab-upcoming" data-type="primary" style="flex-shrink: 0; display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.25rem; font-size: 1rem; font-weight: 600;">
          ⏳ Devam Edenler <span class="badge ${activeTab === 'upcoming' ? 'badge-light' : 'badge-info'}">${upcomingList.length}</span>
        </button>
        <button class="btn ${activeTab === 'completed' ? 'btn-success active' : 'btn-secondary'} tab-btn" data-target="tab-completed" data-type="success" style="flex-shrink: 0; display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.25rem; font-size: 1rem; font-weight: 600;">
          ✅ Tamamlananlar <span class="badge ${activeTab === 'completed' ? 'badge-light' : 'badge-success'}">${completedList.length}</span>
        </button>
      </div>
      
      <div class="card-title" id="dynamic-tab-title" style="margin-bottom: 1.25rem; font-size: 1.1rem; padding-left: 0.25rem;">
        ${activeTitleHtml}
      </div>

      <div class="tab-content">
  `;

  // DUE LIST TAB
  html += `<div id="tab-due" class="tab-pane" style="display: ${activeTab === 'due' ? 'block' : 'none'};">`;
  if (dueList.length > 0) {
    html += `
      <div style="border: 2px solid var(--accent-danger); background: rgba(239, 68, 68, 0.08); padding: 1.25rem; border-radius: var(--radius-md);">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Personel</th>
                <th>Sicil</th>
                <th>İzin Türü</th>
                <th>Ayrılış Tarihi</th>
                <th>Süre</th>
                <th>Başlayış Tarihi</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              ${paginatedDueList.map(item => {
      const titleMap = getPersonnelTitleMap();
      const displayUnvan = titleMap[item.personnelId] || titleMap[item.personnelName] || item.unvan || '';
      return `
                <tr style="background: rgba(239, 68, 68, 0.06);">
                  <td><strong>${item.personnelName}</strong><br><small style="color: var(--text-muted);">${displayUnvan}</small></td>
                  <td>${item.sicil}</td>
                  <td><span class="badge badge-danger">${item.leaveTypeName}</span></td>
                  <td>${formatDateTR(item.ayrilisDate)}</td>
                  <td>${item.days} Gün</td>
                  <td><span class="badge badge-danger">${formatDateTR(item.expectedReturnDate)} (SÜRESİ DOLDU)</span></td>
                  <td style="display: flex; gap: 0.5rem; align-items: center;">
                    <div style="width: 110px; flex-shrink: 0; display: inline-flex; align-items: center;">
                      <button class="btn btn-sm btn-success btn-create-baslayis" data-record-id="${item.id}" style="width: 100%; justify-content: center; font-weight: 700;">
                        <i class="fa-solid fa-paper-plane"></i> BAŞLAYIŞ
                      </button>
                    </div>
                    <button class="btn btn-sm btn-primary btn-edit-leave-record" data-record-id="${item.id}">
                      <i class="fa-solid fa-pen-to-square"></i> Düzenle
                    </button>
                  </td>
                </tr>
              `;
    }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Pagination Bar for Due Leaves -->
        <div class="pagination-bar" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.25rem; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">Sayfa başı:</span>
            <select id="due-page-size" style="width: 70px; padding: 0.25rem 0.5rem; font-size: 0.85rem;">
              <option value="5" ${dueLeavesState.pageSize === 5 ? 'selected' : ''}>5</option>
              <option value="10" ${dueLeavesState.pageSize === 10 ? 'selected' : ''}>10</option>
              <option value="20" ${dueLeavesState.pageSize === 20 ? 'selected' : ''}>20</option>
              <option value="50" ${dueLeavesState.pageSize === 50 ? 'selected' : ''}>50</option>
            </select>
            <span style="font-size: 0.85rem; color: var(--text-muted);">${totalDueRecords === 0 ? '0-0 / 0 Kayıt' : `${dueStartIndex + 1}-${dueEndIndex} / ${totalDueRecords} Kayıt`}</span>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="btn btn-sm btn-secondary" id="btn-due-prev-page" ${dueLeavesState.currentPage <= 1 ? 'disabled' : ''}>
              <i class="fa-solid fa-chevron-left"></i> Önceki
            </button>
            <span style="font-weight: 600; font-size: 0.9rem; padding: 0 0.5rem;">
              Sayfa ${dueLeavesState.currentPage} / ${totalDuePages}
            </span>
            <button class="btn btn-sm btn-secondary" id="btn-due-next-page" ${dueLeavesState.currentPage >= totalDuePages ? 'disabled' : ''}>
              Sonraki <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  } else {
    html += `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted); background: rgba(255,255,255,0.02); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-face-smile" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.5rem;"></i>
        <p>Harika! Günü geçen izin kaydı bulunmuyor.</p>
      </div>
    `;
  }
  html += `</div>`;

  // UPCOMING TAB
  html += `<div id="tab-upcoming" class="tab-pane" style="display: ${activeTab === 'upcoming' ? 'block' : 'none'};">`;
  if (upcomingList.length > 0) {
    html += `
      <div style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Personel</th>
                <th>Sicil</th>
                <th>İzin Türü</th>
                <th>Ayrılış Tarihi</th>
                <th>Süre</th>
                <th>Başlayış Tarihi</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              ${paginatedUpcomingList.map(item => {
      const titleMap = getPersonnelTitleMap();
      const displayUnvan = titleMap[item.personnelId] || titleMap[item.personnelName] || item.unvan || '';
      return `
                <tr>
                  <td><strong>${item.personnelName}</strong><br><small style="color: var(--text-muted);">${displayUnvan}</small></td>
                  <td>${item.sicil}</td>
                  <td><span class="badge badge-info">${item.leaveTypeName}</span></td>
                  <td>${formatDateTR(item.ayrilisDate)}</td>
                  <td>${item.days} Gün</td>
                  <td><span class="badge badge-info">${formatDateTR(item.expectedReturnDate)}</span></td>
                  <td style="display: flex; gap: 0.5rem; align-items: center;">
                    <div style="width: 110px; flex-shrink: 0; display: inline-flex; align-items: center;">
                      <button class="btn btn-sm btn-success btn-create-baslayis" data-record-id="${item.id}" style="width: 100%; justify-content: center;">
                        <i class="fa-solid fa-paper-plane"></i> BAŞLAYIŞ
                      </button>
                    </div>
                    <button class="btn btn-sm btn-primary btn-edit-leave-record" data-record-id="${item.id}">
                      <i class="fa-solid fa-pen-to-square"></i> Düzenle
                    </button>
                  </td>
                </tr>
              `;
    }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Pagination Bar for Upcoming Leaves -->
        <div class="pagination-bar" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.25rem; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">Sayfa başı:</span>
            <select id="upcoming-page-size" style="width: 70px; padding: 0.25rem 0.5rem; font-size: 0.85rem;">
              <option value="5" ${upcomingLeavesState.pageSize === 5 ? 'selected' : ''}>5</option>
              <option value="10" ${upcomingLeavesState.pageSize === 10 ? 'selected' : ''}>10</option>
              <option value="20" ${upcomingLeavesState.pageSize === 20 ? 'selected' : ''}>20</option>
              <option value="50" ${upcomingLeavesState.pageSize === 50 ? 'selected' : ''}>50</option>
            </select>
            <span style="font-size: 0.85rem; color: var(--text-muted);">${totalUpcomingRecords === 0 ? '0-0 / 0 Kayıt' : `${upcomingStartIndex + 1}-${upcomingEndIndex} / ${totalUpcomingRecords} Kayıt`}</span>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="btn btn-sm btn-secondary" id="btn-upcoming-prev-page" ${upcomingLeavesState.currentPage <= 1 ? 'disabled' : ''}>
              <i class="fa-solid fa-chevron-left"></i> Önceki
            </button>
            <span style="font-weight: 600; font-size: 0.9rem; padding: 0 0.5rem;">
              Sayfa ${upcomingLeavesState.currentPage} / ${totalUpcomingPages}
            </span>
            <button class="btn btn-sm btn-secondary" id="btn-upcoming-next-page" ${upcomingLeavesState.currentPage >= totalUpcomingPages ? 'disabled' : ''}>
              Sonraki <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  } else {
    html += `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted); background: rgba(255,255,255,0.02); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-calendar-check" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.5rem;"></i>
        <p>Devam eden izin kaydı bulunmuyor.</p>
      </div>
    `;
  }
  html += `</div>`;

  // COMPLETED TAB
  html += `<div id="tab-completed" class="tab-pane" style="display: ${activeTab === 'completed' ? 'block' : 'none'};">`;
  if (completedList.length > 0) {
    html += `
      <div style="border: 1px solid var(--accent-success); background: rgba(16, 185, 129, 0.05); padding: 1.25rem; border-radius: var(--radius-md);">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Personel</th>
                <th>Sicil</th>
                <th>İzin Türü</th>
                <th>Ayrılış Tarihi</th>
                <th>Başlayış Tarihi</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              ${paginatedCompletedList.map(item => {
      const titleMap = getPersonnelTitleMap();
      const displayUnvan = titleMap[item.personnelId] || titleMap[item.personnelName] || item.unvan || '';
      return `
                <tr>
                  <td><strong>${item.personnelName}</strong><br><small style="color: var(--text-muted);">${displayUnvan}</small></td>
                  <td>${item.sicil}</td>
                  <td><span class="badge badge-info">${item.leaveTypeName}</span></td>
                  <td>${formatDateTR(item.ayrilisDate)}</td>
                  <td>${formatDateTR(item.expectedReturnDate)}</td>
                  <td><span class="badge badge-success"><i class="fa-solid fa-check"></i> BAŞLAYIŞ YAPILDI</span></td>
                  <td style="display: flex; gap: 0.5rem; align-items: center;">
                    <div style="width: 110px; flex-shrink: 0; display: inline-flex; align-items: center;">
                      <button class="btn btn-sm btn-primary btn-re-download-baslayis" data-record-id="${item.id}" style="width: 100%; justify-content: center;">
                        <i class="fa-solid fa-download"></i> UDF İndir
                      </button>
                    </div>
                    <button class="btn btn-sm btn-secondary btn-edit-leave-record" data-record-id="${item.id}">
                      <i class="fa-solid fa-pen-to-square"></i> Düzenle
                    </button>
                    <button class="btn btn-sm btn-secondary btn-delete-leave-record" data-record-id="${item.id}" title="Ana Sayfa Panosundan Kaldır">
                      <i class="fa-solid fa-eye-slash"></i> Panodan Kaldır
                    </button>
                  </td>
                </tr>
              `;
    }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Pagination Bar for Completed Leaves -->
        <div class="pagination-bar" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.25rem; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">Sayfa başı:</span>
            <select id="completed-page-size" style="width: 70px; padding: 0.25rem 0.5rem; font-size: 0.85rem;">
              <option value="5" ${completedLeavesState.pageSize === 5 ? 'selected' : ''}>5</option>
              <option value="10" ${completedLeavesState.pageSize === 10 ? 'selected' : ''}>10</option>
              <option value="20" ${completedLeavesState.pageSize === 20 ? 'selected' : ''}>20</option>
              <option value="50" ${completedLeavesState.pageSize === 50 ? 'selected' : ''}>50</option>
            </select>
            <span style="font-size: 0.85rem; color: var(--text-muted);">${totalCompletedRecords === 0 ? '0-0 / 0 Kayıt' : `${completedStartIndex + 1}-${completedEndIndex} / ${totalCompletedRecords} Kayıt`}</span>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="btn btn-sm btn-secondary" id="btn-completed-prev-page" ${completedLeavesState.currentPage <= 1 ? 'disabled' : ''}>
              <i class="fa-solid fa-chevron-left"></i> Önceki
            </button>
            <span style="font-weight: 600; font-size: 0.9rem; padding: 0 0.5rem;">
              Sayfa ${completedLeavesState.currentPage} / ${totalCompletedPages}
            </span>
            <button class="btn btn-sm btn-secondary" id="btn-completed-next-page" ${completedLeavesState.currentPage >= totalCompletedPages ? 'disabled' : ''}>
              Sonraki <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  } else {
    html += `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted); background: rgba(255,255,255,0.02); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-folder-open" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.5rem;"></i>
        <p>Panoda tamamlanmış izin kaydı bulunmuyor.</p>
      </div>
    `;
  }
  html += `</div>`;

  html += `
      </div>
    </div>
  `;

  pendingContainer.innerHTML = html;

  // Add click listeners for tabs
  pendingContainer.querySelectorAll('.dashboard-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (targetId === 'tab-due') dashboardActiveTab = 'due';
      else if (targetId === 'tab-upcoming') dashboardActiveTab = 'upcoming';
      else if (targetId === 'tab-completed') dashboardActiveTab = 'completed';

      // Reset all tabs
      pendingContainer.querySelectorAll('.dashboard-tabs .tab-btn').forEach(b => {
        b.className = 'btn btn-secondary tab-btn';
        b.style.flexShrink = '0';
        b.style.display = 'flex';
        b.style.alignItems = 'center';
        b.style.gap = '0.5rem';
        b.style.padding = '0.6rem 1.25rem';
        b.style.fontSize = '1rem';
        b.style.fontWeight = '600';

        const badge = b.querySelector('.badge');
        if (b.getAttribute('data-type') === 'danger') badge.className = 'badge badge-danger';
        if (b.getAttribute('data-type') === 'primary') badge.className = 'badge badge-info';
        if (b.getAttribute('data-type') === 'success') badge.className = 'badge badge-success';
      });
      // Hide all panes
      pendingContainer.querySelectorAll('.tab-content .tab-pane').forEach(p => p.style.display = 'none');

      // Set active tab
      const type = btn.getAttribute('data-type');
      btn.className = `btn btn-${type} tab-btn active`;
      btn.style.flexShrink = '0';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '0.5rem';
      btn.style.padding = '0.6rem 1.25rem';
      btn.style.fontSize = '1rem';
      btn.style.fontWeight = '600';

      const badge = btn.querySelector('.badge');
      if (badge) badge.className = 'badge badge-light';

      // Update Dynamic Title
      const tabTitles = {
        'tab-due': '<span><i class="fa-solid fa-triangle-exclamation" style="color: var(--accent-danger); margin-right: 8px;"></i> GÜNÜ GELEN / TARİHİ GEÇENLER (ACİL BAŞLAYIŞ YAZISI GEREKLİ)</span>',
        'tab-upcoming': '<span><i class="fa-solid fa-calendar-days" style="color: var(--accent-primary); margin-right: 8px;"></i> DEVAM EDEN İZİNLER (Gelecek Başlayışlar)</span>',
        'tab-completed': '<span><i class="fa-solid fa-circle-check" style="color: var(--accent-success); margin-right: 8px;"></i> BAŞLAYIŞI YAPILAN VE TAMAMLANAN İZİNLER</span>'
      };
      const titleEl = pendingContainer.querySelector('#dynamic-tab-title');
      if (titleEl) titleEl.innerHTML = tabTitles[targetId] || '';

      // Show active pane
      const targetPane = pendingContainer.querySelector('#' + targetId);
      if (targetPane) targetPane.style.display = 'block';
    });
  });

  // Add click listeners
  pendingContainer.querySelectorAll('.btn-create-baslayis').forEach(btn => {
    btn.addEventListener('click', async () => {
      const recId = btn.getAttribute('data-record-id');
      await startBaslayisWizardForRecord(recId);
    });
  });

  pendingContainer.querySelectorAll('.btn-re-download-baslayis').forEach(btn => {
    btn.addEventListener('click', async () => {
      const recId = btn.getAttribute('data-record-id');
      await startBaslayisWizardForRecord(recId);
    });
  });

  pendingContainer.querySelectorAll('.btn-edit-leave-record').forEach(btn => {
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-record-id');
      openEditLeaveRecordModal(recId);
    });
  });

  pendingContainer.querySelectorAll('.btn-delete-leave-record').forEach(btn => {
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-record-id');
      const rec = getLeaveRecords().find(r => r.id === recId);
      const name = rec ? rec.personnelName : 'Seçili';

      showConfirmModal({
        title: 'Panodan Kaldır',
        message: `<strong>${name}</strong> isimli personelin bu izin kaydını Ana Sayfa panosundan kaldırmak istediğinizden emin misiniz?<br><br><small style="color: var(--text-muted);"><i class="fa-solid fa-circle-info"></i> Not: Bu izin kaydı <strong>İzinler & Başlayış Takibi</strong> (İzin Kayıtları Geçmişi) sayfasında saklanmaya devam edecektir.</small>`,
        confirmText: 'Evet, Panodan Kaldır',
        cancelText: 'Vazgeç',
        onConfirm: () => {
          updateLeaveRecord(recId, { hiddenFromDashboard: true });
          showToast('İzin kaydı panodan kaldırıldı. İzin kayıtları geçmişinde saklanıyor.', 'warning');
          renderDashboard();
          renderLeavesTable();
          renderNotificationBell();
        }
      });
    });
  });

  // Add listeners for due leaves pagination
  const duePageSizeSelect = pendingContainer.querySelector('#due-page-size');
  if (duePageSizeSelect) {
    duePageSizeSelect.addEventListener('change', (e) => {
      dueLeavesState.pageSize = parseInt(e.target.value, 10) || 10;
      dueLeavesState.currentPage = 1;
      renderDashboard();
    });
  }

  const duePrevBtn = pendingContainer.querySelector('#btn-due-prev-page');
  if (duePrevBtn) {
    duePrevBtn.addEventListener('click', () => {
      if (dueLeavesState.currentPage > 1) {
        dueLeavesState.currentPage--;
        renderDashboard();
      }
    });
  }

  const dueNextBtn = pendingContainer.querySelector('#btn-due-next-page');
  if (dueNextBtn) {
    dueNextBtn.addEventListener('click', () => {
      if (dueLeavesState.currentPage < totalDuePages) {
        dueLeavesState.currentPage++;
        renderDashboard();
      }
    });
  }

  // Add listeners for upcoming leaves pagination
  const upcomingPageSizeSelect = pendingContainer.querySelector('#upcoming-page-size');
  if (upcomingPageSizeSelect) {
    upcomingPageSizeSelect.addEventListener('change', (e) => {
      upcomingLeavesState.pageSize = parseInt(e.target.value, 10) || 10;
      upcomingLeavesState.currentPage = 1;
      renderDashboard();
    });
  }

  const upcomingPrevBtn = pendingContainer.querySelector('#btn-upcoming-prev-page');
  if (upcomingPrevBtn) {
    upcomingPrevBtn.addEventListener('click', () => {
      if (upcomingLeavesState.currentPage > 1) {
        upcomingLeavesState.currentPage--;
        renderDashboard();
      }
    });
  }

  const upcomingNextBtn = pendingContainer.querySelector('#btn-upcoming-next-page');
  if (upcomingNextBtn) {
    upcomingNextBtn.addEventListener('click', () => {
      if (upcomingLeavesState.currentPage < totalUpcomingPages) {
        upcomingLeavesState.currentPage++;
        renderDashboard();
      }
    });
  }

  // Add listeners for completed leaves pagination
  const completedPageSizeSelect = pendingContainer.querySelector('#completed-page-size');
  if (completedPageSizeSelect) {
    completedPageSizeSelect.addEventListener('change', (e) => {
      completedLeavesState.pageSize = parseInt(e.target.value, 10) || 10;
      completedLeavesState.currentPage = 1;
      renderDashboard();
    });
  }

  const completedPrevBtn = pendingContainer.querySelector('#btn-completed-prev-page');
  if (completedPrevBtn) {
    completedPrevBtn.addEventListener('click', () => {
      if (completedLeavesState.currentPage > 1) {
        completedLeavesState.currentPage--;
        renderDashboard();
      }
    });
  }

  const completedNextBtn = pendingContainer.querySelector('#btn-completed-next-page');
  if (completedNextBtn) {
    completedNextBtn.addEventListener('click', () => {
      if (completedLeavesState.currentPage < totalCompletedPages) {
        completedLeavesState.currentPage++;
        renderDashboard();
      }
    });
  }
}

// Turkish-aware string normalization for accurate searching
function trNormalize(text) {
  return normalizeSearch(text);
}

function setupSearchablePersonnelSelect() {
  const personSelect = document.getElementById('wiz-personnel-select');
  if (!personSelect) return;

  personSelect.style.display = 'none';

  let wrapper = document.getElementById('custom-searchable-personnel');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'custom-searchable-personnel';
    wrapper.className = 'custom-searchable-select';
    personSelect.parentNode.insertBefore(wrapper, personSelect.nextSibling);

    wrapper.innerHTML = `
      <div class="select-trigger" tabindex="0" role="button" aria-haspopup="listbox">
        <span class="selected-text">Personel Seçiniz...</span>
        <i class="fa-solid fa-chevron-down arrow-icon"></i>
      </div>
      <div class="select-dropdown">
        <div class="search-box">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" placeholder="Personel ara (Ad, Sicil, Unvan)..." autocomplete="off" />
        </div>
        <div class="options-list" role="listbox"></div>
      </div>
    `;

    const trigger = wrapper.querySelector('.select-trigger');
    const input = wrapper.querySelector('input');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = wrapper.classList.toggle('active');
      if (isActive) {
        input.value = '';
        filterSearchablePersonnelOptions('');
        setTimeout(() => input.focus(), 50);
      }
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger.click();
      }
    });

    input.addEventListener('input', (e) => {
      filterSearchablePersonnelOptions(e.target.value);
    });

    input.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove('active');
      }
    });
  }

  const personnelList = getPersonnelList();
  const optionsContainer = wrapper.querySelector('.options-list');
  const triggerText = wrapper.querySelector('.selected-text');
  const selectedPerson = personnelList.find(p => p.id === personSelect.value);

  if (selectedPerson) {
    triggerText.textContent = `${selectedPerson.name} (${selectedPerson.sicil}) - ${selectedPerson.title}`;
  } else {
    triggerText.textContent = 'Personel Seçiniz...';
  }

  optionsContainer.innerHTML = personnelList.map(p => {
    const isSelected = selectedPerson && p.id === selectedPerson.id;
    return `
      <div class="option-item ${isSelected ? 'selected' : ''}" data-value="${p.id}" data-search="${normalizeSearch(`${p.name} ${p.sicil} ${p.title}`)}">
        <div>
          <strong>${p.name}</strong> <small style="opacity: 0.8; margin-left: 4px;">(${p.sicil})</small>
          <div style="font-size: 0.78rem; opacity: 0.75;">${p.title}</div>
        </div>
        ${isSelected ? '<i class="fa-solid fa-check" style="color: #ffffff; font-size: 0.85rem;"></i>' : ''}
      </div>
    `;
  }).join('');

  optionsContainer.querySelectorAll('.option-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = item.getAttribute('data-value');
      personSelect.value = val;
      personSelect.dispatchEvent(new Event('change', { bubbles: true }));
      wrapper.classList.remove('active');
      refreshSearchablePersonnelSelect();
    });
  });
}

function refreshSearchablePersonnelSelect() {
  setupSearchablePersonnelSelect();
}

function filterSearchablePersonnelOptions(query) {
  const wrapper = document.getElementById('custom-searchable-personnel');
  if (!wrapper) return;
  const options = wrapper.querySelectorAll('.option-item');
  let visibleCount = 0;

  options.forEach(opt => {
    const searchText = opt.getAttribute('data-search') || '';
    if (!query || matchesSearchQuery(searchText, query)) {
      opt.style.display = 'flex';
      visibleCount++;
    } else {
      opt.style.display = 'none';
    }
  });

  let noRes = wrapper.querySelector('.no-results');
  if (visibleCount === 0) {
    if (!noRes) {
      noRes = document.createElement('div');
      noRes.className = 'no-results';
      noRes.textContent = 'Aramanıza uygun personel bulunamadı.';
      wrapper.querySelector('.options-list').appendChild(noRes);
    }
    noRes.style.display = 'block';
  } else if (noRes) {
    noRes.style.display = 'none';
  }
}

// 2. DOCUMENT FORM SETUP
function populateWizardOptions(preserveSelections = false) {
  const currentP = preserveSelections ? document.getElementById('wiz-personnel-select')?.value : null;
  const currentL = preserveSelections ? document.getElementById('wiz-leave-type')?.value : null;
  const currentS = preserveSelections ? document.getElementById('wiz-imzalayan')?.value : null;
  const currentM = preserveSelections ? document.getElementById('wiz-alici-makam')?.value : null;

  // 1. Personnel (50 Personnel)
  const personnelList = getPersonnelList();
  const personSelect = document.getElementById('wiz-personnel-select');
  personSelect.innerHTML = personnelList.map(p => `<option value="${p.id}">${p.name} (${p.sicil}) - ${p.title}</option>`).join('');
  if (currentP && personnelList.some(p => p.id === currentP)) personSelect.value = currentP;

  const wizCount = document.getElementById('wiz-personnel-count');
  if (wizCount) wizCount.textContent = `(${personnelList.length} Personel)`;

  setupSearchablePersonnelSelect();

  // 2. Leave Types
  const leaveTypes = getLeaveTypes();
  const leaveSelect = document.getElementById('wiz-leave-type');
  leaveSelect.innerHTML = leaveTypes.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
  if (currentL && leaveTypes.some(l => l.code === currentL)) leaveSelect.value = currentL;

  // 3. Signatories
  const signatories = getSignatories();
  const signerSelect = document.getElementById('wiz-imzalayan');
  signerSelect.innerHTML = signatories.map(s => `<option value="${s.id}" ${s.default ? 'selected' : ''}>${s.name} (${s.title})</option>`).join('');
  if (currentS && signatories.some(s => s.id === currentS)) signerSelect.value = currentS;

  // 4. Alici Makamlar
  const makamlar = getAliciMakamlar();
  const makamSelect = document.getElementById('wiz-alici-makam');
  if (makamSelect) {
    let optionsHtml = makamlar.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    optionsHtml += `<option value="ozel">Özel Makam Yaz (Manuel)</option>`;
    makamSelect.innerHTML = optionsHtml;
    if (currentM && (currentM === 'ozel' || makamlar.some(m => m.id === currentM))) makamSelect.value = currentM;
  }

  // Default dates only if not preserving or empty
  const ayrilisInput = document.getElementById('wiz-ayrilis-tarih');
  if (ayrilisInput && (!preserveSelections || !ayrilisInput.value)) {
    const today = new Date().toISOString().split('T')[0];
    ayrilisInput.value = today;
  }

  if (!preserveSelections) {
    const izinSuresiInput = document.getElementById('wiz-izin-suresi');
    if (izinSuresiInput) {
      izinSuresiInput.value = ''; // Varsayılan olarak boş gelsin (Kullanıcı kendi yazsın)
      document.getElementById('wiz-baslayis-tarih').value = '';
    }
  }
}

function setupWizardForm() {
  populateWizardOptions();

  const leaveTypeSelect = document.getElementById('wiz-leave-type');
  const actionTypeSelect = document.getElementById('wiz-action-type');
  const groupAyrilis = document.getElementById('group-ayrilis-tarih');
  const groupBaslayis = document.getElementById('group-baslayis-tarih');
  const groupIlgi = document.getElementById('group-ilgi-evrak');
  const aliciMakamSelect = document.getElementById('wiz-alici-makam');
  const groupAliciOzel = document.getElementById('group-alici-makam-ozel');
  const izinSuresiInput = document.getElementById('wiz-izin-suresi');
  const ayrilisTarihiInput = document.getElementById('wiz-ayrilis-tarih');
  const baslayisTarihiInput = document.getElementById('wiz-baslayis-tarih');

  // Auto calculate expected return date (Süre -> Başlayış)
  function updateReturnDateCalc() {
    const sDate = ayrilisTarihiInput.value;
    const days = izinSuresiInput.value;
    const calcReturn = calculateExpectedReturn(sDate, days);
    if (baslayisTarihiInput) baslayisTarihiInput.value = calcReturn;
  }

  // Auto calculate leave duration in days (Başlayış -> Süre)
  function updateDurationCalc() {
    const sDate = ayrilisTarihiInput.value;
    const rDate = baslayisTarihiInput.value;
    const calcDays = calculateDaysFromReturn(sDate, rDate);
    if (izinSuresiInput) izinSuresiInput.value = calcDays;
  }

  izinSuresiInput.addEventListener('input', updateReturnDateCalc);
  ayrilisTarihiInput.addEventListener('change', updateReturnDateCalc);
  if (baslayisTarihiInput) {
    baslayisTarihiInput.addEventListener('change', updateDurationCalc);
    baslayisTarihiInput.addEventListener('input', updateDurationCalc);
  }

  function handleFormVisibility() {
    const action = actionTypeSelect.value;
    const lType = leaveTypeSelect.value;
    const isBaslayis = action === 'baslayis';
    const isRapor = lType === 'rapor';

    const groupYolIzni = document.getElementById('group-yol-izni');

    groupAyrilis.style.display = isBaslayis ? 'none' : 'flex';
    groupBaslayis.style.display = 'flex';
    groupIlgi.style.display = isBaslayis ? 'flex' : 'none';

    // Yol izni kutucuğu SADECE Yıllık İzin Ayrılış seçiliğinde görünmeli
    const isYillikAyrilis = (!isBaslayis && lType === 'yillik');
    if (groupYolIzni) {
      groupYolIzni.style.display = isYillikAyrilis ? 'flex' : 'none';
      if (!isYillikAyrilis) {
        const yolChk = document.getElementById('wiz-yol-izni');
        if (yolChk) yolChk.checked = false;
      }
    }

    if (isRapor) {
      aliciMakamSelect.value = 'bakanlik';
      if (!aliciMakamSelect.value && aliciMakamSelect.options.length > 0) aliciMakamSelect.selectedIndex = 0;
    } else {
      aliciMakamSelect.value = 'komisyon';
      if (!aliciMakamSelect.value && aliciMakamSelect.options.length > 0) aliciMakamSelect.selectedIndex = 0;
    }
  }

  actionTypeSelect.addEventListener('change', handleFormVisibility);
  leaveTypeSelect.addEventListener('change', () => {
    const lType = leaveTypeSelect.value;
    if (lType === 'babalik') {
      izinSuresiInput.value = 10;
    } else if (lType === 'evlilik' || lType === 'vefat') {
      izinSuresiInput.value = 7;
    }
    updateReturnDateCalc();
    handleFormVisibility();
  });

  handleFormVisibility();

  aliciMakamSelect.addEventListener('change', () => {
    groupAliciOzel.style.display = aliciMakamSelect.value === 'ozel' ? 'flex' : 'none';
  });

  // UDF Formatted Document Preview Button
  document.getElementById('btn-preview-xml')?.addEventListener('click', () => {
    try {
      const payload = getWizardPayload();

      const payloadAyrilis = { ...payload, actionType: 'ayrilis', docType: payload.leaveType + '_ayrilis' };
      const payloadBaslayis = { ...payload, actionType: 'baslayis', docType: payload.leaveType + '_baslayis' };

      if (!payloadBaslayis.ilgiEvrak) {
        payloadBaslayis.ilgiEvrak = `${formatDateTR(payload.ayrilisTarihi)} tarihli yazımız.`;
      }

      const htmlAyrilis = generateDocumentPreviewHtml(payloadAyrilis, 'btn-modal-dl-ayrilis');
      const htmlBaslayis = generateDocumentPreviewHtml(payloadBaslayis, 'btn-modal-dl-baslayis');

      const previewHtml = `
        <div style="display: flex; gap: 1.5rem; width: 100%; overflow-x: auto; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 450px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem;">
            <h4 style="text-align: center; color: var(--accent-primary); margin-bottom: 1rem; font-size: 1.1rem;"><i class="fa-solid fa-plane-departure"></i> İZNE AYRILIŞ YAZISI</h4>
            <div style="zoom: 0.85; transform-origin: top left;">${htmlAyrilis}</div>
          </div>
          <div style="flex: 1; min-width: 450px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem;">
            <h4 style="text-align: center; color: var(--accent-success); margin-bottom: 1rem; font-size: 1.1rem;"><i class="fa-solid fa-plane-arrival"></i> GÖREVE BAŞLAYIŞ YAZISI</h4>
            <div style="zoom: 0.85; transform-origin: top left;">${htmlBaslayis}</div>
          </div>
        </div>
        <style>
           .modal-container { max-width: 95vw !important; width: 1400px !important; }
           .udf-preview-content-box { min-height: 850px; }
        </style>
      `;

      openModal('📄 AYRILIŞ VE BAŞLAYIŞ BELGELERİ ÖNİZLEMESİ', previewHtml);

      document.getElementById('btn-modal-dl-ayrilis')?.addEventListener('click', async () => {
        const filename = `${payload.personnelName}_${payload.leaveType}_ayrilis.udf`;
        await downloadUdfFile(payloadAyrilis, filename);
        showToast(`${filename} UDF olarak indirildi!`, 'success');
      });

      document.getElementById('btn-modal-dl-baslayis')?.addEventListener('click', async () => {
        const filename = `${payload.personnelName}_${payload.leaveType}_baslayis.udf`;
        await downloadUdfFile(payloadBaslayis, filename);
        showToast(`${filename} UDF olarak indirildi!`, 'success');
      });

    } catch (err) {
      console.error('Önizleme hatası:', err);
      showToast('Önizleme oluşturulurken hata: ' + err.message, 'danger');
    }
  });

  // Form Submit (Generate UDF)
  document.getElementById('form-udf-wizard').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = getWizardPayload();
      const isBaslayis = payload.actionType === 'baslayis';

      // Duplicate/Overlap Leave Check for the same personnel
      if (!isBaslayis) {
        const expReturn = calculateExpectedReturn(payload.ayrilisTarihi, payload.izinSuresi);
        const conflict = checkLeaveConflict(payload.personnelId, payload.ayrilisTarihi, expReturn);

        if (conflict) {
          showToast(`⚠️ ${payload.personnelName} için ${formatDateTR(conflict.ayrilisDate)} - ${formatDateTR(conflict.expectedReturnDate)} tarihleri arasında zaten aktif (${conflict.leaveTypeName}) kaydı mevcuttur! Aynı personel için çakışan tarihte 2. bir izin kaydı oluşturulamaz.`, 'danger');
          return;
        }
      }

      const filename = `${payload.personnelName}_${payload.leaveType}_${payload.actionType}.udf`;
      await downloadUdfFile(payload, filename);
      showToast(`${filename} UDF olarak oluşturuldu ve indirildi!`, 'success');

      // Store record in leave tracking database
      const leaveTypes = getLeaveTypes();
      const ltObj = leaveTypes.find(l => l.code === payload.leaveType) || { name: 'İzin' };

      if (!isBaslayis) {
        const expReturn = calculateExpectedReturn(payload.ayrilisTarihi, payload.izinSuresi);
        addLeaveRecord({
          id: 'rec-' + Date.now(),
          personnelId: payload.personnelId,
          personnelName: payload.personnelName,
          sicil: payload.sicilNo,
          unvan: payload.unvan,
          leaveType: payload.leaveType,
          leaveTypeName: ltObj.name,
          days: payload.izinSuresi,
          isYolIzniDahil: payload.isYolIzniDahil,
          ayrilisDate: payload.ayrilisTarihi,
          expectedReturnDate: expReturn,
          aliciMakam: payload.aliciMakam,
          status: 'ayrilis_yapildi',
          baslayisEvrakNo: null,
          baslayisDate: null
        });
      } else if (payload.linkedRecordId) {
        updateLeaveRecord(payload.linkedRecordId, {
          status: 'baslayis_yapildi',
          baslayisDate: payload.baslayisTarihi
        });
        delete document.getElementById('form-udf-wizard').dataset.linkedRecordId;
      }

      renderDashboard();
    } catch (err) {
      console.error('UDF oluşturma hatası:', err);
      showToast('Hata: ' + err.message, 'danger');
    }
  });
}

function getWizardPayload() {
  const pSelect = document.getElementById('wiz-personnel-select');
  const pId = pSelect ? pSelect.value : '';
  const personnelList = getPersonnelList();
  const person = personnelList.find(p => p.id === pId) || personnelList[0] || { id: '0', name: 'Personel', sicil: '0000', title: 'Katip', birim: 'Bilgi İşlem Müdürlüğü' };

  const sSelect = document.getElementById('wiz-imzalayan');
  const sId = sSelect ? sSelect.value : '';
  const signatories = getSignatories();
  const signer = signatories.find(s => s.id === sId) || signatories[0] || { name: 'Dr. Arif Naci SUCUOĞLU', title: 'Cumhuriyet Başsavcı Vekili' };

  const leaveCode = document.getElementById('wiz-leave-type')?.value || 'yillik';
  const leaveTypes = getLeaveTypes();
  const ltObj = leaveTypes.find(l => l.code === leaveCode || l.id === leaveCode) || { name: 'İzin' };

  const actionType = document.getElementById('wiz-action-type')?.value || 'ayrilis';
  const izinSuresiInput = document.getElementById('wiz-izin-suresi');
  const izinSuresi = parseInt(izinSuresiInput?.value || '5', 10);
  const ayrilisTarihi = document.getElementById('wiz-ayrilis-tarih')?.value || new Date().toISOString().split('T')[0];
  const baslayisTarihi = document.getElementById('wiz-baslayis-tarih')?.value || ayrilisTarihi;

  const aliciMakamId = document.getElementById('wiz-alici-makam')?.value || 'komisyon';
  const makamList = getAliciMakamlar();
  const foundMakam = makamList.find(m => m.id === aliciMakamId);
  const aliciMakamText = foundMakam ? foundMakam.name : '';

  let docType = `${leaveCode}_${actionType}`;
  const todayStr = new Date().toISOString().split('T')[0];
  const donusNotu = getReturnReasonNotu(ayrilisTarihi, izinSuresi);

  return {
    docType: docType,
    leaveType: leaveCode,
    leaveTypeName: ltObj.name || 'İzin',
    subjectText: ltObj.subjectText || '',
    ayrilisPhrase: ltObj.ayrilisPhrase || '',
    baslayisPhrase: ltObj.baslayisPhrase || '',
    ayrilisTemplate: ltObj.ayrilisTemplate || '',
    baslayisTemplate: ltObj.baslayisTemplate || '',
    actionType: actionType,
    personnelId: person.id,
    personnelName: person.name,
    sicilNo: person.sicil,
    unvan: person.title,
    birim: person.birim || 'Bilgi İşlem Müdürlüğü',
    tarih: formatDateTR(todayStr),
    izinSuresi: izinSuresi,
    isYolIzniDahil: document.getElementById('wiz-yol-izni')?.checked || false,
    ayrilisTarihi: ayrilisTarihi,
    baslayisTarihi: baslayisTarihi,
    ilgiEvrak: document.getElementById('wiz-ilgi-evrak')?.value || '',
    aliciMakam: aliciMakamId,
    aliciMakamText: aliciMakamText,
    aliciMakamOzel: document.getElementById('wiz-alici-makam-ozel')?.value || '',
    imzalayanAd: signer.name,
    imzalayanUnvan: signer.title,
    donusNotu: donusNotu,
    linkedRecordId: document.getElementById('form-udf-wizard')?.dataset.linkedRecordId || null
  };
}

async function startBaslayisWizardForRecord(recId) {
  const records = getLeaveRecords();
  const rec = records.find(r => r.id === recId);
  if (!rec) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const isCompleted = rec.status === 'baslayis_yapildi';
  const isEarly = rec.expectedReturnDate && rec.expectedReturnDate > todayStr;

  const executeBaslayis = async () => {
    document.getElementById('wiz-personnel-select').value = rec.personnelId;
    document.getElementById('wiz-leave-type').value = rec.leaveType;

    const actionTypeSelect = document.getElementById('wiz-action-type');
    actionTypeSelect.value = 'baslayis';
    actionTypeSelect.dispatchEvent(new Event('change'));

    document.getElementById('wiz-izin-suresi').value = rec.days;

    const formattedAyrilisDate = formatDateTR(rec.ayrilisDate);
    document.getElementById('wiz-ilgi-evrak').value = `${formattedAyrilisDate} tarihli yazımız.`;

    const baslayisDateVal = (rec.expectedReturnDate && rec.expectedReturnDate <= todayStr) ? todayStr : (rec.expectedReturnDate || todayStr);
    document.getElementById('wiz-baslayis-tarih').value = baslayisDateVal;
    document.getElementById('form-udf-wizard').dataset.linkedRecordId = rec.id;

    try {
      const payload = getWizardPayload();
      const filename = `${payload.personnelName}_${payload.leaveType}_baslayis.udf`;
      await downloadUdfFile(payload, filename);

      updateLeaveRecord(rec.id, {
        status: 'baslayis_yapildi',
        baslayisDate: payload.baslayisTarihi
      });

      delete document.getElementById('form-udf-wizard').dataset.linkedRecordId;
      document.getElementById('form-udf-wizard').reset();
      populateWizardOptions();
      actionTypeSelect.dispatchEvent(new Event('change'));

      showToast(`✅ ${rec.personnelName} için Göreve Başlayış UDF belgesi indirildi ve işlem tamamlandı!`, 'success');
      renderDashboard();
      renderLeavesTable();
      renderNotificationBell();
    } catch (err) {
      console.error('Başlayış UDF oluşturma hatası:', err);
      showToast('Hata: ' + err.message, 'danger');
    }
  };

  // If already completed, re-download directly without modal confirmation (per user request)
  if (isCompleted) {
    await executeBaslayis();
    return;
  }

  const formattedReturnDate = formatDateTR(rec.expectedReturnDate);
  const formattedToday = formatDateTR(todayStr);
  const displayUnvan = rec.unvan || 'Personel';
  const displaySicil = rec.sicil ? ` (${rec.sicil})` : '';

  if (isEarly) {
    // ERKEN BAŞLAYIŞ UYARISI (Tarih henüz gelmedi)
    const messageHtml = `
      <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; text-align: left;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <span style="font-weight: 700; color: var(--text-main); font-size: 1.05rem;">${rec.personnelName}</span>
          <span class="badge badge-warning" style="font-size: 0.78rem;">${rec.leaveTypeName || 'İzin'}</span>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 0.5rem;">
          <div><strong>Unvan / Sicil:</strong> ${displayUnvan}${displaySicil}</div>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; background: rgba(0,0,0,0.15); padding: 0.6rem 0.8rem; border-radius: 8px;">
          <div><i class="fa-solid fa-calendar-dot" style="color: #f59e0b;"></i> <strong>Beklenen Başlayış:</strong><br><span style="color: #f59e0b; font-weight: 800; font-size: 0.95rem;">${formattedReturnDate}</span></div>
          <div><i class="fa-solid fa-clock" style="color: var(--accent-primary);"></i> <strong>Bugünün Tarihi:</strong><br><span style="color: var(--text-main); font-weight: 600;">${formattedToday}</span></div>
        </div>
      </div>
      <p style="font-size: 0.95rem; margin: 0; color: #f59e0b; font-weight: 700;">
        ⚠️ Kişinin göreve başlayış tarihi henüz GELMEMİŞTİR!
      </p>
      <p style="font-size: 0.86rem; color: var(--text-muted); margin-top: 0.4rem;">
        Personelin beklenen başlayış tarihi <strong>${formattedReturnDate}</strong> olarak görünmektedir.<br>Tarihi gelmeden erken göreve başlayış evrakı (UDF) oluşturup kaydı tamamlamak istediğinizden emin misiniz?
      </p>
    `;

    showConfirmModal({
      title: '⚠️ ERKEN GÖREVE BAŞLAYIŞ UYARISI',
      message: messageHtml,
      type: 'warning',
      confirmText: 'Evet, Erken Başlayış Yap',
      cancelText: 'Vazgeç',
      onConfirm: executeBaslayis
    });
  } else {
    // ZAMANI GELMİŞ / GEÇMİŞ BAŞLAYIŞ ONAYI
    const messageHtml = `
      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; text-align: left;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <span style="font-weight: 700; color: var(--text-main); font-size: 1.05rem;">${rec.personnelName}</span>
          <span class="badge badge-success" style="font-size: 0.78rem;">${rec.leaveTypeName || 'İzin'}</span>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 0.5rem;">
          <div><strong>Unvan / Sicil:</strong> ${displayUnvan}${displaySicil}</div>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); background: rgba(0,0,0,0.15); padding: 0.6rem 0.8rem; border-radius: 8px;">
          <i class="fa-solid fa-calendar-check" style="color: #10b981;"></i> <strong>Beklenen Başlayış Tarihi:</strong>
          <span style="color: #10b981; font-weight: 700; font-size: 0.95rem; margin-left: 0.4rem;">${formattedReturnDate}</span>
        </div>
      </div>
      <p style="font-size: 0.95rem; margin: 0; color: var(--text-main); font-weight: 600;">
        Göreve başlayış evrakını (UDF) oluşturmak istediğinizden emin misiniz?
      </p>
      <p style="font-size: 0.86rem; color: var(--text-muted); margin-top: 0.4rem;">
        İşlem onaylandığında personelin göreve başlayış yazısı otomatik olarak bilgisayarınıza indirilecek ve kayıt tamamlanacaktır.
      </p>
    `;

    showConfirmModal({
      title: '📋 GÖREVE BAŞLAYIŞ ONAYI',
      message: messageHtml,
      type: 'success',
      confirmText: 'Evet, Başlayış Yap',
      cancelText: 'Vazgeç',
      onConfirm: executeBaslayis
    });
  }
}

// 3. LEAVES TABLE STATE & FILTERS & PAGINATION
let leavesState = {
  searchQuery: '',
  typeFilter: '',
  statusFilter: '',
  currentPage: 1,
  pageSize: 10
};

function setupLeavesTableFilters() {
  const searchInput = document.getElementById('filter-leaves-search');
  const typeSelect = document.getElementById('filter-leaves-type');
  const statusSelect = document.getElementById('filter-leaves-status');
  const pageSizeSelect = document.getElementById('leaves-page-size');
  const prevBtn = document.getElementById('btn-leaves-prev-page');
  const nextBtn = document.getElementById('btn-leaves-next-page');

  searchInput?.addEventListener('input', (e) => {
    leavesState.searchQuery = e.target.value;
    leavesState.currentPage = 1;
    renderLeavesTable();
  });

  typeSelect?.addEventListener('change', (e) => {
    leavesState.typeFilter = e.target.value;
    leavesState.currentPage = 1;
    renderLeavesTable();
  });

  statusSelect?.addEventListener('change', (e) => {
    leavesState.statusFilter = e.target.value;
    leavesState.currentPage = 1;
    renderLeavesTable();
  });

  pageSizeSelect?.addEventListener('change', (e) => {
    leavesState.pageSize = parseInt(e.target.value, 10) || 10;
    leavesState.currentPage = 1;
    renderLeavesTable();
  });

  prevBtn?.addEventListener('click', () => {
    if (leavesState.currentPage > 1) {
      leavesState.currentPage--;
      renderLeavesTable();
    }
  });

  nextBtn?.addEventListener('click', () => {
    leavesState.currentPage++;
    renderLeavesTable();
  });

  const startDateInput = document.getElementById('leaves-global-start');
  const endDateInput = document.getElementById('leaves-global-end');
  const btnThisMonth = document.getElementById('btn-leaves-filter-this-month');
  const btnThisYear = document.getElementById('btn-leaves-filter-this-year');
  const clearDatesBtn = document.getElementById('btn-leaves-clear-dates');

  if (startDateInput) startDateInput.addEventListener('change', () => { leavesState.currentPage = 1; renderLeavesTable(); });
  if (endDateInput) endDateInput.addEventListener('change', () => { leavesState.currentPage = 1; renderLeavesTable(); });

  if (btnThisMonth) {
    btnThisMonth.addEventListener('click', () => {
      const fmt = (d) => { const pad = n => n < 10 ? '0' + n : n; return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
      const now = new Date();
      if (startDateInput) startDateInput.value = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
      if (endDateInput) endDateInput.value = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      leavesState.currentPage = 1;
      renderLeavesTable();
    });
  }

  if (btnThisYear) {
    btnThisYear.addEventListener('click', () => {
      const now = new Date();
      if (startDateInput) startDateInput.value = `${now.getFullYear()}-01-01`;
      if (endDateInput) endDateInput.value = `${now.getFullYear()}-12-31`;
      leavesState.currentPage = 1;
      renderLeavesTable();
    });
  }

  if (clearDatesBtn) {
    clearDatesBtn.addEventListener('click', () => {
      if (startDateInput) startDateInput.value = '';
      if (endDateInput) endDateInput.value = '';
      leavesState.currentPage = 1;
      renderLeavesTable();
    });
  }
}

function openEditLeaveRecordModal(recordId) {
  const rec = getLeaveRecords().find(r => r.id === recordId);
  if (!rec) {
    showToast('Düzenlenecek izin kaydı bulunamadı.', 'danger');
    return;
  }

  const leaveTypes = getLeaveTypes();

  const modalHtml = `
    <form id="form-edit-leave-record" class="form-grid" style="display: grid; gap: 1rem;">
      <div class="form-group" style="grid-column: span 2;">
        <label style="font-weight: 600; margin-bottom: 0.25rem; display: block; font-size: 0.88rem; color: var(--text-muted);">Personel Bilgisi</label>
        <input type="text" class="form-control" value="${rec.personnelName} (${rec.sicil || ''}) - ${rec.unvan || ''}" disabled style="background: rgba(255,255,255,0.05); font-weight: 600;" />
      </div>

      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 0.25rem; display: block; font-size: 0.88rem;">İzin Türü <span style="color: red;">*</span></label>
        <select id="edit-leave-type" class="form-control" required>
          ${leaveTypes.map(lt => `<option value="${lt.code}" ${lt.code === rec.leaveType ? 'selected' : ''}>${lt.name}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 0.25rem; display: block; font-size: 0.88rem;">Ayrılış Tarihi <span style="color: red;">*</span></label>
        <input type="date" id="edit-ayrilis-date" class="form-control" value="${rec.ayrilisDate || ''}" required />
      </div>

      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 0.25rem; display: block; font-size: 0.88rem;">İzin Süresi (Gün) <span style="color: red;">*</span></label>
        <input type="number" id="edit-days" class="form-control" min="1" max="365" value="${rec.days || 1}" required />
      </div>

      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 0.25rem; display: block; font-size: 0.88rem;">Beklenen Başlayış Tarihi <span style="color: red;">*</span></label>
        <input type="date" id="edit-expected-return" class="form-control" value="${rec.expectedReturnDate || ''}" required />
      </div>

      <div class="form-group" style="grid-column: span 2; display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
        <input type="checkbox" id="edit-yol-izni" ${rec.isYolIzniDahil ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;" />
        <label for="edit-yol-izni" style="cursor: pointer; user-select: none; margin: 0; font-weight: 500;">Yol İzni Dahil</label>
      </div>

      <div style="grid-column: span 2; display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
        <button type="button" class="btn btn-secondary" id="btn-cancel-edit-leave">Vazgeç</button>
        <button type="submit" class="btn btn-primary" style="font-weight: 700;">
          <i class="fa-solid fa-floppy-disk"></i> Değişiklikleri Kaydet
        </button>
      </div>
    </form>
  `;

  openModal('📝 İzin Kaydını Düzenle', modalHtml);

  const ayrilisInput = document.getElementById('edit-ayrilis-date');
  const daysInput = document.getElementById('edit-days');
  const returnInput = document.getElementById('edit-expected-return');

  function recalculateReturn() {
    const sDate = ayrilisInput?.value;
    const dVal = parseInt(daysInput?.value, 10);
    if (sDate && dVal > 0) {
      const calcReturn = calculateExpectedReturn(sDate, dVal);
      if (returnInput && calcReturn) {
        returnInput.value = calcReturn;
      }
    }
  }

  ayrilisInput?.addEventListener('change', recalculateReturn);
  daysInput?.addEventListener('input', recalculateReturn);

  document.getElementById('btn-cancel-edit-leave')?.addEventListener('click', closeModal);

  document.getElementById('form-edit-leave-record')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newLeaveTypeCode = document.getElementById('edit-leave-type').value;
    const newAyrilisDate = document.getElementById('edit-ayrilis-date').value;
    const newDays = parseInt(document.getElementById('edit-days').value, 10);
    const newExpectedReturn = document.getElementById('edit-expected-return').value;
    const newYolIzni = document.getElementById('edit-yol-izni').checked;

    if (!newAyrilisDate || !newDays || !newExpectedReturn) {
      showToast('Lütfen tüm zorunlu alanları doldurunuz.', 'warning');
      return;
    }

    // Check for conflict with other leave records of the same personnel
    const conflict = checkLeaveConflict(rec.personnelId, newAyrilisDate, newExpectedReturn, rec.id);
    if (conflict) {
      showToast(`⚠️ ${rec.personnelName} için ${formatDateTR(conflict.ayrilisDate)} - ${formatDateTR(conflict.expectedReturnDate)} tarihleri arasında zaten aktif (${conflict.leaveTypeName}) kaydı mevcuttur! Aynı personel için çakışan tarihte 2. bir izin kaydı oluşturulamaz.`, 'danger');
      return;
    }

    const ltObj = leaveTypes.find(l => l.code === newLeaveTypeCode) || { name: 'İzin' };

    updateLeaveRecord(rec.id, {
      leaveType: newLeaveTypeCode,
      leaveTypeName: ltObj.name,
      ayrilisDate: newAyrilisDate,
      days: newDays,
      expectedReturnDate: newExpectedReturn,
      isYolIzniDahil: newYolIzni
    });

    closeModal();
    showToast('İzin kaydı başarıyla güncellendi!', 'success');
    renderDashboard();
    renderLeavesTable();
    renderNotificationBell();
  });
}

function renderLeavesTable() {
  const records = getLeaveRecords();
  const tbody = document.querySelector('#table-leaves tbody');
  const typeSelect = document.getElementById('filter-leaves-type');

  if (typeSelect && typeSelect.options.length <= 1) {
    const leaveTypes = getLeaveTypes();
    typeSelect.innerHTML = `<option value="">Tüm İzin Türleri</option>` +
      leaveTypes.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
  }

  const startDateInput = document.getElementById('leaves-global-start');
  const endDateInput = document.getElementById('leaves-global-end');

  // Highlight buttons logic
  const btnThisMonth = document.getElementById('btn-leaves-filter-this-month');
  const btnThisYear = document.getElementById('btn-leaves-filter-this-year');
  const clearDatesBtn = document.getElementById('btn-leaves-clear-dates');

  if (startDateInput && endDateInput && btnThisMonth && btnThisYear && clearDatesBtn) {
    const fmtStr = (d) => { const pad = n => n < 10 ? '0' + n : n; return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const currN = new Date();
    const ms = fmtStr(new Date(currN.getFullYear(), currN.getMonth(), 1));
    const me = fmtStr(new Date(currN.getFullYear(), currN.getMonth() + 1, 0));
    const ys = `${currN.getFullYear()}-01-01`;
    const ye = `${currN.getFullYear()}-12-31`;

    const cs = startDateInput.value;
    const ce = endDateInput.value;

    btnThisMonth.className = (cs === ms && ce === me) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
    btnThisYear.className = (cs === ys && ce === ye) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
    clearDatesBtn.className = (!cs && !ce) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
  }

  // Filtering
  const filtered = records.filter(r => {
    const searchTarget = `${r.personnelName || ''} ${r.sicil || ''} ${r.unvan || ''}`;
    const matchesSearch = !leavesState.searchQuery || matchesSearchQuery(searchTarget, leavesState.searchQuery);
    const matchesType = !leavesState.typeFilter || r.leaveType === leavesState.typeFilter;
    const matchesStatus = !leavesState.statusFilter || r.status === leavesState.statusFilter;

    let matchesDate = true;
    if (startDateInput && startDateInput.value && r.ayrilisDate < startDateInput.value) matchesDate = false;
    if (endDateInput && endDateInput.value && r.ayrilisDate > endDateInput.value) matchesDate = false;

    return matchesSearch && matchesType && matchesStatus && matchesDate;
  });

  // Sort by Ayrılış Tarihi descending (Newest to Oldest)
  filtered.sort((a, b) => {
    if (a.ayrilisDate !== b.ayrilisDate) {
      return a.ayrilisDate < b.ayrilisDate ? 1 : -1;
    }
    return (b.id || '') > (a.id || '') ? 1 : -1;
  });

  // Pagination
  const totalRecords = filtered.length;
  const totalPages = Math.ceil(totalRecords / leavesState.pageSize) || 1;
  if (leavesState.currentPage > totalPages) leavesState.currentPage = totalPages;
  if (leavesState.currentPage < 1) leavesState.currentPage = 1;

  const startIndex = (leavesState.currentPage - 1) * leavesState.pageSize;
  const endIndex = Math.min(startIndex + leavesState.pageSize, totalRecords);
  const paginated = filtered.slice(startIndex, endIndex);

  // Update UI stats & page controls
  const infoSpan = document.getElementById('leaves-pagination-info');
  if (infoSpan) {
    infoSpan.textContent = totalRecords === 0 ? '0-0 / 0 Kayıt' : `${startIndex + 1}-${endIndex} / ${totalRecords} Kayıt`;
  }
  const pageSpan = document.getElementById('leaves-current-page');
  if (pageSpan) pageSpan.textContent = `Sayfa ${leavesState.currentPage} / ${totalPages}`;

  const prevBtn = document.getElementById('btn-leaves-prev-page');
  const nextBtn = document.getElementById('btn-leaves-next-page');
  if (prevBtn) prevBtn.disabled = leavesState.currentPage <= 1;
  if (nextBtn) nextBtn.disabled = leavesState.currentPage >= totalPages;

  if (paginated.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Kriterlere uygun izin kaydı bulunamadı.</td></tr>`;
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const titleMap = getPersonnelTitleMap();

  tbody.innerHTML = paginated.map(r => {
    const isDue = r.status === 'ayrilis_yapildi' && r.expectedReturnDate && r.expectedReturnDate <= todayStr;
    const rowStyle = isDue ? 'background: rgba(239, 68, 68, 0.12); border-left: 4px solid #ef4444;' : '';
    const displayUnvan = titleMap[r.personnelId] || titleMap[r.personnelName] || r.unvan || '';

    return `
      <tr style="${rowStyle}">
        <td><strong>${r.personnelName}</strong><br><small style="color: var(--text-muted);">${displayUnvan}</small></td>
        <td><span class="badge ${isDue ? 'badge-danger' : 'badge-info'}">${r.leaveTypeName}</span></td>
        <td>${r.days} Gün</td>
        <td>${formatDateTR(r.ayrilisDate)}</td>
        <td>
          ${isDue
        ? `<span class="badge badge-danger" style="animation: pulseDanger 2s infinite;"><i class="fa-solid fa-clock"></i> ${formatDateTR(r.expectedReturnDate)} (SÜRESİ DOLDU)</span>`
        : formatDateTR(r.expectedReturnDate)}
        </td>
        <td>
          ${r.status === 'baslayis_yapildi'
        ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Göreve Başladı</span>'
        : isDue
          ? '<span class="badge badge-danger" style="animation: pulseDanger 2s infinite;"><i class="fa-solid fa-triangle-exclamation"></i> 🚨 GÜNÜ GELDİ (ACİL)</span>'
          : '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> İzinde (Ayrılış Yapıldı)</span>'}
        </td>
        <td style="display: flex; gap: 0.5rem; align-items: center;">
          <div style="width: 110px; flex-shrink: 0; display: inline-flex; align-items: center;">
            ${r.status === 'ayrilis_yapildi'
        ? `<button class="btn btn-sm btn-success btn-create-baslayis" data-record-id="${r.id}" style="width: 100%; justify-content: center; ${isDue ? 'font-weight: 800; box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);' : ''}"><i class="fa-solid fa-paper-plane"></i> BAŞLAYIŞ</button>`
        : `<span style="width: 100%; text-align: center; color: var(--text-muted); font-size: 0.85rem; font-weight: 500;">Tamamlandı</span>`}
          </div>
          <button class="btn btn-sm btn-primary btn-edit-leave-record" data-record-id="${r.id}">
            <i class="fa-solid fa-pen-to-square"></i> Düzenle
          </button>
          ${isAdmin() ? `<button class="btn btn-sm btn-danger btn-delete-leave-record" data-record-id="${r.id}"><i class="fa-solid fa-trash"></i> Sil</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-create-baslayis').forEach(btn => {
    btn.addEventListener('click', async () => {
      await startBaslayisWizardForRecord(btn.getAttribute('data-record-id'));
    });
  });

  tbody.querySelectorAll('.btn-edit-leave-record').forEach(btn => {
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-record-id');
      openEditLeaveRecordModal(recId);
    });
  });

  tbody.querySelectorAll('.btn-delete-leave-record').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isAdmin()) {
        showToast('Silme işlemi için Sistem Yöneticisi yetkisi gereklidir!', 'danger');
        return;
      }
      const recId = btn.getAttribute('data-record-id');
      const rec = getLeaveRecords().find(r => r.id === recId);
      const name = rec ? rec.personnelName : 'Seçili';

      showConfirmModal({
        title: 'İzin Kaydını Kalıcı Olarak Sil',
        message: `<strong>${name}</strong> isimli personelin bu izin kaydını sistemden ve izin geçmişinden <strong>KALICI OLARAK SİLMEK</strong> istediğinizden emin misiniz?<br><br><small style="color: #f87171;">⚠️ Bu işlem geri alınamaz ve db.json dosyasından tamamen silinir!</small>`,
        confirmText: 'Evet, Kalıcı Olarak Sil',
        cancelText: 'Vazgeç',
        onConfirm: () => {
          deleteLeaveRecord(recId);
          showToast('İzin kaydı veritabanından tamamen silindi.', 'warning');
          renderDashboard();
          renderLeavesTable();
          renderNotificationBell();
        }
      });
    });
  });
}

// 4. PERSONNEL MANAGEMENT
function renderPersonnelTable() {
  const list = getPersonnelList();

  const sidebarCount = document.getElementById('sidebar-personnel-count');
  if (sidebarCount) sidebarCount.textContent = `(${list.length})`;

  const tbody = document.querySelector('#table-personnel tbody');
  if (!tbody) return;
  const searchInput = document.getElementById('search-personnel');
  const query = (searchInput?.value || '').trim();

  const filtered = list.filter(p => {
    const target = `${p.name || ''} ${p.sicil || ''} ${p.title || ''} ${p.birim || ''}`;
    return !query || matchesSearchQuery(target, query);
  });

  const isFiltering = query !== '';
  tbody.innerHTML = filtered.map((p, index) => `
    <tr ${!isFiltering ? 'draggable="true"' : ''} data-index="${index}" class="personnel-row">
      <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${index + 1}</td>
      <td><code>${p.sicil}</code></td>
      <td><strong>${p.name}</strong></td>
      <td>${p.title}</td>
      <td>${p.birim}</td>
      <td><span class="badge badge-success">Aktif</span></td>
      <td style="display: flex; gap: 0.4rem; align-items: center;">
        ${!isFiltering ? `<span style="cursor: grab; color: #aaa; margin-right: 0.5rem;" title="Sürükle bırak ile taşı"><i class="fa-solid fa-grip-vertical"></i></span>` : ''}
        <button class="btn btn-sm btn-primary btn-edit-personnel" data-id="${p.id}"><i class="fa-solid fa-pen-to-square"></i> Düzenle</button>
        ${isAdmin() ? `<button class="btn btn-sm btn-danger btn-delete-personnel" data-id="${p.id}"><i class="fa-solid fa-trash"></i> Sil</button>` : ''}
      </td>
    </tr>
  `).join('');

  if (searchInput && !searchInput.dataset.hasListener) {
    searchInput.dataset.hasListener = "true";
    searchInput.addEventListener('input', renderPersonnelTable);
  }

  const btnAdd = document.getElementById('btn-add-personnel');
  if (btnAdd && !btnAdd.dataset.hasListener) {
    btnAdd.dataset.hasListener = "true";
    btnAdd.addEventListener('click', () => {
      openModal('Yeni Personel Ekle', `
      <form id="form-add-personnel" class="form-grid">
        <div class="form-group">
          <label>Adı Soyadı</label>
          <input type="text" id="p-name" required placeholder="Örn: Ahmet YILMAZ" />
        </div>
        <div class="form-group">
          <label>Sicil No</label>
          <input type="text" id="p-sicil" required placeholder="Örn: 123456" />
        </div>
        <div class="form-group">
          <label>T.C. Kimlik No</label>
          <input type="text" id="p-tc" placeholder="İsteğe bağlı" maxlength="11" />
        </div>
        <div class="form-group">
          <label>Unvanı</label>
          <input type="text" id="p-title" required value="Zabıt Katibi" />
        </div>
        <div class="form-group">
          <label>Çalıştığı Birim</label>
          <input type="text" id="p-birim" required value="Bilgi İşlem Müdürlüğü" />
        </div>
        <div class="form-group full-width" style="margin-top: 1rem; display: flex; justify-content: flex-end;">
          <button type="submit" class="btn btn-success"><i class="fa-solid fa-save"></i> Kaydet</button>
        </div>
      </form>
    `);

      document.getElementById('form-add-personnel')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameVal = document.getElementById('p-name').value.trim();
        const sicilVal = document.getElementById('p-sicil').value.trim();
        const tcVal = document.getElementById('p-tc').value.trim();
        const titleVal = document.getElementById('p-title').value.trim();
        const birimVal = document.getElementById('p-birim').value.trim();

        const current = getPersonnelList();

        // Mükerrer kayıt kontrolü (Aynı Ad Soyad ve Sicil No)
        const duplicateExact = current.find(p =>
          (p.name || '').trim().toLowerCase() === nameVal.toLowerCase() &&
          String(p.sicil || '').trim().toLowerCase() === sicilVal.toLowerCase()
        );
        if (duplicateExact) {
          showToast(`⚠️ "${nameVal}" (${sicilVal}) sicilli personel sistemde zaten mevcuttur! Aynı ad soyad ve sicille tekrar kayıt oluşturulamaz.`, 'danger');
          document.getElementById('p-sicil')?.focus();
          return;
        }

        // Sicil No teklik kontrolü
        const duplicateSicil = current.find(p =>
          String(p.sicil || '').trim().toLowerCase() === sicilVal.toLowerCase()
        );
        if (duplicateSicil) {
          showToast(`⚠️ "${sicilVal}" sicil numarası ile kayıtlı "${duplicateSicil.name}" isimli bir personel zaten mevcuttur!`, 'danger');
          document.getElementById('p-sicil')?.focus();
          return;
        }

        current.push({
          id: Date.now().toString(),
          name: nameVal,
          sicil: sicilVal,
          tcNo: tcVal,
          title: titleVal,
          birim: birimVal,
          status: 'active'
        });
        savePersonnelList(current);
        closeModal();
        showToast('Personel eklendi ve db.json dosyasına kaydedildi!', 'success');
        renderPersonnelTable();
        populateWizardOptions();
      });
    });
  }

  // Edit Personnel Listener
  tbody.querySelectorAll('.btn-edit-personnel').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const person = getPersonnelList().find(p => p.id === id);
      if (!person) return;

      openModal('Personel Bilgilerini Düzenle', `
        <form id="form-edit-personnel" class="form-grid">
          <div class="form-group">
            <label>Adı Soyadı</label>
            <input type="text" id="edit-p-name" required value="${person.name}" />
          </div>
          <div class="form-group">
            <label>Sicil No</label>
            <input type="text" id="edit-p-sicil" required value="${person.sicil}" />
          </div>
          <div class="form-group">
            <label>T.C. Kimlik No</label>
            <input type="text" id="edit-p-tc" placeholder="İsteğe bağlı" maxlength="11" value="${person.tcNo || person.tc || ''}" />
          </div>
          <div class="form-group">
            <label>Unvanı</label>
            <input type="text" id="edit-p-title" required value="${person.title}" />
          </div>
          <div class="form-group">
            <label>Çalıştığı Birim</label>
            <input type="text" id="edit-p-birim" required value="${person.birim}" />
          </div>
          <div class="form-group full-width" style="margin-top: 1rem; display: flex; justify-content: flex-end;">
            <button type="submit" class="btn btn-success"><i class="fa-solid fa-save"></i> Güncelle ve Kaydet</button>
          </div>
        </form>
      `);

      document.getElementById('form-edit-personnel')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const editName = document.getElementById('edit-p-name').value.trim();
        const editSicil = document.getElementById('edit-p-sicil').value.trim();
        const editTc = document.getElementById('edit-p-tc').value.trim();
        const editTitle = document.getElementById('edit-p-title').value.trim();
        const editBirim = document.getElementById('edit-p-birim').value.trim();

        let current = getPersonnelList();

        const duplicateExact = current.find(p =>
          p.id !== id &&
          (p.name || '').trim().toLowerCase() === editName.toLowerCase() &&
          String(p.sicil || '').trim().toLowerCase() === editSicil.toLowerCase()
        );
        if (duplicateExact) {
          showToast(`⚠️ "${editName}" (${editSicil}) sicilli başka bir personel sistemde mevcuttur! Aynı ad soyad ve sicille güncelleme yapılamaz.`, 'danger');
          document.getElementById('edit-p-sicil')?.focus();
          return;
        }

        const duplicateSicil = current.find(p =>
          p.id !== id &&
          String(p.sicil || '').trim().toLowerCase() === editSicil.toLowerCase()
        );
        if (duplicateSicil) {
          showToast(`⚠️ "${editSicil}" sicil numarası ile kayıtlı başka bir personel ("${duplicateSicil.name}") sistemde mevcuttur!`, 'danger');
          document.getElementById('edit-p-sicil')?.focus();
          return;
        }

        const index = current.findIndex(p => p.id === id);
        if (index !== -1) {
          current[index] = {
            ...current[index],
            name: editName,
            sicil: editSicil,
            tcNo: editTc,
            title: editTitle,
            birim: editBirim
          };
          savePersonnelList(current);
          closeModal();
          showToast(`${current[index].name} bilgileri güncellendi ve db.json dosyasına yazıldı!`, 'success');
          renderPersonnelTable();
          populateWizardOptions();
        }
      });
    });
  });

  // Delete Personnel Listener
  tbody.querySelectorAll('.btn-delete-personnel').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const person = getPersonnelList().find(p => p.id === id);
      const name = person ? person.name : 'Seçili';

      showConfirmModal({
        title: 'Personeli Sil',
        message: `<strong>${name}</strong> isimli personeli sistemden ve db.json kaydından tamamen silmek istediğinizden emin misiniz?`,
        confirmText: 'Evet, Personeli Sil',
        onConfirm: () => {
          let current = getPersonnelList();
          current = current.filter(p => p.id !== id);
          savePersonnelList(current);
          showToast('Personel silindi ve db.json güncellendi.', 'warning');
          renderPersonnelTable();
          populateWizardOptions();
        }
      });
    });
  });

  // Drag and Drop Ordering
  let draggedIndex = null;

  tbody.querySelectorAll('.personnel-row').forEach(row => {
    if (row.getAttribute('draggable') === 'true') {
      row.addEventListener('dragstart', (e) => {
        draggedIndex = parseInt(row.getAttribute('data-index'), 10);
        e.dataTransfer.effectAllowed = 'move';
        row.style.opacity = '0.5';
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.style.borderTop = '2px dashed var(--accent-main)';
      });

      row.addEventListener('dragleave', (e) => {
        row.style.borderTop = '';
      });

      row.addEventListener('dragend', (e) => {
        row.style.opacity = '1';
        tbody.querySelectorAll('.personnel-row').forEach(r => r.style.borderTop = '');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.style.borderTop = '';
        const targetIndex = parseInt(row.getAttribute('data-index'), 10);

        if (draggedIndex !== null && draggedIndex !== targetIndex) {
          let current = getPersonnelList();
          const draggedItem = current.splice(draggedIndex, 1)[0];
          current.splice(targetIndex, 0, draggedItem);
          savePersonnelList(current);
          renderPersonnelTable();
          populateWizardOptions();
        }
      });
    }
  });
}

// 5. SETTINGS
function renderSettings() {
  // Alici Makamlar
  const makamlar = getAliciMakamlar();
  document.getElementById('list-makamlar').innerHTML = makamlar.map(m => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-bottom: var(--border-color) 1px solid;">
      <div>
        <strong>${m.id}</strong><br><small style="color: var(--text-muted);">${m.name}</small>
      </div>
      ${isAdmin() ? `<button class="btn btn-sm btn-danger btn-del-makam" data-id="${m.id}"><i class="fa-solid fa-trash"></i> Sil</button>` : ''}
    </div>
  `).join('');

  document.querySelectorAll('.btn-del-makam').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      showConfirmModal({
        title: 'Makamı Sil',
        message: `Bu gönderilecek makamı silmek istediğinize emin misiniz?`,
        confirmText: 'Evet, Sil',
        onConfirm: () => {
          let current = getAliciMakamlar();
          current = current.filter(m => m.id !== id);
          saveAliciMakamlar(current);
          renderSettings();
          populateWizardOptions();
          showToast('Makam silindi.', 'warning');
        }
      });
    });
  });

  document.getElementById('btn-add-makam')?.addEventListener('click', () => {
    openModal('Yeni Gönderilecek Makam Ekle', `
      <form id="form-add-makam" class="form-grid">
        <div class="form-group">
          <label>Makam Kısa Adı (ID)</label>
          <input type="text" id="makam-id" required placeholder="Örn: komisyon" />
        </div>
        <div class="form-group">
          <label>Makam Uzun Adı (Alt satıra geçmek için Enter'a basın)</label>
          <textarea id="makam-name" required placeholder="Örn: ANKARA CUMHURİYET BAŞSAVCILIĞI&#10;Bakanlık Muhabere Bürosu'na" rows="3"></textarea>
        </div>
        <div class="form-group full-width" style="margin-top: 1rem; display: flex; justify-content: flex-end;">
          <button type="submit" class="btn btn-success"><i class="fa-solid fa-save"></i> Kaydet</button>
        </div>
      </form>
    `);
    document.getElementById('form-add-makam')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const current = getAliciMakamlar();
      const newId = document.getElementById('makam-id').value;
      if (current.find(m => m.id === newId)) {
        showToast('Bu ID zaten mevcut!', 'danger');
        return;
      }
      current.push({
        id: newId,
        name: document.getElementById('makam-name').value
      });
      saveAliciMakamlar(current);
      closeModal();
      renderSettings();
      populateWizardOptions();
      showToast('Makam eklendi.', 'success');
    });
  });

  // Signers
  const signers = getSignatories();
  document.getElementById('list-signers').innerHTML = signers.map(s => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-bottom: var(--border-color) 1px solid;">
      <div>
        <strong>${s.name}</strong><br><small style="color: var(--text-muted);">${s.title}</small>
      </div>
      ${isAdmin() ? `<button class="btn btn-sm btn-danger btn-del-signer" data-id="${s.id}"><i class="fa-solid fa-trash"></i> Sil</button>` : ''}
    </div>
  `).join('');

  document.querySelectorAll('.btn-del-signer').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const signer = getSignatories().find(s => s.id === id);
      const name = signer ? signer.name : 'Seçili';

      showConfirmModal({
        title: 'Yetkiliyi Sil',
        message: `<strong>${name}</strong> imza yetkilisini listeden kaldırmak istediğinizden emin misiniz?`,
        confirmText: 'Evet, Sil',
        onConfirm: () => {
          let current = getSignatories();
          current = current.filter(s => s.id !== id);
          saveSignatories(current);
          renderSettings();
          populateWizardOptions();
          showToast('Yetkili silindi.', 'warning');
        }
      });
    });
  });

  document.getElementById('btn-add-signer')?.addEventListener('click', () => {
    openModal('Yeni Yetkili Ekle', `
      <form id="form-add-signer" class="form-grid">
        <div class="form-group">
          <label>Yetkili Adı Soyadı</label>
          <input type="text" id="signer-name" required placeholder="Örn: Dr. Arif Naci SUCUOĞLU" />
        </div>
        <div class="form-group">
          <label>Unvanı</label>
          <input type="text" id="signer-title" required placeholder="Örn: Cumhuriyet Başsavcı Vekili" />
        </div>
        <div class="form-group full-width" style="margin-top: 1rem; display: flex; justify-content: flex-end;">
          <button type="submit" class="btn btn-success"><i class="fa-solid fa-save"></i> Kaydet</button>
        </div>
      </form>
    `);
    document.getElementById('form-add-signer')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const current = getSignatories();
      current.push({
        id: Date.now().toString(),
        name: document.getElementById('signer-name').value,
        title: document.getElementById('signer-title').value,
        default: false
      });
      saveSignatories(current);
      closeModal();
      renderSettings();
      populateWizardOptions();
      showToast('Yetkili eklendi.', 'success');
    });
  });

  // Leave Types & Dynamic Template Settings
  const leaveTypes = getLeaveTypes();
  document.getElementById('list-leavetypes').innerHTML = leaveTypes.map(l => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: var(--border-color) 1px solid;">
      <div>
        <strong style="color: var(--text-main);">${l.name}</strong>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">
          <span>Konu: <em>${l.subjectText || l.name}</em></span>
        </div>
      </div>
      <div style="display: flex; gap: 0.4rem;">
        <button class="btn btn-sm btn-primary btn-edit-leavetype" data-id="${l.id}"><i class="fa-solid fa-pen"></i> Düzenle</button>
        ${isAdmin() ? `<button class="btn btn-sm btn-danger btn-del-leavetype" data-id="${l.id}"><i class="fa-solid fa-trash"></i> Sil</button>` : ''}
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.btn-del-leavetype').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const lt = getLeaveTypes().find(l => l.id === id);
      const name = lt ? lt.name : 'Seçili';

      showConfirmModal({
        title: 'İzin Türünü Sil',
        message: `<strong>${name}</strong> izin türünü ve bağlı şablon ayarlarını silmek istediğinizden emin misiniz?`,
        confirmText: 'Evet, İzin Türünü Sil',
        onConfirm: () => {
          let current = getLeaveTypes();
          current = current.filter(l => l.id !== id);
          saveLeaveTypes(current);
          renderSettings();
          populateWizardOptions();
          showToast('İzin türü silindi.', 'warning');
        }
      });
    });
  });

  document.querySelectorAll('.btn-edit-leavetype').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const lt = getLeaveTypes().find(l => l.id === id);
      if (!lt) return;

      const isRapor = lt.code === 'rapor';
      const defaultAyrilisTpl = isRapor
        ? `{birim}müzde {unvan} olarak görev yapan {personel} ({sicil}) ekte gönderilen {gun} günlük istirahat raporuyla {ayrilisTarihi} tarihinde görevinden ayrılmıştır.`
        : `{birim}müzde görevli {unvan} {personel} ({sicil}) ${lt.name.toLowerCase()}nden {gun} gününü kullanmak üzere {ayrilisTarihi} tarihinde görevinden ayrılmıştır.`;

      const defaultBaslayisTpl = isRapor
        ? `İlgi sayılı yazımız ile ekte gönderilen {gun} günlük istirahat raporuyla görevinden ayrılışını bildirdiğimiz {birim}müzde görev yapan {unvan} {personel} ({sicil}) {donusNotu}{baslayisTarihi} tarihinde görevine başlamıştır.`
        : `İlgi sayılı yazımız ile {gun} günlük ${lt.name.toLowerCase()}ni kullanmak üzere görevinden ayrılışını bildirdiğimiz {birim}müzde görev yapan {unvan} {personel} ({sicil}) bu iznini kullanarak {donusNotu}{baslayisTarihi} tarihinde görevine başlamıştır.`;

      openModal('İzin Türü ve Tam Şablon Düzenle', `
        <form id="form-edit-leavetype" class="form-grid">
          <div class="form-group full-width">
            <label>İzin Türü Adı</label>
            <input type="text" id="edit-lt-name" required value="${lt.name}" />
          </div>
          <div class="form-group full-width">
            <label>Konu Metni (Evrak Üst Konu Başlığı)</label>
            <input type="text" id="edit-lt-subject" required value="${lt.subjectText || lt.name}" placeholder="Örn: {personel} - Babalık İzni" />
          </div>

          <div class="form-group full-width" style="margin-top: 0.5rem;">
            <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.25); padding: 0.75rem 1rem; border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--text-main);">
              <strong>ℹ️ Kullanılabilecek Şablon Değişkenleri:</strong><br>
              <code>{birim}</code>, <code>{unvan}</code>, <code>{personel}</code>, <code>{sicil}</code>, <code>{gun}</code>, <code>{ayrilisTarihi}</code>, <code>{baslayisTarihi}</code>, <code>{donusNotu}</code>, <code>{ilgiEvrak}</code>
            </div>
          </div>

          <div class="form-group full-width">
            <label>İzne Ayrılış Metni (Tam Paragraf Şablonu)</label>
            <textarea id="edit-lt-ayrilis-tpl" rows="3" style="font-family: monospace; font-size: 0.85rem;">${lt.ayrilisTemplate || defaultAyrilisTpl}</textarea>
          </div>

          <div class="form-group full-width">
            <label>Göreve Başlayış Metni (Tam Paragraf Şablonu)</label>
            <textarea id="edit-lt-baslayis-tpl" rows="3" style="font-family: monospace; font-size: 0.85rem;">${lt.baslayisTemplate || defaultBaslayisTpl}</textarea>
          </div>

          <div class="form-group full-width" style="margin-top: 1rem; display: flex; justify-content: flex-end;">
            <button type="submit" class="btn btn-success"><i class="fa-solid fa-save"></i> Güncelle ve Kaydet</button>
          </div>
        </form>
      `);

      document.getElementById('form-edit-leavetype')?.addEventListener('submit', (e) => {
        e.preventDefault();
        let current = getLeaveTypes();
        const index = current.findIndex(l => l.id === id);
        if (index !== -1) {
          current[index] = {
            ...current[index],
            name: document.getElementById('edit-lt-name').value,
            subjectText: document.getElementById('edit-lt-subject').value,
            ayrilisTemplate: document.getElementById('edit-lt-ayrilis-tpl').value,
            baslayisTemplate: document.getElementById('edit-lt-baslayis-tpl').value
          };
          saveLeaveTypes(current);
          closeModal();
          renderSettings();
          populateWizardOptions();
          showToast('İzin türü ve şablonlar güncellendi!', 'success');
        }
      });
    });
  });

  document.getElementById('btn-add-leavetype')?.addEventListener('click', () => {
    openModal('Yeni İzin Türü ve Tam Şablon Ekle', `
      <form id="form-add-leavetype" class="form-grid">
        <div class="form-group full-width">
          <label>İzin Türü Adı</label>
          <input type="text" id="lt-name" required placeholder="Örn: Babalık İzni, Evlilik İzni" />
        </div>
        <div class="form-group full-width">
          <label>Konu Metni (Evrak Üst Konu Başlığı)</label>
          <input type="text" id="lt-subject" required placeholder="Örn: Babalık İzni" />
        </div>

        <div class="form-group full-width" style="margin-top: 0.5rem;">
          <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.25); padding: 0.75rem 1rem; border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--text-main);">
            <strong>ℹ️ Kullanılabilecek Şablon Değişkenleri:</strong><br>
            <code>{birim}</code>, <code>{unvan}</code>, <code>{personel}</code>, <code>{sicil}</code>, <code>{gun}</code>, <code>{ayrilisTarihi}</code>, <code>{baslayisTarihi}</code>, <code>{donusNotu}</code>, <code>{ilgiEvrak}</code>
          </div>
        </div>

        <div class="form-group full-width">
          <label>İzne Ayrılış Metni (Tam Paragraf Şablonu)</label>
          <textarea id="lt-ayrilis-tpl" rows="3" style="font-family: monospace; font-size: 0.85rem;" placeholder="{birim}müzde görevli {unvan} {personel} ({sicil}) mazeret izninden {gun} gününü kullanmak üzere {ayrilisTarihi} tarihinde görevinden ayrılmıştır."></textarea>
        </div>

        <div class="form-group full-width">
          <label>Göreve Başlayış Metni (Tam Paragraf Şablonu)</label>
          <textarea id="lt-baslayis-tpl" rows="3" style="font-family: monospace; font-size: 0.85rem;" placeholder="İlgi sayılı yazımız ile {gun} günlük mazeret iznini kullanmak üzere görevinden ayrılışını bildirdiğimiz {birim}müzde görev yapan {unvan} {personel} ({sicil}) bu iznini kullanarak {donusNotu}{baslayisTarihi} tarihinde görevine başlamıştır."></textarea>
        </div>

        <div class="form-group full-width" style="margin-top: 1rem; display: flex; justify-content: flex-end;">
          <button type="submit" class="btn btn-success"><i class="fa-solid fa-save"></i> Kaydet</button>
        </div>
      </form>
    `);

    document.getElementById('form-add-leavetype')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const current = getLeaveTypes();
      const name = document.getElementById('lt-name').value;
      const code = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const defaultAyrilisTpl = `{birim}müzde görevli {unvan} {personel} ({sicil}) ${name.toLowerCase()}nden {gun} gününü kullanmak üzere {ayrilisTarihi} tarihinde görevinden ayrılmıştır.`;
      const defaultBaslayisTpl = `İlgi sayılı yazımız ile {gun} günlük ${name.toLowerCase()}ni kullanmak üzere görevinden ayrılışını bildirdiğimiz {birim}müzde görev yapan {unvan} {personel} ({sicil}) bu iznini kullanarak {donusNotu}{baslayisTarihi} tarihinde görevine başlamıştır.`;

      current.push({
        id: Date.now().toString(),
        name: name,
        code: code || 'izin',
        subjectText: document.getElementById('lt-subject').value || name,
        ayrilisTemplate: document.getElementById('lt-ayrilis-tpl').value || defaultAyrilisTpl,
        baslayisTemplate: document.getElementById('lt-baslayis-tpl').value || defaultBaslayisTpl
      });
      saveLeaveTypes(current);
      closeModal();
      renderSettings();
      populateWizardOptions();
      showToast('Yeni izin türü ve tam şablonlar kaydedildi.', 'success');
    });
  });

  // DB Backup & Restore Section
  const jsonBackupContainer = document.getElementById('json-backup-container');
  if (jsonBackupContainer) {
    jsonBackupContainer.innerHTML = `
      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        <button class="btn btn-secondary" id="btn-export-db"><i class="fa-solid fa-download"></i> db.json Yedeğini İndir</button>
        <label class="btn btn-primary" style="cursor: pointer; margin: 0;">
          <i class="fa-solid fa-upload"></i> db.json Dosyası Yükle
          <input type="file" id="input-import-db" accept=".json" style="display: none;" />
        </label>
      </div>
    `;

    document.getElementById('btn-export-db')?.addEventListener('click', () => {
      exportDbJsonFile();
      showToast('db.json verileri bilgisayarınıza indirildi.', 'success');
    });

    document.getElementById('input-import-db')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (importDbJsonData(parsed)) {
            showToast('db.json verisi başarıyla yüklendi ve güncellendi!', 'success');
            renderDashboard();
            renderPersonnelTable();
            renderLeavesTable();
            renderSettings();
            populateWizardOptions();
          } else {
            showToast('Geçersiz db.json dosyası!', 'danger');
          }
        } catch (err) {
          showToast('JSON okuma hatası!', 'danger');
        }
      };
      reader.readAsText(file);
    });
  }
}

// 6. REPORTS & ANALYTICS
function renderReports() {
  const personnelList = getPersonnelList();
  let allRecords = getLeaveRecords();
  const leaveTypes = getLeaveTypes();

  // Populate report type filter dropdown
  const typeFilterSelect = document.getElementById('report-type-filter');
  if (typeFilterSelect && typeFilterSelect.options.length <= 1) {
    typeFilterSelect.innerHTML = `<option value="">Tüm İzin Türleri</option>` +
      leaveTypes.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
  }

  // Date Filter Inputs
  const startDateInput = document.getElementById('report-global-start');
  const endDateInput = document.getElementById('report-global-end');
  const clearDatesBtn = document.getElementById('btn-report-clear-dates');

  // Attach search and filter event listeners
  const searchInput = document.getElementById('report-search-personnel');
  if (searchInput && !searchInput.dataset.hasListener) {
    searchInput.dataset.hasListener = "true";
    searchInput.addEventListener('input', renderReports);
  }

  if (typeFilterSelect && !typeFilterSelect.dataset.hasListener) {
    typeFilterSelect.dataset.hasListener = "true";
    typeFilterSelect.addEventListener('change', renderReports);
  }

  if (startDateInput && !startDateInput.dataset.hasListener) {
    startDateInput.dataset.hasListener = "true";
    startDateInput.addEventListener('change', renderReports);
  }
  if (endDateInput && !endDateInput.dataset.hasListener) {
    endDateInput.dataset.hasListener = "true";
    endDateInput.addEventListener('change', renderReports);
  }

  const btnThisMonth = document.getElementById('btn-filter-this-month');
  const btnThisYear = document.getElementById('btn-filter-this-year');

  if (btnThisMonth && !btnThisMonth.dataset.hasListener) {
    btnThisMonth.dataset.hasListener = "true";
    btnThisMonth.addEventListener('click', () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // format YYYY-MM-DD keeping local timezone correctly
      const fmt = (d) => { const pad = n => n < 10 ? '0' + n : n; return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

      if (startDateInput) startDateInput.value = fmt(start);
      if (endDateInput) endDateInput.value = fmt(end);
      renderReports();
    });
  }

  if (btnThisYear && !btnThisYear.dataset.hasListener) {
    btnThisYear.dataset.hasListener = "true";
    btnThisYear.addEventListener('click', () => {
      const now = new Date();
      if (startDateInput) startDateInput.value = `${now.getFullYear()}-01-01`;
      if (endDateInput) endDateInput.value = `${now.getFullYear()}-12-31`;
      renderReports();
    });
  }

  if (clearDatesBtn && !clearDatesBtn.dataset.hasListener) {
    clearDatesBtn.dataset.hasListener = "true";
    clearDatesBtn.addEventListener('click', () => {
      if (startDateInput) startDateInput.value = '';
      if (endDateInput) endDateInput.value = '';
      renderReports();
    });
  }

  // Visual highlight logic for Quick Filter Buttons
  if (startDateInput && endDateInput && btnThisMonth && btnThisYear && clearDatesBtn) {
    const fmtStr = (d) => { const pad = n => n < 10 ? '0' + n : n; return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const currN = new Date();
    const ms = fmtStr(new Date(currN.getFullYear(), currN.getMonth(), 1));
    const me = fmtStr(new Date(currN.getFullYear(), currN.getMonth() + 1, 0));
    const ys = `${currN.getFullYear()}-01-01`;
    const ye = `${currN.getFullYear()}-12-31`;

    const cs = startDateInput.value;
    const ce = endDateInput.value;

    btnThisMonth.className = (cs === ms && ce === me) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
    btnThisYear.className = (cs === ys && ce === ye) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
    clearDatesBtn.className = (!cs && !ce) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
  }

  // Apply Date Filters
  if (startDateInput && startDateInput.value) {
    allRecords = allRecords.filter(r => r.ayrilisDate >= startDateInput.value);
  }
  if (endDateInput && endDateInput.value) {
    allRecords = allRecords.filter(r => r.ayrilisDate <= endDateInput.value);
  }

  const searchQuery = normalizeSearch(searchInput?.value || '');
  const typeFilter = typeFilterSelect?.value || '';

  let totalRaporCount = 0;
  let totalRaporDays = 0;
  let totalYillikDays = 0;
  let totalAllDays = 0;

  const personStats = personnelList.map(p => {
    const pRecords = allRecords.filter(r => r.personnelId === p.id);

    let pRaporCount = 0;
    let pRaporDays = 0;
    let pYillikCount = 0;
    let pYillikDays = 0;
    let pOtherCount = 0;
    let pOtherDays = 0;
    let pOtherMap = {};

    pRecords.forEach(r => {
      const code = (r.leaveType || '').toLowerCase();
      const name = (r.leaveTypeName || '').toLowerCase();
      const days = parseInt(r.days || 0, 10);

      if (code === 'rapor' || name.includes('rapor') || name.includes('sağlık')) {
        pRaporCount++;
        pRaporDays += days;
      } else if (code === 'yillik' || name.includes('yıllık') || name.includes('yillik')) {
        pYillikCount++;
        pYillikDays += days;
      } else {
        pOtherCount++;
        pOtherDays += days;
        const typeTitle = r.leaveTypeName || 'Diğer İzin';
        if (!pOtherMap[typeTitle]) pOtherMap[typeTitle] = { count: 0, days: 0 };
        pOtherMap[typeTitle].count++;
        pOtherMap[typeTitle].days += days;
      }
    });

    const pTotalCount = pRaporCount + pYillikCount + pOtherCount;
    const pTotalDays = pRaporDays + pYillikDays + pOtherDays;

    totalRaporCount += pRaporCount;
    totalRaporDays += pRaporDays;
    totalYillikDays += pYillikDays;
    totalAllDays += pTotalDays;

    return {
      person: p,
      raporCount: pRaporCount,
      raporDays: pRaporDays,
      yillikCount: pYillikCount,
      yillikDays: pYillikDays,
      otherCount: pOtherCount,
      otherDays: pOtherDays,
      otherMap: pOtherMap,
      totalCount: pTotalCount,
      totalDays: pTotalDays,
      records: pRecords
    };
  });

  // KPI Cards Rendering
  const kpiGrid = document.getElementById('reports-kpi-grid');
  if (kpiGrid) {
    const raporAlanPersonelSayisi = personStats.filter(s => s.raporCount > 0).length;
    const maxRaporPerson = [...personStats].sort((a, b) => b.raporDays - a.raporDays)[0];

    const todayStr = new Date().toISOString().split('T')[0];
    const allPersonnel = getPersonnelList();
    const totalStaffCount = allPersonnel.length;
    const unfilteredRecords = getLeaveRecords();
    const activeLeaveRecords = unfilteredRecords.filter(r => r.status === 'ayrilis_yapildi' && r.ayrilisDate <= todayStr && r.expectedReturnDate > todayStr);
    const activeLeaveStaffIds = new Set(activeLeaveRecords.map(r => r.personnelId));
    const activeLeaveCount = activeLeaveStaffIds.size;
    const activeOnDutyCount = Math.max(0, totalStaffCount - activeLeaveCount);
    const capacityPercentage = totalStaffCount > 0 ? Math.round((activeOnDutyCount / totalStaffCount) * 100) : 100;

    kpiGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon success">
          <i class="fa-solid fa-chart-pie"></i>
        </div>
        <div>
          <div class="stat-value" style="color: #10b981;">%${capacityPercentage} Görevde</div>
          <div class="stat-label">Kurumsal Kapasite Oranı (${activeOnDutyCount} / ${totalStaffCount} Personel)</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon danger">
          <i class="fa-solid fa-stethoscope"></i>
        </div>
        <div>
          <div class="stat-value" style="color: #ef4444;">${totalRaporDays} Gün</div>
          <div class="stat-label">Toplam Rapor Süresi (${raporAlanPersonelSayisi} Personel - ${totalRaporCount} Kez)</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon primary">
          <i class="fa-solid fa-umbrella-beach"></i>
        </div>
        <div>
          <div class="stat-value">${totalYillikDays} Gün</div>
          <div class="stat-label">Toplam Kullanılan Yıllık İzin</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon warning">
          <i class="fa-solid fa-chart-line"></i>
        </div>
        <div>
          <div class="stat-value">${totalAllDays} Gün</div>
          <div class="stat-label">Genel İzin & Rapor Gün Toplamı</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon info">
          <i class="fa-solid fa-user-ninja"></i>
        </div>
        <div>
          <div class="stat-value" style="font-size: 1.05rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">
            ${maxRaporPerson && maxRaporPerson.raporDays > 0 ? maxRaporPerson.person.name : 'Rapor Yok'}
          </div>
          <div class="stat-label">En Çok Rapor Alan (${maxRaporPerson ? maxRaporPerson.raporDays : 0} Gün / ${maxRaporPerson ? maxRaporPerson.raporCount : 0} Kez)</div>
        </div>
      </div>
    `;
  }

  // Filtered Person Stats Table
  const filteredPersonStats = personStats.filter(s => {
    const searchTarget = `${s.person.name || ''} ${s.person.sicil || ''} ${s.person.title || ''} ${s.person.birim || ''}`;
    const matchesSearch = !searchQuery || matchesSearchQuery(searchTarget, searchQuery);

    if (!matchesSearch) return false;
    if (typeFilter === 'rapor') return s.raporCount > 0;
    if (typeFilter === 'yillik') return s.yillikCount > 0;
    if (typeFilter) return s.otherCount > 0;
    return true;
  });

  const tbody = document.querySelector('#table-reports tbody');
  if (tbody) {
    if (filteredPersonStats.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Arama kriterlerine uygun personel kaydı bulunamadı.</td></tr>`;
    } else {
      tbody.innerHTML = filteredPersonStats.map(s => `
        <tr>
          <td><strong>${s.person.name}</strong></td>
          <td>${s.person.sicil}</td>
          <td><small style="color: var(--text-muted);">${s.person.title}</small></td>
          <td>
            ${s.raporCount > 0
          ? `<span class="badge badge-danger" style="font-weight: 700;"><i class="fa-solid fa-stethoscope"></i> ${s.raporCount} Kez (${s.raporDays} Gün)</span>`
          : `<small style="color: var(--text-muted);">0 Kez</small>`}
          </td>
          <td>
            ${s.yillikCount > 0
          ? `<span class="badge badge-info" style="font-weight: 700;"><i class="fa-solid fa-umbrella-beach"></i> ${s.yillikCount} Kez (${s.yillikDays} Gün)</span>`
          : `<small style="color: var(--text-muted);">0 Kez</small>`}
          </td>
          <td>
            ${Object.keys(s.otherMap).length > 0
          ? Object.entries(s.otherMap).map(([tName, tData]) => `<span class="badge badge-warning" style="font-weight: 700; margin: 1px 0; display: inline-block;"><i class="fa-solid fa-tag"></i> ${tName}: ${tData.count} Kez (${tData.days} Gün)</span>`).join('<br>')
          : `<small style="color: var(--text-muted);">0 Kez</small>`}
          </td>
          <td>
            <strong>${s.totalDays} Gün</strong> <small style="color: var(--text-muted);">(${s.totalCount} Kez)</small>
          </td>
          <td>
            <button class="btn btn-sm btn-primary btn-view-person-history" data-person-id="${s.person.id}">
              <i class="fa-solid fa-list-check"></i> Detay Geçmiş (${s.records.length})
            </button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.btn-view-person-history').forEach(btn => {
        btn.addEventListener('click', () => {
          const personId = btn.getAttribute('data-person-id');
          openPersonHistoryModal(personId);
        });
      });
    }
  }

  // Type Distribution Bars
  const typeDistContainer = document.getElementById('reports-type-distribution');
  if (typeDistContainer) {
    const typeMap = {};
    allRecords.forEach(r => {
      const typeName = r.leaveTypeName || 'Diğer';
      const days = parseInt(r.days || 0, 10);
      if (!typeMap[typeName]) typeMap[typeName] = { count: 0, days: 0 };
      typeMap[typeName].count++;
      typeMap[typeName].days += days;
    });

    const typeList = Object.entries(typeMap).sort((a, b) => b[1].days - a[1].days);

    typeDistContainer.innerHTML = typeList.map(([name, data]) => {
      const percentage = totalAllDays > 0 ? Math.round((data.days / totalAllDays) * 100) : 0;
      return `
        <div style="margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 0.35rem;">
            <strong>${name}</strong>
            <span><strong>${data.days} Gün</strong> (${data.count} İzin / %${percentage})</span>
          </div>
          <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.08); border-radius: 4px; overflow: hidden;">
            <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, var(--accent-primary), #a855f7); border-radius: 4px;"></div>
          </div>
        </div>
      `;
    }).join('') || '<p style="color: var(--text-muted);">Henüz izin verisi yok.</p>';
  }

  // Top 5 Health Report Users
  const topRaporUsersContainer = document.getElementById('reports-top-rapor-users');
  if (topRaporUsersContainer) {
    const top5Rapor = [...personStats]
      .filter(s => s.raporDays > 0)
      .sort((a, b) => b.raporDays - a.raporDays || b.raporCount - a.raporCount)
      .slice(0, 5);

    topRaporUsersContainer.innerHTML = top5Rapor.map((s, idx) => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="width: 24px; height: 24px; border-radius: 50%; background: ${idx === 0 ? '#ef4444' : idx === 1 ? '#f97316' : idx === 2 ? '#f59e0b' : 'rgba(255,255,255,0.1)'}; color: #fff; font-weight: 800; font-size: 0.75rem; display: flex; align-items: center; justify-content: center;">${idx + 1}</span>
          <div>
            <strong>${s.person.name}</strong><br>
            <small style="color: var(--text-muted);">${s.person.title} | ${s.person.sicil}</small>
          </div>
        </div>
        <span class="badge badge-danger" style="font-size: 0.8rem; font-weight: 800;"><i class="fa-solid fa-stethoscope"></i> ${s.raporCount} Kez (${s.raporDays} Gün)</span>
      </div>
    `).join('') || '<p style="color: var(--text-muted); padding: 0.5rem 0; font-size: 0.85rem;">Sistemde sıhhi izin/rapor alan personel kaydı yok.</p>';
  }

  // Top 5 Annual Leave Users
  const topYillikUsersContainer = document.getElementById('reports-top-yillik-users');
  if (topYillikUsersContainer) {
    const top5Yillik = [...personStats]
      .filter(s => s.yillikDays > 0)
      .sort((a, b) => b.yillikDays - a.yillikDays || b.yillikCount - a.yillikCount)
      .slice(0, 5);

    topYillikUsersContainer.innerHTML = top5Yillik.map((s, idx) => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="width: 24px; height: 24px; border-radius: 50%; background: ${idx === 0 ? 'var(--accent-primary)' : idx === 1 ? '#8b5cf6' : idx === 2 ? '#3b82f6' : 'rgba(255,255,255,0.1)'}; color: #fff; font-weight: 800; font-size: 0.75rem; display: flex; align-items: center; justify-content: center;">${idx + 1}</span>
          <div>
            <strong>${s.person.name}</strong><br>
            <small style="color: var(--text-muted);">${s.person.title} | ${s.person.sicil}</small>
          </div>
        </div>
        <span class="badge badge-info" style="font-size: 0.8rem; font-weight: 800;"><i class="fa-solid fa-umbrella-beach"></i> ${s.yillikCount} Kez (${s.yillikDays} Gün)</span>
      </div>
    `).join('') || '<p style="color: var(--text-muted); padding: 0.5rem 0; font-size: 0.85rem;">Sistemde yıllık izin kullanan personel kaydı yok.</p>';
  }

  // Top 5 Least Leave Users (Most Hardworking)
  const topLeastLeaveContainer = document.getElementById('reports-top-least-leave-users');
  if (topLeastLeaveContainer) {
    const top5Least = [...personStats]
      .sort((a, b) => a.totalDays - b.totalDays || a.totalCount - b.totalCount)
      .slice(0, 5);

    topLeastLeaveContainer.innerHTML = top5Least.map((s, idx) => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="width: 24px; height: 24px; border-radius: 50%; background: ${idx === 0 ? '#eab308' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : 'rgba(255,255,255,0.1)'}; color: #fff; font-weight: 800; font-size: 0.75rem; display: flex; align-items: center; justify-content: center;">${idx + 1}</span>
          <div>
            <strong>${s.person.name}</strong><br>
            <small style="color: var(--text-muted);">${s.person.title} | ${s.person.sicil}</small>
          </div>
        </div>
        <span class="badge badge-success" style="font-size: 0.8rem; font-weight: 800; background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3);">
          <i class="fa-solid fa-award"></i> ${s.totalDays === 0 ? '0 Gün İzin (Tam Mesai)' : `${s.totalDays} Gün İzin (${s.totalCount} Kez)`}
        </span>
      </div>
    `).join('') || '<p style="color: var(--text-muted); padding: 0.5rem 0; font-size: 0.85rem;">Sistemde personel verisi bulunmuyor.</p>';
  }

  // Monthly Trend Distribution
  const monthlyTrendContainer = document.getElementById('reports-monthly-trend');
  if (monthlyTrendContainer) {
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylüm', 'Ekim', 'Kasım', 'Aralık'];
    const monthMap = {};
    monthNames.forEach((m, i) => monthMap[i] = { name: m, count: 0, days: 0 });

    allRecords.forEach(r => {
      if (!r.ayrilisDate) return;
      const d = new Date(r.ayrilisDate);
      if (isNaN(d.getTime())) return;
      const mIdx = d.getMonth();
      const days = parseInt(r.days || 0, 10);
      if (monthMap[mIdx]) {
        monthMap[mIdx].count++;
        monthMap[mIdx].days += days;
      }
    });

    const activeMonths = Object.values(monthMap).filter(m => m.days > 0);
    const maxMonthDays = Math.max(...activeMonths.map(m => m.days), 1);

    if (activeMonths.length === 0) {
      monthlyTrendContainer.innerHTML = '<p style="color: var(--text-muted); padding: 0.5rem 0; font-size: 0.85rem;">Döneme ait izin verisi bulunamadı.</p>';
    } else {
      monthlyTrendContainer.innerHTML = activeMonths.map(m => {
        const pct = Math.round((m.days / maxMonthDays) * 100);
        return `
          <div style="margin-bottom: 0.65rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 0.2rem;">
              <strong>${m.name}</strong>
              <span style="color: var(--text-muted);"><strong>${m.days} Gün</strong> (${m.count} İzin)</span>
            </div>
            <div style="width: 100%; height: 7px; background: rgba(255, 255, 255, 0.08); border-radius: 4px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #10b981, #6366f1); border-radius: 4px;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Weekend-Connected Health Reports (Monday / Friday Top 5)
  const weekendReportsContainer = document.getElementById('reports-weekend-reports');
  if (weekendReportsContainer) {
    const weekendReportStats = personnelList.map(p => {
      const pRecords = allRecords.filter(r => r.personnelId === p.id);
      let count = 0;
      let days = 0;

      pRecords.forEach(r => {
        const code = (r.leaveType || '').toLowerCase();
        const name = (r.leaveTypeName || '').toLowerCase();
        if (code === 'rapor' || name.includes('rapor') || name.includes('sağlık')) {
          if (r.ayrilisDate) {
            const d = new Date(r.ayrilisDate);
            const dayOfWeek = d.getDay(); // 1: Monday, 5: Friday
            if (dayOfWeek === 1 || dayOfWeek === 5) {
              count++;
              days += parseInt(r.days || 0, 10);
            }
          }
        }
      });

      return { person: p, count, days };
    }).filter(s => s.count > 0).sort((a, b) => b.count - a.count || b.days - a.days).slice(0, 5);

    if (weekendReportStats.length === 0) {
      weekendReportsContainer.innerHTML = `
        <div style="padding: 0.75rem 0; text-align: center; color: var(--text-muted);">
          <i class="fa-solid fa-circle-check" style="color: var(--accent-success); font-size: 1.5rem; margin-bottom: 0.3rem;"></i>
          <p style="font-size: 0.82rem; margin: 0;">Pazartesi veya Cuma günü başlayan sıhhi rapor bulunmuyor.</p>
        </div>
      `;
    } else {
      weekendReportsContainer.innerHTML = weekendReportStats.map((s, idx) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <span style="width: 24px; height: 24px; border-radius: 50%; background: ${idx === 0 ? '#f43f5e' : idx === 1 ? '#fb7185' : '#fda4af'}; color: #fff; font-weight: 800; font-size: 0.75rem; display: flex; align-items: center; justify-content: center;">${idx + 1}</span>
            <div>
              <strong>${s.person.name}</strong><br>
              <small style="color: var(--text-muted);">${s.person.title} | ${s.person.sicil}</small>
            </div>
          </div>
          <span class="badge badge-danger" style="font-size: 0.8rem; font-weight: 800; background: rgba(244, 63, 94, 0.15); color: #f43f5e; border-color: rgba(244, 63, 94, 0.3);">
            🗓️ ${s.count} Kez Pzt/Cuma (${s.days} Gün)
          </span>
        </div>
      `).join('');
    }
  }

  // Yearly Leave Multi-Splitters (2+ parts)
  const topYillikSplittersContainer = document.getElementById('reports-top-yillik-splitters');
  if (topYillikSplittersContainer) {
    const splitters = [...personStats]
      .filter(s => s.yillikCount > 2)
      .sort((a, b) => b.yillikCount - a.yillikCount || b.yillikDays - a.yillikDays);

    if (splitters.length === 0) {
      topYillikSplittersContainer.innerHTML = `
        <div style="padding: 0.75rem 0; text-align: center; color: var(--text-muted);">
          <i class="fa-solid fa-circle-check" style="color: var(--accent-success); font-size: 1.5rem; margin-bottom: 0.3rem;"></i>
          <p style="font-size: 0.82rem; margin: 0;">Yıllık iznini 3 veya daha fazla parçada kullanan personel bulunmuyor.</p>
        </div>
      `;
    } else {
      topYillikSplittersContainer.innerHTML = splitters.map(s => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b; font-size: 1rem;"></i>
            <div>
              <strong>${s.person.name}</strong><br>
              <small style="color: var(--text-muted);">${s.person.title} | ${s.person.sicil}</small>
            </div>
          </div>
          <span class="badge badge-warning" style="font-size: 0.8rem; font-weight: 800; border-color: rgba(245, 158, 11, 0.5);">
            ⚠️ ${s.yillikCount} Parça İzin (${s.yillikDays} Gün)
          </span>
        </div>
      `).join('');
    }
  }
}

function openPersonHistoryModal(personId) {
  const person = getPersonnelList().find(p => p.id === personId);
  if (!person) return;

  const records = getLeaveRecords().filter(r => r.personnelId === personId).sort((a, b) => (a.ayrilisDate < b.ayrilisDate ? 1 : -1));

  let totalDays = 0;
  let totalRaporDays = 0;
  records.forEach(r => {
    const days = parseInt(r.days || 0, 10);
    totalDays += days;
    const code = (r.leaveType || '').toLowerCase();
    const name = (r.leaveTypeName || '').toLowerCase();
    if (code === 'rapor' || name.includes('rapor') || name.includes('sağlık')) {
      totalRaporDays += days;
    }
  });

  const rows = records.map(r => `
    <tr>
      <td><span class="badge badge-info">${r.leaveTypeName}</span></td>
      <td><strong>${r.days} Gün</strong></td>
      <td>${formatDateTR(r.ayrilisDate)}</td>
      <td>${formatDateTR(r.expectedReturnDate)}</td>
      <td>
        ${r.status === 'baslayis_yapildi'
      ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Göreve Başladı</span>'
      : '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> İzinde (Ayrılış Yapıldı)</span>'}
      </td>
    </tr>
  `).join('');

  const modalHtml = `
    <div style="padding: 0.5rem 0;">
      <div style="display: flex; gap: 1rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1.25rem;">
        <div>
          <h4 style="margin: 0 0 0.25rem 0; font-size: 1.05rem;">${person.name} (${person.sicil})</h4>
          <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">${person.title} - ${person.birim}</p>
        </div>
        <div style="margin-left: auto; text-align: right;">
          <span class="badge badge-danger" style="font-size: 0.85rem; font-weight: 700;">Rapor: ${totalRaporDays} Gün</span>
          <span class="badge badge-info" style="font-size: 0.85rem; font-weight: 700; margin-left: 0.3rem;">Genel Toplam: ${totalDays} Gün</span>
        </div>
      </div>

      <div class="table-container" style="max-height: 350px; overflow-y: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>İzin Türü</th>
              <th>Süre</th>
              <th>Ayrılış Tarihi</th>
              <th>Başlayış Tarihi</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            ${records.length > 0 ? rows : '<tr><td colspan="5" style="text-align:center; padding:1rem; color:var(--text-muted);">Bu personele ait geçmiş izin kaydı bulunmamaktadır.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  openModal(`📊 ${person.name} - İzin & Rapor Geçmişi Detayı`, modalHtml);
}

function exportReportsPdf() {
  const personnelList = getPersonnelList();
  let allRecords = getLeaveRecords();

  const startDateInput = document.getElementById('report-global-start');
  const endDateInput = document.getElementById('report-global-end');
  const searchInput = document.getElementById('report-search-personnel');
  const typeFilterSelect = document.getElementById('report-type-filter');

  const searchQuery = normalizeSearch(searchInput?.value || '');
  const typeFilter = typeFilterSelect?.value || '';

  // Calculate PDF Filter Text
  let filterText = 'Uygulanan Filtre: Tüm Zamanlar';
  const filterParts = [];
  if (startDateInput && startDateInput.value && endDateInput && endDateInput.value) {
    filterParts.push(`Tarih: ${formatDateTR(startDateInput.value)} - ${formatDateTR(endDateInput.value)}`);
  } else if (startDateInput && startDateInput.value) {
    filterParts.push(`Tarih: ${formatDateTR(startDateInput.value)} Sonrası`);
  } else if (endDateInput && endDateInput.value) {
    filterParts.push(`Tarih: ${formatDateTR(endDateInput.value)} Öncesi`);
  }

  if (typeFilter) {
    const leaveTypes = getLeaveTypes();
    const lObj = leaveTypes.find(l => l.code === typeFilter) || { name: 'Özel Tür' };
    if (typeFilter === 'rapor') filterParts.push('İzin Türü: İstirahat (Sağlık) Raporu');
    else if (typeFilter === 'yillik') filterParts.push('İzin Türü: Yıllık İzin');
    else filterParts.push(`İzin Türü: ${lObj.name}`);
  }

  if (searchQuery) {
    filterParts.push(`Arama: "${searchQuery}"`);
  }

  if (filterParts.length > 0) {
    filterText = 'Uygulanan Filtreler: ' + filterParts.join(' | ');
  }

  if (startDateInput && startDateInput.value) {
    allRecords = allRecords.filter(r => r.ayrilisDate >= startDateInput.value);
  }
  if (endDateInput && endDateInput.value) {
    allRecords = allRecords.filter(r => r.ayrilisDate <= endDateInput.value);
  }

  let totalRaporDays = 0;
  let totalYillikDays = 0;
  let totalOtherDays = 0;
  let totalAllDays = 0;
  let totalRaporCount = 0;

  const personStats = personnelList.map(p => {
    const pRecords = allRecords.filter(r => r.personnelId === p.id);
    let rCount = 0, rDays = 0, yCount = 0, yDays = 0, oCount = 0, oDays = 0;
    let pOtherMap = {};

    pRecords.forEach(r => {
      const code = (r.leaveType || '').toLowerCase();
      const name = (r.leaveTypeName || '').toLowerCase();
      const days = parseInt(r.days || 0, 10);

      if (code === 'rapor' || name.includes('rapor') || name.includes('sağlık')) {
        rCount++; rDays += days;
      } else if (code === 'yillik' || name.includes('yıllık') || name.includes('yillik')) {
        yCount++; yDays += days;
      } else {
        oCount++; oDays += days;
        const typeTitle = r.leaveTypeName || 'Diğer İzin';
        if (!pOtherMap[typeTitle]) pOtherMap[typeTitle] = { count: 0, days: 0 };
        pOtherMap[typeTitle].count++;
        pOtherMap[typeTitle].days += days;
      }
    });

    const pTotalDays = rDays + yDays + oDays;
    totalRaporCount += rCount;
    totalRaporDays += rDays;
    totalYillikDays += yDays;
    totalOtherDays += oDays;
    totalAllDays += pTotalDays;

    return {
      person: p,
      raporCount: rCount,
      raporDays: rDays,
      yillikCount: yCount,
      yillikDays: yDays,
      otherCount: oCount,
      otherDays: oDays,
      otherMap: pOtherMap,
      totalCount: rCount + yCount + oCount,
      totalDays: pTotalDays,
      records: pRecords
    };
  });

  const filteredPersonStats = personStats.filter(s => {
    const searchTarget = `${s.person.name || ''} ${s.person.sicil || ''} ${s.person.title || ''} ${s.person.birim || ''}`;
    const matchesSearch = !searchQuery || matchesSearchQuery(searchTarget, searchQuery);

    if (!matchesSearch) return false;
    if (typeFilter === 'rapor') return s.raporCount > 0;
    if (typeFilter === 'yillik') return s.yillikCount > 0;
    if (typeFilter) return s.otherCount > 0;
    return true;
  });

  const rowsHtml = filteredPersonStats.map((s, idx) => {
    const otherText = Object.keys(s.otherMap).length > 0
      ? Object.entries(s.otherMap).map(([tName, tData]) => `${tName} (${tData.count} Kez / ${tData.days} Gün)`).join(', ')
      : '-';

    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${s.person.sicil}</td>
        <td><strong>${s.person.name}</strong></td>
        <td>${s.person.title}</td>
        <td>${s.person.birim}</td>
        <td style="text-align: center; ${s.raporDays > 0 ? 'color: #dc2626; font-weight: bold;' : ''}">${s.raporCount > 0 ? `${s.raporCount} Kez (${s.raporDays} Gün)` : '-'}</td>
        <td style="text-align: center;">${s.yillikCount > 0 ? `${s.yillikCount} Kez (${s.yillikDays} Gün)` : '-'}</td>
        <td style="text-align: center;">${otherText}</td>
        <td style="text-align: center; font-weight: bold;">${s.totalDays} Gün</td>
      </tr>
    `;
  }).join('');

  const todayStr = formatDateTR(new Date().toISOString().split('T')[0]);

  // 1. Leave Types Distribution HTML for PDF
  const typeMap = {};
  allRecords.forEach(r => {
    const typeName = r.leaveTypeName || 'Diğer';
    const days = parseInt(r.days || 0, 10);
    if (!typeMap[typeName]) typeMap[typeName] = { count: 0, days: 0 };
    typeMap[typeName].count++;
    typeMap[typeName].days += days;
  });
  const typeList = Object.entries(typeMap).sort((a, b) => b[1].days - a[1].days);
  const typeListPdfHtml = typeList.map(([name, data]) => {
    const pct = totalAllDays > 0 ? Math.round((data.days / totalAllDays) * 100) : 0;
    return `<div style="font-size: 8pt; margin-bottom: 3px; display: flex; justify-content: space-between;">
      <span><strong>${name}</strong></span>
      <span>${data.days} Gün (${data.count} İzin / %${pct})</span>
    </div>`;
  }).join('') || '<div style="font-size: 8pt; color: #64748b;">Kayıt yok.</div>';

  // 2. Top 5 Health Report Users for PDF
  const top5RaporPdf = [...personStats]
    .filter(s => s.raporDays > 0)
    .sort((a, b) => b.raporDays - a.raporDays || b.raporCount - a.raporCount)
    .slice(0, 5);

  const topRaporPdfHtml = top5RaporPdf.map((s, idx) => `
    <div style="font-size: 8pt; margin-bottom: 3px; display: flex; justify-content: space-between;">
      <span><strong>${idx + 1}. ${s.person.name}</strong> <small>(${s.person.sicil})</small></span>
      <span style="color: #dc2626; font-weight: bold;">${s.raporCount} Kez (${s.raporDays} Gün)</span>
    </div>
  `).join('') || '<div style="font-size: 8pt; color: #64748b;">Rapor alan yok.</div>';

  // Top 5 Annual Leave Users for PDF
  const top5YillikPdf = [...personStats]
    .filter(s => s.yillikDays > 0)
    .sort((a, b) => b.yillikDays - a.yillikDays || b.yillikCount - a.yillikCount)
    .slice(0, 5);

  const topYillikPdfHtml = top5YillikPdf.map((s, idx) => `
    <div style="font-size: 8pt; margin-bottom: 3px; display: flex; justify-content: space-between;">
      <span><strong>${idx + 1}. ${s.person.name}</strong> <small>(${s.person.sicil})</small></span>
      <span style="color: #2563eb; font-weight: bold;">${s.yillikCount} Kez (${s.yillikDays} Gün)</span>
    </div>
  `).join('') || '<div style="font-size: 8pt; color: #64748b;">Yıllık izin kullanan yok.</div>';

  // Top 5 Least Leave Users for PDF
  const top5LeastPdf = [...personStats]
    .sort((a, b) => a.totalDays - b.totalDays || a.totalCount - b.totalCount)
    .slice(0, 5);

  const topLeastLeavePdfHtml = top5LeastPdf.map((s, idx) => `
    <div style="font-size: 8pt; margin-bottom: 3px; display: flex; justify-content: space-between;">
      <span><strong>${idx + 1}. ${s.person.name}</strong> <small>(${s.person.sicil})</small></span>
      <span style="color: #059669; font-weight: bold;">🏆 ${s.totalDays === 0 ? '0 Gün İzin' : `${s.totalDays} Gün (${s.totalCount} İzin)`}</span>
    </div>
  `).join('') || '<div style="font-size: 8pt; color: #64748b;">Personel kaydı yok.</div>';

  // Monthly Trend for PDF
  const monthNamesPdf = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const monthMapPdf = {};
  monthNamesPdf.forEach((m, i) => monthMapPdf[i] = { name: m, count: 0, days: 0 });

  allRecords.forEach(r => {
    if (!r.ayrilisDate) return;
    const d = new Date(r.ayrilisDate);
    if (isNaN(d.getTime())) return;
    const mIdx = d.getMonth();
    const days = parseInt(r.days || 0, 10);
    if (monthMapPdf[mIdx]) {
      monthMapPdf[mIdx].count++;
      monthMapPdf[mIdx].days += days;
    }
  });

  const activeMonthsPdf = Object.values(monthMapPdf).filter(m => m.days > 0);
  const monthlyTrendPdfHtml = activeMonthsPdf.map(m => `
    <div style="font-size: 8pt; margin-bottom: 3px; display: flex; justify-content: space-between;">
      <span><strong>${m.name}</strong></span>
      <span style="color: #059669; font-weight: bold;">${m.days} Gün (${m.count} İzin)</span>
    </div>
  `).join('') || '<div style="font-size: 8pt; color: #64748b;">Dönemde kayıt yok.</div>';

  // Weekend-Connected Health Reports for PDF
  const weekendReportStatsPdf = personnelList.map(p => {
    const pRecords = allRecords.filter(r => r.personnelId === p.id);
    let count = 0, days = 0;
    pRecords.forEach(r => {
      const code = (r.leaveType || '').toLowerCase();
      const name = (r.leaveTypeName || '').toLowerCase();
      if (code === 'rapor' || name.includes('rapor') || name.includes('sağlık')) {
        if (r.ayrilisDate) {
          const d = new Date(r.ayrilisDate);
          const dayOfWeek = d.getDay();
          if (dayOfWeek === 1 || dayOfWeek === 5) {
            count++;
            days += parseInt(r.days || 0, 10);
          }
        }
      }
    });
    return { person: p, count, days };
  }).filter(s => s.count > 0).sort((a, b) => b.count - a.count || b.days - a.days).slice(0, 5);

  const weekendReportsPdfHtml = weekendReportStatsPdf.map((s, idx) => `
    <div style="font-size: 8pt; margin-bottom: 3px; display: flex; justify-content: space-between;">
      <span><strong>${idx + 1}. ${s.person.name}</strong> <small>(${s.person.sicil})</small></span>
      <span style="color: #e11d48; font-weight: bold;">🗓️ ${s.count} Kez Pzt/Cuma (${s.days} G)</span>
    </div>
  `).join('') || '<div style="font-size: 8pt; color: #166534; font-weight: 600;">✅ Pazartesi/Cuma başlayan sıhhi rapor bulunmuyor.</div>';

  // 3. Yearly Leave Multi-Splitters (2+ parts) for PDF
  const splittersPdf = [...personStats]
    .filter(s => s.yillikCount > 2)
    .sort((a, b) => b.yillikCount - a.yillikCount || b.yillikDays - a.yillikDays);

  const topSplittersPdfHtml = splittersPdf.length > 0 ? splittersPdf.map(s => `
    <div style="font-size: 8pt; margin-bottom: 3px; display: flex; justify-content: space-between;">
      <span><strong>${s.person.name}</strong> <small>(${s.person.sicil})</small></span>
      <span style="color: #d97706; font-weight: bold;">⚠️ ${s.yillikCount} Parça (${s.yillikDays} Gün)</span>
    </div>
  `).join('') : '<div style="font-size: 8pt; color: #166534; font-weight: 600;">✅ Yıllık iznini 3 veya daha fazla parçada kullanan personel bulunmuyor.</div>';

  const pdfHtml = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>ANKARA ADLİYESİ BİLGİ İŞLEM MÜDÜRLÜĞÜ - DETAYLI İZİN & RAPOR ANALİZ RAPORU</title>
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; font-size: 11pt; background: #fff; }
        .header-table { width: 100%; margin-bottom: 20px; border-bottom: 2px solid #be123c; padding-bottom: 15px; }
        .logo-img { width: 80px; height: 80px; }
        .title-area { text-align: center; }
        .title-main { font-size: 14pt; font-weight: 800; color: #be123c; margin: 0; letter-spacing: 0.5px; }
        .title-sub { font-size: 12pt; font-weight: 700; color: #0f172a; margin: 4px 0 0 0; }
        .title-date { font-size: 9.5pt; color: #64748b; margin-top: 5px; }
        
        .kpi-container { display: flex; gap: 15px; margin-bottom: 15px; justify-content: space-between; }
        .kpi-box { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc; text-align: center; }
        .kpi-val { font-size: 14pt; font-weight: 800; color: #0f172a; }
        .kpi-lbl { font-size: 8pt; color: #475569; font-weight: 600; text-transform: uppercase; margin-top: 3px; }
        
        .report-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 9.5pt; }
        .report-table th { background: #0f172a; color: #ffffff; padding: 8px 6px; text-align: left; font-weight: 700; border: 1px solid #0f172a; }
        .report-table td { padding: 7px 6px; border: 1px solid #cbd5e1; }
        .report-table tr:nth-child(even) { background: #f8fafc; }
        .report-table tfoot td { background: #f1f5f9; font-weight: 800; border-top: 2px solid #0f172a; }

        .signature-area { width: 100%; margin-top: 30px; page-break-inside: avoid; }
        .signature-box { float: right; width: 250px; text-align: center; }
        .signature-title { font-weight: 700; font-size: 10pt; color: #0f172a; }
        .signature-name { font-weight: 800; font-size: 11pt; color: #be123c; margin-top: 6px; }
      </style>
    </head>
    <body>
      <table class="header-table">
        <tr>
          <td width="100"><img src="${window.location.origin}/logo.png" class="logo-img" /></td>
          <td class="title-area">
            <h1 class="title-main">ANKARA ADLİYESİ BİLGİ İŞLEM MÜDÜRLÜĞÜ</h1>
            <h2 class="title-sub">PERSONEL İZİN & SAĞLIK RAPORU DETAYLI ANALİZ RAPORU</h2>
            <div class="title-date">Rapor Tarihi: ${todayStr} | Toplam Personel Sayısı: ${personnelList.length}</div>
            <div class="title-date" style="color: #4f46e5; font-weight: 600; margin-top: 4px;">${filterText}</div>
          </td>
          <td width="100" style="text-align: right;">
            <img src="${window.location.origin}/logo.png" class="logo-img" style="display: inline-block;" />
          </td>
        </tr>
      </table>

      <div style="display:flex; flex-direction:row; gap:12px; margin-bottom:14px; justify-content:space-between;">
        <div style="flex:1; border:1px solid #cbd5e1; border-left:4px solid #10b981; border-radius:6px; padding:10px; background:#f8fafc; text-align:center;">
          <div style="font-size:14pt; font-weight:800; color:#059669;">%${Math.round(((personnelList.length - new Set(getLeaveRecords().filter(r => r.status === 'ayrilis_yapildi' && r.ayrilisDate <= new Date().toISOString().split('T')[0] && r.expectedReturnDate > new Date().toISOString().split('T')[0]).map(r => r.personnelId)).size) / (personnelList.length || 1)) * 100)} Görevde</div>
          <div style="font-size:7.5pt; color:#475569; font-weight:600; text-transform:uppercase; margin-top:3px;">Kurumsal Kapasite / Görevde Olma Oranı</div>
        </div>
        <div style="flex:1; border:1px solid #cbd5e1; border-left:4px solid #ef4444; border-radius:6px; padding:10px; background:#f8fafc; text-align:center;">
          <div style="font-size:14pt; font-weight:800; color:#dc2626;">${totalRaporDays} Gün</div>
          <div style="font-size:7.5pt; color:#475569; font-weight:600; text-transform:uppercase; margin-top:3px;">Toplam İstirahat İzni / Rapor (${totalRaporCount} Kez)</div>
        </div>
        <div style="flex:1; border:1px solid #cbd5e1; border-left:4px solid #4f46e5; border-radius:6px; padding:10px; background:#f8fafc; text-align:center;">
          <div style="font-size:14pt; font-weight:800; color:#0f172a;">${totalYillikDays} Gün</div>
          <div style="font-size:7.5pt; color:#475569; font-weight:600; text-transform:uppercase; margin-top:3px;">Toplam Kullanılan Yıllık İzin</div>
        </div>
        <div style="flex:1; border:1px solid #cbd5e1; border-left:4px solid #f59e0b; border-radius:6px; padding:10px; background:#f8fafc; text-align:center;">
          <div style="font-size:14pt; font-weight:800; color:#0f172a;">${totalOtherDays} Gün</div>
          <div style="font-size:7.5pt; color:#475569; font-weight:600; text-transform:uppercase; margin-top:3px;">Diğer Mazeret İzinleri</div>
        </div>
        <div style="flex:1; border:1px solid #cbd5e1; border-left:4px solid #6366f1; border-radius:6px; padding:10px; background:#f8fafc; text-align:center;">
          <div style="font-size:14pt; font-weight:800; color:#0f172a;">${totalAllDays} Gün</div>
          <div style="font-size:7.5pt; color:#475569; font-weight:600; text-transform:uppercase; margin-top:3px;">Genel İzin &amp; Rapor Gün Toplamı</div>
        </div>
      </div>

      <div style="display:flex; flex-direction:row; gap:12px; margin-bottom:10px;">
        <div style="flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; background:#f8fafc;">
          <div style="font-weight:800; font-size:8.5pt; color:#0f172a; margin-bottom:6px; border-bottom:1px solid #cbd5e1; padding-bottom:3px;">
            📊 İZİN TÜRLERİNE GÖRE DAĞILIM
          </div>
          ${typeListPdfHtml}
        </div>
        <div style="flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; background:#f8fafc;">
          <div style="font-weight:800; font-size:8.5pt; color:#dc2626; margin-bottom:6px; border-bottom:1px solid #cbd5e1; padding-bottom:3px;">
            🩺 EN ÇOK RAPOR ALANLAR (TOP 5)
          </div>
          ${topRaporPdfHtml}
        </div>
        <div style="flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; background:#f8fafc;">
          <div style="font-weight:800; font-size:8.5pt; color:#2563eb; margin-bottom:6px; border-bottom:1px solid #cbd5e1; padding-bottom:3px;">
            🏖️ EN ÇOK YILLIK İZİN KULLANANLAR (TOP 5)
          </div>
          ${topYillikPdfHtml}
        </div>
        <div style="flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; background:#f8fafc;">
          <div style="font-weight:800; font-size:8.5pt; color:#059669; margin-bottom:6px; border-bottom:1px solid #cbd5e1; padding-bottom:3px;">
            🏆 EN AZ İZİN/RAPOR KULLANANLAR (TOP 5)
          </div>
          ${topLeastLeavePdfHtml}
        </div>
      </div>

      <div style="display:flex; flex-direction:row; gap:12px; margin-bottom:18px;">
        <div style="flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; background:#f8fafc;">
          <div style="font-weight:800; font-size:8.5pt; color:#059669; margin-bottom:6px; border-bottom:1px solid #cbd5e1; padding-bottom:3px;">
            📅 AYLARA GÖRE İZİN/RAPOR YOĞUNLUĞU
          </div>
          ${monthlyTrendPdfHtml}
        </div>
        <div style="flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; background:#f8fafc;">
          <div style="font-weight:800; font-size:8.5pt; color:#e11d48; margin-bottom:6px; border-bottom:1px solid #cbd5e1; padding-bottom:3px;">
            🗓️ HAFTA SONU İLE BİRLEŞTİRİLEN RAPORLAR (PZT/CUMA)
          </div>
          ${weekendReportsPdfHtml}
        </div>
        <div style="flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; background:#f8fafc;">
          <div style="font-weight:800; font-size:8.5pt; color:#d97706; margin-bottom:6px; border-bottom:1px solid #cbd5e1; padding-bottom:3px;">
            ⚠️ YILLIK İZNİNİ 3+ PARÇADA KULLANANLAR
          </div>
          ${topSplittersPdfHtml}
        </div>
      </div>

      <table class="report-table">
        <thead>
          <tr>
            <th width="30" style="text-align: center;">No</th>
            <th width="70">Sicil No</th>
            <th>Adı Soyadı</th>
            <th>Unvanı</th>
            <th>Birim</th>
            <th width="120" style="text-align: center;">Rapor Kullanımı</th>
            <th width="120" style="text-align: center;">Yıllık İzin</th>
            <th width="110" style="text-align: center;">Diğer İzinler</th>
            <th width="90" style="text-align: center;">Genel Gün</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr style="background: #f1f5f9; font-weight: 800; border-top: 2px solid #0f172a;">
            <td colspan="5" style="text-align: right; padding: 10px 6px;">TOPLAM KURUMSAL KULLANIM:</td>
            <td style="text-align: center; color: #dc2626; padding: 10px 6px;">${totalRaporDays} Gün</td>
            <td style="text-align: center; padding: 10px 6px;">${totalYillikDays} Gün</td>
            <td style="text-align: center; padding: 10px 6px;">${totalOtherDays} Gün</td>
            <td style="text-align: center; color: #be123c; font-size: 11pt; padding: 10px 6px;">${totalAllDays} Gün</td>
          </tr>
        </tbody>
      </table>

      <div class="signature-area">
        <div class="signature-box">
          <div class="signature-title">Ankara Adliyesi Bilgi İşlem Müdürlüğü</div>
          <div style="font-size: 9.5pt; color: #475569; margin-top: 2px;">Bilgi İşlem Müdürü</div>
          <div class="signature-name">Erkan HACAT</div>
        </div>
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 150);
        };
      </script>
    </body>
    </html>
  `;

  // Create temporary print container on main document
  let printDiv = document.getElementById('pdf-print-container');
  if (printDiv) printDiv.remove();
  printDiv = document.createElement('div');
  printDiv.id = 'pdf-print-container';
  printDiv.innerHTML = pdfHtml;
  document.body.appendChild(printDiv);
  document.body.classList.add('printing-pdf-report');
  document.documentElement.classList.add('printing-pdf-report');

  // Inject @page landscape rule temporarily
  const pageStyle = document.createElement('style');
  pageStyle.id = 'pdf-page-style';
  pageStyle.textContent = '@page { size: A4 landscape; margin: 12mm; }';
  document.head.appendChild(pageStyle);

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-pdf-report');
      document.documentElement.classList.remove('printing-pdf-report');
      const ps = document.getElementById('pdf-page-style');
      if (ps) ps.remove();
      if (printDiv) printDiv.remove();
    }, 800);
  }, 200);
}

// Helper
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// =============================================
// MESAİ CETVELİ MODÜLÜ CONTROLLER
// =============================================

let mesaiCurrentYear = new Date().getFullYear();
let mesaiCurrentMonth = new Date().getMonth() + 1;

function initMesaiView() {
  // Ay / Yıl selectler
  const mSel = document.getElementById('mesai-month-select');
  const ySel = document.getElementById('mesai-year-select');
  if (mSel) mSel.value = String(mesaiCurrentMonth);
  if (ySel) ySel.value = String(mesaiCurrentYear);

  // Navigasyon butonları
  const prevBtn = document.getElementById('mesai-prev-month-btn');
  const nextBtn = document.getElementById('mesai-next-month-btn');
  if (prevBtn) prevBtn.addEventListener('click', () => {
    if (mesaiCurrentMonth === 1) { mesaiCurrentMonth = 12; mesaiCurrentYear--; }
    else mesaiCurrentMonth--;
    syncMesaiSelects();
    renderMesaiView(false);
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (mesaiCurrentMonth === 12) { mesaiCurrentMonth = 1; mesaiCurrentYear++; }
    else mesaiCurrentMonth++;
    syncMesaiSelects();
    renderMesaiView(false);
  });

  if (mSel) mSel.addEventListener('change', () => {
    mesaiCurrentMonth = parseInt(mSel.value, 10);
    renderMesaiView(false);
  });
  if (ySel) ySel.addEventListener('change', () => {
    mesaiCurrentYear = parseInt(ySel.value, 10);
    renderMesaiView(false);
  });
  const targetEl = document.getElementById('mesai-global-target');
  if (targetEl) {
    const settings = getMesaiSettingsDB();
    if (settings && settings.targetHours) {
      targetEl.value = settings.targetHours;
    }
    targetEl.addEventListener('change', () => {
      const s = getMesaiSettingsDB() || { targetHours: 50 };
      s.targetHours = targetEl.value;
      saveMesaiSettingsDB(s);
      renderMesaiView(false);
    });
  }

  // İmza alanı değerleri localStorage'dan yükle
  const sigs = getMesaiSignatories();
  const duzAdiEl = document.getElementById('mesai-duzenleyen-adi');
  const duzUnvEl = document.getElementById('mesai-duzenleyen-unvan');
  const tasvipAdiEl = document.getElementById('mesai-tasvip-adi');
  const tasvipUnvEl = document.getElementById('mesai-tasvip-unvan');
  const tasAdiEl = document.getElementById('mesai-tasdik-adi');
  const tasUnvEl = document.getElementById('mesai-tasdik-unvan');

  if (duzAdiEl) duzAdiEl.value = sigs.duzenleyen?.ad || '';
  if (duzUnvEl) duzUnvEl.value = sigs.duzenleyen?.unvan || '';
  if (tasvipAdiEl) tasvipAdiEl.value = sigs.tasvip?.ad || '';
  if (tasvipUnvEl) tasvipUnvEl.value = sigs.tasvip?.unvan || '';
  if (tasAdiEl) tasAdiEl.value = sigs.tasdik?.ad || '';
  if (tasUnvEl) tasUnvEl.value = sigs.tasdik?.unvan || '';

  // İmza alanı değişince otomatik kaydet
  [duzAdiEl, duzUnvEl, tasvipAdiEl, tasvipUnvEl, tasAdiEl, tasUnvEl].forEach(el => {
    if (el) el.addEventListener('change', saveMesaiSigs);
  });

  renderMesaiView();
}

function syncMesaiSelects() {
  const mSel = document.getElementById('mesai-month-select');
  const ySel = document.getElementById('mesai-year-select');
  if (mSel) mSel.value = String(mesaiCurrentMonth);
  if (ySel) ySel.value = String(mesaiCurrentYear);
}

function renderMesaiView(forceRebuild = false) {
  const targetEl = document.getElementById('mesai-global-target');
  const globalTarget = targetEl ? parseInt(targetEl.value, 10) : 50;

  if (forceRebuild) {
    generateMesaiForMonth(mesaiCurrentYear, mesaiCurrentMonth, globalTarget);
  }

  renderMesaiTable(mesaiCurrentYear, mesaiCurrentMonth);
  renderArchiveSection();
}

function renderArchiveSection() {
  renderMesaiArchiveSection(
    (y, m) => {
      mesaiCurrentYear = y;
      mesaiCurrentMonth = m;
      syncMesaiSelects();
      renderMesaiView(false);
      showToast(`📅 ${m}. Ay / ${y} mesai cetveli görüntülendi.`, 'info');
    },
    async (y, m) => {
      const sigs = getMesaiSigs();
      try {
        await exportMesaiToExcelFile(y, m, sigs.duzAd, sigs.duzUnvan, sigs.tasvipAd, sigs.tasvipUnvan, sigs.tasAd, sigs.tasUnvan);
        showToast(`📊 ${m}/${y} mesai cetveli Excel olarak indirildi!`, 'success');
      } catch (err) {
        showToast('Excel oluşturulamadı: ' + err.message, 'danger');
      }
    },
    (y, m) => {
      const sigs = getMesaiSigs();
      printMesaiView(y, m, sigs.duzAd, sigs.duzUnvan, sigs.tasvipAd, sigs.tasvipUnvan, sigs.tasAd, sigs.tasUnvan);
    },
    (y, m) => {
      const monthName = monthNamesList[m - 1] || `${m}. Ay`;
      showConfirmModal({
        title: '🗑️ Dönem Verilerini Temizle',
        message: `<strong>${monthName} ${y}</strong> dönemine ait tüm mesai verilerini silmek istediğinizden emin misiniz?`,
        confirmText: 'Evet, Sil',
        cancelText: 'Vazgeç',
        onConfirm: () => {
          clearMesaiForMonth(y, m);
          renderMesaiView(false);
          showToast(`🗑️ ${monthName} ${y} mesai verileri temizlendi.`, 'info');
        }
      });
    }
  );
}

function saveMesaiSigs() {
  saveMesaiSignatories({
    duzenleyen: {
      ad: document.getElementById('mesai-duzenleyen-adi')?.value || '',
      unvan: document.getElementById('mesai-duzenleyen-unvan')?.value || ''
    },
    tasvip: {
      ad: document.getElementById('mesai-tasvip-adi')?.value || '',
      unvan: document.getElementById('mesai-tasvip-unvan')?.value || ''
    },
    tasdik: {
      ad: document.getElementById('mesai-tasdik-adi')?.value || '',
      unvan: document.getElementById('mesai-tasdik-unvan')?.value || ''
    }
  });
}

function getMesaiSigs() {
  return {
    duzAd: document.getElementById('mesai-duzenleyen-adi')?.value || '',
    duzUnvan: document.getElementById('mesai-duzenleyen-unvan')?.value || '',
    tasvipAd: document.getElementById('mesai-tasvip-adi')?.value || '',
    tasvipUnvan: document.getElementById('mesai-tasvip-unvan')?.value || '',
    tasAd: document.getElementById('mesai-tasdik-adi')?.value || '',
    tasUnvan: document.getElementById('mesai-tasdik-unvan')?.value || ''
  };
}

const monthNamesList = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Global mesai action functions (called from inline onclick in index.html)
window.generateMesaiCetveli = function () {
  const targetEl = document.getElementById('mesai-global-target');
  const globalTarget = targetEl ? parseInt(targetEl.value, 10) : 45;
  const monthName = monthNamesList[mesaiCurrentMonth - 1];

  showConfirmModal({
    title: '⚡ Otomatik Mesai Cetveli Oluştur',
    message: `
      <div style="text-align: center; margin-bottom: 1rem;">
        <strong>${monthName} ${mesaiCurrentYear}</strong> ayına ait fazla çalışma cetveli tüm izinler taranarak otomatik oluşturulsun mu?
      </div>
      <div style="text-align: left; font-size: 0.82rem; background: rgba(255,255,255,0.04); padding: 0.85rem 1.1rem; border-radius: 10px; border: 1px solid var(--border-color); line-height: 1.6; color: var(--text-main);">
        • İzin takip sistemindeki tüm izin kayıtlarına otomatik <strong style="color:#ef4444;">X</strong> işlenir.<br>
        • Resmi tatil ve bayram günlerine <strong style="color:#ef4444;">X</strong> işlenir.<br>
        • Hafta içi günlük max 4 saat, hafta sonu max 8 saat atanır.<br>
        • Aylık max <strong>${Math.min(50, globalTarget)} saat</strong>, yıllık max 300 saat kota uygulanır.
      </div>
    `,
    confirmText: '⚡ Cetveli Oluştur',
    cancelText: 'Vazgeç',
    onConfirm: () => {
      renderMesaiView(true);
      showToast(`⚡ ${monthName} ${mesaiCurrentYear} mesai cetveli başarıyla oluşturuldu!`, 'success');
    }
  });
};

window.clearMesaiMonth = function () {
  const monthName = monthNamesList[mesaiCurrentMonth - 1];
  showConfirmModal({
    title: '🗑️ Aylık Mesai Verilerini Temizle',
    message: `<strong>${monthName} ${mesaiCurrentYear}</strong> ayına ait kaydedilmiş tüm mesai verilerini silmek istediğinizden emin misiniz?`,
    confirmText: 'Evet, Verileri Sil',
    cancelText: 'Vazgeç',
    onConfirm: () => {
      clearMesaiForMonth(mesaiCurrentYear, mesaiCurrentMonth);
      renderMesaiView();
      showToast('🗑️ Aylık mesai verileri temizlendi.', 'info');
    }
  });
};

window.exportMesaiExcel = async function () {
  const sigs = getMesaiSigs();
  saveMesaiSigs();
  try {
    await exportMesaiToExcelFile(mesaiCurrentYear, mesaiCurrentMonth, sigs.duzAd, sigs.duzUnvan, sigs.tasvipAd, sigs.tasvipUnvan, sigs.tasAd, sigs.tasUnvan);
    showToast('📊 Mesai cetveli Excel olarak indirildi!', 'success');
  } catch (err) {
    showToast('Excel oluşturulamadı: ' + err.message, 'danger');
  }
};

window.printMesaiCetveli = function () {
  const sigs = getMesaiSigs();
  saveMesaiSigs();
  printMesaiView(mesaiCurrentYear, mesaiCurrentMonth, sigs.duzAd, sigs.duzUnvan, sigs.tasvipAd, sigs.tasvipUnvan, sigs.tasAd, sigs.tasUnvan);
};

window.mesaiCellEdit = function (pid, y, m, d, tdEl) {
  const currentVal = tdEl.querySelector('span')?.textContent?.trim() || 'X';
  const person = getPersonnelList().find(p => p.id === pid);
  const personName = person ? person.name : 'Personel';
  const monthName = monthNamesList[m - 1];
  const dateLabel = `${d} ${monthName} ${y}`;

  const modalHtml = `
    <form id="form-mesai-cell-edit" style="padding: 0.5rem 0;">
      <div style="display: flex; align-items: center; gap: 0.85rem; background: rgba(99, 102, 241, 0.1); padding: 0.85rem 1.1rem; border-radius: 12px; margin-bottom: 1.25rem; border: 1px solid rgba(99, 102, 241, 0.25);">
        <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(99, 102, 241, 0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <i class="fa-solid fa-user-clock" style="font-size: 1.3rem; color: var(--accent-primary);"></i>
        </div>
        <div>
          <div style="font-weight: 800; font-size: 1rem; color: var(--text-main);">${personName}</div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.1rem;">📅 ${dateLabel}</div>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 1.5rem;">
        <label style="font-weight: 700; margin-bottom: 0.5rem; display: block; font-size: 0.9rem;">
          Mesai Saati Giriniz (0 – 8 Saat veya 'X'):
        </label>
        <input type="text" id="mesai-cell-val-input" value="${currentVal === 'X' ? '' : currentVal}" placeholder="Örn: 4, 8 veya X (İzinli)" 
          style="width: 100%; font-size: 1.25rem; font-weight: 800; text-align: center; color: var(--accent-primary); padding: 0.75rem; border-radius: 10px;" />
        <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.5rem; line-height: 1.5;">
          💡 İzinli veya tatil durumları için <strong>X</strong> girin ya da boş bırakın.<br>Çalışılan mesai saati için sayı (0–8) girin.
        </div>
      </div>

      <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.75rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
        <button type="button" class="btn btn-secondary" id="btn-cancel-cell-edit">İptal</button>
        <button type="submit" class="btn btn-primary" style="padding: 0.65rem 1.5rem; font-weight: 700;">
          <i class="fa-solid fa-check"></i> Güncelle ve Kaydet
        </button>
      </div>
    </form>
  `;

  openModal('📝 MESAİ SAATİ DÜZENLE', modalHtml);

  setTimeout(() => {
    const input = document.getElementById('mesai-cell-val-input');
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);

  document.getElementById('btn-cancel-cell-edit')?.addEventListener('click', closeModal);

  document.getElementById('form-mesai-cell-edit')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputVal = document.getElementById('mesai-cell-val-input')?.value;
    updateMesaiCell(pid, y, m, d, inputVal);
    closeModal();
    renderMesaiView();
    showToast(`✅ ${personName} — ${dateLabel} mesai saati güncellendi.`, 'success');
  });
};


// =============================================
// YOL YARDIMI KESİNTİSİ İZİN LİSTESİ (EXCEL) EXPORT
// =============================================

function splitNameComponents(fullName) {
  if (!fullName) return { name: '', surname: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { name: parts[0], surname: '' };
  const surname = parts.pop();
  const name = parts.join(' ');
  return { name, surname };
}

function formatDateDotTR(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('.')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parseInt(parts[2], 10)}.${parseInt(parts[1], 10)}.${parts[0]}`;
  }
  return dateStr;
}

function formatLongDateWithDayTR(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const monthNames = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];
  const dayNames = [
    'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'
  ];

  const day = d.getDate();
  const monthName = monthNames[d.getMonth()];
  const year = d.getFullYear();
  const dayName = dayNames[d.getDay()];

  return `${day} ${monthName} ${year} ${dayName}`;
}

function calculateWorkDaysInRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return 0;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

  let count = 0;
  const curr = new Date(start);
  while (curr <= end) {
    if (!isWeekendOrHoliday(curr)) {
      count++;
    }
    curr.setDate(curr.getDate() + 1);
  }
  return count;
}

export async function exportYolYardimiExcel() {
  if (typeof ExcelJS === 'undefined') {
    alert('Excel kütüphanesi (ExcelJS) yüklenemedi. Lütfen sayfayı yenileyin.');
    return;
  }

  const personnelList = getPersonnelList();
  let allRecords = getLeaveRecords();

  const startDateInput = document.getElementById('report-global-start');
  const endDateInput = document.getElementById('report-global-end');
  const searchInput = document.getElementById('report-search-personnel');
  const typeFilterSelect = document.getElementById('report-type-filter');

  const searchQuery = normalizeSearch(searchInput?.value || '');
  const typeFilter = typeFilterSelect?.value || '';

  // Filter records by global date range
  if (startDateInput && startDateInput.value) {
    allRecords = allRecords.filter(r => r.ayrilisDate >= startDateInput.value);
  }
  if (endDateInput && endDateInput.value) {
    allRecords = allRecords.filter(r => r.ayrilisDate <= endDateInput.value);
  }

  // Sort records by ayrilisDate ascending
  allRecords.sort((a, b) => (a.ayrilisDate > b.ayrilisDate ? 1 : -1));

  // Determine Title Text
  let titleText = 'PERSONEL İZİN VE GÖREVE BAŞLAYIŞ CETVELİ';
  const monthNamesUpper = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];

  const hasStart = startDateInput && startDateInput.value;
  const hasEnd = endDateInput && endDateInput.value;

  if (hasStart && hasEnd) {
    const dStart = new Date(startDateInput.value);
    const dEnd = new Date(endDateInput.value);
    if (!isNaN(dStart.getTime()) && !isNaN(dEnd.getTime())) {
      const startYear = dStart.getFullYear();
      const startMonth = dStart.getMonth();
      const endYear = dEnd.getFullYear();
      const endMonth = dEnd.getMonth();

      if (startYear === endYear && startMonth === endMonth) {
        titleText = `${startYear} YILI ${monthNamesUpper[startMonth]} AYI PERSONEL İZİN VE GÖREVE BAŞLAYIŞ CETVELİ`;
      } else if (startYear === endYear) {
        titleText = `${startYear} YILI (${monthNamesUpper[startMonth]} - ${monthNamesUpper[endMonth]}) PERSONEL İZİN VE GÖREVE BAŞLAYIŞ CETVELİ`;
      } else {
        titleText = `${startYear} - ${endYear} DÖNEMİ PERSONEL İZİN VE GÖREVE BAŞLAYIŞ CETVELİ`;
      }
    } else {
      titleText = 'PERSONEL İZİN VE GÖREVE BAŞLAYIŞ CETVELİ (TÜM ZAMANLAR)';
    }
  } else if (hasStart) {
    const dStart = new Date(startDateInput.value);
    if (!isNaN(dStart.getTime())) {
      titleText = `${dStart.getFullYear()} YILI ${monthNamesUpper[dStart.getMonth()]} AYI PERSONEL İZİN VE GÖREVE BAŞLAYIŞ CETVELİ`;
    }
  } else {
    titleText = 'PERSONEL İZİN VE GÖREVE BAŞLAYIŞ CETVELİ (TÜM ZAMANLAR)';
  }

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Yol Yardımı Listesi');

  // Page setup for printing
  ws.pageSetup.orientation = 'landscape';
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;

  // Title Row (Row 1)
  ws.mergeCells('A1:L1');
  const titleCell = ws.getCell('A1');
  titleCell.value = titleText;
  titleCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFC00000' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;

  // Table Headers (Row 2)
  const headers = [
    'SIRA\nNO',
    'BKN\nSİCİL NO',
    'TC KİMLİK\nNO',
    'AD',
    'SOYAD',
    'UNVAN',
    'GÖREV YERİ',
    'İZİNE AYRILIŞ\nTARİHİ\n(İZNİN İLK GÜNÜ)',
    'İZİN BİTİŞ TARİHİ\n(İZNİN SON GÜNÜ)',
    'GÖREVE BAŞLAMA\nTARİHİ',
    'İZİN TÜRÜ',
    'İŞ GÜNÜ'
  ];

  ws.getRow(2).values = headers;
  ws.getRow(2).height = 36;

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } }
  };

  for (let c = 1; c <= 12; c++) {
    const cell = ws.getCell(2, c);
    cell.fill = headerFill;
    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  }

  // Populate Rows
  let rowIdx = 3;
  let count = 0;

  allRecords.forEach(r => {
    const p = personnelList.find(p => p.id === r.personnelId);
    const fullName = p ? p.name : r.personnelName;

    if (searchQuery) {
      const searchTarget = `${fullName || ''} ${p ? p.sicil : ''} ${p ? p.title : ''} ${p ? p.birim : ''}`;
      if (!matchesSearchQuery(searchTarget, searchQuery)) return;
    }

    if (typeFilter) {
      const code = (r.leaveType || '').toLowerCase();
      if (typeFilter === 'rapor' && !code.includes('rapor')) return;
      if (typeFilter === 'yillik' && !code.includes('yillik')) return;
    }

    count++;
    const { name, surname } = splitNameComponents(fullName);
    const tcNo = p ? (p.tcNo || p.tc || '') : '';
    const sicil = p ? p.sicil : '';
    const unvan = p ? p.title : (r.unvan || '');
    const gorevYeri = p ? (p.birim || 'BİLGİ İŞLEM MÜDÜRLÜĞÜ') : 'BİLGİ İŞLEM MÜDÜRLÜĞÜ';

    // Calculate last leave day (1 day before expectedReturnDate)
    let bitisDateStr = '';
    if (r.expectedReturnDate) {
      const retDate = new Date(r.expectedReturnDate);
      if (!isNaN(retDate.getTime())) {
        retDate.setDate(retDate.getDate() - 1);
        bitisDateStr = retDate.toISOString().split('T')[0];
      }
    }

    const ayrilisFormatted = formatDateDotTR(r.ayrilisDate);
    const bitisFormatted = formatDateDotTR(bitisDateStr || r.ayrilisDate);
    const returnFormatted = formatLongDateWithDayTR(r.expectedReturnDate);
    let leaveTypeNameUpper = (r.leaveTypeName || 'YILLIK İZİN').toLocaleUpperCase('tr-TR');
    const typeCode = (r.leaveType || '').toLowerCase();
    if (typeCode === 'rapor' || leaveTypeNameUpper.includes('RAPOR') || leaveTypeNameUpper.includes('RAHAT') || leaveTypeNameUpper.includes('İSTİRAHAT') || leaveTypeNameUpper.includes('SAĞLIK')) {
      leaveTypeNameUpper = 'SAĞLIK RAPORU';
    }
    const isGunu = calculateWorkDaysInRange(r.ayrilisDate, bitisDateStr || r.ayrilisDate);

    const row = ws.getRow(rowIdx);
    row.height = 22;

    row.getCell(1).value = count;
    row.getCell(2).value = sicil ? (isNaN(sicil) ? sicil : parseInt(sicil, 10)) : '';
    row.getCell(3).value = tcNo;
    row.getCell(4).value = name.toLocaleUpperCase('tr-TR');
    row.getCell(5).value = surname.toLocaleUpperCase('tr-TR');
    row.getCell(6).value = unvan.toLocaleUpperCase('tr-TR');
    row.getCell(7).value = gorevYeri.toLocaleUpperCase('tr-TR');
    row.getCell(8).value = ayrilisFormatted;
    row.getCell(9).value = bitisFormatted;
    row.getCell(10).value = returnFormatted;
    row.getCell(11).value = leaveTypeNameUpper.toLocaleUpperCase('tr-TR');
    row.getCell(12).value = isGunu;

    // Formatting each cell in row
    for (let col = 1; col <= 12; col++) {
      const cell = row.getCell(col);
      cell.border = thinBorder;
      cell.font = { name: 'Segoe UI', size: 9, bold: (col === 1 || col === 2 || col === 4 || col === 5 || col === 12) };

      if (col === 12) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EDF4' } };
      }

      if ([1, 2, 3, 8, 9, 10, 11, 12].includes(col)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    }

    rowIdx++;
  });

  // Set column widths
  ws.columns = [
    { width: 8 },  // A: SIRA NO
    { width: 14 }, // B: BKN SİCİL NO
    { width: 16 }, // C: TC KİMLİK NO
    { width: 18 }, // D: AD
    { width: 18 }, // E: SOYAD
    { width: 22 }, // F: UNVAN
    { width: 26 }, // G: GÖREV YERİ
    { width: 18 }, // H: İZİNE AYRILIŞ
    { width: 18 }, // I: İZİN BİTİŞ
    { width: 26 }, // J: GÖREVE BAŞLAMA
    { width: 20 }, // K: İZİN TÜRÜ
    { width: 14 }  // L: İŞ GÜNÜ
  ];

  // Download buffer as Excel file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const todayStr = new Date().toISOString().split('T')[0];
  a.download = `Personel_Izin_ve_Goreve_Baslayis_Cetveli_${todayStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


