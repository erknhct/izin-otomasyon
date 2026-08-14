// Local JSON File & LocalStorage Persistence Manager

const DB_API_URL = '/api/db';

const STORAGE_KEYS = {
  PERSONNEL: 'udf_personnel_list_v1',
  LEAVE_TYPES: 'udf_leave_types_v1',
  SIGNATORIES: 'udf_signatories_v1',
  LEAVE_RECORDS: 'udf_leave_records_v1'
};

// In-Memory Database Cache
let dbCache = {
  personnel: [],
  aliciMakamlar: [
    { id: 'komisyon', name: "ANKARA ADLÎ YARGI\nİLK DERECE MAHKEMESİ\nADALET KOMİSYONU BAŞKANLIĞI'NA" },
    { id: 'bakanlik', name: "ANKARA CUMHURİYET BAŞSAVCILIĞI\nBakanlık Muhabere Bürosu'na" }
  ],
  leaveTypes: [],
  signatories: [],
  leaveRecords: [],
  mesaiSettings: {
    targetHours: 50,
    duzenleyen: { ad: 'Emine SÖKMEN', unvan: 'Bilgisayar İşletmeni' },
    tasvip: { ad: '', unvan: '' },
    tasdik: { ad: 'Dr. Arif Naci SUCUOĞLU', unvan: 'Cumhuriyet Başsavcı Vekili' }
  },
  adminPassword: 'ankara2025',
  staffPassword: 'yazi2025'
};

// Unique Client Identifier for LAN real-time synchronization
export const CLIENT_ID = Math.random().toString(36).substring(2) + Date.now().toString(36);

function getDbHash(obj) {
  try {
    return JSON.stringify(obj).length + '_' + (obj.personnel ? obj.personnel.length : 0) + '_' + (obj.leaveRecords ? obj.leaveRecords.length : 0);
  } catch (e) {
    return '';
  }
}

function sanitizeDbData(cache) {
  if (!cache) return;
  const pMap = {};
  if (Array.isArray(cache.personnel)) {
    cache.personnel.forEach(p => {
      if (p.name) p.name = p.name.replace(/\s+/g, ' ').trim();
      if (p.title) p.title = p.title.replace(/\s+/g, ' ').trim();
      if (p.birim) p.birim = p.birim.replace(/\s+/g, ' ').trim();
      if (p.sicil) p.sicil = p.sicil.toString().trim();
      if (p.id) pMap[p.id] = p;
      if (p.name) pMap[p.name] = p;
    });
  }

  if (Array.isArray(cache.leaveRecords)) {
    cache.leaveRecords.forEach(r => {
      delete r.raporKurum;
      if (r.personnelName) r.personnelName = r.personnelName.replace(/\s+/g, ' ').trim();
      if (r.unvan) r.unvan = r.unvan.replace(/\s+/g, ' ').trim();
      if (r.sicil) r.sicil = r.sicil.toString().trim();
      const p = pMap[r.personnelId] || pMap[r.personnelName];
      if (p) {
        if (p.title && (!r.unvan || r.unvan.includes('\uFFFD') || r.unvan === 'ef')) {
          r.unvan = p.title;
        }
        if (p.name && (!r.personnelName || r.personnelName.includes('\uFFFD'))) {
          r.personnelName = p.name;
        }
      }
    });
  }

  if (Array.isArray(cache.leaveTypes)) {
    const replacements = [
      ['ayrılı\uFFFD\uFFFDını', 'ayrılışını'],
      ['g\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFDnünü', 'gününü'],
      ['ayr\uFFFD\uFFFDlmıştır', 'ayrılmıştır'],
      ['g\uFFFD\uFFFD\uFFFD\uFFFDrevine', 'görevine'],
      ['gün\uFFFD\uFFFDnü', 'gününü'],
      ['günün\uFFFD\uFFFD\uFFFD\uFFFD', 'gününü']
    ];
    cache.leaveTypes.forEach(lt => {
      ['ayrilisTemplate', 'baslayisTemplate', 'name', 'subjectText'].forEach(key => {
        if (typeof lt[key] === 'string' && lt[key].includes('\uFFFD')) {
          replacements.forEach(([from, to]) => {
            lt[key] = lt[key].replaceAll(from, to);
          });
        }
      });
    });
  }
}

/**
 * Initializes database by reading data/db.json from backend API
 */
export async function initStorage() {
  try {
    const res = await fetch(DB_API_URL, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.personnel && Array.isArray(data.personnel)) {
        dbCache = data;
        if (!dbCache.adminPassword) dbCache.adminPassword = dbCache.appPassword || 'ankara2025';
        if (!dbCache.staffPassword) dbCache.staffPassword = 'yazi2025';
        delete dbCache.appPassword;
        if (!dbCache.mesaiSettings) {
          dbCache.mesaiSettings = { targetHours: 50, duzenleyen: { ad: 'Emine SÖKMEN', unvan: 'Bilgisayar İşletmeni' }, tasvip: { ad: '', unvan: '' }, tasdik: { ad: 'Dr. Arif Naci SUCUOĞLU', unvan: 'Cumhuriyet Başsavcı Vekili' } };
        }
        sanitizeDbData(dbCache);

        // Sync to localStorage
        localStorage.setItem(STORAGE_KEYS.PERSONNEL, JSON.stringify(dbCache.personnel));
        localStorage.setItem('udf_alici_makamlar_v1', JSON.stringify(dbCache.aliciMakamlar));
        localStorage.setItem(STORAGE_KEYS.LEAVE_TYPES, JSON.stringify(dbCache.leaveTypes));
        localStorage.setItem(STORAGE_KEYS.SIGNATORIES, JSON.stringify(dbCache.signatories));
        localStorage.setItem(STORAGE_KEYS.LEAVE_RECORDS, JSON.stringify(dbCache.leaveRecords));
        localStorage.setItem('udf_admin_password', dbCache.adminPassword);
        localStorage.setItem('udf_staff_password', dbCache.staffPassword);
        return true;
      }
    }
  } catch (err) {
    console.warn('API db.json okunamadı, localStorage kullanılıyor:', err);
  }

  // Fallback to localStorage
  dbCache.personnel = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERSONNEL) || '[]');
  
  const savedMakamlar = localStorage.getItem('udf_alici_makamlar_v1');
  if (savedMakamlar) {
    dbCache.aliciMakamlar = JSON.parse(savedMakamlar);
  } else {
    dbCache.aliciMakamlar = [
      { id: 'komisyon', name: "ANKARA ADLÎ YARGI\nİLK DERECE MAHKEMESİ\nADALET KOMİSYONU BAŞKANLIĞI'NA" },
      { id: 'bakanlik', name: "ANKARA CUMHURİYET BAŞSAVCILIĞI\nBakanlık Muhabere Bürosu'na" }
    ];
  }

  dbCache.leaveTypes = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEAVE_TYPES) || '[]');
  dbCache.signatories = JSON.parse(localStorage.getItem(STORAGE_KEYS.SIGNATORIES) || '[]');
  dbCache.leaveRecords = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEAVE_RECORDS) || '[]');
  
  if (!dbCache.mesaiSettings) {
    dbCache.mesaiSettings = { targetHours: 50, duzenleyen: { ad: 'Emine SÖKMEN', unvan: 'Bilgisayar İşletmeni' }, tasvip: { ad: '', unvan: '' }, tasdik: { ad: 'Dr. Arif Naci SUCUOĞLU', unvan: 'Cumhuriyet Başsavcı Vekili' } };
  }
  dbCache.adminPassword = localStorage.getItem('udf_admin_password') || localStorage.getItem('udf_app_password') || 'ankara2025';
  dbCache.staffPassword = localStorage.getItem('udf_staff_password') || 'yazi2025';
  delete dbCache.appPassword;

  sanitizeDbData(dbCache);

  // Sync sanitized data back to localStorage
  localStorage.setItem(STORAGE_KEYS.PERSONNEL, JSON.stringify(dbCache.personnel));
  localStorage.setItem('udf_alici_makamlar_v1', JSON.stringify(dbCache.aliciMakamlar));
  localStorage.setItem(STORAGE_KEYS.LEAVE_TYPES, JSON.stringify(dbCache.leaveTypes));
  localStorage.setItem(STORAGE_KEYS.SIGNATORIES, JSON.stringify(dbCache.signatories));
  localStorage.setItem(STORAGE_KEYS.LEAVE_RECORDS, JSON.stringify(dbCache.leaveRecords));

  return false;
}

/**
 * Saves current in-memory dbCache to data/db.json on disk via POST /api/db
 */
export async function syncToDiskFile() {
  delete dbCache.appPassword;
  // Always update localStorage
  localStorage.setItem(STORAGE_KEYS.PERSONNEL, JSON.stringify(dbCache.personnel));
  localStorage.setItem('udf_alici_makamlar_v1', JSON.stringify(dbCache.aliciMakamlar));
  localStorage.setItem(STORAGE_KEYS.LEAVE_TYPES, JSON.stringify(dbCache.leaveTypes));
  localStorage.setItem(STORAGE_KEYS.SIGNATORIES, JSON.stringify(dbCache.signatories));
  localStorage.setItem(STORAGE_KEYS.LEAVE_RECORDS, JSON.stringify(dbCache.leaveRecords));
  localStorage.setItem('udf_admin_password', dbCache.adminPassword);
  localStorage.setItem('udf_staff_password', dbCache.staffPassword);

  // Write to data/db.json file
  try {
    await fetch(DB_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': CLIENT_ID
      },
      body: JSON.stringify(dbCache, null, 2)
    });
  } catch (err) {
    console.error('db.json dosyasına yazılırken hata oluştu:', err);
  }
}

/**
 * Initializes real-time synchronization across LAN clients
 * @param {Function} onRemoteUpdate Callback when data is changed by another PC
 */
export function initLiveSync(onRemoteUpdate) {
  let eventSource = null;

  function connectSSE() {
    if (eventSource) eventSource.close();
    try {
      eventSource = new EventSource('/api/events');

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'db-updated') {
            if (data.sender !== CLIENT_ID) {
              onRemoteUpdate(true);
            }
          }
        } catch (err) {
          console.error('SSE mesaj ayrıştırma hatası:', err);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setTimeout(connectSSE, 5000);
      };
    } catch (e) {
      console.warn('SSE başlatılamadı:', e);
    }
  }

  connectSSE();

  // Polling fallback (every 5s check if db structure changed remotely)
  setInterval(async () => {
    try {
      const res = await fetch(DB_API_URL, { cache: 'no-store' });
      if (res.ok) {
        const remoteData = await res.json();
        if (getDbHash(remoteData) !== getDbHash(dbCache)) {
          console.log('Periyodik kontrol ile uzaktan veri değişikliği algılandı, yenileniyor...');
          onRemoteUpdate(true);
        }
      }
    } catch (e) {}
  }, 5000);

  // Tab visibility fallback
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      try {
        const res = await fetch(DB_API_URL, { cache: 'no-store' });
        if (res.ok) {
          const remoteData = await res.json();
          if (getDbHash(remoteData) !== getDbHash(dbCache)) {
            onRemoteUpdate(true);
          }
        }
      } catch (e) {}
    }
  });
}

// 1. PERSONNEL
export function getPersonnelList() {
  return dbCache.personnel;
}

export function savePersonnelList(list) {
  dbCache.personnel = list;
  syncToDiskFile();
}

// 2. LEAVE TYPES
export function getLeaveTypes() {
  return dbCache.leaveTypes;
}

export function saveLeaveTypes(types) {
  dbCache.leaveTypes = types;
  syncToDiskFile();
}

// 3. SIGNATORIES
export function getSignatories() {
  return dbCache.signatories;
}

export function saveSignatories(signers) {
  dbCache.signatories = signers;
  syncToDiskFile();
}

// 4. LEAVE RECORDS
export function getLeaveRecords() {
  return dbCache.leaveRecords;
}

export function saveLeaveRecords(records) {
  dbCache.leaveRecords = records;
  syncToDiskFile();
}

export function addLeaveRecord(record) {
  dbCache.leaveRecords.unshift(record);
  syncToDiskFile();
  return record;
}

export function updateLeaveRecord(id, updates) {
  const index = dbCache.leaveRecords.findIndex(r => r.id === id);
  if (index !== -1) {
    dbCache.leaveRecords[index] = { ...dbCache.leaveRecords[index], ...updates };
    syncToDiskFile();
    return dbCache.leaveRecords[index];
  }
  return null;
}

export function deleteLeaveRecord(id) {
  dbCache.leaveRecords = dbCache.leaveRecords.filter(r => r.id !== id);
  syncToDiskFile();
}

/**
 * Direct Export of db.json as a downloadable file
 */
export function exportDbJsonFile() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dbCache, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `db_yedek_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * Direct Import of a db.json file
 */
export function importDbJsonData(importedObject) {
  if (importedObject && Array.isArray(importedObject.personnel)) {
    dbCache = importedObject;
    if (!dbCache.adminPassword) dbCache.adminPassword = dbCache.appPassword || 'ankara2025';
    if (!dbCache.staffPassword) dbCache.staffPassword = 'yazi2025';
    syncToDiskFile();
    return true;
  }
  return false;
}

export function getAdminPasswordStored() {
  return dbCache.adminPassword || localStorage.getItem('udf_admin_password') || 'ankara2025';
}

export function setAdminPasswordStored(newPassword) {
  dbCache.adminPassword = newPassword;
  localStorage.setItem('udf_admin_password', newPassword);
  syncToDiskFile();
}

export function getStaffPasswordStored() {
  return dbCache.staffPassword || localStorage.getItem('udf_staff_password') || 'yazi2025';
}

export function setStaffPasswordStored(newPassword) {
  dbCache.staffPassword = newPassword;
  localStorage.setItem('udf_staff_password', newPassword);
  syncToDiskFile();
}

// Backward compatibility getters/setters
export function getAppPasswordStored() {
  return getAdminPasswordStored();
}

export function setAppPasswordStored(newPassword) {
  setAdminPasswordStored(newPassword);
}

export function getAliciMakamlar() {
  return dbCache.aliciMakamlar || [];
}

export function saveAliciMakamlar(list) {
  dbCache.aliciMakamlar = list;
  syncToDiskFile();
}

export function getMesaiSettingsDB() {
  return dbCache.mesaiSettings;
}

export function saveMesaiSettingsDB(settings) {
  dbCache.mesaiSettings = settings;
  syncToDiskFile();
}

export function getMesaiDataDB() {
  return dbCache.mesaiData || { mesaiShifts: {}, pastMesaiHours: {}, signatories: {} };
}

export function saveMesaiDataDB(data) {
  dbCache.mesaiData = data;
  syncToDiskFile();
}


