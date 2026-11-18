/**
 * Generate E3 IVR MP3 prompts with open-source Piper TTS (CPU).
 *
 * Voices:
 *   EN — en_US-lessac-medium (telephony-friendly)
 *   AR — ar_JO-kareem-medium (best CPU Arabic dialect in Piper; not Qatari)
 *
 * Usage:
 *   npm run ivr:generate-audio
 *
 * Downloads Piper + voice models into `.cache/piper/` (gitignored),
 * writes MP3s to `public/ivr/{en,ar}/`.
 */

import { spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(ROOT, ".cache", "piper");
const OUT_EN = join(ROOT, "public", "ivr", "en");
const OUT_AR = join(ROOT, "public", "ivr", "ar");

const PIPER_VERSION = "2023.11.14-2";
const HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main";

const VOICES = {
  en: {
    id: "en_US-lessac-medium",
    onnx: `${HF}/en/en_US/lessac/medium/en_US-lessac-medium.onnx`,
    json: `${HF}/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json`,
  },
  ar: {
    id: "ar_JO-kareem-medium",
    onnx: `${HF}/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx`,
    json: `${HF}/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json`,
  },
};

/** Keep in sync with src/lib/call-center/ivr-oss-prompts.ts + e3-ivr-prompt / recording-disclosure. */
const PROMPTS = [
  {
    id: "language-menu",
    lang: "en",
    file: "language-menu.mp3",
    text: "Thank you for calling E3, Events and Entertainment Enterprises. For English, press 1. للعربية، اضغط 2. To speak with an agent, press 0. للتحدث مع موظف، اضغط 0.",
  },
  {
    id: "language-menu",
    lang: "ar",
    file: "language-menu.mp3",
    text: "شكراً لاتصالك بـ E3 للفعاليات والترفيه. للإنجليزي اضغط 1. للعربي اضغط 2. عشان تتكلم مع موظف اضغط 0.",
  },
  {
    id: "center-menu",
    lang: "en",
    file: "center-menu.mp3",
    text: "Please select the entertainment center you would like assistance with. For Inflata Park, City Center, press 1. For Kids Driving School, City Center, press 2. For Urban Arena, Doha Mall, press 3. For general E3 customer support, press 0.",
  },
  {
    id: "center-menu",
    lang: "ar",
    file: "center-menu.mp3",
    text: "أي مركز تبيه المساعدة فيه؟ لإنفلاتا بارك في سيتي سنتر اضغط 1. لمدرسة القيادة للأطفال في سيتي سنتر اضغط 2. لأوربان أرينا في دوحة مول اضغط 3. للدعم العام لـ E3 اضغط 0.",
  },
  {
    id: "service-menu",
    lang: "en",
    file: "service-menu.mp3",
    text: "How can we help you today? For activity bookings and reservations, press 1. For birthday parties and private events, press 2. For school visits and group bookings, press 3. For ticket prices, offers, and payments, press 4. For opening hours, directions, and visit information, press 5. For complaints, lost items, and customer support, press 6. To speak directly with our customer service team, press 0.",
  },
  {
    id: "service-menu",
    lang: "ar",
    file: "service-menu.mp3",
    text: "كيف نقدر نساعدك اليوم؟ لحجز الأنشطة اضغط 1. لحفلات أعياد الميلاد والمناسبات الخاصة اضغط 2. لزيارات المدارس والحجوزات الجماعية اضغط 3. لأسعار التذاكر والعروض والدفع اضغط 4. لساعات العمل والاتجاهات ومعلومات الزيارة اضغط 5. للشكاوى والمفقودات وخدمة العملاء اضغط 6. عشان تتكلم مباشرة مع خدمة العملاء اضغط 0.",
  },
  {
    id: "bridge-connecting",
    lang: "en",
    file: "bridge-connecting.mp3",
    text: "Please note that this call may be recorded for quality and training purposes. Please wait. We are connecting you to an agent.",
  },
  {
    id: "bridge-connecting",
    lang: "ar",
    file: "bridge-connecting.mp3",
    text: "للعلم، المكالمة هذي ممكن تنسجل عشان الجودة والتدريب. لحظة من فضلك، بنوصلك بالموظف الحين.",
  },
];

function platformAsset() {
  const p = process.platform;
  const arch = process.arch;
  if (p === "win32" && (arch === "x64" || arch === "arm64")) {
    return {
      name: "piper_windows_amd64.zip",
      bin: join(CACHE, "piper", "piper.exe"),
      kind: "zip",
    };
  }
  if (p === "darwin" && arch === "arm64") {
    return {
      name: "piper_macos_aarch64.tar.gz",
      bin: join(CACHE, "piper", "piper"),
      kind: "tar.gz",
    };
  }
  if (p === "darwin") {
    return {
      name: "piper_macos_x64.tar.gz",
      bin: join(CACHE, "piper", "piper"),
      kind: "tar.gz",
    };
  }
  if (p === "linux" && arch === "arm64") {
    return {
      name: "piper_linux_aarch64.tar.gz",
      bin: join(CACHE, "piper", "piper"),
      kind: "tar.gz",
    };
  }
  return {
    name: "piper_linux_x86_64.tar.gz",
    bin: join(CACHE, "piper", "piper"),
    kind: "tar.gz",
  };
}

async function download(url, dest) {
  if (existsSync(dest) && (await import("node:fs")).statSync(dest).size > 1000) {
    console.log(`  cached ${dest}`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  console.log(`  download ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    // Never shell:true — paths with spaces (e.g. "Live Projects") break otherwise.
    shell: false,
    ...opts,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status}): ${err}`);
  }
  return r;
}

function extractArchive(archivePath, kind) {
  mkdirSync(join(CACHE, "piper"), { recursive: true });
  if (kind === "zip") {
    if (process.platform === "win32") {
      run("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Force -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${join(CACHE, "piper").replace(/'/g, "''")}'`,
      ]);
    } else {
      run("unzip", ["-o", archivePath, "-d", join(CACHE, "piper")]);
    }
    return;
  }
  run("tar", ["-xzf", archivePath, "-C", join(CACHE, "piper")]);
}

function findPiperBinary() {
  const exe = process.platform === "win32" ? "piper.exe" : "piper";
  const candidates = [
    join(CACHE, "piper", exe),
    join(CACHE, "piper", "piper", exe),
    join(CACHE, "piper", "piper", "piper", exe),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function ensurePiper() {
  const existing = findPiperBinary();
  if (existing) return existing;

  const asset = platformAsset();
  const url = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/${asset.name}`;
  const archive = join(CACHE, asset.name);
  await download(url, archive);
  extractArchive(archive, asset.kind);

  const found = findPiperBinary();
  if (!found) {
    throw new Error(`Piper binary not found after extract. Expected under ${join(CACHE, "piper")}`);
  }
  return found;
}

async function ensureVoice(lang) {
  const v = VOICES[lang];
  const onnx = join(CACHE, "voices", `${v.id}.onnx`);
  const json = join(CACHE, "voices", `${v.id}.onnx.json`);
  await download(v.onnx, onnx);
  await download(v.json, json);
  return { onnx, json };
}

function synthesize(piperBin, voiceOnnx, text, wavOut) {
  mkdirSync(dirname(wavOut), { recursive: true });
  // Piper reads text from stdin
  const r = spawnSync(piperBin, ["--model", voiceOnnx, "--output_file", wavOut], {
    input: text,
    encoding: "utf8",
    shell: false,
  });
  if (r.status !== 0) {
    throw new Error(`piper failed: ${(r.stderr || r.stdout || "").trim()}`);
  }
  if (!existsSync(wavOut)) {
    throw new Error(`piper produced no file: ${wavOut}`);
  }
}

function wavToMp3(wavPath, mp3Path) {
  mkdirSync(dirname(mp3Path), { recursive: true });
  run("ffmpeg", [
    "-y",
    "-i",
    wavPath,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "64k",
    "-ar",
    "22050",
    "-ac",
    "1",
    mp3Path,
  ]);
}

async function main() {
  console.log("E3 IVR OSS audio — Piper generator");
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT_EN, { recursive: true });
  mkdirSync(OUT_AR, { recursive: true });

  const piperBin = await ensurePiper();
  console.log(`Piper: ${piperBin}`);

  const voices = {
    en: await ensureVoice("en"),
    ar: await ensureVoice("ar"),
  };

  const manifest = [];
  for (const prompt of PROMPTS) {
    const outDir = prompt.lang === "ar" ? OUT_AR : OUT_EN;
    const mp3Path = join(outDir, prompt.file);
    const wavPath = join(CACHE, "wav", `${prompt.lang}-${prompt.id}.wav`);
    console.log(`→ ${prompt.lang}/${prompt.file}`);
    synthesize(piperBin, voices[prompt.lang].onnx, prompt.text, wavPath);
    wavToMp3(wavPath, mp3Path);
    const size = readFileSync(mp3Path).length;
    manifest.push({
      id: prompt.id,
      lang: prompt.lang,
      path: `/ivr/${prompt.lang}/${prompt.file}`,
      bytes: size,
    });
    console.log(`  ok ${size} bytes`);
  }

  writeFileSync(
    join(ROOT, "public", "ivr", "manifest.json"),
    JSON.stringify(
      {
        generator: "piper",
        voices: { en: VOICES.en.id, ar: VOICES.ar.id },
        note: "Arabic uses Piper ar_JO (Jordanian), not Qatari. Prefer human uploads for dialect.",
        generatedAt: new Date().toISOString(),
        clips: manifest,
      },
      null,
      2,
    ),
  );
  console.log("Done. Clips in public/ivr/{en,ar}/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
