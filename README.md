# Church Birthday Management System (CBMS)

A lightweight, self-service web system that allows church members to submit their birthday details and photos, while enabling leaders to manage and export accurate monthly birthday data.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML + [Tailwind CSS](https://tailwindcss.com/) (CDN) + Vanilla JavaScript (ES Modules) |
| Database | [Firebase Firestore](https://firebase.google.com/docs/firestore) |
| File Storage | [Firebase Storage](https://firebase.google.com/docs/storage) |
| Authentication | [Firebase Auth](https://firebase.google.com/docs/auth) (leaders & admin only) |
| Hosting | [Firebase Hosting](https://firebase.google.com/docs/hosting) |

---

## Project Structure

```
church-cbms/
├── index.html              # Public birthday submission form (no login)
├── login.html              # Staff / Leader / Admin login
├── admin.html              # Admin dashboard
├── leader.html             # Leader dashboard
├── js/
│   ├── app.js              # Firebase init + shared utilities
│   ├── submit.js           # Public form submission logic
│   ├── auth.js             # Login / role-based redirect
│   ├── admin.js            # Admin dashboard logic
│   └── leader.js           # Leader dashboard logic
├── firebase.json           # Firebase Hosting configuration
├── firestore.rules         # Firestore security rules
├── storage.rules           # Firebase Storage security rules
└── firestore.indexes.json  # Composite indexes for Firestore queries
```

---

## Setup

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. Enable **Firestore Database** (start in production mode).
3. Enable **Firebase Storage**.
4. Enable **Firebase Authentication** → **Email/Password** provider.
5. Register a **Web app** in your project settings.

### 2. Add your Firebase config

Open `js/app.js` and replace the placeholder values with your project's configuration:

```js
const firebaseConfig = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT_ID.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId:             'YOUR_APP_ID',
};
```

You can find these values in **Firebase Console → Project Settings → Your apps → SDK setup and configuration**.

### 3. Deploy Firestore rules & indexes

Install the [Firebase CLI](https://firebase.google.com/docs/cli) if you haven't already:

```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
```

Then deploy the security rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 4. Create the first Admin account

1. In the Firebase Console, go to **Authentication → Users** and manually create an email/password user for the admin.
2. Visit the hosted (or locally-opened) `login.html` and sign in with that account.  
   On first login a Firestore record is created with `role: "leader"` by default.
3. In the Firebase Console, go to **Firestore → users collection** and find the document for that user.  
   Change the `role` field to `"admin"`.
4. Sign out and sign in again — you will be redirected to `admin.html`.

### 5. Create Leader accounts

1. In **Firebase Authentication → Users**, create an email/password user for each leader.
2. Have each leader sign in through `login.html` once so their Firestore record is created.
3. In the **Admin Dashboard → Users** tab, change their role to `"Leader"` if needed (default is already `leader`).
4. In the **Admin Dashboard → Month Leaders** tab, assign each leader to their birth month.

### 6. Deploy to Firebase Hosting (optional)

```bash
firebase deploy --only hosting
```

Or simply open `index.html` in a browser for local testing (note: Firebase SDK requires a valid config).

---

## User Roles

### Public Member (no login)
- Opens `index.html`
- Fills in: Full Name, Date of Birth, Photo
- Photo is compressed client-side before upload (max 800 × 800 px, JPEG 80 %)
- Birth month is auto-derived from the Date of Birth
- Sees a success confirmation after submission

### Birth Month Leader (login required)
- Signs in via `login.html` → redirected to `leader.html`
- Sees only the celebrants for their assigned month
- Can edit existing records or add new ones on behalf of members
- Completeness indicators highlight missing photos / DOB

### Admin (login required)
- Signs in via `login.html` → redirected to `admin.html`
- **Submissions tab** — view all submissions, filter by month / name, add / edit / delete records, export CSV
- **Month Leaders tab** — assign a leader to each of the 12 months
- **Users tab** — view all users who have signed in and change their role

---

## Data Model

### `submissions` collection

| Field | Type | Description |
|---|---|---|
| `name` | string | Full name of the member |
| `date_of_birth` | string | ISO date `YYYY-MM-DD` |
| `birth_month` | number | 1–12 (derived from DOB) |
| `birth_month_name` | string | e.g. `"March"` |
| `photo_url` | string | Firebase Storage download URL |
| `photo_storage_path` | string | Firebase Storage object path (for deletion) |
| `completeness_status` | string | `complete` · `missing_photo` · `missing_dob` · `incomplete` |
| `created_at` | timestamp | Firestore server timestamp |
| `updated_at` | timestamp | Firestore server timestamp |

### `months` collection

| Field | Type | Description |
|---|---|---|
| `month_number` | number | 1–12 |
| `month_name` | string | e.g. `"March"` |
| `leader_id` | string \| null | UID of the assigned leader |

> Month documents are created automatically (IDs `"1"`–`"12"`) the first time an admin signs in.

### `users` collection

| Field | Type | Description |
|---|---|---|
| `email` | string | Firebase Auth email |
| `name` | string | Display name |
| `role` | string | `"leader"` or `"admin"` |
| `assigned_month` | number \| null | Birth month number the leader manages |
| `created_at` | string | ISO timestamp of first login |

---

## Security Rules Summary

| Collection | Public | Leader | Admin |
|---|---|---|---|
| `submissions` | Create only | Read + Update (own month) | Full access |
| `months` | — | Read | Read + Write |
| `users` | — | Read all · Write own | Full access |
| Storage `/photos/**` | Upload (image, ≤10 MB) · Read | — | — |

---

## CSV Export

In the Admin dashboard, click **📥 Export CSV** to download a CSV file containing:
- Name
- Date of Birth
- Birth Month
- Completeness Status
- Photo URL

The export respects the currently active month filter and search query.
