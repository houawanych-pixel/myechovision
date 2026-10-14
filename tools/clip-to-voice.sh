#!/usr/bin/env bash
# Turns one talking-character video clip into everything a character needs:
#   <name>-voice.wav  24 kHz mono, first 10 s  -> the sample the voice cloner learns from
#   <name>-voice.mp3  the same audio, for listening and sharing
#   <name>-loop.mp4   the video with sound removed -> idle loop (15 s max in My Echo Vision)
#   <name>.webp       a still frame -> portrait
# Usage: tools/clip-to-voice.sh clip.mp4 nova [output-folder]
set -euo pipefail
in="$1"; name="$2"; out="${3:-.}"; mkdir -p "$out"
ffmpeg -v error -y -i "$in" -map 0:a:0 -t 10 -ac 1 -ar 24000 -c:a pcm_s16le "$out/$name-voice.wav"
ffmpeg -v error -y -i "$in" -map 0:a:0 -ac 1 -ar 44100 -b:a 192k "$out/$name-voice.mp3"
ffmpeg -v error -y -i "$in" -map 0:v:0 -t 15 -an -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p -movflags +faststart "$out/$name-loop.mp4"
ffmpeg -v error -y -ss 0.5 -i "$in" -map 0:v:0 -frames:v 1 -c:v libwebp -q:v 88 "$out/$name.webp"
echo "== files"; ls -la "$out/$name-voice.wav" "$out/$name-voice.mp3" "$out/$name-loop.mp4" "$out/$name.webp"
echo "== audio check (want: 5-10 s of speech, pauses near silent, peak below 0 dB)"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/$name-voice.wav" | sed 's/^/seconds: /'
ffmpeg -hide_banner -i "$out/$name-voice.wav" -af "silencedetect=noise=-40dB:d=0.3,volumedetect" -f null - 2>&1 | grep -E "silence_end|mean_volume|max_volume" | sed 's/^\[[^]]*\] //'
ffmpeg -hide_banner -i "$out/$name-voice.wav" -af "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level" -f null - 2>&1 | grep -o "RMS_level=[-0-9.inf]*" | cut -d= -f2 | sort -n | awk '{a[NR]=$1}END{print "quietest moments (dB): " a[int(NR*.05)+1] "   (below -60 = clean, above -45 = music or noise under the voice)"}'
