/**
 * Aylık Fazla Çalışma (Mesai) Cetveli Motoru
 * nobet_mesai_app'den uyarlanmış — izin-otomasyon projesi için
 *
 * Kurallar:
 *  - Hafta içi: günlük max 4 saat
 *  - Hafta sonu: günlük max 8 saat
 *  - Aylık max 50 saat
 *  - Yıllık max 300 saat
 *  - İzinli ve resmi tatil günlerine X işlenir
 *  - İzin kenarlı hafta sonlarına X işlenir
 */

import { getPersonnelList, getLeaveRecords, getMesaiSettingsDB, saveMesaiSettingsDB } from './storage.js';

// ─────────────────────────────────────────────────────────
// STORAGE (localStorage tabanlı, hafif)
// ─────────────────────────────────────────────────────────
const MESAI_STORAGE_KEY = 'izin_otomasyon_mesai_v1';

function loadMesaiData() {
  try {
    return JSON.parse(localStorage.getItem(MESAI_STORAGE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveMesaiData(data) {
  localStorage.setItem(MESAI_STORAGE_KEY, JSON.stringify(data));
}

let mesaiData = loadMesaiData();
// { mesaiShifts: {}, pastMesaiHours: {}, signatories: { duzenleyen: {ad,unvan}, tasdik: {ad,unvan} } }

if (!mesaiData.mesaiShifts) mesaiData.mesaiShifts = {};
if (!mesaiData.pastMesaiHours) mesaiData.pastMesaiHours = {};
if (!mesaiData.signatories) mesaiData.signatories = {
  duzenleyen: { ad: '', unvan: '' },
  tasdik: { ad: '', unvan: '' }
};

// ─────────────────────────────────────────────────────────
// YARDIMCI FONKSİYONLAR
// ─────────────────────────────────────────────────────────
const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const dayNamesFull = ['PAZAR','PAZARTESİ','SALI','ÇARŞAMBA','PERŞEMBE','CUMA','CUMARTESİ'];

function fz(n) { return n < 10 ? '0' + n : '' + n; }
function getDaysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function getDayOfWeek(y, m, d) { return new Date(y, m - 1, d).getDay(); } // 0=Pazar, 6=Cmt
function isWeekend(y, m, d) { const dw = getDayOfWeek(y, m, d); return dw === 0 || dw === 6; }
function dateToStr(y, m, d) { return y + '-' + fz(m) + '-' + fz(d); }
function getKey(y, m, d, pid) { return dateToStr(y, m, d) + '_' + pid; }

// ─────────────────────────────────────────────────────────
// RESMİ TATİL KONTROLÜ (2024-2050 tüm bayramlar dahil)
// ─────────────────────────────────────────────────────────
function isOfficialHoliday(y, m, d) {
  const ds = dateToStr(y, m, d);
  const md = fz(m) + '-' + fz(d);

  // Sabit Resmi Bayramlar (yıl bağımsız MM-DD)
  const fixed = {
    '01-01': 'Yılbaşı',
    '04-23': '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı',
    '05-01': '1 Mayıs Emek ve Dayanışma Günü',
    '05-19': '19 Mayıs Atatürk\'ü Anma Bayramı',
    '07-15': '15 Temmuz Demokrasi Bayramı',
    '08-30': '30 Ağustos Zafer Bayramı',
    '10-29': '29 Ekim Cumhuriyet Bayramı'
  };
  if (fixed[md]) return true;

  // Dini Bayramlar (2024–2035 yeterli; genişletilebilir)
  const dini = [
    '2024-04-10','2024-04-11','2024-04-12','2024-06-16','2024-06-17','2024-06-18','2024-06-19',
    '2025-03-30','2025-03-31','2025-04-01','2025-06-06','2025-06-07','2025-06-08','2025-06-09',
    '2026-03-20','2026-03-21','2026-03-22','2026-05-27','2026-05-28','2026-05-29','2026-05-30',
    '2027-03-09','2027-03-10','2027-03-11','2027-05-16','2027-05-17','2027-05-18','2027-05-19',
    '2028-02-26','2028-02-27','2028-02-28','2028-05-05','2028-05-06','2028-05-07','2028-05-08',
    '2029-02-14','2029-02-15','2029-02-16','2029-02-17','2029-04-23','2029-04-24','2029-04-25','2029-04-26','2029-04-27',
    '2030-02-03','2030-02-04','2030-02-05','2030-02-06','2030-04-12','2030-04-13','2030-04-14','2030-04-15','2030-04-16',
    '2031-01-23','2031-01-24','2031-01-25','2031-01-26','2031-04-01','2031-04-02','2031-04-03','2031-04-04','2031-04-05',
    '2032-01-13','2032-01-14','2032-01-15','2032-01-16','2032-03-21','2032-03-22','2032-03-23','2032-03-24','2032-03-25',
    '2033-01-01','2033-01-02','2033-01-03','2033-01-04','2033-03-10','2033-03-11','2033-03-12','2033-03-13','2033-03-14','2033-12-22','2033-12-23','2033-12-24','2033-12-25',
    '2034-02-28','2034-03-01','2034-03-02','2034-03-03','2034-03-04','2034-12-11','2034-12-12','2034-12-13','2034-12-14',
    '2035-02-17','2035-02-18','2035-02-19','2035-02-20','2035-02-21','2035-11-30','2035-12-01','2035-12-02','2035-12-03'
  ];
  return dini.includes(ds);
}

// ─────────────────────────────────────────────────────────
// İZİN KONTROLÜ — db.json leaveRecords üzerinden
// ─────────────────────────────────────────────────────────
function isPersonOnLeave(pid, dateStr) {
  const records = getLeaveRecords();
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);

  return records.some(r => {
    if (r.personnelId !== pid) return false;
    if (!r.ayrilisDate) return false;

    const start = new Date(r.ayrilisDate);
    start.setHours(0, 0, 0, 0);

    // İzin bitiş tarihi hesabı (izinli olunan son gün):
    // 1. expectedReturnDate (göreve başlama tarihi) varsa, bir gün öncesi iznin son günüdür.
    // 2. expectedReturnDate yoksa ayrılış tarihi + gün sayısı - 1.
    // 3. Hiçbiri yoksa baslayisDate - 1.
    let endDate;
    if (r.expectedReturnDate) {
      endDate = new Date(r.expectedReturnDate);
      endDate.setDate(endDate.getDate() - 1);
    } else if (r.days) {
      endDate = new Date(r.ayrilisDate);
      endDate.setDate(endDate.getDate() + parseInt(r.days, 10) - 1);
    } else if (r.baslayisDate) {
      endDate = new Date(r.baslayisDate);
      endDate.setDate(endDate.getDate() - 1);
    } else {
      return false;
    }
    endDate.setHours(0, 0, 0, 0);

    // Eğer baslayisDate girilmişse ve expectedReturnDate ile yakın tarihlerde ise (en fazla 7 gün fark)
    // gerçek dönüş tarihini yansıtması için baslayisDate esas alınabilir.
    // Ancak baslayisDate evrak sonradan basıldığı için aylar sonraya aitse (örn: Ocak ayı iznine Ağustos'ta göreve başlayış yazılması),
    // kişinin izni aylarca uzatılmayıp planlanan expectedReturnDate esas alınır.
    if (r.baslayisDate && r.expectedReturnDate) {
      const bDate = new Date(r.baslayisDate);
      const expDate = new Date(r.expectedReturnDate);
      const diffDays = Math.abs((bDate - expDate) / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) {
        endDate = new Date(r.baslayisDate);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(0, 0, 0, 0);
      }
    }

    return target >= start && target <= endDate;
  });
}

// ─────────────────────────────────────────────────────────
// İZİN KENARLı HAFTA SONU KONTROLÜ
// ─────────────────────────────────────────────────────────
function isOffDay(pid, y, m, dayNum, dim) {
  if (dayNum < 1 || dayNum > dim) return false;
  const ds = dateToStr(y, m, dayNum);
  if (isPersonOnLeave(pid, ds)) return true;
  if (isOfficialHoliday(y, m, dayNum)) return true;
  return false;
}

function isWeekendLinkedToLeave(pid, y, m, dayNum, dim) {
  const dow = getDayOfWeek(y, m, dayNum); // 0=Pazar, 6=Cmt
  if (dow !== 0 && dow !== 6) return false;

  if (dow === 6) { // Cumartesi
    if (isOffDay(pid, y, m, dayNum - 1, dim)) return true; // Cuma izinli
    if (isOffDay(pid, y, m, dayNum + 2, dim)) return true; // Pazartesi izinli
    if (isOffDay(pid, y, m, dayNum + 1, dim)) return true; // Pazar izinli
  }
  if (dow === 0) { // Pazar
    if (isOffDay(pid, y, m, dayNum - 1, dim)) return true; // Cmt izinli/bağlı
    if (isOffDay(pid, y, m, dayNum - 2, dim)) return true; // Cuma izinli
    if (isOffDay(pid, y, m, dayNum + 1, dim)) return true; // Pzt izinli
  }
  return false;
}

// ─────────────────────────────────────────────────────────
// AYLLIK MESAİ SAAT HESAPLAMA
// ─────────────────────────────────────────────────────────
export function getMonthMesaiHours(pid, y, m) {
  let total = 0;
  const dim = getDaysInMonth(y, m);
  for (let d = 1; d <= dim; d++) {
    const val = mesaiData.mesaiShifts[getKey(y, m, d, pid)];
    if (val && val !== 'X') {
      const h = parseInt(val, 10);
      if (!isNaN(h)) total += h;
    }
  }
  return total;
}

export function getPastMesaiHours(pid, year) {
  const key = year + '_' + pid;
  const val = parseInt(mesaiData.pastMesaiHours[key] || 0, 10);
  return isNaN(val) ? 0 : val;
}

export function getYearlyMesaiHours(pid, year, upToMonth) {
  const maxM = upToMonth !== undefined ? upToMonth : 12;
  let total = getPastMesaiHours(pid, year);
  for (let m = 1; m <= maxM; m++) {
    total += getMonthMesaiHours(pid, year, m);
  }
  return total;
}

export function getRemainingYearlyQuota(pid, year, upToMonth) {
  const YEARLY_LIMIT = 300;
  return Math.max(0, YEARLY_LIMIT - getYearlyMesaiHours(pid, year, upToMonth));
}

// ─────────────────────────────────────────────────────────
// OTOMATİK CETVEL OLUŞTURMA MOTORU
// ─────────────────────────────────────────────────────────
export function generateMesaiForMonth(y, m, globalTarget) {
  const target = Math.min(50, Math.max(1, parseInt(globalTarget, 10) || 45));
  const dim = getDaysInMonth(y, m);
  const personnel = getPersonnelList();

  // Bu ayın mevcut shift'lerini temizle
  const prefix = dateToStr(y, m, 1).substring(0, 7) + '-'; // "2026-08-"
  Object.keys(mesaiData.mesaiShifts).forEach(k => {
    if (k.startsWith(prefix)) delete mesaiData.mesaiShifts[k];
  });

  personnel.forEach(p => {
    const pid = p.id;

    // Yıllık kota kontrolü
    const ytdPrior = getYearlyMesaiHours(pid, y, m - 1);
    const remainingYearly = Math.max(0, 300 - ytdPrior);
    const effectiveCap = Math.min(target, 50, remainingYearly);

    if (effectiveCap <= 0) {
      // Kotası dolmuş: tüm günlere X
      for (let d = 1; d <= dim; d++) {
        mesaiData.mesaiShifts[getKey(y, m, d, pid)] = 'X';
      }
      return;
    }

    const eligibleWeekdays = [];
    const eligibleWeekends = [];

    for (let d = 1; d <= dim; d++) {
      const dow = getDayOfWeek(y, m, d);
      const off = isOffDay(pid, y, m, d, dim);
      const wkndConn = isWeekendLinkedToLeave(pid, y, m, d, dim);

      if (off || wkndConn) {
        mesaiData.mesaiShifts[getKey(y, m, d, pid)] = 'X';
      } else if (dow === 0 || dow === 6) {
        eligibleWeekends.push(d);
      } else {
        eligibleWeekdays.push(d);
      }
    }

    let assignedHours = 0;

    // Hafta içi günlere önce dağıt (günlük 2–4 saat)
    const weekdayBase = Math.max(2, Math.min(4, Math.floor(effectiveCap / Math.max(1, eligibleWeekdays.length))));
    eligibleWeekdays.forEach(d => {
      if (assignedHours < effectiveCap) {
        const h = Math.min(4, weekdayBase, effectiveCap - assignedHours);
        mesaiData.mesaiShifts[getKey(y, m, d, pid)] = h;
        assignedHours += h;
      } else {
        mesaiData.mesaiShifts[getKey(y, m, d, pid)] = 'X';
      }
    });

    // Kalan saatleri hafta içine tamamlayıcı olarak dağıt (4 saate kadar doldur)
    if (assignedHours < effectiveCap) {
      for (let i = 0; i < eligibleWeekdays.length && assignedHours < effectiveCap; i++) {
        const d = eligibleWeekdays[i];
        const cur = parseInt(mesaiData.mesaiShifts[getKey(y, m, d, pid)], 10) || 0;
        if (cur < 4) {
          const add = Math.min(4 - cur, effectiveCap - assignedHours);
          mesaiData.mesaiShifts[getKey(y, m, d, pid)] = cur + add;
          assignedHours += add;
        }
      }
    }

    // Hâlâ kalan saatleri hafta sonuna dağıt (günlük max 8 saat)
    if (assignedHours < effectiveCap) {
      for (let wi = 0; wi < eligibleWeekends.length && assignedHours < effectiveCap; wi++) {
        const wd = eligibleWeekends[wi];
        const add = Math.min(8, effectiveCap - assignedHours);
        mesaiData.mesaiShifts[getKey(y, m, wd, pid)] = add;
        assignedHours += add;
      }
    }

    // Hiç değer atanmamış günleri X yap
    for (let d = 1; d <= dim; d++) {
      if (mesaiData.mesaiShifts[getKey(y, m, d, pid)] === undefined) {
        mesaiData.mesaiShifts[getKey(y, m, d, pid)] = 'X';
      }
    }
  });

  saveMesaiData(mesaiData);
}

export function hasMesaiDataForMonth(y, m) {
  const prefix = dateToStr(y, m, 1).substring(0, 7) + '-';
  return Object.keys(mesaiData.mesaiShifts).some(k => k.startsWith(prefix));
}

// ─────────────────────────────────────────────────────────
// MANUEL HÜCRE GÜNCELLEMESİ
// ─────────────────────────────────────────────────────────
export function updateMesaiCell(pid, y, m, d, newVal) {
  const key = getKey(y, m, d, pid);
  const val = String(newVal).trim().toUpperCase();
  if (val === '' || val === 'X') {
    mesaiData.mesaiShifts[key] = 'X';
  } else {
    const h = parseInt(val, 10);
    if (!isNaN(h) && h >= 0 && h <= 8) {
      mesaiData.mesaiShifts[key] = h;
    }
  }
  saveMesaiData(mesaiData);
}

// ─────────────────────────────────────────────────────────
// AYIN TÜM VERİSİNİ SİL
// ─────────────────────────────────────────────────────────
export function clearMesaiForMonth(y, m) {
  const prefix = dateToStr(y, m, 1).substring(0, 7) + '-';
  Object.keys(mesaiData.mesaiShifts).forEach(k => {
    if (k.startsWith(prefix)) delete mesaiData.mesaiShifts[k];
  });
  saveMesaiData(mesaiData);
}

// ─────────────────────────────────────────────────────────
// HÜCRE DEĞERİ OKU
// ─────────────────────────────────────────────────────────
export function getMesaiCellValue(pid, y, m, d) {
  return mesaiData.mesaiShifts[getKey(y, m, d, pid)];
}

// ─────────────────────────────────────────────────────────
// İMZA ALANI KAYDET / OKU
// ─────────────────────────────────────────────────────────
export function getMesaiSignatories() {
  const settings = getMesaiSettingsDB();
  return {
    duzenleyen: settings?.duzenleyen || { ad: '', unvan: '' },
    tasdik: settings?.tasdik || { ad: '', unvan: '' }
  };
}
export function saveMesaiSignatories(s) {
  const settings = getMesaiSettingsDB() || { targetHours: 50 };
  settings.duzenleyen = s.duzenleyen;
  settings.tasdik = s.tasdik;
  saveMesaiSettingsDB(settings);
}

// ─────────────────────────────────────────────────────────
// CETVEL TABLOSU RENDER (UI)
// ─────────────────────────────────────────────────────────
export function renderMesaiTable(y, m) {
  const headerRow = document.getElementById('mesai-table-header');
  const tbody = document.getElementById('mesai-table-body');
  const emptyDiv = document.getElementById('mesai-table-empty');
  if (!headerRow || !tbody) return;

  const personnel = getPersonnelList();
  const dim = getDaysInMonth(y, m);

  // Header
  let headHtml = `
    <th style="width:32px; padding:6px 4px; border:1px solid var(--border-color); text-align:center;">S.N.</th>
    <th style="min-width:65px; padding:6px 4px; border:1px solid var(--border-color);">SİCİL NO</th>
    <th style="min-width:170px; padding:6px 4px; border:1px solid var(--border-color); text-align:left;">AD SOYAD</th>
    <th style="min-width:90px; padding:6px 4px; border:1px solid var(--border-color);">UNVAN</th>`;

  for (let d = 1; d <= dim; d++) {
    const wknd = isWeekend(y, m, d);
    const hol = isOfficialHoliday(y, m, d);
    const dow = getDayOfWeek(y, m, d);
    const dayAbbr = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'][dow];
    let bg = wknd ? 'background:rgba(251,191,36,0.12); color:var(--text-muted);' :
             hol  ? 'background:rgba(239,68,68,0.12); color:#ef4444;' : '';
    headHtml += `<th style="width:28px; padding:4px 2px; border:1px solid var(--border-color); text-align:center; font-size:0.7rem; ${bg}" title="${dayAbbr}">
      <div style="font-weight:800;">${d}</div>
      <div style="font-size:0.62rem; opacity:0.7;">${dayAbbr}</div>
    </th>`;
  }

  headHtml += `
    <th style="width:70px; padding:6px 4px; border:1px solid var(--border-color); font-weight:800;">TOPLAM</th>`;

  headerRow.innerHTML = headHtml;

  // Body
  let bodyHtml = '';
  let grandTotal = 0;
  let mesailiSayisi = 0;
  let toplamXCount = 0;
  let incompleteNames = [];
  
  const targetEl = document.getElementById('mesai-global-target');
  const globalTarget = targetEl ? parseInt(targetEl.value, 10) : 50;

  personnel.forEach((p, idx) => {
    const monthTotal = getMonthMesaiHours(p.id, y, m);
    const remaining = getRemainingYearlyQuota(p.id, y, m);
    grandTotal += monthTotal;
    if (monthTotal > 0) mesailiSayisi++;
    if (monthTotal < globalTarget) incompleteNames.push(p.name);

    const totalStyle = monthTotal > 50
      ? 'color:#ef4444; font-weight:800;'
      : monthTotal > 0
        ? 'color:var(--accent-primary); font-weight:800;'
        : 'color:var(--text-muted);';

    bodyHtml += `<tr style="border-bottom:1px solid var(--border-color);">
      <td style="text-align:center; padding:4px; border:1px solid var(--border-color); font-size:0.78rem;">${idx+1}</td>
      <td style="text-align:center; padding:4px; border:1px solid var(--border-color); font-size:0.75rem; font-weight:600;">${p.sicilNo || '---'}</td>
      <td style="padding:4px 8px; border:1px solid var(--border-color); font-weight:700; font-size:0.8rem;">${escapeHtml(p.name || '')}</td>
      <td style="padding:4px 6px; border:1px solid var(--border-color); font-size:0.72rem; color:var(--text-muted);">${escapeHtml(p.title || p.unvan || 'Zabıt Katibi')}</td>`;

    for (let d = 1; d <= dim; d++) {
      const val = getMesaiCellValue(p.id, y, m, d);
      const wknd = isWeekend(y, m, d);
      const hol = isOfficialHoliday(y, m, d);
      const isX = (val === 'X' || val === undefined || val === null || val === '');
      const dispVal = isX ? 'X' : val;
      if (isX) toplamXCount++;

      let cellStyle = wknd ? 'background:rgba(251,191,36,0.08);' :
                     hol  ? 'background:rgba(239,68,68,0.08);' : '';
      let textStyle = isX
        ? 'color:rgba(239,68,68,0.5); font-size:0.7rem;'
        : 'color:var(--text-main); font-weight:700; font-size:0.78rem;';

      bodyHtml += `<td style="text-align:center; padding:2px 1px; border:1px solid var(--border-color); cursor:pointer; ${cellStyle}"
        onclick="mesaiCellEdit('${p.id}',${y},${m},${d},this)"
        title="${p.name} — ${d} ${monthNames[m-1]}">
        <span style="${textStyle}">${dispVal === undefined || dispVal === null ? 'X' : dispVal}</span>
      </td>`;
    }

    bodyHtml += `
      <td style="text-align:center; padding:4px; border:1px solid var(--border-color); ${totalStyle}">${monthTotal > 0 ? monthTotal + ' s' : '—'}</td>
    </tr>`;
  });

  tbody.innerHTML = bodyHtml;

  // Özet istatistik
  const statTotal = document.getElementById('mesai-stat-total');
  const statPers = document.getElementById('mesai-stat-personnel');
  const statIzin = document.getElementById('mesai-stat-izin');
  const statIncomplete = document.getElementById('mesai-stat-incomplete');
  const statIncompleteNames = document.getElementById('mesai-stat-incomplete-names');
  if (statTotal) statTotal.textContent = grandTotal;
  if (statPers) statPers.textContent = mesailiSayisi;
  if (statIzin) statIzin.textContent = toplamXCount;
  if (statIncomplete) statIncomplete.textContent = incompleteNames.length;
  if (statIncompleteNames) {
    if (incompleteNames.length > 0) {
      statIncompleteNames.innerHTML = incompleteNames.map(n => `• ${escapeHtml(n)}`).join('<br>');
    } else {
      statIncompleteNames.innerHTML = '<span style="color:#10b981;">Herkes hedefe ulaştı! 🎉</span>';
    }
  }

  // Boş durum
  const hasAnyData = Object.keys(mesaiData.mesaiShifts).some(k => k.startsWith(dateToStr(y, m, 1).substring(0, 7)));
  if (emptyDiv) emptyDiv.style.display = hasAnyData || personnel.length > 0 ? 'none' : 'block';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────────────────
// YAZDIRMA
// ─────────────────────────────────────────────────────────
export function printMesaiView(y, m, duzenleyenAd, duzenleyenUnvan, tasdikAd, tasdikUnvan) {
  const personnel = getPersonnelList();
  const dim = getDaysInMonth(y, m);
  const titleText = `${monthNames[m-1].toUpperCase()} ${y} AYLIK FAZLA ÇALIŞMA CETVELİ`;

  // Header row
  let headCols = `<th>S.N.</th><th>SİCİL NO</th><th style="text-align:left;">AD SOYAD</th><th>UNVAN</th>`;
  for (let d = 1; d <= dim; d++) {
    const wknd = isWeekend(y, m, d);
    const dow = getDayOfWeek(y, m, d);
    const abbr = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'][dow];
    headCols += `<th style="${wknd ? 'background:#fff2cc;' : ''}">${d}<br><small>${abbr}</small></th>`;
  }
  headCols += `<th>TOPLAM</th>`;

  let rows = '';
  personnel.forEach((p, idx) => {
    let cells = `<td style="text-align:center;">${idx+1}</td>
      <td style="text-align:center;">${p.sicilNo || '---'}</td>
      <td style="text-align:left; font-weight:bold;">${escapeHtml(p.name || '')}</td>
      <td>${escapeHtml(p.title || p.unvan || 'Zabıt Katibi')}</td>`;
    let total = 0;
    for (let d = 1; d <= dim; d++) {
      const val = getMesaiCellValue(p.id, y, m, d);
      const wknd = isWeekend(y, m, d);
      const isX = (val === 'X' || val === undefined || val === null || val === '');
      const h = isX ? 0 : (parseInt(val, 10) || 0);
      total += h;
      cells += `<td style="text-align:center; ${wknd ? 'background:#fff2cc;' : ''} ${isX ? 'color:#ccc;' : 'font-weight:bold;'}">${isX ? 'X' : val}</td>`;
    }
    cells += `<td style="text-align:center; font-weight:bold;">${total > 0 ? total : ''}</td>`;
    rows += `<tr>${cells}</tr>`;
  });

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${titleText}</title>
<style>
* { box-sizing:border-box; }
body { font-family:'Calibri',Arial,sans-serif; padding:12px 18px; color:#000; background:#fff; margin:0; font-size:8pt; }
.hdr { text-align:center; margin-bottom:10px; border-bottom:2px solid #000; padding-bottom:6px; }
.hdr h2 { margin:0; font-size:13pt; font-weight:bold; }
.hdr h3 { margin:2px 0; font-size:10.5pt; }
.hdr h4 { margin:2px 0; font-size:9.5pt; }
table { width:100%; border-collapse:collapse; font-size:7.5pt; }
th,td { border:1px solid #000; padding:2px 3px; text-align:center; }
th { background:#f2f2f2; font-weight:bold; }
.sign-area { margin-top:30px; display:flex; justify-content:space-around; }
.sign-box { text-align:center; min-width:200px; border:1px solid #000; padding:8px 16px; }
.sign-name { font-weight:bold; font-size:10pt; }
.sign-title { font-size:9pt; }
@media print { @page { size:A4 landscape; margin:8mm 10mm; } body { padding:0; } }
</style></head>
<body onload="window.print()">
<div class="hdr">
  <h2>T.C. ANKARA ADLİYESİ</h2>
  <h3>AYLIK FAZLA ÇALIŞMA (MESAİ) CETVELİ</h3>
  <h4>${titleText}</h4>
</div>
<table>
  <thead><tr>${headCols}</tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="sign-area">
  <div class="sign-box">
    <div style="font-size:8pt; color:#555; margin-bottom:4px;">DÜZENLEYEN</div>
    <div class="sign-name">${escapeHtml(duzenleyenAd || '___________________')}</div>
    <div class="sign-title">${escapeHtml(duzenleyenUnvan || '')}</div>
  </div>
  <div class="sign-box">
    <div style="font-size:8pt; color:#555; margin-bottom:4px;">TASDİK EDEN</div>
    <div class="sign-name">${escapeHtml(tasdikAd || '___________________')}</div>
    <div class="sign-title">${escapeHtml(tasdikUnvan || '')}</div>
  </div>
</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const pw = window.open(url, '_blank');
  if (!pw) alert('Lütfen açılır pencerelere izin veriniz.');
}

// ─────────────────────────────────────────────────────────
// EXCEL EXPORT — Mevcut Şablon Dosyasını Kullanarak (ExcelJS ile)
// ─────────────────────────────────────────────────────────
export async function exportMesaiToExcelFile(y, m, duzenleyenAd, duzenleyenUnvan, tasdikAd, tasdikUnvan) {
  if (typeof ExcelJS === 'undefined') { alert('Excel kütüphanesi yüklenemedi. Lütfen sayfayı yenileyin.'); return; }

  const personnel = getPersonnelList();
  const dim = getDaysInMonth(y, m);
  const titleMonth = monthNames[m - 1].toUpperCase();

  // Şablon dosyasını fetch et (Vite public klasöründeki dosyalar root'tan sunulur)
  let res = await fetch('/mesai_sablon.xlsx');
  if (!res.ok) {
    res = await fetch('/public/mesai_sablon.xlsx'); // Fallback
  }

  if (res.ok) {
    try {
      const buf = await res.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buf);

      // İlk sayfayı al
      const ws = workbook.worksheets[0];

      // ── Başlık Alanlarını Güncelle ──
      // E6 = AY, F6 = YIL
      ws.getCell('E6').value = titleMonth;
      ws.getCell('F6').value = y;

      // ── Gün Başlıkları (G7 → AK7) ──
      // ExcelJS'de sütunlar 1-indekslidir. G sütunu = 7.
      for (let d = 1; d <= 31; d++) {
        const colIdx = 6 + d; // G=7, H=8 vb.
        const cell = ws.getCell(7, colIdx);
        cell.value = d <= dim ? d : '';
      }

      // ── Yeni Personeller İçin Satır Ekle (Şablonun Düzenini Bozmamak İçin) ──
      const shiftCount = personnel.length > 1 ? personnel.length - 1 : 0;
      
      if (shiftCount > 0) {
        // ExcelJS'in paylaşılan (shared) formülleri kopyalarken dosyayı bozmasını engelle
        for(let c = 1; c <= 50; c++) {
          const cell = ws.getCell(8, c);
          if (cell.value && cell.value.shareType === 'shared') {
            cell.value = { formula: cell.value.formula };
          }
        }

        // Eski merge'leri (birleştirmeleri) bul ve güvenli bir şekilde iptal et (unMerge)
        const oldMerges = [];
        if (ws.model && Array.isArray(ws.model.merges)) {
          oldMerges.push(...ws.model.merges);
        }
        oldMerges.forEach(m => {
          try { ws.unMergeCells(m); } catch(e) {}
        });

        // 8. satırı personeller için çoğalt
        ws.duplicateRow(8, shiftCount, true);
        
        // Merge'leri (birleştirmeleri) yeni satır numaralarıyla tekrar oluştur
        oldMerges.forEach(mStr => {
          const match = mStr.match(/([a-zA-Z]+)(\d+):([a-zA-Z]+)(\d+)/);
          if (match) {
            let r1 = parseInt(match[2], 10);
            let r2 = parseInt(match[4], 10);
            // "Sayfa Toplamı", "Genel Toplam" ve "İmzalar" 9. satır ve sonrasındadır
            if (r1 >= 9) r1 += shiftCount;
            if (r2 >= 9) r2 += shiftCount;
            const newMerge = `${match[1]}${r1}:${match[3]}${r2}`;
            try { ws.mergeCells(newMerge); } catch(e) {}
          }
        });

        // Yazdırma alanını (Print Area) dinamik olarak genişlet (Eksik çıkmasını önlemek için)
        if (ws.pageSetup && typeof ws.pageSetup.printArea === 'string') {
          ws.pageSetup.printArea = ws.pageSetup.printArea.replace(/\d+$/, (match) => {
            return parseInt(match, 10) + shiftCount;
          });
        }
      }

      // ── Çoğaltılan Satırların İçeriğini Temizle ──
      // template'den gelen "1" vb. kalıntıları silmek için değerleri null yapıyoruz (stiller kalır)
      for (let r = 8; r < 8 + (personnel.length || 1); r++) {
        for (let c = 1; c <= 40; c++) {
          ws.getCell(r, c).value = null;
        }
      }

      // ── Personel Verilerini Yaz ──
      personnel.forEach((p, idx) => {
        const rowNum = 8 + idx;
        const sicilVal = p.sicil || p.sicilNo || '';
        const parsedSicil = parseInt(sicilVal, 10);

        ws.getCell('A' + rowNum).value = idx + 1;
        ws.getCell('C' + rowNum).value = !isNaN(parsedSicil) && parsedSicil > 0 ? parsedSicil : sicilVal;
        ws.getCell('D' + rowNum).value = p.tcNo ? parseInt(p.tcNo, 10) : (p.tc || '');
        ws.getCell('E' + rowNum).value = (p.name || '').toUpperCase();
        ws.getCell('F' + rowNum).value = p.title || p.unvan || 'Zabıt Katibi';

        for (let d = 1; d <= 31; d++) {
          const colIdx = 6 + d; 
          const cell = ws.getCell(rowNum, colIdx);
          
          if (d <= dim) {
            const val = getMesaiCellValue(p.id, y, m, d);
            const isX = (val === 'X' || val === undefined || val === null || val === '');
            if (isX) {
              cell.value = 'X';
            } else {
              const nv = parseInt(val, 10);
              cell.value = isNaN(nv) ? val : nv;
            }
          } else {
            cell.value = '';
          }
        }

        // Toplam saat formülü (AL sütunu = 38. sütun)
        ws.getCell('AL' + rowNum).value = { formula: `SUM(G${rowNum}:AK${rowNum})` };
      });

      // ── İmza Alanlarını Dinamik Yaz (Şablondaki Kendi Konumlarına) ──
      const signNameRow = 12 + shiftCount;
      const signTitleRow = 13 + shiftCount;

      ws.getCell('K' + signNameRow).value = duzenleyenAd || '';
      ws.getCell('K' + signTitleRow).value = duzenleyenUnvan || '';
      
      ws.getCell('AE' + signNameRow).value = tasdikAd || '';
      ws.getCell('AE' + signTitleRow).value = tasdikUnvan || '';

      // Sayfa adını güncelle
      ws.name = `${titleMonth}-${y}`;

      // ── Dosyayı İndir ──
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${y} YILI MESAİ CETVELİ (${titleMonth}).xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      return;
    } catch (err) {
      console.error('Şablon dosyası işlenirken hata oluştu:', err);
      alert('Şablon dosyası işlenirken hata oluştu. Lütfen şablonun geçerli bir Excel (.xlsx) dosyası olduğundan emin olun.');
    }
  } else {
    alert('Şablon dosyası bulunamadı! Lütfen public klasöründe boş bir "mesai_sablon.xlsx" dosyası olduğundan emin olun.');
  }
}
