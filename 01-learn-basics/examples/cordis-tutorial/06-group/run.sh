#!/usr/bin/env bash
# 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
# 启动后 5 秒把整组 disabled 掉，观察子条目是不是一起走。
set -u
cd "$(dirname "$0")"

cp cordis.yml cordis.yml.orig
trap 'mv -f cordis.yml.orig cordis.yml' EXIT

(timeout 20 node --import tsx ../../../vendor/cordis/bin.js &)
sleep 5
echo "───── disabled 整组 ─────"
sed -i 's/disabled: false/disabled: true/' cordis.yml
sleep 12
