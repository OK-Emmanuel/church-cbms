import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ──────────────────────────────────────────────────────────────────────────────
// Replace these placeholder values with your Firebase project configuration.
// You can find them in: Firebase Console → Project Settings → Your apps → SDK setup
// ──────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// ──────────────────────────────────────────────────────────────────────────────
// Shared constants
// ──────────────────────────────────────────────────────────────────────────────
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ──────────────────────────────────────────────────────────────────────────────
// Derive data-completeness status from a submission record
// ──────────────────────────────────────────────────────────────────────────────
export function getCompletenessStatus(record) {
  const hasName = Boolean(record.name?.trim());
  const hasDob = Boolean(record.date_of_birth);
  const hasPhoto = Boolean(record.photo_url);

  if (hasName && hasDob && hasPhoto) return 'complete';
  if (hasName && hasDob && !hasPhoto) return 'missing_photo';
  if (hasName && !hasDob) return 'missing_dob';
  return 'incomplete';
}

// ──────────────────────────────────────────────────────────────────────────────
// Returns an HTML badge string for a completeness status value
// ──────────────────────────────────────────────────────────────────────────────
export function getStatusBadge(status) {
  switch (status) {
    case 'complete':
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">✅ Complete</span>';
    case 'missing_photo':
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">⚠ Missing Photo</span>';
    case 'missing_dob':
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">⚠ Missing DOB</span>';
    default:
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">⚠ Incomplete</span>';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Format a date string (YYYY-MM-DD) for display
// ──────────────────────────────────────────────────────────────────────────────
export function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ──────────────────────────────────────────────────────────────────────────────
// Compress and resize an image file to max 800×800 px at 80 % JPEG quality
// ──────────────────────────────────────────────────────────────────────────────
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const MAX_SIDE = 800;
    const QUALITY = 0.8;

    const img = new Image();
    img.onerror = () => reject(new Error('Failed to load image for compression'));

    img.onload = () => {
      let { width, height } = img;

      if (width > MAX_SIDE) {
        height = Math.round((height * MAX_SIDE) / width);
        width = MAX_SIDE;
      }
      if (height > MAX_SIDE) {
        width = Math.round((width * MAX_SIDE) / height);
        height = MAX_SIDE;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'));
        },
        'image/jpeg',
        QUALITY,
      );
    };

    img.src = URL.createObjectURL(file);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Escape HTML to prevent XSS when inserting user content via innerHTML
// ──────────────────────────────────────────────────────────────────────────────
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str ?? '')));
  return div.innerHTML;
}
