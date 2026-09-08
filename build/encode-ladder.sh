#!/usr/bin/env bash
# Encode ladder for the autoplay hero. Nothing seeks any more, so the
# all-intra constraint that produced the 56 MB scrub file is gone.
#
# Source is the LOSSLESS FFV1 master, 1920x1080 48fps, not the shipped webm.
set -u
SRC="build/intermediate_48fps_fixed.mkv"
OUT="$1"
mkdir -p "$OUT"
# No audio anywhere: the film is muted, and muted is a precondition of autoplay.
for crf in 18 20 22; do
  ffmpeg -y -v error -i "$SRC" -an -c:v libx264 -preset slow -crf $crf \
    -pix_fmt yuv420p -movflags +faststart "$OUT/h264-1080-crf$crf.mp4" &
done
wait
for crf in 18 20 22; do
  ffmpeg -y -v error -i "$SRC" -an -c:v libvpx-vp9 -crf $crf -b:v 0 \
    -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p "$OUT/vp9-1080-crf$crf.webm" &
done
wait
for crf in 24 28 32; do
  ffmpeg -y -v error -i "$SRC" -an -c:v libsvtav1 -crf $crf -preset 6 \
    -pix_fmt yuv420p -movflags +faststart "$OUT/av1-1080-crf$crf.mp4" &
done
wait
# 720p rung, since 1440p would be an upscale of a 1080p master
ffmpeg -y -v error -i "$SRC" -an -vf scale=1280:720:flags=lanczos -c:v libx264 \
  -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart "$OUT/h264-720-crf20.mp4"
ffmpeg -y -v error -i "$SRC" -an -vf scale=1280:720:flags=lanczos -c:v libsvtav1 \
  -crf 28 -preset 6 -pix_fmt yuv420p -movflags +faststart "$OUT/av1-720-crf28.mp4"
echo LADDER_DONE
