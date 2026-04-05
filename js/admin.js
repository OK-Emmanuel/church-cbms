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
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// ──────────────────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────────────────
let allSubmissions = [];
let allLeaders = [];
let allUsers = [];
let allMonths = [];
let currentMonthFilter = '';

// ──────────────────────────────────────────────────────────────────────────────
// Auth guard — only admins may access this page
// ──────────────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists() || snap.data().role !== 'admin') {
    window.location.href = 'login.html';
    return;
  }

  document.getElementById('admin-name').textContent = snap.data().name || user.email;
  await initAdmin();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'login.html';
});

// ──────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ──────────────────────────────────────────────────────────────────────────────
async function initAdmin() {
  await ensureMonths();
  setupTabs();
  setupSearch();
  populateMonthFilter();
  await Promise.all([loadSubmissions(), loadUsers(), loadMonths()]);
}

// Create the 12-month documents in Firestore if they don't already exist
async function ensureMonths() {
  const snap = await getDocs(collection(db, 'months'));
  const existing = new Set(snap.docs.map((d) => d.data().month_number));
  const promises = [];
  for (let i = 1; i <= 12; i++) {
    if (!existing.has(i)) {
      promises.push(
        setDoc(doc(db, 'months', String(i)), {
          month_number: i,
          month_name: MONTHS[i - 1],
          leader_id: null,
        }),
      );
    }
  }
  await Promise.all(promises);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab navigation
// ──────────────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.replace('bg-purple-600', 'bg-white');
        b.classList.replace('text-white', 'text-gray-600');
        b.classList.add('border');
      });
      btn.classList.replace('bg-white', 'bg-purple-600');
      btn.classList.replace('text-gray-600', 'text-white');
      btn.classList.remove('border');

      document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hidden'));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');

      if (btn.dataset.tab === 'leaders') renderMonthCards();
      if (btn.dataset.tab === 'users') renderUsersTable();
    });
  });
}

function setupSearch() {
  document.getElementById('search-input').addEventListener('input', applyFilters);
}

function populateMonthFilter() {
  const sel = document.getElementById('month-filter');
  MONTHS.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = String(i + 1);
    opt.textContent = m;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    currentMonthFilter = sel.value;
    applyFilters();
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Data loading
// ──────────────────────────────────────────────────────────────────────────────
async function loadSubmissions() {
  const snap = await getDocs(
    query(collection(db, 'submissions'), orderBy('created_at', 'desc')),
  );
  allSubmissions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  applyFilters();
  updateStats();
}

async function loadUsers() {
  const snap = await getDocs(collection(db, 'users'));
  allUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  allLeaders = allUsers.filter((u) => u.role === 'leader');
}

async function loadMonths() {
  const snap = await getDocs(collection(db, 'months'));
  allMonths = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.month_number - b.month_number);
}

// ──────────────────────────────────────────────────────────────────────────────
// Filtering & stats
// ──────────────────────────────────────────────────────────────────────────────
function applyFilters() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const filtered = allSubmissions.filter((s) => {
    const monthMatch = !currentMonthFilter || String(s.birth_month) === currentMonthFilter;
    const nameMatch = !search || s.name?.toLowerCase().includes(search);
    return monthMatch && nameMatch;
  });
  renderSubmissionsTable(filtered);
}

function updateStats() {
  const total = allSubmissions.length;
  const complete = allSubmissions.filter(
    (s) => getCompletenessStatus(s) === 'complete',
  ).length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-complete').textContent = complete;
  document.getElementById('stat-incomplete').textContent = total - complete;
}

// ──────────────────────────────────────────────────────────────────────────────
// Submissions table
// ──────────────────────────────────────────────────────────────────────────────
function renderSubmissionsTable(rows) {
  const tbody = document.getElementById('submissions-tbody');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-gray-400">No submissions found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((s) => {
    const status = getCompletenessStatus(s);
    const monthName = s.birth_month_name || MONTHS[(s.birth_month || 1) - 1] || '—';
    const photoEl = s.photo_url
      ? `<img src="${escapeHtml(s.photo_url)}" alt="" class="h-10 w-10 object-cover rounded-full">`
      : `<div class="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-[10px] text-center leading-tight">No photo</div>`;

    return `
      <tr class="border-b hover:bg-gray-50">
        <td class="py-3 px-4">${photoEl}</td>
        <td class="py-3 px-4 font-medium text-gray-800">${escapeHtml(s.name || '—')}</td>
        <td class="py-3 px-4 text-gray-600">${formatDate(s.date_of_birth)}</td>
        <td class="py-3 px-4 text-gray-600">${escapeHtml(monthName)}</td>
        <td class="py-3 px-4">${getStatusBadge(status)}</td>
        <td class="py-3 px-4">
          <div class="flex gap-3">
            <button class="text-blue-600 hover:text-blue-800 text-sm" data-action="edit" data-id="${escapeHtml(s.id)}">Edit</button>
            <button class="text-red-500 hover:text-red-700 text-sm" data-action="delete" data-id="${escapeHtml(s.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Delegate click events on the table body
  tbody.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { action, id } = btn.dataset;
      if (action === 'edit') openRecordModal(allSubmissions.find((s) => s.id === id));
      if (action === 'delete') deleteRecord(id);
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// CSV Export
// ──────────────────────────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', () => {
  const search = document.getElementById('search-input').value.toLowerCase();
  const data = allSubmissions.filter((s) => {
    const monthMatch = !currentMonthFilter || String(s.birth_month) === currentMonthFilter;
    const nameMatch = !search || s.name?.toLowerCase().includes(search);
    return monthMatch && nameMatch;
  });

  if (!data.length) { alert('No data to export.'); return; }

  const headers = ['Name', 'Date of Birth', 'Birth Month', 'Status', 'Photo URL'];
  const rows = data.map((s) => [
    s.name || '',
    s.date_of_birth || '',
    s.birth_month_name || MONTHS[(s.birth_month || 1) - 1] || '',
    getCompletenessStatus(s),
    s.photo_url || '',
  ]);

  const monthLabel = currentMonthFilter ? MONTHS[parseInt(currentMonthFilter) - 1] : 'All';
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CBMS_${monthLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

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

  const dobDate = new Date(dob + 'T00:00:00');
  const birthMonth = dobDate.getMonth() + 1;
  const birthMonthName = MONTHS[dobDate.getMonth()];

  let photoUrl = id ? (allSubmissions.find((s) => s.id === id)?.photo_url || '') : '';
  let photoStoragePath = id ? (allSubmissions.find((s) => s.id === id)?.photo_storage_path || '') : '';

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
      birth_month: birthMonth,
      birth_month_name: birthMonthName,
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
    await loadSubmissions();
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

// ──────────────────────────────────────────────────────────────────────────────
// Delete record
// ──────────────────────────────────────────────────────────────────────────────
async function deleteRecord(id) {
  if (!confirm('Are you sure you want to delete this record? This cannot be undone.')) return;
  try {
    const record = allSubmissions.find((s) => s.id === id);
    if (record?.photo_storage_path) {
      try { await deleteObject(ref(storage, record.photo_storage_path)); } catch { /* ignore */ }
    }
    await deleteDoc(doc(db, 'submissions', id));
    await loadSubmissions();
  } catch (err) {
    console.error('Delete error:', err);
    alert('Failed to delete record.');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Month Leaders tab
// ──────────────────────────────────────────────────────────────────────────────
function renderMonthCards() {
  const container = document.getElementById('month-cards');
  container.innerHTML = '';

  allMonths.forEach((month) => {
    const leader = allUsers.find((u) => u.id === month.leader_id);
    const count = allSubmissions.filter((s) => s.birth_month === month.month_number).length;

    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl shadow p-4';
    card.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-gray-800">${escapeHtml(month.month_name)}</h3>
        <span class="text-xs text-gray-400">${count} submission${count !== 1 ? 's' : ''}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm ${leader ? 'text-green-700' : 'text-gray-400'}">
          ${leader ? '👤 ' + escapeHtml(leader.name || leader.email) : 'No leader assigned'}
        </span>
        <button
          class="text-xs text-purple-600 hover:text-purple-800 font-medium assign-btn"
          data-month-id="${escapeHtml(month.id)}"
          data-month-name="${escapeHtml(month.month_name)}"
          data-leader-id="${escapeHtml(month.leader_id || '')}"
        >
          ${leader ? 'Change' : 'Assign'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('.assign-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openLeaderModal(btn.dataset.monthId, btn.dataset.monthName, btn.dataset.leaderId);
    });
  });
}

// Leader assignment modal
const leaderModal = document.getElementById('leader-modal');

function openLeaderModal(monthId, monthName, currentLeaderId) {
  document.getElementById('assign-month-name').textContent = monthName;
  document.getElementById('assign-month-id').value = monthId;

  const sel = document.getElementById('leader-select');
  sel.innerHTML = '<option value="">— No Leader —</option>';
  allLeaders.forEach((l) => {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.name || l.email;
    if (l.id === currentLeaderId) opt.selected = true;
    sel.appendChild(opt);
  });

  leaderModal.classList.remove('hidden');
}

document.getElementById('leader-modal-cancel').addEventListener('click', () => {
  leaderModal.classList.add('hidden');
});

document.getElementById('leader-modal-save').addEventListener('click', async () => {
  const monthId = document.getElementById('assign-month-id').value;
  const newLeaderId = document.getElementById('leader-select').value;
  const monthNum = parseInt(monthId, 10);

  try {
    // Clear assigned_month for the previous leader (if any)
    const prevMonth = allMonths.find((m) => m.id === monthId);
    if (prevMonth?.leader_id && prevMonth.leader_id !== newLeaderId) {
      await updateDoc(doc(db, 'users', prevMonth.leader_id), { assigned_month: null });
    }

    // Update the month document
    await updateDoc(doc(db, 'months', monthId), { leader_id: newLeaderId || null });

    // Update the new leader's assigned_month
    if (newLeaderId) {
      await updateDoc(doc(db, 'users', newLeaderId), { assigned_month: monthNum });
    }

    leaderModal.classList.add('hidden');
    await Promise.all([loadUsers(), loadMonths()]);
    renderMonthCards();
  } catch (err) {
    console.error('Assign error:', err);
    alert('Failed to assign leader.');
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Users tab
// ──────────────────────────────────────────────────────────────────────────────
function renderUsersTable() {
  const tbody = document.getElementById('users-tbody');

  if (!allUsers.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-gray-400">No users found. Users appear here after their first login.</td></tr>';
    return;
  }

  tbody.innerHTML = allUsers.map((u) => {
    const monthName = u.assigned_month ? MONTHS[u.assigned_month - 1] : '—';
    const roleBadge = u.role === 'admin'
      ? '<span class="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 font-medium">Admin</span>'
      : '<span class="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">Leader</span>';

    return `
      <tr class="border-b hover:bg-gray-50">
        <td class="py-3 px-4 font-medium text-gray-800">${escapeHtml(u.name || '—')}</td>
        <td class="py-3 px-4 text-gray-600">${escapeHtml(u.email || '—')}</td>
        <td class="py-3 px-4">${roleBadge}</td>
        <td class="py-3 px-4 text-gray-600">${escapeHtml(monthName)}</td>
        <td class="py-3 px-4">
          <button class="text-blue-600 hover:text-blue-800 text-sm edit-user-btn" data-id="${escapeHtml(u.id)}">
            Edit Role
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.edit-user-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const user = allUsers.find((u) => u.id === btn.dataset.id);
      if (user) openUserModal(user);
    });
  });
}

// User role modal
const userModal = document.getElementById('user-modal');

function openUserModal(user) {
  document.getElementById('edit-user-id').value = user.id;
  document.getElementById('edit-user-name').textContent = user.name || user.email;
  document.getElementById('edit-user-role').value = user.role || 'leader';
  userModal.classList.remove('hidden');
}

document.getElementById('user-modal-cancel').addEventListener('click', () => {
  userModal.classList.add('hidden');
});

document.getElementById('user-modal-save').addEventListener('click', async () => {
  const userId = document.getElementById('edit-user-id').value;
  const newRole = document.getElementById('edit-user-role').value;

  try {
    await updateDoc(doc(db, 'users', userId), { role: newRole });
    userModal.classList.add('hidden');
    await loadUsers();
    renderUsersTable();
  } catch (err) {
    console.error('Update user error:', err);
    alert('Failed to update user role.');
  }
});
