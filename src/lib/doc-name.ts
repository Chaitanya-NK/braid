/**
 * Name of a document on the sync server. Shared by browser and servers.
 * A page is "page:<id>"; one of its branches is "page:<id>:branch:<id>".
 */
export const docName = (pageId: string, branchId?: string | null) =>
  branchId ? `page:${pageId}:branch:${branchId}` : `page:${pageId}`;

const DOC_NAME = /^page:([0-9a-f-]{36})(?::branch:([0-9a-f-]{36}))?$/i;

/** The page (and branch, if any) a document name points at. */
export function parseDocName(name: string): { pageId: string; branchId: string | null } {
  const match = DOC_NAME.exec(name);
  if (!match) throw new Error(`Unknown document "${name}"`);
  return { pageId: match[1], branchId: match[2] ?? null };
}
