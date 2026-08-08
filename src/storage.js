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
  leaveTypes: [],
  signatories: [],
  leaveRecords: [],
  appPassword: 'ankara2025'
};

/**
 * Initializes database by reading data/db.json from backend API
 */
export async function initStorage() {
  try {
    const res = await fetch(DB_API_URL);
    if (res.ok) {
      const data = await res.json();
      if (data.personnel && Array.isArray(data.personnel)) {
        dbCache = data;
        if (!dbCache.appPassword) dbCache.appPassword = 'ankara2025';
        if (dbCache.leaveRecords && Array.isArray(dbCache.leaveRecords)) {
          dbCache.leaveRecords.forEach(r => delete r.raporKurum);
        }
        // Sync to localStorage
        localStorage.setItem(STORAGE_KEYS.PERSONNEL, JSON.stringify(dbCache.personnel));
        localStorage.setItem(STORAGE_KEYS.LEAVE_TYPES, JSON.stringify(dbCache.leaveTypes));
        localStorage.setItem(STORAGE_KEYS.SIGNATORIES, JSON.stringify(dbCache.signatories));
        localStorage.setItem(STORAGE_KEYS.LEAVE_RECORDS, JSON.stringify(dbCache.leaveRecords));
        return true;
      }
    }
  } catch (err) {
    console.warn('API db.json okunamadı, localStorage kullanılıyor:', err);
  }

  // Fallback to localStorage
  dbCache.personnel = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERSONNEL) || '[]');
  dbCache.leaveTypes = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEAVE_TYPES) || '[]');
  dbCache.signatories = JSON.parse(localStorage.getItem(STORAGE_KEYS.SIGNATORIES) || '[]');
  dbCache.leaveRecords = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEAVE_RECORDS) || '[]');
  if (dbCache.leaveRecords && Array.isArray(dbCache.leaveRecords)) {
    dbCache.leaveRecords.forEach(r => delete r.raporKurum);
  }
  dbCache.appPassword = localStorage.getItem('udf_app_password') || 'ankara2025';
  return false;
}

/**
 * Saves current in-memory dbCache to data/db.json on disk via POST /api/db
 */
export async function syncToDiskFile() {
  // Always update localStorage
  localStorage.setItem(STORAGE_KEYS.PERSONNEL, JSON.stringify(dbCache.personnel));
  localStorage.setItem(STORAGE_KEYS.LEAVE_TYPES, JSON.stringify(dbCache.leaveTypes));
  localStorage.setItem(STORAGE_KEYS.SIGNATORIES, JSON.stringify(dbCache.signatories));
  localStorage.setItem(STORAGE_KEYS.LEAVE_RECORDS, JSON.stringify(dbCache.leaveRecords));

  // Write to data/db.json file
  try {
    await fetch(DB_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbCache, null, 2)
    });
  } catch (err) {
    console.error('db.json dosyasına yazılırken hata oluştu:', err);
  }
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
    syncToDiskFile();
    return true;
  }
  return false;
}

export function getAppPasswordStored() {
  return dbCache.appPassword || localStorage.getItem('udf_app_password') || 'ankara2025';
}

export function setAppPasswordStored(newPassword) {
  dbCache.appPassword = newPassword;
  localStorage.setItem('udf_app_password', newPassword);
  syncToDiskFile();
}
