import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertAdminApiSession } from "@/server/auth/session";
import {
  settingsService,
  SettingsServiceError,
  type SettingsService,
} from "@/server/services";

export interface SettingsRouteDeps {
  service?: SettingsService;
  checkAuth?: typeof assertAdminApiSession;
}

export async function handleGetSettings(
  deps: SettingsRouteDeps = {},
): Promise<Response> {
  const service = deps.service ?? settingsService;
  const settings = await service.getSiteSettings();
  return NextResponse.json(
    { data: settings },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export async function handleUpdateSettings(
  request: NextRequest | Request,
  deps: SettingsRouteDeps = {},
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
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body is not valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const service = deps.service ?? settingsService;
  try {
    const updated = await service.updateSiteSettings(body);
    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (err) {
    if (err instanceof SettingsServiceError) {
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error while saving site settings.",
        },
      },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<Response> {
  return handleGetSettings();
}

export async function PUT(request: NextRequest): Promise<Response> {
  return handleUpdateSettings(request);
}

export async function PATCH(request: NextRequest): Promise<Response> {
  return handleUpdateSettings(request);
}
