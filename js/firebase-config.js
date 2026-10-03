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
  apiKey: "AIzaSyAyKw5JZ-VlTs8wK40E2Z6pJH_3wCSF0U8",
  authDomain: "web-store-12856.firebaseapp.com",
  databaseURL: "https://web-store-12856-default-rtdb.firebaseio.com",
  projectId: "toko-web-12856",
  storageBucket: "web-store-12856.firebasestorage.app",
  messagingSenderId: "72980085852",
  appId: "1:72980085852:web:9f30a318b821adacc83a9"
};

export const ROOM_PREFIX = "ALYZ-";
export const isConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
  
