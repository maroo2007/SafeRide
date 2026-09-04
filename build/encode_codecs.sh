#!/bin/sh
set -e
SRC=build/intermediate_48fps_fixed.mkv
echo "--- AV1 (SVT-AV1), -g 3 ---"
ffmpeg -hide_banner -loglevel error -y -i "$SRC" -an \
  -c:v libsvtav1 -crf 30 -preset 6 -g 3 -pix_fmt yuv420p \
  -movflags +faststart build/ladder/g3_1080_av1.mp4
echo "AV1 done"
echo "--- VP9, -g 3 ---"
ffmpeg -hide_banner -loglevel error -y -i "$SRC" -an \
  -c:v libvpx-vp9 -crf 31 -b:v 0 -g 3 -keyint_min 3 \
  -row-mt 1 -threads 8 -speed 2 -pix_fmt yuv420p \
  build/ladder/g3_1080_vp9.webm
echo "VP9 done"
