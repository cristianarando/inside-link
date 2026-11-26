import type { NextRequest } from "next/server";
import { assertAdminApiSession } from "@/server/auth/session";
import { linkService } from "@/server/services";
import { handleLinkError, type AdminApiDeps } from "../../route";

export async function handleResetLinkClicksPost(
  request: NextRequest | Request,
  id: string,
  deps: AdminApiDeps = {},
): Promise<Response> {
  const checkAuth = deps.checkAuth ?? assertAdminApiSession;
  const authResult = await checkAuth(request.headers);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const service = deps.service ?? linkService;
  try {
    const updated = await service.resetLinkClicks(id);
    return Response.json({ data: updated }, { status: 200 });
  } catch (err) {
    return handleLinkError(err);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleResetLinkClicksPost(request, id);
}
