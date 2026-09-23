#!/usr/bin/env bash
# 启动后 5 秒把 disabled 翻成 false，观察 consumer 是否自动被唤醒。
set -u
cd "$(dirname "$0")"

cp cordis.yml cordis.yml.orig
trap 'mv -f cordis.yml.orig cordis.yml' EXIT

(timeout 20 node --import tsx ../../../vendor/cordis/bin.js &)
sleep 5
echo "───── 把 disabled 翻成 false ─────"
sed -i 's/disabled: true/disabled: false/' cordis.yml
sleep 12
