import { downloadUdfFile, buildUdfXml, generateDocumentPreviewHtml, formatDateTR } from './udfGenerator.js';
import {
  initStorage, exportDbJsonFile, importDbJsonData,
  getPersonnelList, savePersonnelList,
  getLeaveTypes, saveLeaveTypes,
  getSignatories, saveSignatories,
  getLeaveRecords, addLeaveRecord, updateLeaveRecord, deleteLeaveRecord
} from './storage.js';
import { calculateExpectedReturn, getReturnReasonNotu, checkLeaveConflict, getPendingReturnRecords, getDashboardStats } from './leaveTracker.js';

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

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupThemeToggle();
  setupModalEvents();
  setupLeavesTableFilters();
  setupNotificationBell();
  await initStorage();
  renderDashboard();
  setupWizardForm();
  renderPersonnelTable();
  renderLeavesTable();
  renderSettings();
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
}

function switchView(viewName) {
  navItems.forEach(nav => {
    if (nav.getAttribute('data-view') === viewName) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });

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
    personnel: '<i class="fa-solid fa-users" style="color: var(--accent-primary);"></i> Personel Listesi (50)',
    settings: '<i class="fa-solid fa-sliders" style="color: var(--accent-primary);"></i> Şablon & İzin Türü Ayarları'
  };
  const topTitle = document.getElementById('top-view-title');
  if (topTitle && viewTitles[viewName]) {
    topTitle.innerHTML = viewTitles[viewName];
  }

  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'leaves') renderLeavesTable();
  if (viewName === 'personnel') renderPersonnelTable();
  if (viewName === 'settings') renderSettings();
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
function setupModalEvents() {
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
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

function showConfirmModal({ title, message, confirmText = 'Evet, Sil', cancelText = 'Vazgeç', onConfirm }) {
  const html = `
    <div style="text-align: center; padding: 1rem 0.5rem;">
      <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(239, 68, 68, 0.12); border: 2px solid rgba(239, 68, 68, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto; box-shadow: 0 0 25px rgba(239, 68, 68, 0.3);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.8rem; color: #ef4444;"></i>
      </div>
      <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 0.6rem; color: var(--text-main);">${title}</h3>
      <div style="font-size: 0.92rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1.75rem;">${message}</div>
      <div style="display: flex; gap: 0.75rem; justify-content: center;">
        <button class="btn btn-secondary" id="confirm-modal-cancel" style="min-width: 110px; font-weight: 600;">${cancelText}</button>
        <button class="btn btn-danger" id="confirm-modal-ok" style="min-width: 125px; font-weight: 800; color: #ffffff !important; background: linear-gradient(135deg, #ef4444, #dc2626); border: none; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);">
          <i class="fa-solid fa-trash"></i> ${confirmText}
        </button>
      </div>
    </div>
  `;

  openModal('⚠️ Silme Onayı', html);

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
function renderDashboard() {
  renderNotificationBell();
  const stats = getDashboardStats();
  document.getElementById('stat-active-leaves').textContent = stats.totalActiveLeaves;
  document.getElementById('stat-pending-returns').textContent = stats.pendingReturnsCount;
  document.getElementById('stat-completed-returns').textContent = stats.completedCount;
  document.getElementById('stat-total-personnel').textContent = getPersonnelList().length;

  // Pending returns badge
  const badge = document.getElementById('nav-pending-badge');
  if (stats.pendingReturnsCount > 0) {
    badge.textContent = stats.pendingReturnsCount;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }

  // Pending and Completed returns list
  const pendingContainer = document.getElementById('pending-returns-container');
  const allRecords = getLeaveRecords();
  const pendingList = getPendingReturnRecords();
  const dueList = pendingList.filter(r => r.isDue);
  const upcomingList = pendingList.filter(r => !r.isDue);
  const completedList = allRecords.filter(r => r.status === 'baslayis_yapildi' && !r.hiddenFromDashboard);

  document.getElementById('pending-count-badge').textContent = dueList.length > 0 
    ? `${pendingList.length} Bekleyen (${dueList.length} ACİL)` 
    : `${pendingList.length} Bekleyen`;

  if (pendingList.length === 0 && completedList.length === 0) {
    pendingContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <i class="fa-solid fa-circle-check" style="font-size: 2rem; color: var(--accent-success); margin-bottom: 0.5rem;"></i>
        <p>Şu anda takipte olan veya göreve başlayış yazısı bekleyen izin kaydı bulunmamaktadır.</p>
      </div>
    `;
    return;
  }

  let html = '';

  if (dueList.length > 0) {
    html += `
      <div style="margin-bottom: 1.5rem; border: 2px solid var(--accent-danger); background: rgba(239, 68, 68, 0.08); padding: 1.25rem; border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="color: var(--accent-danger); font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
            <i class="fa-solid fa-triangle-exclamation"></i> 🚨 GÜNÜ GELEN / TARİHİ GEÇENLER (ACİL BAŞLAYIŞ YAZISI GEREKLİ)
          </h3>
          <span class="badge badge-danger">${dueList.length} Acil Personel</span>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Personel</th>
                <th>Sicil</th>
                <th>İzin Türü</th>
                <th>Ayrılış Tarihi</th>
                <th>Süre</th>
                <th>Beklenen Başlayış</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              ${dueList.map(item => `
                <tr style="background: rgba(239, 68, 68, 0.06);">
                  <td><strong>${item.personnelName}</strong><br><small style="color: var(--text-muted);">${item.unvan}</small></td>
                  <td>${item.sicil}</td>
                  <td><span class="badge badge-danger">${item.leaveTypeName}</span></td>
                  <td>${formatDateTR(item.ayrilisDate)}</td>
                  <td>${item.days} Gün</td>
                  <td><span class="badge badge-danger">${formatDateTR(item.expectedReturnDate)} (SÜRESİ DOLDU)</span></td>
                  <td style="display: flex; gap: 0.4rem; align-items: center;">
                    <button class="btn btn-sm btn-success btn-create-baslayis" data-record-id="${item.id}" style="font-weight: 700;">
                      <i class="fa-solid fa-paper-plane"></i> BAŞLAYIŞ
                    </button>
                    <button class="btn btn-sm btn-secondary btn-delete-leave-record" data-record-id="${item.id}" title="Ana Sayfa Panosundan Kaldır">
                      <i class="fa-solid fa-eye-slash"></i> Panodan Kaldır
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (upcomingList.length > 0) {
    html += `
      <div style="margin-top: 1rem;">
        <h4 style="color: var(--text-main); font-size: 0.95rem; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fa-solid fa-calendar-days" style="color: var(--accent-primary);"></i> ⏳ DEVAM EDEN İZİNLER (Gelecek Başlayışlar)
        </h4>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Personel</th>
                <th>Sicil</th>
                <th>İzin Türü</th>
                <th>Ayrılış Tarihi</th>
                <th>Süre</th>
                <th>Tahmini Başlayış</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              ${upcomingList.map(item => `
                <tr>
                  <td><strong>${item.personnelName}</strong><br><small style="color: var(--text-muted);">${item.unvan}</small></td>
                  <td>${item.sicil}</td>
                  <td><span class="badge badge-info">${item.leaveTypeName}</span></td>
                  <td>${formatDateTR(item.ayrilisDate)}</td>
                  <td>${item.days} Gün</td>
                  <td><span class="badge badge-info">${formatDateTR(item.expectedReturnDate)}</span></td>
                  <td style="display: flex; gap: 0.4rem; align-items: center;">
                    <button class="btn btn-sm btn-success btn-create-baslayis" data-record-id="${item.id}">
                      <i class="fa-solid fa-paper-plane"></i> BAŞLAYIŞ
                    </button>
                    <button class="btn btn-sm btn-secondary btn-delete-leave-record" data-record-id="${item.id}" title="Ana Sayfa Panosundan Kaldır">
                      <i class="fa-solid fa-eye-slash"></i> Panodan Kaldır
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (completedList.length > 0) {
    html += `
      <div style="margin-top: 1.5rem; border: 1px solid var(--accent-success); background: rgba(16, 185, 129, 0.05); padding: 1.25rem; border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <h4 style="color: var(--accent-success); font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
            <i class="fa-solid fa-circle-check"></i> ✅ BAŞLAYIŞI YAPILAN VE TAMAMLANAN İZİNLER
          </h4>
          <span class="badge badge-success">${completedList.length} Kayıt</span>
        </div>
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
              ${completedList.map(item => `
                <tr>
                  <td><strong>${item.personnelName}</strong><br><small style="color: var(--text-muted);">${item.unvan}</small></td>
                  <td>${item.sicil}</td>
                  <td><span class="badge badge-info">${item.leaveTypeName}</span></td>
                  <td>${formatDateTR(item.ayrilisDate)}</td>
                  <td>${formatDateTR(item.baslayisDate || item.expectedReturnDate)}</td>
                  <td><span class="badge badge-success"><i class="fa-solid fa-check"></i> BAŞLAYIŞ YAPILDI</span></td>
                  <td style="display: flex; gap: 0.4rem; align-items: center;">
                    <button class="btn btn-sm btn-primary btn-re-download-baslayis" data-record-id="${item.id}">
                      <i class="fa-solid fa-download"></i> UDF İndir
                    </button>
                    <button class="btn btn-sm btn-secondary btn-delete-leave-record" data-record-id="${item.id}" title="Ana Sayfa Panosundan Kaldır">
                      <i class="fa-solid fa-eye-slash"></i> Panodan Kaldır
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  pendingContainer.innerHTML = html;

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
}

// 2. DOCUMENT FORM SETUP
function populateWizardOptions() {
  // 1. Personnel (50 Personnel)
  const personnelList = getPersonnelList();
  const personSelect = document.getElementById('wiz-personnel-select');
  personSelect.innerHTML = personnelList.map(p => `<option value="${p.id}">${p.name} (${p.sicil}) - ${p.title}</option>`).join('');

  // 2. Leave Types
  const leaveTypes = getLeaveTypes();
  const leaveSelect = document.getElementById('wiz-leave-type');
  leaveSelect.innerHTML = leaveTypes.map(l => `<option value="${l.code}">${l.name}</option>`).join('');

  // 3. Signatories
  const signatories = getSignatories();
  const signerSelect = document.getElementById('wiz-imzalayan');
  signerSelect.innerHTML = signatories.map(s => `<option value="${s.id}" ${s.default ? 'selected' : ''}>${s.name} (${s.title})</option>`).join('');

  // Default dates
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('wiz-ayrilis-tarih').value = today;
  document.getElementById('wiz-baslayis-tarih').value = calculateExpectedReturn(today, document.getElementById('wiz-izin-suresi').value);
}

function setupWizardForm() {
  populateWizardOptions();

  const leaveTypeSelect = document.getElementById('wiz-leave-type');
  const actionTypeSelect = document.getElementById('wiz-action-type');
  const groupAyrilis = document.getElementById('group-ayrilis-tarih');
  const groupBaslayis = document.getElementById('group-baslayis-tarih');
  const groupIlgi = document.getElementById('group-ilgi-evrak');
  const groupRapor = document.getElementById('group-rapor-kurum');
  const aliciMakamSelect = document.getElementById('wiz-alici-makam');
  const groupAliciOzel = document.getElementById('group-alici-makam-ozel');
  const izinSuresiInput = document.getElementById('wiz-izin-suresi');
  const ayrilisTarihiInput = document.getElementById('wiz-ayrilis-tarih');

  // Auto calculate expected return date
  function updateReturnDateCalc() {
    const sDate = ayrilisTarihiInput.value;
    const days = izinSuresiInput.value;
    const calcReturn = calculateExpectedReturn(sDate, days);
    document.getElementById('wiz-baslayis-tarih').value = calcReturn;
  }

  izinSuresiInput.addEventListener('input', updateReturnDateCalc);
  ayrilisTarihiInput.addEventListener('change', updateReturnDateCalc);

  function handleFormVisibility() {
    const action = actionTypeSelect.value;
    const lType = leaveTypeSelect.value;
    const isBaslayis = action === 'baslayis';
    const isRapor = lType === 'rapor';

    groupAyrilis.style.display = isBaslayis ? 'none' : 'flex';
    groupBaslayis.style.display = 'flex';
    groupIlgi.style.display = isBaslayis ? 'flex' : 'none';
    groupRapor.style.display = 'none';

    if (isRapor) {
      aliciMakamSelect.value = 'bakanlik';
    } else {
      aliciMakamSelect.value = 'komisyon';
    }
  }

  actionTypeSelect.addEventListener('change', handleFormVisibility);
  leaveTypeSelect.addEventListener('change', handleFormVisibility);

  aliciMakamSelect.addEventListener('change', () => {
    groupAliciOzel.style.display = aliciMakamSelect.value === 'ozel' ? 'flex' : 'none';
  });

  // UDF Formatted Document Preview Button
  document.getElementById('btn-preview-xml')?.addEventListener('click', () => {
    try {
      const payload = getWizardPayload();
      const previewHtml = generateDocumentPreviewHtml(payload);
      openModal('📄 ÖNİZLEME', previewHtml);

      document.getElementById('btn-modal-download-udf')?.addEventListener('click', async () => {
        const filename = `${payload.personnelName}_${payload.leaveType}_${payload.actionType}.udf`;
        await downloadUdfFile(payload, filename);
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
          ayrilisDate: payload.ayrilisTarihi,
          expectedReturnDate: expReturn,
          raporKurum: payload.raporKurum,
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
    ayrilisTarihi: ayrilisTarihi,
    baslayisTarihi: baslayisTarihi,
    ilgiEvrak: document.getElementById('wiz-ilgi-evrak')?.value || '',
    raporKurum: document.getElementById('wiz-rapor-kurum')?.value || '',
    aliciMakam: document.getElementById('wiz-alici-makam')?.value || 'komisyon',
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

  document.getElementById('wiz-personnel-select').value = rec.personnelId;
  document.getElementById('wiz-leave-type').value = rec.leaveType;

  const actionTypeSelect = document.getElementById('wiz-action-type');
  actionTypeSelect.value = 'baslayis';
  actionTypeSelect.dispatchEvent(new Event('change'));

  document.getElementById('wiz-izin-suresi').value = rec.days;
  
  const formattedAyrilisDate = formatDateTR(rec.ayrilisDate);
  document.getElementById('wiz-ilgi-evrak').value = `${formattedAyrilisDate} tarihli yazımız.`;
  
  const todayStr = new Date().toISOString().split('T')[0];
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
    showToast(`✅ ${rec.personnelName} için Göreve Başlayış UDF belgesi indirildi ve işlem tamamlandı!`, 'success');
    renderDashboard();
    renderLeavesTable();
    renderNotificationBell();
  } catch (err) {
    console.error('Başlayış UDF oluşturma hatası:', err);
    showToast('Hata: ' + err.message, 'danger');
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

  // Filtering
  const filtered = records.filter(r => {
    const search = leavesState.searchQuery.toLowerCase();
    const matchesSearch = !search || 
      r.personnelName.toLowerCase().includes(search) || 
      (r.sicil && r.sicil.includes(search));
    const matchesType = !leavesState.typeFilter || r.leaveType === leavesState.typeFilter;
    const matchesStatus = !leavesState.statusFilter || r.status === leavesState.statusFilter;
    return matchesSearch && matchesType && matchesStatus;
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

  tbody.innerHTML = paginated.map(r => {
    const isDue = r.status === 'ayrilis_yapildi' && r.expectedReturnDate && r.expectedReturnDate <= todayStr;
    const rowStyle = isDue ? 'background: rgba(239, 68, 68, 0.12); border-left: 4px solid #ef4444;' : '';
    
    return `
      <tr style="${rowStyle}">
        <td><strong>${r.personnelName}</strong><br><small style="color: var(--text-muted);">${r.unvan}</small></td>
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
        <td style="display: flex; gap: 0.4rem; align-items: center;">
          ${r.status === 'ayrilis_yapildi' 
            ? `<button class="btn btn-sm btn-success btn-create-baslayis" data-record-id="${r.id}" style="${isDue ? 'font-weight: 800; box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);' : ''}"><i class="fa-solid fa-paper-plane"></i> BAŞLAYIŞ</button>`
            : `<small style="color: var(--text-muted);">Tamamlandı</small>`}
          <button class="btn btn-sm btn-danger btn-delete-leave-record" data-record-id="${r.id}"><i class="fa-solid fa-trash"></i> Sil</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-create-baslayis').forEach(btn => {
    btn.addEventListener('click', async () => {
      await startBaslayisWizardForRecord(btn.getAttribute('data-record-id'));
    });
  });

  tbody.querySelectorAll('.btn-delete-leave-record').forEach(btn => {
    btn.addEventListener('click', () => {
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
  const tbody = document.querySelector('#table-personnel tbody');
  const searchInput = document.getElementById('search-personnel');
  const query = (searchInput?.value || '').toLowerCase();

  const filtered = list.filter(p => p.name.toLowerCase().includes(query) || p.sicil.includes(query) || p.title.toLowerCase().includes(query));

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td><code>${p.sicil}</code></td>
      <td><strong>${p.name}</strong></td>
      <td>${p.title}</td>
      <td>${p.birim}</td>
      <td><span class="badge badge-success">Aktif</span></td>
      <td style="display: flex; gap: 0.4rem; align-items: center;">
        <button class="btn btn-sm btn-primary btn-edit-personnel" data-id="${p.id}"><i class="fa-solid fa-pen-to-square"></i> Düzenle</button>
        <button class="btn btn-sm btn-danger btn-delete-personnel" data-id="${p.id}"><i class="fa-solid fa-trash"></i> Sil</button>
      </td>
    </tr>
  `).join('');

  searchInput?.replaceWith(searchInput.cloneNode(true));
  document.getElementById('search-personnel')?.addEventListener('input', renderPersonnelTable);

  // Add Personnel Listener
  document.getElementById('btn-add-personnel')?.addEventListener('click', () => {
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
      const current = getPersonnelList();
      current.push({
        id: Date.now().toString(),
        name: document.getElementById('p-name').value,
        sicil: document.getElementById('p-sicil').value,
        title: document.getElementById('p-title').value,
        birim: document.getElementById('p-birim').value,
        status: 'active'
      });
      savePersonnelList(current);
      closeModal();
      showToast('Personel eklendi ve db.json dosyasına kaydedildi!', 'success');
      renderPersonnelTable();
      populateWizardOptions();
    });
  });

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
        let current = getPersonnelList();
        const index = current.findIndex(p => p.id === id);
        if (index !== -1) {
          current[index] = {
            ...current[index],
            name: document.getElementById('edit-p-name').value,
            sicil: document.getElementById('edit-p-sicil').value,
            title: document.getElementById('edit-p-title').value,
            birim: document.getElementById('edit-p-birim').value
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
}

// 5. SETTINGS
function renderSettings() {
  // Signers
  const signers = getSignatories();
  document.getElementById('list-signers').innerHTML = signers.map(s => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-bottom: var(--border-color) 1px solid;">
      <div>
        <strong>${s.name}</strong><br><small style="color: var(--text-muted);">${s.title}</small>
      </div>
      <button class="btn btn-sm btn-danger btn-del-signer" data-id="${s.id}"><i class="fa-solid fa-trash"></i> Sil</button>
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
        <button class="btn btn-sm btn-danger btn-del-leavetype" data-id="${l.id}"><i class="fa-solid fa-trash"></i> Sil</button>
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

// Helper
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
