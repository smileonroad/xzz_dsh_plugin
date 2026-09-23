// schema-shape.ts 是纯脚本（没有 apply），所以用这个小插件把它 import 进来。
export const name = 'schema-shape-runner'

export function apply() {
  return import('./schema-shape.ts')
}
