import Schema from '@deepseek-ai/schemastery'

const s = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

console.log('① Schema 实例的 typeof      :', typeof s)
console.log('   它是可调用的吗？          :', typeof s === 'function')

console.log('\n② 直接调用它（Schemastery 自己的接口）')
console.log('   s({})          →', JSON.stringify(s({})))

console.log('\n③ 通过 Standard Schema 接口（Cordis 实际走的路）')
console.log('   有 ~standard 属性吗？     :', '~standard' in (s as any))
const result = (s as any)['~standard'].validate({})
console.log('   validate({}) 的完整形状   :', JSON.stringify(result))
console.log('   → 取值要用 .value        :', JSON.stringify(result.value))

console.log('\n④ 校验失败时的形状')
console.log('   ', JSON.stringify((s as any)['~standard'].validate({ targets: 'oops' }).issues))
