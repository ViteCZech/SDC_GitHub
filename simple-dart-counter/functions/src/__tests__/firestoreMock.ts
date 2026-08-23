import type { DocumentReference, Transaction } from 'firebase-admin/firestore';

export type TxUpdate = { id: string; data: Record<string, unknown> };

export function mockTransaction() {
  const updates: TxUpdate[] = [];
  const transaction = {
    update(ref: { id: string }, data: Record<string, unknown>) {
      updates.push({ id: String(ref.id), data });
    },
  } as unknown as Transaction;
  return { transaction, updates };
}

export function mockRef(id: string) {
  return { id } as DocumentReference;
}

export function mockSnap(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    exists: true,
    ref: mockRef(id),
    data: () => data,
  } as unknown as FirebaseFirestore.QueryDocumentSnapshot;
}

export function patchOf(updates: TxUpdate[], id: string) {
  const hit = [...updates].reverse().find((u) => u.id === id);
  return hit?.data ?? null;
}
