import { db, storage, MONTHS, compressImage } from './app.js';
import {
  collection,
  addDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// ──────────────────────────────────────────────────────────────────────────────
// DOM references
// ──────────────────────────────────────────────────────────────────────────────
const form = document.getElementById('submit-form');
const submitBtn = document.getElementById('submit-btn');
const formMessage = document.getElementById('form-message');
const formContainer = document.getElementById('form-container');
const successContainer = document.getElementById('success-container');
const dropZone = document.getElementById('drop-zone');
const photoInput = document.getElementById('photo');
const photoPreview = document.getElementById('photo-preview');
const uploadPlaceholder = document.getElementById('upload-placeholder');

// File selected from drag-and-drop or file picker
let selectedFile = null;

// ──────────────────────────────────────────────────────────────────────────────
// Photo upload interactions
// ──────────────────────────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => photoInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-purple-400', 'bg-purple-50');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('border-purple-400', 'bg-purple-50');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-purple-400', 'bg-purple-50');
  const file = e.dataTransfer?.files[0];
  if (file) handlePhotoFile(file);
});

photoInput.addEventListener('change', () => {
  if (photoInput.files[0]) handlePhotoFile(photoInput.files[0]);
});

function handlePhotoFile(file) {
  if (!file.type.match(/^image\/(jpeg|png)$/)) {
    showMessage('Only JPG and PNG images are accepted.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showMessage('File size must be under 10 MB.', 'error');
    return;
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    photoPreview.src = e.target.result;
    photoPreview.classList.remove('hidden');
    uploadPlaceholder.classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function showMessage(msg, type) {
  formMessage.textContent = msg;
  formMessage.className =
    type === 'error'
      ? 'text-red-500 text-sm text-center'
      : 'text-green-600 text-sm text-center';
  formMessage.classList.remove('hidden');
}

function hideMessage() {
  formMessage.classList.add('hidden');
}

function setSaving(label) {
  submitBtn.disabled = true;
  submitBtn.textContent = label;
}

function resetButton() {
  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit Registration';
}

// ──────────────────────────────────────────────────────────────────────────────
// Form submission
// ──────────────────────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();

  const name = document.getElementById('name').value.trim();
  const dob = document.getElementById('dob').value;
  const photoFile = selectedFile || photoInput.files[0];

  if (!name || !dob || !photoFile) {
    showMessage('Please fill in all required fields and upload a photo.', 'error');
    return;
  }

  // Derive birth month from the date-of-birth
  const dobDate = new Date(dob + 'T00:00:00');
  const birthMonth = dobDate.getMonth() + 1; // 1–12
  const birthMonthName = MONTHS[dobDate.getMonth()];

  setSaving('Uploading photo…');

  try {
    // Compress image before upload
    let uploadBlob;
    try {
      uploadBlob = await compressImage(photoFile);
    } catch {
      uploadBlob = photoFile; // fall back to original
    }

    // Build a safe, unique storage path
    const safeName = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `photos/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, fileName);
    await uploadBytes(storageRef, uploadBlob);
    const photoUrl = await getDownloadURL(storageRef);

    setSaving('Saving record…');

    await addDoc(collection(db, 'submissions'), {
      name,
      date_of_birth: dob,
      birth_month: birthMonth,
      birth_month_name: birthMonthName,
      photo_url: photoUrl,
      photo_storage_path: fileName,
      completeness_status: 'complete',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    // Show success screen
    formContainer.classList.add('hidden');
    successContainer.classList.remove('hidden');
  } catch (err) {
    console.error('Submission error:', err);
    showMessage('Submission failed. Please try again.', 'error');
  } finally {
    resetButton();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// "Submit Another" resets the whole form
// ──────────────────────────────────────────────────────────────────────────────
document.getElementById('submit-another').addEventListener('click', () => {
  form.reset();
  selectedFile = null;
  photoPreview.src = '';
  photoPreview.classList.add('hidden');
  uploadPlaceholder.classList.remove('hidden');
  formContainer.classList.remove('hidden');
  successContainer.classList.add('hidden');
  hideMessage();
});
