import { NextResponse } from "next/server";

/** Pass through file/binary Responses; JSON-wrap plain handler payloads. */
export function toRouteResponse(result: unknown): NextResponse {
  if (result instanceof NextResponse) return result;
  if (result instanceof Response) return new NextResponse(result.body, result);
  return NextResponse.json(result);
}
