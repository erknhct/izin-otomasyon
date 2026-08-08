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

import { getPersonnelList, getLeaveRecords } from './storage.js';

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

  // Dini Bayramlar (2024–2028 yeterli; genişletilebilir)
  const dini = [
    '2024-04-10','2024-04-11','2024-04-12','2024-06-16','2024-06-17','2024-06-18','2024-06-19',
    '2025-03-30','2025-03-31','2025-04-01','2025-06-06','2025-06-07','2025-06-08','2025-06-09',
    '2026-03-20','2026-03-21','2026-03-22','2026-05-27','2026-05-28','2026-05-29','2026-05-30',
    '2027-03-09','2027-03-10','2027-03-11','2027-05-16','2027-05-17','2027-05-18','2027-05-19',
    '2028-02-26','2028-02-27','2028-02-28','2028-05-05','2028-05-06','2028-05-07','2028-05-08'
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
    // Aktif izinde veya geçmiş izin kaydı (başlayış tarihi geçmişte bile olsa tarih aralığında kalıyor)
    if (r.status === 'başladı') return false; // Göreve başlamış, sayılmaz

    const start = new Date(r.ayrilisDate);
    start.setHours(0, 0, 0, 0);

    // Bitiş tarihi: baslayisDate varsa bir gün önce, yoksa expectedReturnDate bir gün önce
    let endDate;
    if (r.baslayisDate) {
      endDate = new Date(r.baslayisDate);
      endDate.setDate(endDate.getDate() - 1);
    } else {
      endDate = new Date(r.expectedReturnDate);
      endDate.setDate(endDate.getDate() - 1);
    }
    endDate.setHours(0, 0, 0, 0);

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
  return mesaiData.signatories || { duzenleyen: { ad: '', unvan: '' }, tasdik: { ad: '', unvan: '' } };
}
export function saveMesaiSignatories(s) {
  mesaiData.signatories = s;
  saveMesaiData(mesaiData);
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
    <th style="width:70px; padding:6px 4px; border:1px solid var(--border-color); font-weight:800;">TOPLAM</th>
    <th style="width:70px; padding:6px 4px; border:1px solid var(--border-color);">KALAN KOTA</th>`;

  headerRow.innerHTML = headHtml;

  // Body
  let bodyHtml = '';
  let grandTotal = 0;
  let mesailiSayisi = 0;
  let toplamXCount = 0;

  personnel.forEach((p, idx) => {
    const monthTotal = getMonthMesaiHours(p.id, y, m);
    const remaining = getRemainingYearlyQuota(p.id, y, m);
    grandTotal += monthTotal;
    if (monthTotal > 0) mesailiSayisi++;

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
      <td style="text-align:center; padding:4px; border:1px solid var(--border-color); font-size:0.75rem; color:${remaining < 50 ? '#f59e0b' : 'var(--text-muted)'};">${remaining} s</td>
    </tr>`;
  });

  tbody.innerHTML = bodyHtml;

  // Özet istatistik
  const statTotal = document.getElementById('mesai-stat-total');
  const statPers = document.getElementById('mesai-stat-personnel');
  const statIzin = document.getElementById('mesai-stat-izin');
  if (statTotal) statTotal.textContent = grandTotal;
  if (statPers) statPers.textContent = mesailiSayisi;
  if (statIzin) statIzin.textContent = toplamXCount;

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
// EXCEL EXPORT — Mevcut Şablon Dosyasını Kullanarak
// ─────────────────────────────────────────────────────────
export async function exportMesaiToExcelFile(y, m, duzenleyenAd, duzenleyenUnvan, tasdikAd, tasdikUnvan) {
  if (typeof XLSX === 'undefined') { alert('Excel kütüphanesi yüklenemedi.'); return; }

  const personnel = getPersonnelList();
  const dim = getDaysInMonth(y, m);
  const titleMonth = monthNames[m - 1].toUpperCase();

  // Önce şablon dosyasını fetch et
  try {
    const res = await fetch('/public/mesai_sablon.xlsx');
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellStyles: true });

      // İlk sayfayı al (şablon)
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];

      // ── Başlık Alanlarını Güncelle ──
      // Birim satırı (E4 benzeri): BİRİMİ alanı zaten şablonda var, sadece ay/yıl güncelle
      // E6 = AY, F6 = YIL  (şablona göre ayarlıyoruz)
      const ayHucre = findCell(ws, titleMonth, y);
      if (ws['E6']) ws['E6'].v = titleMonth;
      if (ws['F6']) ws['F6'].v = y;

      // ── Gün Başlıkları (G7 → AK7) ──
      for (let d = 1; d <= 31; d++) {
        const colName = XLSX.utils.encode_col(5 + d); // G=6, H=7...
        const cellAddr = colName + '7';
        if (ws[cellAddr]) {
          ws[cellAddr].v = d <= dim ? d : '';
        }
      }

      // ── Mevcut Personel Verilerini Temizle (satır 8'den 50'ye kadar) ──
      for (let r = 8; r <= 50; r++) {
        for (let c = 0; c <= 39; c++) {
          const addr = XLSX.utils.encode_col(c) + r;
          if (ws[addr]) ws[addr].v = '';
        }
      }

      // ── Personel Verilerini Yaz ──
      personnel.forEach((p, idx) => {
        const rowNum = 8 + idx;

        if (ws['A' + rowNum]) ws['A' + rowNum].v = idx + 1;
        else ws['A' + rowNum] = { t: 'n', v: idx + 1 };

        if (ws['C' + rowNum]) ws['C' + rowNum].v = p.sicilNo ? parseInt(p.sicilNo, 10) : '';
        else ws['C' + rowNum] = { t: p.sicilNo ? 'n' : 's', v: p.sicilNo ? parseInt(p.sicilNo, 10) : '' };

        if (ws['D' + rowNum]) ws['D' + rowNum].v = p.tcNo ? parseInt(p.tcNo, 10) : '';
        else ws['D' + rowNum] = { t: p.tcNo ? 'n' : 's', v: p.tcNo ? parseInt(p.tcNo, 10) : '' };

        if (ws['E' + rowNum]) ws['E' + rowNum].v = (p.name || '').toUpperCase();
        else ws['E' + rowNum] = { t: 's', v: (p.name || '').toUpperCase() };

        if (ws['F' + rowNum]) ws['F' + rowNum].v = p.title || p.unvan || 'Zabıt Katibi';
        else ws['F' + rowNum] = { t: 's', v: p.title || p.unvan || 'Zabıt Katibi' };

        for (let d = 1; d <= 31; d++) {
          const colLtr = XLSX.utils.encode_col(5 + d);
          const addr = colLtr + rowNum;
          if (d <= dim) {
            const val = getMesaiCellValue(p.id, y, m, d);
            const isX = (val === 'X' || val === undefined || val === null || val === '');
            if (isX) {
              if (ws[addr]) ws[addr].v = 'X'; else ws[addr] = { t: 's', v: 'X' };
            } else {
              const nv = parseInt(val, 10);
              if (ws[addr]) { ws[addr].v = isNaN(nv) ? val : nv; ws[addr].t = isNaN(nv) ? 's' : 'n'; }
              else ws[addr] = { t: isNaN(nv) ? 's' : 'n', v: isNaN(nv) ? val : nv };
            }
          } else {
            if (ws[addr]) ws[addr].v = '';
            else ws[addr] = { t: 's', v: '' };
          }
        }

        // Toplam saat formülü (AL sütunu)
        const totalCol = 'AL' + rowNum;
        ws[totalCol] = { f: `SUM(G${rowNum}:AK${rowNum})`, t: 'n' };
      });

      // ── İmza Alanlarını Dinamik Yaz ──
      const lastRow = 8 + personnel.length;
      const signRow1 = lastRow + 3;
      const signRow2 = lastRow + 4;
      const signRow3 = lastRow + 5;

      setCell(ws, 'T' + signRow1, 'DÜZENLEYEN');
      setCell(ws, 'AD' + signRow1, 'TASDİK EDEN');
      setCell(ws, 'T' + signRow2, duzenleyenAd || '');
      setCell(ws, 'AD' + signRow2, tasdikAd || '');
      setCell(ws, 'T' + signRow3, duzenleyenUnvan || '');
      setCell(ws, 'AD' + signRow3, tasdikUnvan || '');

      // Sayfa adını güncelle
      const newSheetName = titleMonth + '-' + y;
      wb.SheetNames = [newSheetName];
      wb.Sheets[newSheetName] = ws;
      delete wb.Sheets[sheetName];

      XLSX.writeFile(wb, `${y} YILI MESAİ CETVELİ (${titleMonth}).xlsx`);
      return;
    }
  } catch (err) {
    console.warn('Şablon dosyası yüklenemedi, sıfırdan oluşturuluyor:', err);
  }

  // Şablon yoksa sıfırdan üret (fallback)
  exportMesaiFallback(y, m, dim, titleMonth, personnel, duzenleyenAd, duzenleyenUnvan, tasdikAd, tasdikUnvan);
}

function setCell(ws, addr, val) {
  const t = typeof val === 'number' ? 'n' : 's';
  if (ws[addr]) ws[addr].v = val; else ws[addr] = { t, v: val };
}

function findCell(ws, month, year) { return null; } // placeholder

// Fallback: Şablon olmadan yeni Excel üret
function exportMesaiFallback(y, m, dim, titleMonth, personnel, duzAd, duzUnvan, tasAd, tasUnvan) {
  const thin = { top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'} };
  const thick = { top:{style:'medium'},bottom:{style:'medium'},left:{style:'medium'},right:{style:'medium'} };
  const yellowFill = { fgColor:{rgb:'FFF2CC'}, patternType:'solid' };
  const whiteFill  = { fgColor:{rgb:'FFFFFF'}, patternType:'solid' };

  function c(val, bold, hAlign, sz, border, fill) {
    return { v: val ?? '', t: typeof val === 'number' ? 'n' : 's',
      s: { font:{name:'Calibri',sz:sz||9,bold:!!bold},
           alignment:{horizontal:hAlign||'center',vertical:'center',wrapText:true},
           border: border||thin, fill: fill||whiteFill } };
  }

  const totalCols = 40;
  const rows = [];
  // 3 boş satır
  for (let r = 0; r < 3; r++) rows.push(Array(totalCols).fill({v:'',t:'s'}));

  const r4 = Array(totalCols).fill(null).map(() => c(''));
  r4[0] = c('BİRİMİ:', true, 'left', 10, thick);
  r4[2] = c('Ankara Cumhuriyet Başsavcılığı', true, 'left', 10);
  r4[6] = c('AYLIK FAZLA ÇALIŞMA CETVELİ', true, 'center', 14, thick);
  rows.push(r4);

  const r5 = Array(totalCols).fill(null).map(() => c(''));
  r5[2] = c('İnfaz Bürosu', true, 'left', 10);
  rows.push(r5);

  const r6 = Array(totalCols).fill(null).map(() => c(''));
  r6[0] = c('AİT OLDUĞU AY:', true, 'left', 10, thick);
  r6[4] = c(titleMonth, true, 'center', 10);
  r6[5] = c(y, true, 'center', 10);
  rows.push(r6);

  const r7 = Array(totalCols).fill(null).map(() => c(''));
  r7[0] = c('S.N.', true, 'center', 8, thick);
  r7[2] = c('SİCİL NO', true, 'center', 8, thick);
  r7[3] = c('T.C. NO', true, 'center', 8, thick);
  r7[4] = c('AD SOYAD', true, 'center', 8, thick);
  r7[5] = c('UNVAN', true, 'center', 8, thick);
  for (let d = 1; d <= 31; d++) {
    const wknd = d <= dim && isWeekend(y, m, d);
    r7[5+d] = c(d <= dim ? d : '', true, 'center', 8, thick, wknd ? yellowFill : whiteFill);
  }
  r7[37] = c('TOPLAM\nSAAT', true, 'center', 8, thick);
  rows.push(r7);

  personnel.forEach((p, idx) => {
    const row = Array(totalCols).fill(null).map(() => c(''));
    row[0] = c(idx+1, true, 'center', 9, thin);
    row[2] = c(p.sicilNo ? parseInt(p.sicilNo,10) : '', false, 'center', 9, thin);
    row[3] = c(p.tcNo ? parseInt(p.tcNo,10) : '', false, 'center', 9, thin);
    row[4] = c((p.name||'').toUpperCase(), true, 'left', 9);
    row[5] = c(p.title||p.unvan||'Zabıt Katibi', false, 'center', 9);
    for (let d = 1; d <= 31; d++) {
      const wknd = d <= dim && isWeekend(y, m, d);
      if (d <= dim) {
        const val = getMesaiCellValue(p.id, y, m, d);
        const isX = (val === 'X' || val === undefined || val === null || val === '');
        row[5+d] = isX
          ? c('X', false, 'center', 9, thin, wknd ? yellowFill : whiteFill)
          : c(parseInt(val,10)||val, !isNaN(parseInt(val,10)), 'center', 9, thin, wknd ? yellowFill : whiteFill);
      } else {
        row[5+d] = c('', false, 'center', 9, thin, whiteFill);
      }
    }
    const curRowIdx = 8 + idx;
    row[37] = { f:`SUM(G${curRowIdx}:AK${curRowIdx})`, t:'n',
      s:{font:{name:'Calibri',sz:10,bold:true},alignment:{horizontal:'center',vertical:'center'},border:thin,fill:whiteFill} };
    rows.push(row);
  });

  // İmza
  rows.push(Array(totalCols).fill(null).map(() => c('')));
  const sRow1 = Array(totalCols).fill(null).map(() => c(''));
  sRow1[20] = c('DÜZENLEYEN', true, 'center', 10, thick, yellowFill);
  sRow1[30] = c('TASDİK EDEN', true, 'center', 10, thick, yellowFill);
  rows.push(sRow1);
  const sRow2 = Array(totalCols).fill(null).map(() => c(''));
  sRow2[20] = c(duzAd||'', true, 'center', 10, thin, yellowFill);
  sRow2[30] = c(tasAd||'', true, 'center', 10, thin, yellowFill);
  rows.push(sRow2);
  const sRow3 = Array(totalCols).fill(null).map(() => c(''));
  sRow3[20] = c(duzUnvan||'', false, 'center', 10, thin, yellowFill);
  sRow3[30] = c(tasUnvan||'', false, 'center', 10, thin, yellowFill);
  rows.push(sRow3);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wscols = [{wch:7},{wch:3},{wch:10},{wch:14},{wch:25},{wch:18}];
  for (let w = 0; w < 31; w++) wscols.push({wch:3.4});
  wscols.push({wch:9});
  ws['!cols'] = wscols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, titleMonth+'-'+y);
  XLSX.writeFile(wb, `${y} YILI MESAİ CETVELİ (${titleMonth}).xlsx`);
}
