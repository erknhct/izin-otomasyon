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
    <i class="fa-solid ${type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
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

// 1. DASHBOARD
function renderDashboard() {
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

  // Pending returns list
  const pendingContainer = document.getElementById('pending-returns-container');
  const pendingList = getPendingReturnRecords();
  const dueList = pendingList.filter(r => r.isDue);
  const upcomingList = pendingList.filter(r => !r.isDue);

  document.getElementById('pending-count-badge').textContent = dueList.length > 0 
    ? `${pendingList.length} Kayıt (${dueList.length} ACİL)` 
    : `${pendingList.length} Kayıt`;

  if (pendingList.length === 0) {
    pendingContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <i class="fa-solid fa-circle-check" style="font-size: 2rem; color: var(--accent-success); margin-bottom: 0.5rem;"></i>
        <p>Şu anda göreve başlayış yazısı bekleyen izinli personel bulunmamaktadır.</p>
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
                    <button class="btn btn-sm btn-danger btn-delete-leave-record" data-record-id="${item.id}">
                      <i class="fa-solid fa-trash"></i> Sil
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
                    <button class="btn btn-sm btn-danger btn-delete-leave-record" data-record-id="${item.id}">
                      <i class="fa-solid fa-trash"></i> Sil
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
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-record-id');
      startBaslayisWizardForRecord(recId);
    });
  });

  pendingContainer.querySelectorAll('.btn-delete-leave-record').forEach(btn => {
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-record-id');
      deleteLeaveRecord(recId);
      showToast('İzin kaydı silindi.', 'warning');
      renderDashboard();
      renderLeavesTable();
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
    const payload = getWizardPayload();
    const previewHtml = generateDocumentPreviewHtml(payload);
    openModal('📄 ÖNİZLEME', previewHtml);

    document.getElementById('btn-modal-download-udf')?.addEventListener('click', async () => {
      const filename = `${payload.personnelName}_${payload.leaveType}_${payload.actionType}.udf`;
      await downloadUdfFile(payload, filename);
      showToast(`${filename} UDF olarak indirildi!`, 'success');
    });
  });

  // Form Submit (Generate UDF)
  document.getElementById('form-udf-wizard').addEventListener('submit', async (e) => {
    e.preventDefault();
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
  });
}

function getWizardPayload() {
  const pId = document.getElementById('wiz-personnel-select').value;
  const person = getPersonnelList().find(p => p.id === pId) || { name: 'Personel', sicil: '0000', title: 'Katip', birim: 'Bilgi İşlem Müdürlüğü' };

  const sId = document.getElementById('wiz-imzalayan').value;
  const signer = getSignatories().find(s => s.id === sId) || { name: 'Dr. Arif Naci SUCUOĞLU', title: 'Cumhuriyet Başsavcı Vekili' };

  const leaveCode = document.getElementById('wiz-leave-type').value;
  const leaveTypes = getLeaveTypes();
  const ltObj = leaveTypes.find(l => l.code === leaveCode || l.id === leaveCode) || { name: 'İzin' };

  const actionType = document.getElementById('wiz-action-type').value;
  const izinSuresi = parseInt(document.getElementById('wiz-izin-suresi').value, 10);
  const ayrilisTarihi = document.getElementById('wiz-ayrilis-tarih').value;

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
    actionType: actionType,
    personnelId: pId,
    personnelName: person.name,
    sicilNo: person.sicil,
    unvan: person.title,
    birim: person.birim || 'Bilgi İşlem Müdürlüğü',
    tarih: formatDateTR(todayStr),
    izinSuresi: izinSuresi,
    ayrilisTarihi: ayrilisTarihi,
    baslayisTarihi: document.getElementById('wiz-baslayis-tarih').value,
    ilgiEvrak: document.getElementById('wiz-ilgi-evrak').value,
    raporKurum: document.getElementById('wiz-rapor-kurum').value,
    aliciMakam: document.getElementById('wiz-alici-makam').value,
    aliciMakamOzel: document.getElementById('wiz-alici-makam-ozel').value,
    imzalayanAd: signer.name,
    imzalayanUnvan: signer.title,
    donusNotu: donusNotu,
    linkedRecordId: document.getElementById('form-udf-wizard').dataset.linkedRecordId || null
  };
}

function startBaslayisWizardForRecord(recId) {
  const records = getLeaveRecords();
  const rec = records.find(r => r.id === recId);
  if (!rec) return;

  switchView('dashboard');

  document.getElementById('wiz-personnel-select').value = rec.personnelId;
  document.getElementById('wiz-leave-type').value = rec.leaveType;

  const actionTypeSelect = document.getElementById('wiz-action-type');
  actionTypeSelect.value = 'baslayis';
  actionTypeSelect.dispatchEvent(new Event('change'));

  document.getElementById('wiz-izin-suresi').value = rec.days;
  
  const formattedAyrilisDate = formatDateTR(rec.ayrilisDate);
  document.getElementById('wiz-ilgi-evrak').value = `${formattedAyrilisDate} günlü yazımız`;
  
  document.getElementById('wiz-baslayis-tarih').value = rec.expectedReturnDate;
  document.getElementById('form-udf-wizard').dataset.linkedRecordId = rec.id;

  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast(`${rec.personnelName} için göreve başlayış verileri otomatik bağlandı.`, 'info');
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

  tbody.innerHTML = paginated.map(r => `
    <tr>
      <td><strong>${r.personnelName}</strong><br><small style="color: var(--text-muted);">${r.unvan}</small></td>
      <td><span class="badge badge-info">${r.leaveTypeName}</span></td>
      <td>${r.days} Gün</td>
      <td>${formatDateTR(r.ayrilisDate)}</td>
      <td>${formatDateTR(r.expectedReturnDate)}</td>
      <td>
        ${r.status === 'baslayis_yapildi' 
          ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Göreve Başladı</span>' 
          : '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> İznide (Ayrılış Yapıldı)</span>'}
      </td>
      <td style="display: flex; gap: 0.4rem; align-items: center;">
        ${r.status === 'ayrilis_yapildi' 
          ? `<button class="btn btn-sm btn-success btn-create-baslayis" data-record-id="${r.id}"><i class="fa-solid fa-file-pen"></i> BAŞLAYIŞ</button>`
          : `<small style="color: var(--text-muted);">Tamamlandı</small>`}
        <button class="btn btn-sm btn-danger btn-delete-leave-record" data-record-id="${r.id}"><i class="fa-solid fa-trash"></i> Sil</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-create-baslayis').forEach(btn => {
    btn.addEventListener('click', () => {
      startBaslayisWizardForRecord(btn.getAttribute('data-record-id'));
    });
  });

  tbody.querySelectorAll('.btn-delete-leave-record').forEach(btn => {
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-record-id');
      deleteLeaveRecord(recId);
      showToast('İzin kaydı silindi.', 'warning');
      renderDashboard();
      renderLeavesTable();
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
      let current = getPersonnelList();
      current = current.filter(p => p.id !== id);
      savePersonnelList(current);
      showToast('Personel silindi ve db.json güncellendi.', 'warning');
      renderPersonnelTable();
      populateWizardOptions();
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
      let current = getSignatories();
      current = current.filter(s => s.id !== btn.getAttribute('data-id'));
      saveSignatories(current);
      renderSettings();
      populateWizardOptions();
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
          <span>Konu: <em>${l.subjectText || l.name}</em></span> | 
          <span>Ayrılış: <em>${l.ayrilisPhrase || '-'}</em></span> | 
          <span>Başlayış: <em>${l.baslayisPhrase || '-'}</em></span>
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
      let current = getLeaveTypes();
      current = current.filter(l => l.id !== btn.getAttribute('data-id'));
      saveLeaveTypes(current);
      renderSettings();
      populateWizardOptions();
      showToast('İzin türü silindi.', 'warning');
    });
  });

  document.querySelectorAll('.btn-edit-leavetype').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const lt = getLeaveTypes().find(l => l.id === id);
      if (!lt) return;

      openModal('İzin Türü ve Şablon Düzenle', `
        <form id="form-edit-leavetype" class="form-grid">
          <div class="form-group full-width">
            <label>İzin Türü Adı</label>
            <input type="text" id="edit-lt-name" required value="${lt.name}" />
          </div>
          <div class="form-group full-width">
            <label>Konu Metni (Evrak Üst Konu Başlığı)</label>
            <input type="text" id="edit-lt-subject" required value="${lt.subjectText || lt.name}" placeholder="Örn: Babalık İzni, Yıllık İzin" />
          </div>
          <div class="form-group">
            <label>Ayrılış Cümle Eki (UDF Ayrılış İfadesi)</label>
            <input type="text" id="edit-lt-ayrilis" required value="${lt.ayrilisPhrase || ''}" placeholder="Örn: babalık izninden, evlilik izninden" />
          </div>
          <div class="form-group">
            <label>Başlayış Cümle Eki (UDF Başlayış İfadesi)</label>
            <input type="text" id="edit-lt-baslayis" required value="${lt.baslayisPhrase || ''}" placeholder="Örn: babalık iznini, evlilik iznini" />
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
            ayrilisPhrase: document.getElementById('edit-lt-ayrilis').value,
            baslayisPhrase: document.getElementById('edit-lt-baslayis').value
          };
          saveLeaveTypes(current);
          closeModal();
          renderSettings();
          populateWizardOptions();
          showToast('İzin türü şablonu güncellendi ve kaydedildi!', 'success');
        }
      });
    });
  });

  document.getElementById('btn-add-leavetype')?.addEventListener('click', () => {
    openModal('Yeni İzin Türü ve Şablon Ekle', `
      <form id="form-add-leavetype" class="form-grid">
        <div class="form-group full-width">
          <label>İzin Türü Adı</label>
          <input type="text" id="lt-name" required placeholder="Örn: Babalık İzni, Evlilik İzni" />
        </div>
        <div class="form-group full-width">
          <label>Konu Metni (Evrak Üst Konu Başlığı)</label>
          <input type="text" id="lt-subject" required placeholder="Örn: Babalık İzni" />
        </div>
        <div class="form-group">
          <label>Ayrılış Cümle Eki (UDF Ayrılış İfadesi)</label>
          <input type="text" id="lt-ayrilis" required placeholder="Örn: babalık izninden" />
        </div>
        <div class="form-group">
          <label>Başlayış Cümle Eki (UDF Başlayış İfadesi)</label>
          <input type="text" id="lt-baslayis" required placeholder="Örn: babalık iznini" />
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
      current.push({
        id: Date.now().toString(),
        name: name,
        code: code || 'izin',
        subjectText: document.getElementById('lt-subject').value || name,
        ayrilisPhrase: document.getElementById('lt-ayrilis').value || `${name.toLowerCase()}nden`,
        baslayisPhrase: document.getElementById('lt-baslayis').value || `${name.toLowerCase()}ni`
      });
      saveLeaveTypes(current);
      closeModal();
      renderSettings();
      populateWizardOptions();
      showToast('Yeni izin türü şablonu eklendi ve kaydedildi.', 'success');
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
