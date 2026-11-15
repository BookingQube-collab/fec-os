import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_CHARS = 220;

/**
 * Same-origin Arabic (or EN) TTS for the IVR Test preview.
 * Browsers block Google translate_tts as a cross-origin <audio> src; proxying fixes that.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = (searchParams.get("text") ?? "").trim();
  const langRaw = (searchParams.get("lang") ?? "ar").toLowerCase();
  const lang = langRaw.startsWith("ar") ? "ar" : "en";

  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `text too long (max ${MAX_CHARS} chars)` },
      { status: 400 },
    );
  }

  const upstream =
    "https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=" +
    encodeURIComponent(lang) +
    "&q=" +
    encodeURIComponent(text);

  try {
    const res = await fetch(upstream, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream TTS failed (${res.status})` },
        { status: 502 },
      );
    }

    const buf = await res.arrayBuffer();
    if (!buf.byteLength) {
      return NextResponse.json({ error: "empty TTS audio" }, { status: 502 });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "TTS proxy failed",
      },
      { status: 502 },
    );
  }
}
