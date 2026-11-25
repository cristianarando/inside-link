import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApiSession } from "@/server/auth/session";
import {
  MetadataServiceError,
  previewUrlMetadata,
  type PreviewMetadataDeps,
} from "@/server/services/metadata.service";

const MetadataPreviewBodySchema = z.object({
  url: z.string().trim().min(1, "URL is required"),
});

export interface MetadataPreviewRouteDeps extends PreviewMetadataDeps {
  checkAuth?: typeof assertAdminApiSession;
}

export async function handleMetadataPreviewPost(
  request: NextRequest | Request,
  deps: MetadataPreviewRouteDeps = {},
): Promise<Response> {
  const checkAuth = deps.checkAuth ?? assertAdminApiSession;
  const authResult = await checkAuth(request.headers);
  if (!authResult.authorized) {
    return authResult.response;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
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

  const parsed = MetadataPreviewBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            parsed.error.issues[0]?.message || "Invalid request payload.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const metadata = await previewUrlMetadata(parsed.data.url, deps);
    return NextResponse.json({ data: metadata }, { status: 200 });
  } catch (err) {
    if (err instanceof MetadataServiceError) {
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
          },
        },
        { status: err.status },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error while previewing metadata.",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleMetadataPreviewPost(request);
}
