#!/bin/bash

# モデルをダウンロードして展開するシェルスクリプト
set -e

# ベースディレクトリを作成
BASE_DIR="./models"
mkdir -p $BASE_DIR
TEMP_DIR="/tmp/tfjs_models"
mkdir -p $TEMP_DIR

# モデルのURLとローカルディレクトリのマッピング
declare -A MODEL_URLS=(
  ["blazepose/detector"]="https://www.kaggle.com/api/v1/models/mediapipe/blazepose-3d/tfJs/detector/1/download"
  ["blazepose/landmark/full"]="https://www.kaggle.com/api/v1/models/mediapipe/blazepose-3d/tfJs/landmark-full/2/download"
  ["blazepose/landmark/lite"]="https://www.kaggle.com/api/v1/models/mediapipe/blazepose-3d/tfJs/landmark-lite/2/download"
  ["blazepose/landmark/heavy"]="https://www.kaggle.com/api/v1/models/mediapipe/blazepose-3d/tfJs/landmark-heavy/2/download"
  ["movenet/singlepose/lightning"]="https://www.kaggle.com/api/v1/models/google/movenet/tfJs/singlepose-lightning/4/download"
  ["movenet/singlepose/thunder"]="https://www.kaggle.com/api/v1/models/google/movenet/tfJs/singlepose-thunder/4/download"
  ["movenet/multipose/lightning"]="https://www.kaggle.com/api/v1/models/google/movenet/tfJs/multipose-lightning/1/download"
)

# モデルをダウンロードして展開する関数
download_and_extract_model() {
  local model_dir=$1
  local model_url=$2
  local target_dir="$BASE_DIR/$model_dir"
  local temp_tar="$TEMP_DIR/$(basename $model_dir).tar.gz"
  
  echo "ダウンロード: $model_url -> $target_dir"
  mkdir -p "$target_dir"
  
  # モデルをダウンロード
  echo "  tgzファイルをダウンロード中..."
  curl -L -o "$temp_tar" "$model_url"
  
  # 展開
  echo "  ファイルを展開中..."
  tar -xzf "$temp_tar" -C "$target_dir"
  
  # 一時ファイルを削除
  rm "$temp_tar"
  
  echo "  完了: $model_dir"
  echo ""
}

# モデルのダウンロード開始
echo "TensorFlow.js モデルのダウンロードを開始します..."

# すべてのモデルをダウンロード
for model_dir in "${!MODEL_URLS[@]}"; do
  download_and_extract_model "$model_dir" "${MODEL_URLS[$model_dir]}"
done

echo "すべてのモデルのダウンロードが完了しました！"
echo "モデルは次のディレクトリに保存されました: $BASE_DIR"

# 一時ディレクトリの削除
rm -rf $TEMP_DIR
