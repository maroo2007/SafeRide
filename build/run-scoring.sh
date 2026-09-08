#!/usr/bin/env bash
set -u
SP="$1"
if [ ! -s "$SP/baseline-shipped.webm" ]; then
  echo "regenerating the shipped baseline (VP9 crf31 -g 3, the all-intra recipe)"
  ffmpeg -y -v error -i build/intermediate_48fps_fixed.mkv -an \
    -c:v libvpx-vp9 -crf 31 -b:v 0 -g 3 -keyint_min 3 -row-mt 1 -deadline good -cpu-used 2 \
    -pix_fmt yuv420p "$SP/baseline-shipped.webm"
fi
ls -la "$SP/baseline-shipped.webm" | awk '{printf "  baseline: %.2f MB\n", $5/1048576}'
BASELINE="$SP/baseline-shipped.webm" node build/score-ladder.js "$SP/ladder" --every=48
echo SCORING_DONE
