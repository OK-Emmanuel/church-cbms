import {
  db,
  storage,
  auth,
  MONTHS,
  getCompletenessStatus,
  getStatusBadge,
  formatDate,
  compressImage,
  escapeHtml,
} from './app.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// ──────────────────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────────────────
let allRecords = [];
let assignedMonth = null;
let assignedMonthName = '';

// ──────────────────────────────────────────────────────────────────────────────
// Auth guard — leaders and admins may access; admins are redirected to admin.html
// ──────────────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) { window.location.href = 'login.html'; return; }

  const userData = snap.data();

  if (userData.role === 'admin') {
    window.location.href = 'admin.html';
    return;
  }

  // Reveal identity in header
  document.getElementById('leader-name').textContent = userData.name || user.email;
  document.getElementById('loading').classList.add('hidden');

  if (!userData.assigned_month) {
    document.getElementById('no-month-msg').classList.remove('hidden');
    return;
  }

  assignedMonth = userData.assigned_month;
  assignedMonthName = MONTHS[assignedMonth - 1];

  document.getElementById('leader-month').textContent = assignedMonthName;
  document.getElementById('leader-stats').classList.remove('hidden');
  document.getElementById('leader-actions').classList.remove('hidden');
  document.getElementById('records-list').classList.remove('hidden');

  setupSearch();
  await loadRecords();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'login.html';
});

// ──────────────────────────────────────────────────────────────────────────────
// Search
// ──────────────────────────────────────────────────────────────────────────────
function setupSearch() {
  document.getElementById('search-input').addEventListener('input', renderRecords);
}

// ──────────────────────────────────────────────────────────────────────────────
// Load submissions for the assigned birth month
// ──────────────────────────────────────────────────────────────────────────────
async function loadRecords() {
  const q = query(
    collection(db, 'submissions'),
    where('birth_month', '==', assignedMonth),
    orderBy('name'),
  );
  const snap = await getDocs(q);
  allRecords = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderRecords();
  updateStats();
}

function updateStats() {
  const total = allRecords.length;
  const complete = allRecords.filter((r) => getCompletenessStatus(r) === 'complete').length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-complete').textContent = complete;
  document.getElementById('stat-incomplete').textContent = total - complete;
}

// ──────────────────────────────────────────────────────────────────────────────
// Render the card list
// ──────────────────────────────────────────────────────────────────────────────
function renderRecords() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const filtered = allRecords.filter(
    (r) => !search || r.name?.toLowerCase().includes(search),
  );
  const list = document.getElementById('records-list');

  if (!filtered.length) {
    list.innerHTML = '<div class="text-center py-10 text-gray-400">No celebrants found for this month.</div>';
    return;
  }

  list.innerHTML = filtered.map((r) => {
    const status = getCompletenessStatus(r);
    const photoEl = r.photo_url
      ? `<img src="${escapeHtml(r.photo_url)}" alt="" class="h-14 w-14 object-cover rounded-full flex-shrink-0">`
      : `<div class="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-[10px] text-center leading-tight flex-shrink-0">No photo</div>`;

    return `
      <div class="bg-white rounded-xl shadow p-4 flex items-center gap-4">
        ${photoEl}
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-gray-800 truncate">${escapeHtml(r.name || '—')}</p>
          <p class="text-sm text-gray-500">${formatDate(r.date_of_birth)}</p>
          <div class="mt-1">${getStatusBadge(status)}</div>
        </div>
        <button
          class="text-purple-600 hover:text-purple-800 text-sm font-medium flex-shrink-0 edit-btn"
          data-id="${escapeHtml(r.id)}"
        >
          Edit
        </button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const record = allRecords.find((r) => r.id === btn.dataset.id);
      if (record) openRecordModal(record);
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Record modal (add / edit)
// ──────────────────────────────────────────────────────────────────────────────
const recordModal = document.getElementById('record-modal');
const recordForm = document.getElementById('record-form');
const modalMsg = document.getElementById('modal-message');
const modalSave = document.getElementById('modal-save');

document.getElementById('add-record-btn').addEventListener('click', () => openRecordModal());
document.getElementById('modal-cancel').addEventListener('click', () => recordModal.classList.add('hidden'));

function openRecordModal(record = null) {
  document.getElementById('modal-title').textContent = record ? 'Edit Record' : 'Add Record';
  document.getElementById('record-id').value = record?.id || '';
  document.getElementById('record-name').value = record?.name || '';
  document.getElementById('record-dob').value = record?.date_of_birth || '';
  document.getElementById('record-photo').value = '';

  const preview = document.getElementById('record-photo-preview');
  if (record?.photo_url) {
    preview.src = record.photo_url;
    preview.classList.remove('hidden');
  } else {
    preview.src = '';
    preview.classList.add('hidden');
  }

  modalMsg.classList.add('hidden');
  recordModal.classList.remove('hidden');
}

recordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  modalSave.disabled = true;
  modalMsg.classList.add('hidden');

  const id = document.getElementById('record-id').value;
  const name = document.getElementById('record-name').value.trim();
  const dob = document.getElementById('record-dob').value;
  const photoFile = document.getElementById('record-photo').files[0];

  if (!name || !dob) {
    showModalMsg('Name and Date of Birth are required.', 'error');
    modalSave.disabled = false;
    return;
  }

  let photoUrl = id ? (allRecords.find((r) => r.id === id)?.photo_url || '') : '';
  let photoStoragePath = id ? (allRecords.find((r) => r.id === id)?.photo_storage_path || '') : '';

  try {
    if (photoFile) {
      modalSave.textContent = 'Uploading…';
      let blob;
      try { blob = await compressImage(photoFile); } catch { blob = photoFile; }
      const safeName = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `photos/${Date.now()}_${safeName}`;
      await uploadBytes(ref(storage, path), blob);
      photoUrl = await getDownloadURL(ref(storage, path));
      photoStoragePath = path;
    }

    const data = {
      name,
      date_of_birth: dob,
      birth_month: assignedMonth,
      birth_month_name: assignedMonthName,
      photo_url: photoUrl,
      photo_storage_path: photoStoragePath,
      completeness_status: getCompletenessStatus({ name, date_of_birth: dob, photo_url: photoUrl }),
      updated_at: serverTimestamp(),
    };

    if (id) {
      await updateDoc(doc(db, 'submissions', id), data);
    } else {
      data.created_at = serverTimestamp();
      await addDoc(collection(db, 'submissions'), data);
    }

    recordModal.classList.add('hidden');
    await loadRecords();
  } catch (err) {
    console.error('Save error:', err);
    showModalMsg('Failed to save. Please try again.', 'error');
  } finally {
    modalSave.disabled = false;
    modalSave.textContent = 'Save';
  }
});

function showModalMsg(msg, type) {
  modalMsg.textContent = msg;
  modalMsg.className = type === 'error' ? 'text-red-500 text-sm text-center' : 'text-green-600 text-sm text-center';
  modalMsg.classList.remove('hidden');
}
