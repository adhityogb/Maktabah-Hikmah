'use strict';

const books = [
  {id:'t1', title:'Tafsir Ibnu Katsir', subtitle:'Jilid 1', category:'tafsir', pages:600, glyph:'١', colors:['#315c78','#173246'], keywords:'tafsir ibnu katsir jilid satu al fatihah al baqarah'},
  {id:'t2', title:'Tafsir Ibnu Katsir', subtitle:'Jilid 2', category:'tafsir', pages:496, glyph:'٢', colors:['#5d6b42','#2c3920'], keywords:'tafsir ibnu katsir jilid dua ali imran an nisa'},
  {id:'t3', title:'Tafsir Ibnu Katsir', subtitle:'Jilid 3', category:'tafsir', pages:531, glyph:'٣', colors:['#8a5b42','#4f2e22'], keywords:'tafsir ibnu katsir jilid tiga al maidah'},
  {id:'t4', title:'Tafsir Ibnu Katsir', subtitle:'Jilid 4', category:'tafsir', pages:578, glyph:'٤', colors:['#725f86','#3b2d4b'], keywords:'tafsir ibnu katsir jilid empat al anfal'},
  {id:'t5', title:'Tafsir Ibnu Katsir', subtitle:'Jilid 5', category:'tafsir', pages:636, glyph:'٥', colors:['#2f7868','#17453b'], keywords:'tafsir ibnu katsir jilid lima al hijr an nahl'},
  {id:'t6', title:'Tafsir Ibnu Katsir', subtitle:'Jilid 6', category:'tafsir', pages:0, glyph:'٦', colors:['#6e6f72','#36383b'], keywords:'tafsir ibnu katsir jilid enam'},
  {id:'t7', title:'Tafsir Ibnu Katsir', subtitle:'Jilid 7', category:'tafsir', pages:664, glyph:'٧', colors:['#4e6d8e','#263d59'], keywords:'tafsir ibnu katsir jilid tujuh ash shaaffaat az zumar'},
  {id:'t8', title:'Tafsir Ibnu Katsir', subtitle:'Jilid 8', category:'tafsir', pages:658, glyph:'٨', colors:['#8c6b42','#4c351f'], keywords:'tafsir ibnu katsir jilid delapan al waqiah al hadid'},
  {id:'sejarah', title:'Sejarah Al-Quran', subtitle:'Ta’rikh Al-Quran', category:'bacaan', pages:129, glyph:'ق', colors:['#735b42','#3b2c20'], keywords:'sejarah alquran tarikh quran mushaf qiraat'},
  {id:'kisah', title:'101 Kisah Orang yang Dikabulkan Doanya', subtitle:'Kisah & hikmah', category:'bacaan', pages:150, glyph:'د', colors:['#7b3944','#421b24'], keywords:'101 kisah doa dikabulkan orang saleh'},
  {id:'doa', title:'Kumpulan Doa Sehari-hari', subtitle:'Kementerian Agama RI', category:'bacaan', pages:154, glyph:'ر', colors:['#497a65','#244838'], keywords:'doa sehari hari harian kementerian agama'}
];

const DB_NAME = 'maktabah-hikmah';
const DB_VERSION = 1;
const STORE = 'pdfs';
const $ = selector => document.querySelector(selector);
const grid = $('#bookGrid');
const searchInput = $('#searchInput');
const emptyState = $('#emptyState');
const bookCount = $('#bookCount');
const reader = $('#reader');
const pdfFrame = $('#pdfFrame');
const pageInput = $('#pageInput');
const toast = $('#toast');
const fileInput = $('#fileInput');
const replaceInput = $('#replaceInput');

let db;
let filter = 'all';
let activeBook = null;
let activeObjectUrl = null;
let replaceTarget = null;
let stored = new Map();

const state = {
  favorites: new Set(JSON.parse(localStorage.getItem('mh-favorites') || '[]')),
  progress: JSON.parse(localStorage.getItem('mh-progress') || '{}'),
  last: JSON.parse(localStorage.getItem('mh-last') || 'null')
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, {keyPath:'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(mode='readonly') {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function getAllPdfs() {
  return new Promise((resolve, reject) => {
    const request = tx().getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function getPdf(id) {
  return new Promise((resolve, reject) => {
    const request = tx().get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function putPdf(record) {
  return new Promise((resolve, reject) => {
    const request = tx('readwrite').put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deletePdf(id) {
  return new Promise((resolve, reject) => {
    const request = tx('readwrite').delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function formatSize(bytes=0) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1900);
}

function bookById(id) {
  return books.find(book => book.id === id);
}

function normalizeName(name='') {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
}

function identifyFile(file) {
  const name = normalizeName(file.name);
  const jilid = name.match(/(?:jilid|jld|volume|vol)\s*([1-8])\b/);
  if ((name.includes('tafsir') || name.includes('katsir')) && jilid) return `t${jilid[1]}`;
  if (name.includes('sejarah') && (name.includes('alquran') || name.includes('quran'))) return 'sejarah';
  if (name.includes('tarikh') && name.includes('quran')) return 'sejarah';
  if (name.includes('101') && name.includes('kisah')) return 'kisah';
  if (name.includes('kumpulan') && name.includes('doa')) return 'doa';
  if (name.includes('doa') && name.includes('sehari')) return 'doa';
  return null;
}

function persistFavorites() {
  localStorage.setItem('mh-favorites', JSON.stringify([...state.favorites]));
}

function cardTemplate(book) {
  const record = stored.get(book.id);
  const favorite = state.favorites.has(book.id);
  const savedPage = state.progress[book.id] || 1;
  const status = record ? `Tersimpan · ${formatSize(record.size)}` : 'Belum diimpor';
  return `<article class="book-card" data-id="${book.id}">
    <div class="cover-wrap">
      <div class="cover-art" style="--cover-a:${book.colors[0]};--cover-b:${book.colors[1]}">
        <span class="cover-arabic">${book.glyph}</span>
        <div class="cover-title">
          <small>Maktabah Hikmah</small>
          <strong>${escapeHtml(book.title)}</strong>
          <span>${escapeHtml(book.subtitle)}</span>
        </div>
      </div>
      <span class="badge">${book.category === 'tafsir' ? 'TAFSIR' : 'BACAAN'}</span>
      <button class="fav-btn ${favorite ? 'active' : ''}" data-action="favorite" aria-label="Favorit">${favorite ? '★' : '☆'}</button>
      ${record ? '<span class="stored-dot">✓ LOKAL</span>' : ''}
    </div>
    <div class="book-info">
      <h4>${escapeHtml(book.title)}</h4>
      <p>${escapeHtml(book.subtitle)} · ${status}${record && savedPage > 1 ? ` · hal. ${savedPage}` : ''}</p>
      <div class="book-actions">
        <button class="primary" data-action="${record ? 'read' : 'import'}">${record ? 'Baca' : 'Impor PDF'}</button>
        ${record ? '<button class="secondary" data-action="replace">Ganti</button>' : ''}
      </div>
    </div>
  </article>`;
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = books.filter(book => {
    const isStored = stored.has(book.id);
    const filterMatch = filter === 'all' || book.category === filter || (filter === 'stored' && isStored) || (filter === 'favorite' && state.favorites.has(book.id));
    const haystack = `${book.title} ${book.subtitle} ${book.keywords}`.toLowerCase();
    return filterMatch && (!query || haystack.includes(query));
  });
  grid.innerHTML = filtered.map(cardTemplate).join('');
  bookCount.textContent = `${filtered.length} dari ${books.length} buku`;
  emptyState.classList.toggle('show', filtered.length === 0);
  updateStats();
  updateContinue();
}

function updateStats() {
  const records = [...stored.values()];
  const bytes = records.reduce((sum, item) => sum + (item.size || 0), 0);
  $('#storedCount').textContent = records.length;
  $('#totalSize').textContent = formatSize(bytes);
}

function updateContinue() {
  const card = $('#continueCard');
  if (!state.last || !stored.has(state.last.id)) {
    card.classList.remove('show');
    return;
  }
  const book = bookById(state.last.id);
  if (!book) return;
  $('#continueGlyph').textContent = book.glyph;
  $('#continueTitle').textContent = `${book.title} — ${book.subtitle}`;
  $('#continueMeta').textContent = `Lanjut dari halaman ${state.progress[book.id] || state.last.page || 1}`;
  card.dataset.id = book.id;
  card.classList.add('show');
}

async function refreshStored() {
  const records = await getAllPdfs();
  stored = new Map(records.map(record => [record.id, record]));
  render();
}

async function importFiles(files, forcedId=null) {
  const results = [];
  for (const file of files) {
    const id = forcedId || identifyFile(file);
    if (!id) {
      results.push({name:file.name, ok:false, message:'Nama file tidak dikenali'});
      continue;
    }
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      results.push({name:file.name, ok:false, message:'Bukan file PDF'});
      continue;
    }
    try {
      await putPdf({id, name:file.name, size:file.size, type:file.type || 'application/pdf', blob:file, updatedAt:Date.now()});
      results.push({name:file.name, ok:true, message:`Disimpan sebagai ${bookById(id).title} — ${bookById(id).subtitle}`});
    } catch (error) {
      results.push({name:file.name, ok:false, message:error?.name === 'QuotaExceededError' ? 'Penyimpanan iPad tidak cukup' : 'Gagal menyimpan PDF'});
    }
  }
  await refreshStored();
  showImportSummary(results);
}

function showImportSummary(results) {
  $('#importSummary').innerHTML = results.map(result => `<div class="import-row"><strong>${result.ok ? '✓' : '!' } ${escapeHtml(result.name)}</strong><span>${escapeHtml(result.message)}</span></div>`).join('');
  openSheet('importSheet');
}

function openSheet(id) {
  $(`#${id}`).classList.add('open');
}

function closeSheet(id) {
  $(`#${id}`).classList.remove('open');
}

async function openBook(book, requestedPage) {
  const record = await getPdf(book.id);
  if (!record?.blob) {
    replaceTarget = book.id;
    replaceInput.click();
    return;
  }
  closeActiveUrl();
  activeBook = book;
  activeObjectUrl = URL.createObjectURL(record.blob);
  const page = Math.max(1, Number(requestedPage) || state.progress[book.id] || 1);
  pageInput.value = page;
  $('#readerTitle').textContent = `${book.title} — ${book.subtitle}`;
  $('#readerSubtitle').textContent = `${record.name} · ${formatSize(record.size)}`;
  pdfFrame.src = `${activeObjectUrl}#page=${page}&view=FitH`;
  reader.classList.add('open');
  document.body.style.overflow = 'hidden';
  state.last = {id:book.id, page, time:Date.now()};
  localStorage.setItem('mh-last', JSON.stringify(state.last));
  updateContinue();
}

function closeActiveUrl() {
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = null;
}

function savePage() {
  if (!activeBook) return;
  const page = Math.max(1, Number(pageInput.value) || 1);
  state.progress[activeBook.id] = page;
  state.last = {id:activeBook.id, page, time:Date.now()};
  localStorage.setItem('mh-progress', JSON.stringify(state.progress));
  localStorage.setItem('mh-last', JSON.stringify(state.last));
  showToast(`Halaman ${page} disimpan`);
  render();
}

function closeReader() {
  savePage();
  reader.classList.remove('open');
  document.body.style.overflow = '';
  pdfFrame.src = 'about:blank';
  closeActiveUrl();
  activeBook = null;
}

function openPdfFull() {
  if (!activeObjectUrl || !activeBook) return;
  const page = Math.max(1, Number(pageInput.value) || 1);
  const anchor = document.createElement('a');
  anchor.href = `${activeObjectUrl}#page=${page}`;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function renderManage() {
  $('#manageList').innerHTML = books.map(book => {
    const record = stored.get(book.id);
    return `<div class="manage-item" data-id="${book.id}">
      <div><strong>${escapeHtml(book.title)} — ${escapeHtml(book.subtitle)}</strong><span>${record ? `${escapeHtml(record.name)} · ${formatSize(record.size)}` : 'Belum tersimpan'}</span></div>
      <div class="manage-buttons">
        <button data-manage="replace">${record ? 'Ganti' : 'Impor'}</button>
        ${record ? '<button class="danger" data-manage="delete">Hapus</button>' : ''}
      </div>
    </div>`;
  }).join('');
}

async function deleteStoredBook(id) {
  const book = bookById(id);
  if (!confirm(`Hapus PDF ${book.title} — ${book.subtitle} dari perangkat ini?`)) return;
  await deletePdf(id);
  delete state.progress[id];
  localStorage.setItem('mh-progress', JSON.stringify(state.progress));
  await refreshStored();
  renderManage();
  showToast('PDF lokal dihapus');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}

grid.addEventListener('click', event => {
  const card = event.target.closest('.book-card');
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!card || !action) return;
  const book = bookById(card.dataset.id);
  if (action === 'read') openBook(book);
  if (action === 'import' || action === 'replace') {
    replaceTarget = book.id;
    replaceInput.value = '';
    replaceInput.click();
  }
  if (action === 'favorite') {
    state.favorites.has(book.id) ? state.favorites.delete(book.id) : state.favorites.add(book.id);
    persistFavorites();
    render();
  }
});

searchInput.addEventListener('input', render);
$('#filters').addEventListener('click', event => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach(item => item.classList.remove('active'));
  chip.classList.add('active');
  filter = chip.dataset.filter;
  render();
});

['importTopBtn','importHeroBtn','manageImportBtn'].forEach(id => $(`#${id}`).addEventListener('click', () => {
  fileInput.value = '';
  fileInput.click();
}));
fileInput.addEventListener('change', () => importFiles([...fileInput.files]));
replaceInput.addEventListener('change', () => {
  if (replaceInput.files[0] && replaceTarget) importFiles([replaceInput.files[0]], replaceTarget);
});

$('#continueCard').addEventListener('click', event => {
  const book = bookById(event.currentTarget.dataset.id);
  openBook(book, state.progress[book.id] || state.last?.page || 1);
});
$('#closeReader').addEventListener('click', closeReader);
$('#savePage').addEventListener('click', savePage);
$('#openPdf').addEventListener('click', openPdfFull);
pageInput.addEventListener('keydown', event => { if (event.key === 'Enter') savePage(); });
$('#hideHint').addEventListener('click', () => $('#readerHint').classList.add('hidden'));

$('#infoBtn').addEventListener('click', () => openSheet('infoSheet'));
$('#installHelpBtn').addEventListener('click', () => openSheet('infoSheet'));
$('#manageBtn').addEventListener('click', () => { renderManage(); openSheet('manageSheet'); });
$('#manageList').addEventListener('click', event => {
  const row = event.target.closest('.manage-item');
  const action = event.target.closest('[data-manage]')?.dataset.manage;
  if (!row || !action) return;
  if (action === 'delete') deleteStoredBook(row.dataset.id);
  if (action === 'replace') {
    replaceTarget = row.dataset.id;
    replaceInput.value = '';
    replaceInput.click();
  }
});
document.querySelectorAll('[data-close-sheet]').forEach(button => button.addEventListener('click', () => closeSheet(button.dataset.closeSheet)));
document.querySelectorAll('.sheet').forEach(sheet => sheet.addEventListener('click', event => { if (event.target === sheet) closeSheet(sheet.id); }));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && reader.classList.contains('open')) closeReader();
});

const themeOrder = ['light','sepia','dark'];
let theme = localStorage.getItem('mh-theme') || 'light';
function applyTheme() {
  document.documentElement.dataset.theme = theme === 'light' ? '' : theme;
  localStorage.setItem('mh-theme', theme);
  $('#themeBtn').textContent = theme === 'dark' ? '☾' : theme === 'sepia' ? '◒' : '◐';
}
$('#themeBtn').addEventListener('click', () => {
  theme = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length];
  applyTheme();
});

(async function init() {
  applyTheme();
  registerServiceWorker();
  try {
    db = await openDb();
    await refreshStored();
  } catch (error) {
    render();
    showToast('Penyimpanan lokal tidak tersedia');
  }
})();
