#!/usr/bin/env bash
# 运行期把 cordis.yml 改坏（指向不存在的模块），看进程是崩还是只记日志。
#
# 日志必须写到【被监视目录之外】—— HMR 的 root 是 ['.']，
# 写进本目录会被当成一次文件变更，触发额外的 reload。
set -u
cd "$(dirname "$0")"

LOG="${TMPDIR:-/tmp}/hmr-config-error.log"
cp cordis.yml cordis.yml.orig
cp hello.ts  hello.ts.orig
rm -f "$LOG"

timeout 16 node --import tsx ../../../vendor/cordis/bin.js > "$LOG" 2>&1 &
NODE_PID=$!

sleep 5
echo "───── ② 改坏 cordis.yml（加一个不存在的模块 ./nope.ts）─────"
printf -- "- id: broken\n  name: './nope.ts'\n" >> cordis.yml

sleep 5
echo "───── ③ 再改 hello.ts，看旧树是否还活着 ─────"
sed -i "s/hello is ACTIVE/hello is STILL ALIVE/" hello.ts

sleep 4
wait $NODE_PID 2>/dev/null
echo "node 退出码 = $?（124 = 被 timeout 杀掉，即进程一直活着没崩）"

echo "───── ④ 完整输出 ─────"
cat "$LOG"

mv cordis.yml.orig cordis.yml
mv hello.ts.orig  hello.ts
