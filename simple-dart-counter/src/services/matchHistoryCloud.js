import { collection, addDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export const PUBLIC_MATCHES_APP_ID = 'sdc_global_production';

function matchesCollection() {
  return collection(db, 'artifacts', PUBLIC_MATCHES_APP_ID, 'public', 'data', 'matches');
}

export function isCloudDbReady() {
  return !!db;
}

export async function savePublicMatch(record) {
  if (!db || !record) return null;
  const ref = await addDoc(matchesCollection(), record);
  return ref.id;
}

export async function deletePublicMatch(docId) {
  const id = String(docId ?? '').trim();
  if (!db || !id) return;
  await deleteDoc(doc(db, 'artifacts', PUBLIC_MATCHES_APP_ID, 'public', 'data', 'matches', id));
}

export async function deletePublicMatchesForUser(uid) {
  const userId = String(uid ?? '').trim();
  if (!db || !userId) return;
  const q1 = query(matchesCollection(), where('p1Id', '==', userId));
  const q2 = query(matchesCollection(), where('p2Id', '==', userId));
  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  const deletePromises = [];
  snap1.forEach((d) => deletePromises.push(deleteDoc(d.ref)));
  snap2.forEach((d) => deletePromises.push(deleteDoc(d.ref)));
  await Promise.all(deletePromises);
}
