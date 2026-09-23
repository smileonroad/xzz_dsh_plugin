import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { pathToFileURL } from 'node:url'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'
await ctx.plugin(Loader)

// entry-init 在 Entry 构造函数里、options 赋值之前就发出了，
// 所以这里只记下引用，等加载完再回头看。
const seen: any[] = []
ctx.on('loader/entry-init', (entry: any) => seen.push(entry))

await ctx.loader.create({
  name: '@deepseek-ai/cordis-plugin-include',
  config: { path: './cordis.yml' },
})

for (const entry of seen) {
  console.log('name           =', entry.options?.name)
  console.log('  options.id   =', JSON.stringify(entry.options?.id))
  console.log('  typeof id    =', typeof entry.options?.id)
  console.log('  生效的 id    =', entry.id)
}
