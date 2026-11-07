/**
 * Braid keeps a copy of every doc and board you open in this browser's
 * IndexedDB, so pages open instantly and edits survive going offline (or
 * closing the tab before they reach the server).
 *
 * Copies are named per user, so two people sharing a browser never see each
 * other's local data, and signing out deletes them.
 */

const PREFIX = "braid";

export function localDocName(userId: string, pageId: string, branchId?: string | null) {
  const page = `${PREFIX}:${userId}:page:${pageId}`;
  return branchId ? `${page}:branch:${branchId}` : page;
}

/** Deletes every local copy belonging to this user. Safe to call when offline. */
export async function clearLocalCopies(userId: string) {
  if (typeof indexedDB === "undefined" || !("databases" in indexedDB)) return 0;
  const mine = (await indexedDB.databases()).filter((db) => db.name?.startsWith(`${PREFIX}:${userId}:`));
  await Promise.all(
    mine.map(
      (db) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(db.name!);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        }),
    ),
  );
  return mine.length;
}
