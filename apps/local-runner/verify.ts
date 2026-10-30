import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileDigest } from "./files";

export function verifyVideo(path: string, expected = { width: 640, height: 360, fps: 30, frames: 180, audio: true }, diagnosticTiming = false) {
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8" }));
  const streams = probe.streams as { codec_type: string; codec_name: string; width: number; height: number;
    avg_frame_rate: string; nb_frames: string; duration: string; sample_rate: string; channels: number; pix_fmt: string; color_space: string }[];
  const video = streams.filter((s) => s.codec_type === "video");
  const audio = streams.filter((s) => s.codec_type === "audio");
  assert.equal(video.length, 1, "Exactly one video track");
  assert.equal(audio.length, expected.audio ? 1 : 0, "Expected audio track count");
  assert.equal(streams.length, expected.audio ? 2 : 1, "No unexpected tracks");
  const v = video[0];
  assert.equal(v.codec_name, "h264"); assert.equal(v.width, expected.width); assert.equal(v.height, expected.height);
  const [num, den] = v.avg_frame_rate.split("/").map(Number);
  assert.equal(num / den, expected.fps);
  assert.equal(Number(v.nb_frames), expected.frames);
  assert.equal(v.pix_fmt, "yuv420p");
  assert.equal(v.color_space, "bt709");
  const timingIssues: string[] = [];
  const checkTiming = (duration: string, label: string) => {
    if (Math.abs(Number(duration) - expected.frames / expected.fps) > 1 / expected.fps) timingIssues.push(`${label}: ${duration}s exceeds one-frame tolerance from ${expected.frames / expected.fps}s`);
  };
  checkTiming(v.duration, "Video duration"); checkTiming(probe.format.duration, "Container duration");
  execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", path, "-f", "null", "-"], { stdio: "pipe" });
  const frames = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-an", "-vf", "scale=32:18,format=gray", "-f", "rawvideo", "pipe:1"]);
  assert.equal(frames.length, expected.frames * 32 * 18);
  const sampleFrames = [0, Math.min(15, expected.frames - 1), Math.floor(expected.frames / 3), Math.floor(expected.frames / 2), Math.floor(expected.frames * 2 / 3), expected.frames - 1];
  for (const n of sampleFrames) {
    const pixels = frames.subarray(n * 576, (n + 1) * 576);
    const mean = pixels.reduce((a, b) => a + b, 0) / 576;
    assert.ok(mean > 5 && mean < 250, `Frame ${n} is not black/white`);
  }
  assert.notDeepEqual(frames.subarray(15 * 576, 16 * 576), frames.subarray((expected.frames - 1) * 576), "Video must contain motion");
  let audioLevels: { rms: number; peak: number } | null = null;
  if (expected.audio) {
    assert.equal(audio[0].codec_name, "aac"); assert.equal(Number(audio[0].sample_rate), 48000);
    assert.equal(audio[0].channels, 2);
    checkTiming(audio[0].duration, "Audio duration");
    const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-vn", "-ac", "1", "-f", "f32le", "pipe:1"], { maxBuffer: 8 * 1024 * 1024 });
    let sum = 0, peak = 0;
    for (let i = 0; i < pcm.length; i += 4) { const value = pcm.readFloatLE(i); sum += value * value; peak = Math.max(peak, Math.abs(value)); }
    audioLevels = { rms: Math.sqrt(sum / (pcm.length / 4)), peak };
    assert.ok(audioLevels.rms > 0.0001, "Audio is not silent"); assert.ok(peak < 0.99, "Audio is not clipped");
  }
  const qaDir = join(dirname(path), `${basename(path, ".mp4")}-qa`);
  mkdirSync(qaDir, { recursive: true });
  for (const n of sampleFrames) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path, "-vf", `select=eq(n\\,${n})`,
    "-frames:v", "1", join(qaDir, `frame-${String(n).padStart(3, "0")}.png`)]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path, "-vf",
    `select='${sampleFrames.map((n) => `eq(n,${n})`).join("+")}',scale=320:180,tile=3x2`, "-frames:v", "1", join(qaDir, "contact-sheet.png")]);
  const report = { status: timingIssues.length ? "failed" : "passed", file: basename(path), sha256: fileDigest(path), bytes: statSync(path).size,
    streams, durationSeconds: Number(probe.format.duration), decodedFrames: expected.frames, sampleFrames, audioLevels, timingIssues };
  writeFileSync(join(qaDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (!diagnosticTiming) assert.equal(timingIssues.length, 0, timingIssues.join("; "));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve("apps/local-runner/verify.ts")) {
  const report = verifyVideo(resolve(process.argv.slice(2).at(-1) ?? "artifacts/m00/sample.mp4"));
  console.log(JSON.stringify(report, null, 2));
}
