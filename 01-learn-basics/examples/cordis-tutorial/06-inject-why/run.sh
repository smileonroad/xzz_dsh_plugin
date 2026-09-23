#!/usr/bin/env bash
# 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
# 跑两个场景：① 主时间线（cordis.yml）② orphan（cordis-orphan.yml）
# 跑完把 cordis.yml 还原，反复跑不留残余。
set -e
cd "$(dirname "$0")"

cp cordis.yml cordis.yml.bak
trap 'mv -f cordis.yml.bak cordis.yml' EXIT

echo "########## 场景 1：主时间线 ##########"
node --import tsx ../../../vendor/cordis/bin.js

echo
echo "########## 场景 2：orphan（没有任何祖先声明 inject） ##########"
cp cordis-orphan.yml cordis.yml
node --import tsx ../../../vendor/cordis/bin.js || true
