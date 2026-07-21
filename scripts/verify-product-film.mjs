#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const [mediaPath = "docs/images/product_film.mp4"] = process.argv.slice(2);

if (!existsSync(mediaPath)) {
  throw new Error(`Product film not found: ${mediaPath}`);
}

const probe = spawnSync(
  "ffprobe",
  [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,duration,nb_frames",
    "-of",
    "json",
    mediaPath,
  ],
  { encoding: "utf8" },
);

if (probe.error) {
  throw new Error(`Unable to execute ffprobe: ${probe.error.message}`);
}
if (probe.status !== 0) {
  throw new Error(`ffprobe failed (${probe.status}): ${probe.stderr.trim()}`);
}

const metadata = JSON.parse(probe.stdout);
const streams = Array.isArray(metadata.streams) ? metadata.streams : [];
const videoStreams = streams.filter((stream) => stream.codec_type === "video");
const audioStreams = streams.filter((stream) => stream.codec_type === "audio");

if (videoStreams.length !== 1) {
  throw new Error(`Expected exactly one video stream, found ${videoStreams.length}`);
}
if (audioStreams.length !== 0) {
  throw new Error(`Expected a muted product film, found ${audioStreams.length} audio stream(s)`);
}

const [video] = videoStreams;
const expected = {
  codec_name: "h264",
  width: 1920,
  height: 1080,
  r_frame_rate: "30/1",
  nb_frames: "1350",
};

for (const [field, value] of Object.entries(expected)) {
  if (video[field] !== value) {
    throw new Error(`Unexpected ${field}: expected ${value}, received ${video[field]}`);
  }
}

if (!new Set(["yuv420p", "yuvj420p"]).has(video.pix_fmt)) {
  throw new Error(`Expected 4:2:0 pixel format, received ${video.pix_fmt}`);
}

const duration = Number(video.duration);
if (!Number.isFinite(duration) || Math.abs(duration - 45) > 0.001) {
  throw new Error(`Expected a 45-second video stream, received ${video.duration}`);
}

console.log(
  `Verified ${mediaPath}: ${video.codec_name}, ${video.width}x${video.height}, ${video.r_frame_rate}, ${video.nb_frames} frames, ${video.pix_fmt}, no audio`,
);
