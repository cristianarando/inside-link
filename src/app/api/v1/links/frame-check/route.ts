import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApiSession } from "@/server/auth/session";
import {
  checkUrlFrameCompatibility,
  MetadataServiceError,
  type PreviewMetadataDeps,
} from "@/server/services/metadata.service";

const FrameCheckBodySchema = z.object({
  url: z.string().trim().min(1, "URL is required"),
});

export interface FrameCheckRouteDeps extends PreviewMetadataDeps {
  checkAuth?: typeof assertAdminApiSession;
}

export async function handleFrameCheckPost(
  request: NextRequest | Request,
  deps: FrameCheckRouteDeps = {},
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

  const parsed = FrameCheckBodySchema.safeParse(rawBody);
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
    const compatibility = await checkUrlFrameCompatibility(
      parsed.data.url,
      deps,
    );
    return NextResponse.json({ data: compatibility }, { status: 200 });
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
          message: "Internal server error while checking frame compatibility.",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleFrameCheckPost(request);
}
