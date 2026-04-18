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

try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  console.error('Firebase Init Error:', e);
}

/** Autentizace (Google, anonymní online, …). Při selhání inicializace je `null`. */
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app, 'eur3') : null;
export { app };
