import { getLeaveRecords, updateLeaveRecord } from './storage.js';
import { formatDateTR } from './udfGenerator.js';

/**
 * List of fixed and moveable official public holidays in Turkey
 */
export function isWeekendOrHoliday(date) {
  const dayOfWeek = date.getDay(); // 0: Sunday, 6: Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const monthDay = `${month}-${day}`;

  // Fixed yearly official holidays in Turkey
  const fixedHolidays = [
    '01-01', // Yılbaşı (1 Ocak)
    '04-23', // Ulusal Egemenlik ve Çocuk Bayramı (23 Nisan)
    '05-01', // Emek ve Dayanışma Günü (1 Mayıs)
    '05-19', // Atatürk'ü Anma, Gençlik ve Spor Bayramı (19 Mayıs)
    '07-15', // Demokrasi ve Milli Birlik Günü (15 Temmuz)
    '08-30', // Zafer Bayramı (30 Ağustos)
    '10-29'  // Cumhuriyet Bayramı (29 Ekim)
  ];

  if (fixedHolidays.includes(monthDay)) return true;

  // Moveable religious holidays (YYYY-MM-DD)
  const fullDateStr = date.toISOString().split('T')[0];
  const moveableHolidays = [
    // 2026
    '2026-03-20', '2026-03-21', '2026-03-22', // Ramazan Bayramı 2026
    '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', // Kurban Bayramı 2026
    // 2027
    '2027-03-09', '2027-03-10', '2027-03-11', // Ramazan Bayramı 2027
    '2027-05-16', '2027-05-17', '2027-05-18', '2027-05-19' // Kurban Bayramı 2027
  ];

  if (moveableHolidays.includes(fullDateStr)) return true;

  return false;
}

/**
 * Determines whether the return shift was caused by a Public Holiday or a Weekend
 * Returns 'resmi tatili müteakiben', 'hafta sonunu müteakip', or ''
 */
export function getReturnReasonNotu(startDateStr, days) {
  if (!startDateStr || !days) return 'hafta sonunu müteakip';
  const d = new Date(startDateStr);
  if (isNaN(d.getTime())) return 'hafta sonunu müteakip';

  d.setDate(d.getDate() + parseInt(days, 10));

  let hitHoliday = false;
  let hitWeekend = false;

  while (isWeekendOrHoliday(d)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      hitWeekend = true;
    } else {
      hitHoliday = true; // Weekday public holiday
    }
    d.setDate(d.getDate() + 1);
  }

  if (hitHoliday) {
    return 'resmi tatili müteakiben';
  } else if (hitWeekend) {
    return 'hafta sonunu müteakip';
  }
  return '';
}

/**
 * Calculates expected return date based on start date and number of days.
 * Automatically shifts return date past Weekends AND Official Public Holidays to the first working day.
 */
export function calculateExpectedReturn(startDateStr, days) {
  if (!startDateStr || !days) return '';
  const d = new Date(startDateStr);
  if (isNaN(d.getTime())) return '';
  
  // Add leave days
  d.setDate(d.getDate() + parseInt(days, 10));

  // Loop while the calculated return date falls on a Weekend or Official Public Holiday
  while (isWeekendOrHoliday(d)) {
    d.setDate(d.getDate() + 1);
  }

  return d.toISOString().split('T')[0];
}

/**
 * Calculates number of leave days in reverse based on start date and chosen return date.
 */
export function calculateDaysFromReturn(startDateStr, returnDateStr) {
  if (!startDateStr || !returnDateStr) return 1;
  const start = new Date(startDateStr);
  const ret = new Date(returnDateStr);
  if (isNaN(start.getTime()) || isNaN(ret.getTime())) return 1;
  if (ret <= start) return 1;

  const rawDiff = Math.round((ret - start) / (1000 * 60 * 60 * 24));
  if (rawDiff <= 0) return 1;

  // Find smallest d where calculateExpectedReturn matches returnDateStr
  for (let d = 1; d <= rawDiff; d++) {
    if (calculateExpectedReturn(startDateStr, d) === returnDateStr) {
      return d;
    }
  }

  return rawDiff;
}

/**
 * Checks if a personnel already has an active or overlapping leave record in the same date range
 */
export function checkLeaveConflict(personnelId, ayrilisDate, expectedReturnDate, excludeRecordId = null) {
  const records = getLeaveRecords();
  return records.find(r => {
    if (excludeRecordId && r.id === excludeRecordId) return false;
    if (r.personnelId !== personnelId) return false;
    
    const existingStart = r.ayrilisDate;
    const existingEnd = r.expectedReturnDate;
    
    if (!existingStart || !existingEnd) return false;

    // Check date overlap: (StartA <= EndB) and (EndA >= StartB)
    const isOverlap = (ayrilisDate <= existingEnd && expectedReturnDate >= existingStart);
    return isOverlap ? r : null;
  });
}

/**
 * Returns active leave records that require return (başlayış) document creation.
 * Evaluates records where status === 'ayrilis_yapildi'
 */
export function getPendingReturnRecords() {
  const records = getLeaveRecords();
  const today = new Date().toISOString().split('T')[0];
  
  return records.filter(r => {
    if (r.status !== 'ayrilis_yapildi') return false;
    if (r.hiddenFromDashboard) return false;
    return true;
  }).map(r => {
    const isDue = r.expectedReturnDate <= today;
    return {
      ...r,
      isDue
    };
  }).sort((a, b) => (a.expectedReturnDate > b.expectedReturnDate ? 1 : -1));
}

/**
 * Returns statistics for dashboard
 */
export function getDashboardStats() {
  const records = getLeaveRecords();
  const activeLeaves = records.filter(r => r.status === 'ayrilis_yapildi');
  const pendingReturns = getPendingReturnRecords();
  const completedReturns = records.filter(r => r.status === 'baslayis_yapildi');
  
  return {
    totalActiveLeaves: activeLeaves.length,
    pendingReturnsCount: pendingReturns.length,
    completedCount: completedReturns.length,
    totalRecords: records.length
  };
}
