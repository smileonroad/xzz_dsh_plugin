#!/usr/bin/env bash
# 运行期把插件改成语法错误，再改回合法代码，看能否自动恢复。
set -u
cd "$(dirname "$0")"

LOG="${TMPDIR:-/tmp}/hmr-reload-error.log"
cp cordis.yml cordis.yml.orig
cp hello.ts  hello.ts.orig
trap 'mv -f cordis.yml.orig cordis.yml; mv -f hello.ts.orig hello.ts' EXIT
rm -f "$LOG"

timeout 16 node --import tsx ../../../vendor/cordis/bin.js > "$LOG" 2>&1 &
NODE_PID=$!

sleep 5
echo "───── ② 把 hello.ts 改成语法错误 ─────"
cat > hello.ts <<'TS'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello is ACTIVE'      // ← 缺一个右括号
}
TS

sleep 5
echo "───── ③ 改回合法代码，看能否恢复 ─────"
cp hello.ts.orig hello.ts
sed -i "s/hello is ACTIVE/hello is RECOVERED/" hello.ts

sleep 4
wait $NODE_PID 2>/dev/null
echo "node 退出码 = $?（124 = 进程一直活着）"
echo "───── ④ 完整输出 ─────"
cat "$LOG"
