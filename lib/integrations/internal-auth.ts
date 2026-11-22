import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function isInternalRequest(request: NextRequest): boolean {
  const expected = process.env.AUTOMATION_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const actual = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!expected || !actual) return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
