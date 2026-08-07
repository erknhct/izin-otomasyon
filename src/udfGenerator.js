import JSZip from 'jszip';

/**
 * Converts numbers (e.g. 4, 11) to Turkish text representation (e.g. "Dört", "Onbir")
 */
export function numberToTurkishText(num) {
  const n = parseInt(num, 10);
  if (isNaN(n)) return num.toString();
  
  const units = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
  const tens = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
  
  if (n === 0) return 'Sıfır';
  if (n < 10) return units[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return tens[t] + (u > 0 ? units[u].toLowerCase() : '');
  }
  return n.toString();
}

/**
 * Formats a date string (YYYY-MM-DD) to Turkish format (DD.MM.YYYY)
 */
export function formatDateTR(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('.')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

/**
 * Converts unicode string to RTF Unicode escape format (\uN?)
 */
function toRtfUnicode(str) {
  if (!str) return '';
  return str.split('').map(char => {
    const code = char.charCodeAt(0);
    if (code > 127) {
      return `\\u${code}?`;
    }
    return char;
  }).join('');
}

/**
 * Generates RTF (Rich Text Format) text for UYAP Editor Java Swing RTFEditorKit
 */
export function generateRtfText(payload) {
  const {
    docType,
    personnelName,
    sicilNo,
    unvan,
    birim = 'Bilgi İşlem Müdürlüğü',
    tarih = formatDateTR(new Date().toISOString().split('T')[0]),
    izinSuresi = 5,
    ayrilisTarihi = tarih,
    baslayisTarihi = tarih,
    raporKurum = 'Sağlık Bakanlığı Ankara Etlik Şehir Hastanesi',
    ilgiEvrak = '',
    aliciMakam = 'komisyon',
    aliciMakamOzel = '',
    imzalayanAd = 'Dr. Arif Naci SUCUOĞLU',
    imzalayanUnvan = 'Cumhuriyet Başsavcı Vekili',
    ekBelge = 'Rapor (1 Sayfa)',
    donusNotu = ''
  } = payload;

  const gunMetni = `${izinSuresi} (${numberToTurkishText(izinSuresi)})`;

  let destTitleLines = [];
  let closingSentence = "Bilgilerinize arz olunur.";

  if (aliciMakam === 'komisyon') {
    destTitleLines = [
      "ANKARA ADLÎ YARGI",
      "İLK DERECE MAHKEMESİ",
      "ADALET KOMİSYONU BAŞKANLIĞI'NA"
    ];
    closingSentence = "Bilgilerinize arz olunur.";
  } else if (aliciMakam === 'bakanlik') {
    destTitleLines = [
      "ANKARA CUMHURİYET BAŞSAVCILIĞI",
      "Bakanlık Muhabere Bürosu'na"
    ];
    closingSentence = "Gereğini arz ederim.";
  } else {
    destTitleLines = aliciMakamOzel.split('\n').filter(l => l.trim());
    if (destTitleLines.length === 0) {
      destTitleLines = ["ANKARA ADLÎ YARGI", "ADALET KOMİSYONU BAŞKANLIĞI'NA"];
    }
  }

  let bodyParagraph = "";
  let subjectStr = "";
  const notuPart = donusNotu && donusNotu.trim() ? `${donusNotu.trim()} ` : '';
  const izinEkStr = docType.includes('mazeret') ? "mazeret izninden" : "yıllık izninden";

  if (docType.includes('yillik_ayrilis') || docType.includes('mazeret_ayrilis') || (!docType.includes('baslayis') && !docType.includes('rapor'))) {
    subjectStr = docType.includes('mazeret') ? "Mazeret İzni" : "Yıllık İzin";
    bodyParagraph = `${birim}müzde görevli ${unvan} ${personnelName} (${sicilNo}) ${izinEkStr} ${gunMetni} gününü kullanmak üzere ${formatDateTR(ayrilisTarihi)} tarihinde görevinden ayrılmıştır.`;
  } else if (docType.includes('yillik_baslayis') || docType.includes('mazeret_baslayis')) {
    subjectStr = "Göreve Başlama";
    bodyParagraph = `İlgi sayılı yazımız ile ${gunMetni} günlük iznini kullanmak üzere görevinden ayrılışını bildirdiğimiz ${birim}müzde görev yapan ${unvan} ${personnelName} (${sicilNo}) bu iznini kullanarak ${notuPart}${formatDateTR(baslayisTarihi)} tarihinde görevine başlamıştır.`;
  } else if (docType.includes('rapor_ayrilis')) {
    subjectStr = `${personnelName}-Rapor İşlemi`;
    bodyParagraph = `${birim}müzde ${unvan} olarak görev yapan ${personnelName} (${sicilNo}) ${raporKurum} tarafından verilen ${gunMetni} günlük istirahat raporuyla ${formatDateTR(ayrilisTarihi)} tarihinde görevinden ayrılmıştır.`;
  } else if (docType.includes('rapor_baslayis')) {
    subjectStr = `${personnelName} Göreve Başlama`;
    bodyParagraph = `İlgi sayılı yazımız ile ${raporKurum} tarafından verilen ${gunMetni} günlük istirahat raporuyla görevinden ayrılışını bildirdiğimiz ${birim}müzde görev yapan ${unvan} ${personnelName} (${sicilNo}) ${notuPart}${formatDateTR(baslayisTarihi)} tarihinde görevine başlamıştır.`;
  }

  const isBaslayis = docType.includes('baslayis');
  const isRaporAyrilis = docType.includes('rapor_ayrilis');

  const subjectRtf = toRtfUnicode(`Konu : ${subjectStr}`);
  const destRtfLines = destTitleLines.map(l => `\\pard\\qc\\f0\\fs24 ${toRtfUnicode(l)}\\par`).join('\n');
  const bodyRtf = toRtfUnicode(bodyParagraph);
  const closingRtf = toRtfUnicode(closingSentence);
  const signerNameRtf = toRtfUnicode(imzalayanAd);
  const signerTitleRtf = toRtfUnicode(imzalayanUnvan);
  const ilgiRtf = toRtfUnicode(ilgiEvrak ? `İlgi     : ${ilgiEvrak.trim()}` : '');
  const ekRtf = toRtfUnicode(ekBelge ? `Ek      : ${ekBelge}` : '');

  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil\\fcharset0 Times New Roman;}}
\\viewkind4\\uc1\\pard\\lang1055\\f0\\fs24 ${subjectRtf}\\par
\\par
\\par
\\par
${destRtfLines}
\\par
${isBaslayis && ilgiEvrak && ilgiEvrak.trim() ? `\\pard\\f0\\fs24 ${ilgiRtf}\\par\\par` : ''}
\\pard\\qj\\fi708\\f0\\fs24 ${bodyRtf}\\par
\\pard\\qj\\fi708\\f0\\fs24 ${closingRtf}\\par
\\par
\\par
\\pard\\qr\\f0\\fs24 ${signerNameRtf}\\par
\\pard\\qr\\f0\\fs24 ${signerTitleRtf}\\par
${isRaporAyrilis ? `\\par\\pard\\f0\\fs24 ${ekRtf}\\par` : ''}
}`;
}

/**
 * Helper to center text with spaces for 80-char line width (UYAP Editor standard)
 */
function padCenter(str, width = 78) {
  const trimmed = str.trim();
  const padLength = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return ' '.repeat(padLength) + trimmed;
}

/**
 * Helper to right-align text with spaces for 80-char line width (UYAP Editor standard)
 */
function padRight(str, targetCol = 48) {
  const trimmed = str.trim();
  return ' '.repeat(targetCol) + trimmed;
}

/**
 * Generates HTML formatted specifically for UYAP Java Swing HTMLEditorKit
 */
export function generateCopyableHtml(payload) {
  const {
    docType,
    personnelName,
    sicilNo,
    unvan,
    birim = 'Bilgi İşlem Müdürlüğü',
    tarih = formatDateTR(new Date().toISOString().split('T')[0]),
    izinSuresi = 5,
    ayrilisTarihi = tarih,
    baslayisTarihi = tarih,
    raporKurum = 'Sağlık Bakanlığı Ankara Etlik Şehir Hastanesi',
    ilgiEvrak = '',
    aliciMakam = 'komisyon',
    aliciMakamOzel = '',
    imzalayanAd = 'Dr. Arif Naci SUCUOĞLU',
    imzalayanUnvan = 'Cumhuriyet Başsavcı Vekili',
    ekBelge = 'Rapor (1 Sayfa)',
    donusNotu = ''
  } = payload;

  const gunMetni = `${izinSuresi} (${numberToTurkishText(izinSuresi)})`;

  let destTitleLines = [];
  let closingSentence = "Bilgilerinize arz olunur.";

  if (aliciMakam === 'komisyon') {
    destTitleLines = [
      "ANKARA ADLÎ YARGI",
      "İLK DERECE MAHKEMESİ",
      "ADALET KOMİSYONU BAŞKANLIĞI'NA"
    ];
    closingSentence = "Bilgilerinize arz olunur.";
  } else if (aliciMakam === 'bakanlik') {
    destTitleLines = [
      "ANKARA CUMHURİYET BAŞSAVCILIĞI",
      "Bakanlık Muhabere Bürosu'na"
    ];
    closingSentence = "Gereğini arz ederim.";
  } else {
    destTitleLines = aliciMakamOzel.split('\n').filter(l => l.trim());
    if (destTitleLines.length === 0) {
      destTitleLines = ["ANKARA ADLÎ YARGI", "ADALET KOMİSYONU BAŞKANLIĞI'NA"];
    }
  }

  let bodyParagraph = "";
  let subjectStr = "";
  const notuPart = donusNotu && donusNotu.trim() ? `${donusNotu.trim()} ` : '';
  const izinEkStr = docType.includes('mazeret') ? "mazeret izninden" : "yıllık izninden";

  if (docType.includes('yillik_ayrilis') || docType.includes('mazeret_ayrilis') || (!docType.includes('baslayis') && !docType.includes('rapor'))) {
    subjectStr = docType.includes('mazeret') ? "Mazeret İzni" : "Yıllık İzin";
    bodyParagraph = `${birim}müzde görevli ${unvan} ${personnelName} (${sicilNo}) ${izinEkStr} ${gunMetni} gününü kullanmak üzere ${formatDateTR(ayrilisTarihi)} tarihinde görevinden ayrılmıştır.`;
  } else if (docType.includes('yillik_baslayis') || docType.includes('mazeret_baslayis')) {
    subjectStr = "Göreve Başlama";
    bodyParagraph = `İlgi sayılı yazımız ile ${gunMetni} günlük iznini kullanmak üzere görevinden ayrılışını bildirdiğimiz ${birim}müzde görev yapan ${unvan} ${personnelName} (${sicilNo}) bu iznini kullanarak ${notuPart}${formatDateTR(baslayisTarihi)} tarihinde görevine başlamıştır.`;
  } else if (docType.includes('rapor_ayrilis')) {
    subjectStr = `${personnelName}-Rapor İşlemi`;
    bodyParagraph = `${birim}müzde ${unvan} olarak görev yapan ${personnelName} (${sicilNo}) ${raporKurum} tarafından verilen ${gunMetni} günlük istirahat raporuyla ${formatDateTR(ayrilisTarihi)} tarihinde görevinden ayrılmıştır.`;
  } else if (docType.includes('rapor_baslayis')) {
    subjectStr = `${personnelName} Göreve Başlama`;
    bodyParagraph = `İlgi sayılı yazımız ile ${raporKurum} tarafından verilen ${gunMetni} günlük istirahat raporuyla görevinden ayrılışını bildirdiğimiz ${birim}müzde görev yapan ${unvan} ${personnelName} (${sicilNo}) ${notuPart}${formatDateTR(baslayisTarihi)} tarihinde görevine başlamıştır.`;
  }

  const isBaslayis = docType.includes('baslayis');
  const isRaporAyrilis = docType.includes('rapor_ayrilis');

  const destHtml = destTitleLines.map(l => `<p align="center" style="text-align: center; margin: 0;">${l}</p>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Times New Roman', serif; font-size: 12pt; color: #000000;">
  <p align="left" style="text-align: left; margin-bottom: 24pt;">Konu : ${subjectStr}</p>
  
  <br><br>
  <div align="center" style="text-align: center; margin-top: 24pt; margin-bottom: 24pt;">
    ${destHtml}
  </div>
  <br>

  ${isBaslayis && ilgiEvrak && ilgiEvrak.trim() ? `<p align="left" style="margin-bottom: 12pt;">İlgi     : ${ilgiEvrak.trim()}</p>` : ''}

  <p align="justify" style="text-indent: 1.25cm; text-align: justify; margin-bottom: 12pt;">
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${bodyParagraph}
  </p>

  <p align="justify" style="text-indent: 1.25cm; text-align: justify; margin-bottom: 36pt;">
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${closingSentence}
  </p>
  <br><br>

  <div align="right" style="text-align: right; margin-right: 30pt;">
    <p align="right" style="text-align: right; margin: 0;">${imzalayanAd}</p>
    <p align="right" style="text-align: right; margin: 0;">${imzalayanUnvan}</p>
  </div>

  ${isRaporAyrilis ? `<p align="left" style="margin-top: 24pt;">Ek      : ${ekBelge}</p>` : ''}
</body>
</html>`;
}

/**
 * Generates plain text with exact calculated space indents for UYAP Editor
 */
export function generatePlainUdfText(payload) {
  const {
    docType,
    personnelName,
    sicilNo,
    unvan,
    birim = 'Bilgi İşlem Müdürlüğü',
    tarih = formatDateTR(new Date().toISOString().split('T')[0]),
    izinSuresi = 5,
    ayrilisTarihi = tarih,
    baslayisTarihi = tarih,
    raporKurum = 'Sağlık Bakanlığı Ankara Etlik Şehir Hastanesi',
    ilgiEvrak = '',
    aliciMakam = 'komisyon',
    aliciMakamOzel = '',
    imzalayanAd = 'Dr. Arif Naci SUCUOĞLU',
    imzalayanUnvan = 'Cumhuriyet Başsavcı Vekili',
    ekBelge = 'Rapor (1 Sayfa)',
    donusNotu = ''
  } = payload;

  const gunMetni = `${izinSuresi} (${numberToTurkishText(izinSuresi)})`;

  let destTitleLines = [];
  let closingSentence = "Bilgilerinize arz olunur.";

  if (aliciMakam === 'komisyon') {
    destTitleLines = [
      "ANKARA ADLÎ YARGI ",
      "İLK DERECE MAHKEMESİ ",
      "ADALET KOMİSYONU BAŞKANLIĞI'NA"
    ];
    closingSentence = "Bilgilerinize arz olunur.";
  } else if (aliciMakam === 'bakanlik') {
    destTitleLines = [
      "ANKARA CUMHURİYET BAŞSAVCILIĞI",
      "Bakanlık Muhabere Bürosu'na"
    ];
    closingSentence = "Gereğini arz ederim.";
  } else {
    destTitleLines = aliciMakamOzel.split('\n').filter(l => l.trim());
    if (destTitleLines.length === 0) {
      destTitleLines = ["ANKARA ADLÎ YARGI ", "ADALET KOMİSYONU BAŞKANLIĞI'NA"];
    }
  }

  let bodyParagraph = "";
  let subjectStr = "";
  const notuPart = donusNotu && donusNotu.trim() ? `${donusNotu.trim()} ` : '';
  const izinEkStr = docType.includes('mazeret') ? "mazeret izninden" : "yıllık izninden";

  if (docType.includes('yillik_ayrilis') || docType.includes('mazeret_ayrilis') || (!docType.includes('baslayis') && !docType.includes('rapor'))) {
    subjectStr = docType.includes('mazeret') ? "Mazeret İzni" : "Yıllık İzin";
    bodyParagraph = `${birim}müzde görevli ${unvan} ${personnelName} (${sicilNo}) ${izinEkStr} ${gunMetni} gününü kullanmak üzere ${formatDateTR(ayrilisTarihi)} tarihinde görevinden ayrılmıştır.`;
  } else if (docType.includes('yillik_baslayis') || docType.includes('mazeret_baslayis')) {
    subjectStr = "Göreve Başlama";
    bodyParagraph = `İlgi sayılı yazımız ile ${gunMetni} günlük iznini kullanmak üzere görevinden ayrılışını bildirdiğimiz ${birim}müzde görev yapan ${unvan} ${personnelName} (${sicilNo}) bu iznini kullanarak ${notuPart}${formatDateTR(baslayisTarihi)} tarihinde görevine başlamıştır.`;
  } else if (docType.includes('rapor_ayrilis')) {
    subjectStr = `${personnelName}-Rapor İşlemi`;
    bodyParagraph = `${birim}müzde ${unvan} olarak görev yapan ${personnelName} (${sicilNo}) ${raporKurum} tarafından verilen ${gunMetni} günlük istirahat raporuyla ${formatDateTR(ayrilisTarihi)} tarihinde görevinden ayrılmıştır.`;
  } else if (docType.includes('rapor_baslayis')) {
    subjectStr = `${personnelName} Göreve Başlama`;
    bodyParagraph = `İlgi sayılı yazımız ile ${raporKurum} tarafından verilen ${gunMetni} günlük istirahat raporuyla görevinden ayrılışını bildirdiğimiz ${birim}müzde görev yapan ${unvan} ${personnelName} (${sicilNo}) ${notuPart}${formatDateTR(baslayisTarihi)} tarihinde görevine başlamıştır.`;
  }

  const isBaslayis = docType.includes('baslayis');
  const isRaporAyrilis = docType.includes('rapor_ayrilis');

  let text = `Konu : ${subjectStr}\n\n\n\n`;
  destTitleLines.forEach(l => {
    text += `${padCenter(l)}\n`;
  });
  text += `\n`;

  if (isBaslayis && ilgiEvrak && ilgiEvrak.trim()) {
    text += `İlgi     : ${ilgiEvrak.trim()}\n\n`;
  }

  text += `        ${bodyParagraph}\n`;
  text += `        ${closingSentence}\n\n\n`;
  text += `${padRight(imzalayanAd, 48)}\n`;
  text += `${padRight(imzalayanUnvan, 47)}\n`;

  if (isRaporAyrilis) {
    text += `\nEk      : ${ekBelge}\n`;
  }

  return text;
}

/**
 * Generates clean HTML document preview for modal view
 */
export function generateDocumentPreviewHtml(payload) {
  const {
    docType,
    personnelName,
    sicilNo,
    unvan,
    birim = 'Bilgi İşlem Müdürlüğü',
    tarih = formatDateTR(new Date().toISOString().split('T')[0]),
    izinSuresi = 5,
    ayrilisTarihi = tarih,
    baslayisTarihi = tarih,
    raporKurum = 'Sağlık Bakanlığı Ankara Etlik Şehir Hastanesi',
    ilgiEvrak = '',
    aliciMakam = 'komisyon',
    aliciMakamOzel = '',
    imzalayanAd = 'Dr. Arif Naci SUCUOĞLU',
    imzalayanUnvan = 'Cumhuriyet Başsavcı Vekili',
    ekBelge = 'Rapor (1 Sayfa)',
    donusNotu = ''
  } = payload;

  const gunMetni = `${izinSuresi} (${numberToTurkishText(izinSuresi)})`;

  let destTitleLines = [];
  let closingSentence = "Bilgilerinize arz olunur.";

  if (aliciMakam === 'komisyon') {
    destTitleLines = [
      "ANKARA ADLÎ YARGI",
      "İLK DERECE MAHKEMESİ",
      "ADALET KOMİSYONU BAŞKANLIĞI'NA"
    ];
    closingSentence = "Bilgilerinize arz olunur.";
  } else if (aliciMakam === 'bakanlik') {
    destTitleLines = [
      "ANKARA CUMHURİYET BAŞSAVCILIĞI",
      "Bakanlık Muhabere Bürosu'na"
    ];
    closingSentence = "Gereğini arz ederim.";
  } else {
    destTitleLines = aliciMakamOzel.split('\n').filter(l => l.trim());
    if (destTitleLines.length === 0) {
      destTitleLines = ["ANKARA ADLÎ YARGI", "ADALET KOMİSYONU BAŞKANLIĞI'NA"];
    }
  }

  let bodyParagraph = "";
  let subjectStr = "";
  const notuPart = donusNotu && donusNotu.trim() ? `${donusNotu.trim()} ` : '';
  const izinEkStr = docType.includes('mazeret') ? "mazeret izninden" : "yıllık izninden";

  if (docType.includes('yillik_ayrilis') || docType.includes('mazeret_ayrilis') || (!docType.includes('baslayis') && !docType.includes('rapor'))) {
    subjectStr = docType.includes('mazeret') ? "Mazeret İzni" : "Yıllık İzin";
    bodyParagraph = `${birim}müzde görevli ${unvan} ${personnelName} (${sicilNo}) ${izinEkStr} ${gunMetni} gününü kullanmak üzere ${formatDateTR(ayrilisTarihi)} tarihinde görevinden ayrılmıştır.`;
  } else if (docType.includes('yillik_baslayis') || docType.includes('mazeret_baslayis')) {
    subjectStr = "Göreve Başlama";
    bodyParagraph = `İlgi sayılı yazımız ile ${gunMetni} günlük iznini kullanmak üzere görevinden ayrılışını bildirdiğimiz ${birim}müzde görev yapan ${unvan} ${personnelName} (${sicilNo}) bu iznini kullanarak ${notuPart}${formatDateTR(baslayisTarihi)} tarihinde görevine başlamıştır.`;
  } else if (docType.includes('rapor_ayrilis')) {
    subjectStr = `${personnelName}-Rapor İşlemi`;
    bodyParagraph = `${birim}müzde ${unvan} olarak görev yapan ${personnelName} (${sicilNo}) ${raporKurum} tarafından verilen ${gunMetni} günlük istirahat raporuyla ${formatDateTR(ayrilisTarihi)} tarihinde görevinden ayrılmıştır.`;
  } else if (docType.includes('rapor_baslayis')) {
    subjectStr = `${personnelName} Göreve Başlama`;
    bodyParagraph = `İlgi sayılı yazımız ile ${raporKurum} tarafından verilen ${gunMetni} günlük istirahat raporuyla görevinden ayrılışını bildirdiğimiz ${birim}müzde görev yapan ${unvan} ${personnelName} (${sicilNo}) ${notuPart}${formatDateTR(baslayisTarihi)} tarihinde görevine başlamıştır.`;
  }

  const isBaslayis = docType.includes('baslayis');
  const isRaporAyrilis = docType.includes('rapor_ayrilis');

  return `
    <div style="margin-bottom: 1.25rem; display: flex; justify-content: flex-end;">
      <button class="btn btn-primary" id="btn-copy-udf-text" style="font-weight: 600;">
        <i class="fa-solid fa-copy"></i> METNİ KOPYALA
      </button>
    </div>
    <div id="udf-preview-content" style="background: #ffffff; color: #1e293b; padding: 2.5rem; border-radius: 12px; font-family: 'Times New Roman', Times, serif; font-size: 13pt; line-height: 1.6; box-shadow: 0 10px 30px rgba(0,0,0,0.25); border: 1px solid #cbd5e1; user-select: text;">
      <div style="margin-bottom: 2rem;"><strong>Konu :</strong> ${subjectStr}</div>
      
      <div style="text-align: center; font-weight: normal; margin: 2.5rem 0 2rem 0; font-size: 13pt; line-height: 1.4;">
        ${destTitleLines.join('<br>')}
      </div>

      ${isBaslayis && ilgiEvrak && ilgiEvrak.trim() ? `<div style="margin-bottom: 1.5rem;"><strong>İlgi     :</strong> ${ilgiEvrak.trim()}</div>` : ''}

      <div style="text-indent: 1.25cm; text-align: justify; margin-bottom: 1rem;">
        ${bodyParagraph}
      </div>

      <div style="text-indent: 1.25cm; margin-bottom: 3.5rem;">
        ${closingSentence}
      </div>

      <div style="text-align: right; margin-right: 1.5rem; line-height: 1.3;">
        <strong>${imzalayanAd}</strong><br>
        <span>${imzalayanUnvan}</span>
      </div>

      ${isRaporAyrilis ? `<div style="margin-top: 2rem; font-size: 11pt;"><strong>Ek      :</strong> ${ekBelge}</div>` : ''}
    </div>
  `;
}

/**
 * Builds UYAP compliant content.xml with 1.25 cm (35.4375 pt) first line indents
 */
export function buildUdfXml(payload) {
  const {
    docType,
    personnelName,
    sicilNo,
    unvan,
    birim = 'Bilgi İşlem Müdürlüğü',
    tarih = formatDateTR(new Date().toISOString().split('T')[0]),
    izinSuresi = 5,
    ayrilisTarihi = tarih,
    baslayisTarihi = tarih,
    raporKurum = 'Sağlık Bakanlığı Ankara Etlik Şehir Hastanesi',
    ilgiEvrak = '',
    aliciMakam = 'komisyon',
    aliciMakamOzel = '',
    imzalayanAd = 'Dr. Arif Naci SUCUOĞLU',
    imzalayanUnvan = 'Cumhuriyet Başsavcı Vekili',
    ekBelge = 'Rapor (1 Sayfa)',
    donusNotu = ''
  } = payload;

  const gunMetni = `${izinSuresi} (${numberToTurkishText(izinSuresi)})`;

  // Destination lines
  let destTitleLines = [];
  let closingSentence = "Bilgilerinize arz olunur.";

  if (aliciMakam === 'komisyon') {
    destTitleLines = [
      "ANKARA ADLÎ YARGI ",
      "İLK DERECE MAHKEMESİ ",
      "ADALET KOMİSYONU BAŞKANLIĞI'NA"
    ];
    closingSentence = "Bilgilerinize arz olunur.";
  } else if (aliciMakam === 'bakanlik') {
    destTitleLines = [
      "ANKARA CUMHURİYET BAŞSAVCILIĞI",
      "Bakanlık Muhabere Bürosu'na"
    ];
    closingSentence = "Gereğini arz ederim.";
  } else {
    destTitleLines = aliciMakamOzel.split('\n').filter(l => l.trim());
    if (destTitleLines.length === 0) {
      destTitleLines = ["ANKARA ADLÎ YARGI ", "ADALET KOMİSYONU BAŞKANLIĞI'NA"];
    }
  }

  // Subject and Body Text
  let bodyParagraph = "";
  let subjectStr = "";
  const notuPart = donusNotu && donusNotu.trim() ? `${donusNotu.trim()} ` : '';
  const izinEkStr = docType.includes('mazeret') ? "mazeret izninden" : "yıllık izninden";

  if (docType.includes('yillik_ayrilis') || docType.includes('mazeret_ayrilis') || (!docType.includes('baslayis') && !docType.includes('rapor'))) {
    subjectStr = docType.includes('mazeret') ? "Mazeret İzni" : "Yıllık İzin";
    bodyParagraph = `${birim}müzde görevli ${unvan} ${personnelName} (${sicilNo}) ${izinEkStr} ${gunMetni} gününü kullanmak üzere ${formatDateTR(ayrilisTarihi)} tarihinde görevinden ayrılmıştır.`;
  } else if (docType.includes('yillik_baslayis') || docType.includes('mazeret_baslayis')) {
    subjectStr = "Göreve Başlama";
    bodyParagraph = `İlgi sayılı yazımız ile ${gunMetni} günlük iznini kullanmak üzere görevinden ayrılışını bildirdiğimiz ${birim}müzde görev yapan ${unvan} ${personnelName} (${sicilNo}) bu iznini kullanarak ${notuPart}${formatDateTR(baslayisTarihi)} tarihinde görevine başlamıştır.`;
  } else if (docType.includes('rapor_ayrilis')) {
    subjectStr = `${personnelName}-Rapor İşlemi`;
    bodyParagraph = `${birim}müzde ${unvan} olarak görev yapan ${personnelName} (${sicilNo}) ${raporKurum} tarafından verilen ${gunMetni} günlük istirahat raporuyla ${formatDateTR(ayrilisTarihi)} tarihinde görevinden ayrılmıştır.`;
  } else if (docType.includes('rapor_baslayis')) {
    subjectStr = `${personnelName} Göreve Başlama`;
    bodyParagraph = `İlgi sayılı yazımız ile ${raporKurum} tarafından verilen ${gunMetni} günlük istirahat raporuyla görevinden ayrılışını bildirdiğimiz ${birim}müzde görev yapan ${unvan} ${personnelName} (${sicilNo}) ${notuPart}${formatDateTR(baslayisTarihi)} tarihinde görevine başlamıştır.`;
  }

  const isBaslayis = docType.includes('baslayis');
  const isRaporAyrilis = docType.includes('rapor_ayrilis');

  // Build Structured Line Definition: [Text, Alignment (0:left, 1:center, 3:justify), isBold, fontSize, firstLineIndentInPt]
  // 1.25 cm = 35.4375 pt
  const INDENT_1_25_CM = "35.4375";

  const lines = [
    [`Konu : ${subjectStr}`, 0, false, 12, "0.0"],
    ["", 0, false, 12, "0.0"],
    ["", 0, false, 12, "0.0"],
    ["", 0, false, 12, "0.0"]
  ];

  // Recipient lines (Centered, NOT bold)
  destTitleLines.forEach(l => {
    lines.push([l, 1, false, 12, "0.0"]);
  });

  lines.push(["", 0, false, 12, "0.0"]);

  if (isBaslayis && ilgiEvrak && ilgiEvrak.trim()) {
    lines.push([`İlgi     : ${ilgiEvrak.trim()}`, 0, false, 12, "0.0"]);
    lines.push(["", 0, false, 12, "0.0"]);
  }

  // Body and Closing (FirstLineIndent = 35.4375 i.e. 1.25 cm)
  lines.push([bodyParagraph, 3, false, 12, INDENT_1_25_CM]);
  lines.push([closingSentence, 3, false, 12, INDENT_1_25_CM]);
  lines.push(["", 0, false, 12, "0.0"]);
  lines.push(["", 0, false, 12, "0.0"]);

  // Signatory (Tabbed right alignment, NOT bold)
  lines.push([`\t\t\t                                    ${imzalayanAd}`, 0, false, 12, "0.0"]);
  lines.push([`\t\t\t                                   ${imzalayanUnvan}`, 0, false, 12, "0.0"]);

  if (isRaporAyrilis) {
    lines.push(["", 0, false, 12, "0.0"]);
    lines.push([`Ek      : ${ekBelge}`, 0, false, 12, "0.0"]);
  }

  // Construct CDATA and Elements XML
  const cdataText = lines.map(l => l[0]).join('\n') + '\n';
  
  let elementsXml = '';
  let currentOffset = 0;

  lines.forEach(item => {
    const text = item[0];
    const align = item[1];
    const bold = item[2];
    const size = item[3];
    const indent = item[4] || "0.0";

    // Character length of line including newline \n
    const lineLen = text.length + 1;
    const boldStr = bold ? 'true' : 'false';

    elementsXml += `<paragraph resolver="hvl-default" Alignment="${align}" FirstLineIndent="${indent}" SpaceBelow="1.0" LineSpacing="0.0" RightIndent="0.0" LeftIndent="0.0" SpaceAbove="0.0"><content resolver="hvl-default" family="Times New Roman" size="${size}" bold="${boldStr}" startOffset="${currentOffset}" length="${lineLen}" /></paragraph>\n`;
    
    currentOffset += lineLen;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8" ?> 

<template format_id="1.8" >
<content><![CDATA[${cdataText}]]></content><properties><pageFormat mediaSizeName="1" leftMargin="42.51968479156494" rightMargin="42.51968479156494" topMargin="42.51968479156494" bottomMargin="14.17322826385498" paperOrientation="1" headerFOffset="20.0" footerFOffset="20.01259830856323" /></properties>
<elements >
${elementsXml}</elements>
<styles><style name="default" family="Dialog" size="12" description="Geçerli" foreground="-16777216" bold="false" RightIndent="15.0" italic="false" FONT_ATTRIBUTE_KEY="javax.swing.plaf.FontUIResource[family=Dialog,name=Dialog,style=plain,size=12]" /><style name="hvl-default" family="Times New Roman" size="12" description="Gövde" Alignment="0" SpaceBelow="0.0" LineSpacing="0.0" RightIndent="0.0" LeftIndent="0.0" SpaceAbove="0.0" /></styles>
</template>
`;

  return xml;
}

/**
 * Creates a .udf Zip file and triggers browser download
 */
export async function downloadUdfFile(payload, filename = 'evrak.udf') {
  const xmlContent = buildUdfXml(payload);
  
  const zip = new JSZip();
  zip.file('content.xml', xmlContent);
  
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/x-zip-compressed'
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.udf') ? filename : `${filename}.udf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
