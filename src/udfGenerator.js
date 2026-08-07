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
 * Generates exact UYAP template CDATA text matching original UYAP XML files
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
  text += destTitleLines.join('\n') + '\n\t\n';

  if (isBaslayis && ilgiEvrak && ilgiEvrak.trim()) {
    text += `İlgi     : ${ilgiEvrak.trim()}\n\n`;
  }

  text += `\t${bodyParagraph}\n`;
  text += `\t${closingSentence}\n\t\t\t\n\t\t\t\n`;
  text += `\t\t\t                                    ${imzalayanAd}\n`;
  text += `\t\t\t                                   ${imzalayanUnvan}\n`;

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
    <div style="margin-bottom: 1.25rem; display: flex; gap: 0.75rem; justify-content: flex-end;">
      <button class="btn btn-secondary" id="btn-modal-download-udf" style="font-weight: 600;">
        <i class="fa-solid fa-download"></i> UDF OLARAK İNDİR
      </button>
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
