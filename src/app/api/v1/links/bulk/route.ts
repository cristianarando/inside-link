import type { NextRequest } from "next/server";
import { assertAdminApiSession } from "@/server/auth/session";
import { linkService } from "@/server/services";
import { handleLinkError, type AdminApiDeps } from "../route";

export async function handleBulkActionLinksPost(
  request: NextRequest | Request,
  deps: AdminApiDeps = {},
): Promise<Response> {
  const checkAuth = deps.checkAuth ?? assertAdminApiSession;
  const authResult = await checkAuth(request.headers);
  if (!authResult.authorized) {
    return authResult.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body is not valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const service = deps.service ?? linkService;
  try {
    const result = await service.bulkActionLinks(body);
    return Response.json({ data: result }, { status: 200 });
  } catch (err) {
    return handleLinkError(err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleBulkActionLinksPost(request);
}
