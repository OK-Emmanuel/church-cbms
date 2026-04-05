import { auth, db } from './app.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

// If already signed in, redirect immediately
onAuthStateChanged(auth, async (user) => {
  if (user) await redirectByRole(user);
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in…';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserRecord(user);
    await redirectByRole(user);
  } catch (err) {
    console.error('Login error:', err);
    loginError.textContent = friendlyError(err.code);
    loginError.classList.remove('hidden');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Create a Firestore user record on first login (role defaults to 'leader')
// ──────────────────────────────────────────────────────────────────────────────
async function ensureUserRecord(user) {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      email: user.email,
      name: user.displayName || user.email.split('@')[0],
      role: 'leader',
      assigned_month: null,
      created_at: new Date().toISOString(),
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Redirect to the correct dashboard based on role
// ──────────────────────────────────────────────────────────────────────────────
async function redirectByRole(user) {
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const role = snap.exists() ? snap.data().role : 'leader';
    window.location.href = role === 'admin' ? 'admin.html' : 'leader.html';
  } catch {
    window.location.href = 'leader.html';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Human-readable Firebase Auth error messages
// ──────────────────────────────────────────────────────────────────────────────
function friendlyError(code) {
  const map = {
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
  };
  return map[code] ?? 'Login failed. Please try again.';
}
