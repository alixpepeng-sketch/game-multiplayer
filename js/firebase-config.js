// ALYZ MULTIPLAYER - konfigurasi Firebase
//
// .env.example (referensi saja; situs statis di Vercel tidak membaca .env di browser,
// jadi salin nilainya ke objek firebaseConfig di bawah. Nilai ini memang publik,
// keamanan dijaga oleh Authorized domains + database.rules.json):
//   FIREBASE_API_KEY=xxxx
//   FIREBASE_AUTH_DOMAIN=nama-project.firebaseapp.com
//   FIREBASE_DATABASE_URL=https://nama-project-default-rtdb.asia-southeast1.firebasedatabase.app
//   FIREBASE_PROJECT_ID=nama-project
//   FIREBASE_STORAGE_BUCKET=nama-project.appspot.com
//   FIREBASE_MESSAGING_SENDER_ID=000000000000
//   FIREBASE_APP_ID=1:000000000000:web:xxxxxxxx
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "000000000000",
  appId: "YOUR_APP_ID"
};

export const ROOM_PREFIX = "ALYZ-";
export const isConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
