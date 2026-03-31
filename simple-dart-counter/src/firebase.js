import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCJuKUfdx5hC6jbtgBN_zXEnlVaq6mjcM0',
  authDomain: 'simple-dart-counter-12ff2.firebaseapp.com',
  projectId: 'simple-dart-counter-12ff2',
  storageBucket: 'simple-dart-counter-12ff2.firebasestorage.app',
  messagingSenderId: '874074054437',
  appId: '1:874074054437:web:712eec6b4c4f8b9ed644cc',
  measurementId: 'G-5NBXTH3LM7',
};

let app;
let auth;
let db;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app, 'eur3');
} catch (e) {
  console.error('Firebase Init Error:', e);
}

export { app, auth, db };
