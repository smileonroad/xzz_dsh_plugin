#!/usr/bin/env bash
# 启动后 6 秒改插件文件，再等 6 秒看是否自动重载。
set -u
cd "$(dirname "$0")"

LOG="${TMPDIR:-/tmp}/hmr.log"
cp hello.ts hello.ts.orig
trap 'mv -f hello.ts.orig hello.ts' EXIT

(timeout 14 node --import tsx ../../../vendor/cordis/bin.js > "$LOG" 2>&1 &)
sleep 6
echo "───── 改 hello.ts ─────"
sed -i "s/hello from my first plugin/hello from my EDITED plugin/" hello.ts
sleep 7
cat "$LOG"
