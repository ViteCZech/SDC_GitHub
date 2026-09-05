import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  collection: vi.fn(() => 'matches-col'),
  addDoc: vi.fn(async () => ({ id: 'new-doc' })),
  deleteDoc: vi.fn(async () => {}),
  doc: vi.fn((...args) => ({ path: args.join('/') })),
  query: vi.fn((col, ...rest) => ({ col, rest })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  getDocs: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestore);
vi.mock('../../firebase', () => ({ db: { name: 'eur3' } }));

import {
  deletePublicMatch,
  deletePublicMatchesForUser,
  isCloudDbReady,
  savePublicMatch,
} from '../matchHistoryCloud';

describe('matchHistoryCloud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.collection.mockReturnValue('matches-col');
    firestore.addDoc.mockResolvedValue({ id: 'new-doc' });
  });

  it('reports backend ready when db exists', () => {
    expect(isCloudDbReady()).toBe(true);
  });

  it('saves a public match into the artifacts collection', async () => {
    const id = await savePublicMatch({ id: 'local-1', p1Name: 'Domácí' });
    expect(id).toBe('new-doc');
    expect(firestore.collection).toHaveBeenCalledWith(
      { name: 'eur3' },
      'artifacts',
      'sdc_global_production',
      'public',
      'data',
      'matches'
    );
    expect(firestore.addDoc).toHaveBeenCalledWith('matches-col', { id: 'local-1', p1Name: 'Domácí' });
  });

  it('deletes a public match by doc id', async () => {
    await deletePublicMatch('abc');
    expect(firestore.doc).toHaveBeenCalledWith(
      { name: 'eur3' },
      'artifacts',
      'sdc_global_production',
      'public',
      'data',
      'matches',
      'abc'
    );
    expect(firestore.deleteDoc).toHaveBeenCalled();
  });

  it('deletes all matches for a user on both player slots', async () => {
    const snap1 = {
      forEach: (cb) => cb({ ref: { id: 'a' } }),
    };
    const snap2 = {
      forEach: (cb) => cb({ ref: { id: 'b' } }),
    };
    firestore.getDocs.mockResolvedValueOnce(snap1).mockResolvedValueOnce(snap2);
    await deletePublicMatchesForUser('uid-9');
    expect(firestore.where).toHaveBeenCalledWith('p1Id', '==', 'uid-9');
    expect(firestore.where).toHaveBeenCalledWith('p2Id', '==', 'uid-9');
    expect(firestore.deleteDoc).toHaveBeenCalledTimes(2);
  });
});
