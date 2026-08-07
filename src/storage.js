// LocalStorage Data Management Module

const STORAGE_KEYS = {
  PERSONNEL: 'udf_personnel_list_v1',
  LEAVE_TYPES: 'udf_leave_types_v1',
  SIGNATORIES: 'udf_signatories_v1',
  CONTACTS: 'udf_contacts_v1',
  LEAVE_RECORDS: 'udf_leave_records_v1',
  DOC_TEMPLATES: 'udf_doc_templates_v1',
  SETTINGS: 'udf_settings_v1'
};

// Seed Personnel List (50 Initial Personnel)
const DEFAULT_PERSONNEL = [
  { id: '1', name: 'Tuğba ALTUNTAŞ', sicil: '304581', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '2', name: 'Erdal ŞİMŞEK', sicil: '96214', title: 'Bilgisayar İşletmeni', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '3', name: 'Öznur YILDIRIM', sicil: '125768', title: 'Teknisyen', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '4', name: 'Hasan KARAKOÇLAR', sicil: '142055', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '5', name: 'Emine SÖKMEN', sicil: '189420', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '6', name: 'Ahmet YILMAZ', sicil: '102345', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '7', name: 'Mehmet KAYA', sicil: '115678', title: 'Bilgisayar İşletmeni', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '8', name: 'Ayşe DEMİR', sicil: '128901', title: 'Teknisyen', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '9', name: 'Fatma ÇELİK', sicil: '131234', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '10', name: 'Ali ÖZTÜRK', sicil: '144567', title: 'Programcı', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '11', name: 'Zeynep ARSLAN', sicil: '157890', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '12', name: 'Mustafa DOĞAN', sicil: '160123', title: 'Teknisyen', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '13', name: 'Elif KILIÇ', sicil: '173456', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '14', name: 'Hüseyin ASLAN', sicil: '186789', title: 'Mühendis', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '15', name: 'Merve KARA', sicil: '199012', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '16', name: 'İbrahim ŞAHİN', sicil: '201345', title: 'Bilgisayar İşletmeni', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '17', name: 'Büşra KOÇ', sicil: '214678', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '18', name: 'Osman YILDIZ', sicil: '228001', title: 'Teknisyen', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '19', name: 'Seda ÖZDEMİR', sicil: '231334', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '20', name: 'Ömer ERDOĞAN', sicil: '244667', title: 'Çözümleyici', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '21', name: 'Hatice AYDIN', sicil: '258000', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '22', name: 'Yusuf POLAT', sicil: '261333', title: 'Bilgisayar İşletmeni', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '23', name: 'Kübra YALÇIN', sicil: '274666', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '24', name: 'Murat ERGÜN', sicil: '287999', title: 'Teknisyen', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '25', name: 'Esra AKSOY', sicil: '291332', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '26', name: 'Emre ÖZKAN', sicil: '304665', title: 'Mühendis', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '27', name: 'Yasemin GÜNEŞ', sicil: '317998', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '28', name: 'Serkan BULUT', sicil: '321331', title: 'Bilgisayar İşletmeni', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '29', name: 'Deniz KESKİN', sicil: '334664', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '30', name: 'Fatih ÜNAL', sicil: '347997', title: 'Teknisyen', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '31', name: 'Tuğçe ŞEN', sicil: '351330', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '32', name: 'Hakan GÜL', sicil: '364663', title: 'Programcı', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '33', name: 'Sibel BOZKURT', sicil: '377996', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '34', name: 'Kaan AVCI', sicil: '381329', title: 'Teknisyen', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '35', name: 'Gamze KORKMAZ', sicil: '394662', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '36', name: 'Burak ASLAN', sicil: '407995', title: 'Bilgisayar İşletmeni', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '37', name: 'Derya TEKİN', sicil: '411328', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '38', name: 'Volkan KAHRAMAN', sicil: '424661', title: 'Mühendis', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '39', name: 'Aslı CEYLAN', sicil: '437994', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '40', name: 'Sinan ŞAHİN', sicil: '441327', title: 'Teknisyen', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '41', name: 'Gözde SOYLU', sicil: '454660', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '42', name: 'Uğur ÇAKIR', sicil: '467993', title: 'Bilgisayar İşletmeni', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '43', name: 'Berna COŞKUN', sicil: '471326', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '44', name: 'Onur YÜCEL', sicil: '484659', title: 'Teknisyen', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '45', name: 'Ceren KILIÇ', sicil: '497992', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '46', name: 'Tolga EKER', sicil: '501325', title: 'Programcı', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '47', name: 'Hande TAŞ', sicil: '514658', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '48', name: 'Eren YILDIRIM', sicil: '527991', title: 'Bilgisayar İşletmeni', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '49', name: 'Gizem DURMAZ', sicil: '531324', title: 'Zabıt Katibi', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' },
  { id: '50', name: 'Metin SARI', sicil: '544657', title: 'Teknisyen', birim: 'Bilgi İşlem Müdürlüğü', status: 'active' }
];

// Seed Leave Types
const DEFAULT_LEAVE_TYPES = [
  { id: 'yillik', name: 'Yıllık İzin', code: 'yillik' },
  { id: 'rapor', name: 'İstirahat Raporu / Sağlık İzni', code: 'rapor' },
  { id: 'mazeret', name: 'Mazeret İzni', code: 'mazeret' },
  { id: 'sua', name: 'Şua İzni', code: 'sua' },
  { id: 'babalik', name: 'Babalık İzni', code: 'babalik' },
  { id: 'dogum', name: 'Doğum İzni', code: 'dogum' },
  { id: 'vefat', name: 'Vefat İzni', code: 'vefat' },
  { id: 'evlilik', name: 'Evlilik İzni', code: 'evlilik' }
];

// Seed Signatories
const DEFAULT_SIGNATORIES = [
  { id: '1', name: 'Dr. Arif Naci SUCUOĞLU', title: 'Cumhuriyet Başsavcı Vekili', default: true },
  { id: '2', name: 'Cesur AYKUL', title: 'Cumhuriyet Savcısı', default: false },
  { id: '3', name: 'Ahmet ÖZKAN', title: 'Bilgi İşlem Müdürü', default: false }
];

// Seed Contacts for Footer ("Ayrıntılı Bilgi İçin")
const DEFAULT_CONTACTS = [
  { id: '1', name: 'HASAN KARAKOÇLAR', default: true },
  { id: '2', name: 'EMİNE SÖKMEN', default: false },
  { id: '3', name: 'TUĞBA ALTUNTAŞ', default: false }
];

export function getPersonnelList() {
  const data = localStorage.getItem(STORAGE_KEYS.PERSONNEL);
  if (!data) {
    localStorage.setItem(STORAGE_KEYS.PERSONNEL, JSON.stringify(DEFAULT_PERSONNEL));
    return DEFAULT_PERSONNEL;
  }
  return JSON.parse(data);
}

export function savePersonnelList(list) {
  localStorage.setItem(STORAGE_KEYS.PERSONNEL, JSON.stringify(list));
}

export function getLeaveTypes() {
  const data = localStorage.getItem(STORAGE_KEYS.LEAVE_TYPES);
  if (!data) {
    localStorage.setItem(STORAGE_KEYS.LEAVE_TYPES, JSON.stringify(DEFAULT_LEAVE_TYPES));
    return DEFAULT_LEAVE_TYPES;
  }
  return JSON.parse(data);
}

export function saveLeaveTypes(types) {
  localStorage.setItem(STORAGE_KEYS.LEAVE_TYPES, JSON.stringify(types));
}

export function getSignatories() {
  const data = localStorage.getItem(STORAGE_KEYS.SIGNATORIES);
  if (!data) {
    localStorage.setItem(STORAGE_KEYS.SIGNATORIES, JSON.stringify(DEFAULT_SIGNATORIES));
    return DEFAULT_SIGNATORIES;
  }
  return JSON.parse(data);
}

export function saveSignatories(signers) {
  localStorage.setItem(STORAGE_KEYS.SIGNATORIES, JSON.stringify(signers));
}

export function getContacts() {
  const data = localStorage.getItem(STORAGE_KEYS.CONTACTS);
  if (!data) {
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(DEFAULT_CONTACTS));
    return DEFAULT_CONTACTS;
  }
  return JSON.parse(data);
}

export function saveContacts(contacts) {
  localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
}

export function getLeaveRecords() {
  const data = localStorage.getItem(STORAGE_KEYS.LEAVE_RECORDS);
  if (!data) {
    // Seed initial active leave records
    const initialRecords = [
      {
        id: 'rec-1',
        personnelId: '1',
        personnelName: 'Tuğba ALTUNTAŞ',
        sicil: '304581',
        unvan: 'Zabıt Katibi',
        leaveType: 'yillik',
        leaveTypeName: 'Yıllık İzin',
        days: 4,
        ayrilisDate: '2026-08-10',
        expectedReturnDate: '2026-08-14',
        evrakNo: '2026/12494 Muh.',
        evrakTarihi: '2026-08-10',
        aliciMakam: 'komisyon',
        status: 'ayrilis_yapildi', // 'ayrilis_yapildi', 'baslayis_yapildi'
        baslayisEvrakNo: null,
        baslayisDate: null
      },
      {
        id: 'rec-2',
        personnelId: '2',
        personnelName: 'Erdal ŞİMŞEK',
        sicil: '96214',
        unvan: 'Bilgisayar İşletmeni',
        leaveType: 'rapor',
        leaveTypeName: 'İstirahat Raporu / Sağlık İzni',
        days: 11,
        ayrilisDate: '2026-05-18',
        expectedReturnDate: '2026-05-29',
        evrakNo: '2026/7568 Muh.',
        evrakTarihi: '2026-05-18',
        raporKurum: 'Sağlık Bakanlığı Ankara Etlik Şehir Hastanesi',
        aliciMakam: 'bakanlik',
        status: 'baslayis_yapildi',
        baslayisEvrakNo: '2026/8358 Muh.',
        baslayisDate: '2026-06-08'
      }
    ];
    localStorage.setItem(STORAGE_KEYS.LEAVE_RECORDS, JSON.stringify(initialRecords));
    return initialRecords;
  }
  return JSON.parse(data);
}

export function saveLeaveRecords(records) {
  localStorage.setItem(STORAGE_KEYS.LEAVE_RECORDS, JSON.stringify(records));
}

export function addLeaveRecord(record) {
  const records = getLeaveRecords();
  records.unshift(record);
  saveLeaveRecords(records);
  return record;
}

export function updateLeaveRecord(id, updates) {
  const records = getLeaveRecords();
  const index = records.findIndex(r => r.id === id);
  if (index !== -1) {
    records[index] = { ...records[index], ...updates };
    saveLeaveRecords(records);
    return records[index];
  }
  return null;
}
