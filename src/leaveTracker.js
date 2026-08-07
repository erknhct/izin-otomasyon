import { getLeaveRecords, updateLeaveRecord } from './storage.js';
import { formatDateTR } from './udfGenerator.js';

/**
 * Calculates expected return date based on start date and number of days.
 * If expected return lands on Saturday or Sunday, moves to Monday.
 */
export function calculateExpectedReturn(startDateStr, days) {
  if (!startDateStr || !days) return '';
  const d = new Date(startDateStr);
  if (isNaN(d.getTime())) return '';
  
  // Add days
  d.setDate(d.getDate() + parseInt(days, 10));
  
  // If Saturday (6), add 2 days -> Monday
  if (d.getDay() === 6) {
    d.setDate(d.getDate() + 2);
  } else if (d.getDay() === 0) { // If Sunday (0), add 1 day -> Monday
    d.setDate(d.getDate() + 1);
  }
  
  return d.toISOString().split('T')[0];
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
