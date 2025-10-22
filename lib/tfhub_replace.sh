#!/bin/bash

# pose-detection.js 内のURLをローカルパスに置き換えるスクリプト
set -e

# 対象ファイル
TARGET_FILE="pose-detection.js"

# バックアップを作成
cp "$TARGET_FILE" "${TARGET_FILE}.bak"
echo "元のファイルをバックアップしました: ${TARGET_FILE}.bak"

# グローバル置換フラグを使用して、すべての一致を置換
echo "モデルURLを置き換えています..."

# BlazePose モデルのURLを置き換え
sed -i 's|https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/detector/1|./lib/models/blazepose/detector/model.json|g' "$TARGET_FILE"
sed -i 's|https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/landmark/full/2|./lib/models/blazepose/landmark/full/model.json|g' "$TARGET_FILE"
sed -i 's|https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/landmark/lite/2|./lib/models/blazepose/landmark/lite/model.json|g' "$TARGET_FILE"
sed -i 's|https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/landmark/heavy/2|./lib/models/blazepose/landmark/heavy/model.json|g' "$TARGET_FILE"

# MoveNet モデルのURLを置き換え
sed -i 's|https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4|./lib/models/movenet/singlepose/lightning/model.json|g' "$TARGET_FILE"
sed -i 's|https://tfhub.dev/google/tfjs-model/movenet/singlepose/thunder/4|./lib/models/movenet/singlepose/thunder/model.json|g' "$TARGET_FILE"
sed -i 's|https://tfhub.dev/google/tfjs-model/movenet/multipose/lightning/1|./lib/models/movenet/multipose/lightning/model.json|g' "$TARGET_FILE"

echo "URLの置き換えが完了しました！"
echo "元のファイル: ${TARGET_FILE}.bak"
echo "修正したファイル: ${TARGET_FILE}"

# 残りのURLを確認
echo "確認: 残りのtfhub.devへの参照"
grep -n "https://tfhub.dev/" "$TARGET_FILE" || echo "すべて置換されました！"
