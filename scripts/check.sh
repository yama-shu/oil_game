#!/usr/bin/env bash
#
# コミット前チェックを一発で実行する省力化スクリプト。
# 「型チェック → 単体テスト → 本番ビルド」を順に実行し、
# どれか1つでも失敗したら即座に非0で終了する。
# CI (GitHub Actions) でも同じスクリプトを使い、手元と CI の乖離を防ぐ。
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 型チェック (tsc --noEmit)"
npx tsc --noEmit

echo "==> 単体テスト (vitest run)"
npx vitest run

echo "==> 本番ビルド (vite build)"
npx vite build

echo "==> すべてのチェックに合格しました"
