import type { NextRequest } from "next/server";
import { assertAdminApiSession } from "@/server/auth/session";
import { linkService } from "@/server/services";
import { handleLinkError, type AdminApiDeps } from "../route";

export async function handleExportLinksBackupGet(
  request: NextRequest | Request,
  deps: AdminApiDeps = {},
): Promise<Response> {
  const checkAuth = deps.checkAuth ?? assertAdminApiSession;
  const authResult = await checkAuth(request.headers);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const service = deps.service ?? linkService;
  try {
    const backup = await service.exportLinksBackup();
    const url = new URL(request.url);
    const headers: Record<string, string> = {
      "Cache-Control": "private, no-store",
    };
    if (url.searchParams.get("download") === "1") {
      const stamp = backup.exportedAt.slice(0, 10);
      headers["Content-Disposition"] =
        `attachment; filename="insidelink-backup-${stamp}.json"`;
    }
    return Response.json({ data: backup }, { status: 200, headers });
  } catch (err) {
    return handleLinkError(err);
  }
}

export async function handleImportLinksBackupPost(
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
    const result = await service.importLinksBackup(body);
    return Response.json({ data: result }, { status: 200 });
  } catch (err) {
    return handleLinkError(err);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handleExportLinksBackupGet(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleImportLinksBackupPost(request);
}
