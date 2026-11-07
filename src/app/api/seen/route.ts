import { markSeen } from "@/lib/catch-up-actions";
import { getCurrentUser, isUuid } from "@/lib/dal";

/**
 * Marks a page as seen. Called with navigator.sendBeacon when you close the
 * tab or leave the page, when a normal request might not get through.
 */
export async function POST(request: Request) {
  if (!(await getCurrentUser())) return new Response(null, { status: 401 });
  let pageId: unknown;
  try {
    ({ pageId } = await request.json());
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof pageId !== "string" || !isUuid(pageId)) return new Response(null, { status: 400 });
  await markSeen(pageId);
  return new Response(null, { status: 204 });
}
