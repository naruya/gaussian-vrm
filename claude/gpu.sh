#!/usr/bin/env bash
# GPU headroom check before running the conversion (pose detection + GPU splat assignment) in Chrome.
# The RTX 4090 is shared with other jobs (e.g. ComfyUI); if it is near full, wait or ask.
#   claude/gpu.sh [samples]
SMI=/usr/lib/wsl/lib/nvidia-smi
n=${1:-3}
for i in $(seq 1 "$n"); do
  "$SMI" --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader
  [ "$i" -lt "$n" ] && sleep 1
done
echo "--- WSL processes that may hold the GPU:"
ps -eo pid,etime,%cpu,%mem,cmd --sort=-%mem | grep -iE 'python|torch|comfy|ollama|blender' | grep -v grep | cut -c1-140 | head -5
