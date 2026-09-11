/**
 * reply-tips 纯函数层 spec。
 *
 * 钉住可脱离宿主测试的核心：latestTurnPair 的同轮配对回扫、fallbackTips 规则兜底、
 * buildSuggestionsPrompt 提示词形状、tryParseArray / linesFallback / parseModelOutput
 * 三级解析、withToggle / readToggleFile 开关文件读写，以及导出契约。
 *
 * 静态包把两侧入口分开：`.`（`src/index.ts`）是 Host 半边，`./client`
 * （`src/client.ts`）是浏览器半边，`inject` 归客户端半边，Host 的纯函数经 `.` 转出。
 *
 * 与仓库其它 example 同一哲学：测试描述行为——把「现在就是这样工作的」钉死，
 * 包括框架与解析链的反直觉细节（例如同轮配对只认回复之前的最近 user 提问、
 * 逐行兜底会剥列表符与引号、多级解析的逐级放宽顺序）。
 */

import { describe, expect, it } from 'vitest'
import {
  FILE_NAME, buildSuggestionsPrompt, fallbackTips, latestTurnPair, linesFallback,
  name, parseModelOutput, readToggleFile, tryParseArray, withToggle,
  type SessionLike,
} from '../src/index.ts'

const userMessage = (text: string, seq = 0, sourceKind = 'user') => ({
  type: 'user/message', seq,
  data: { content: [{ type: 'text', text }], source: { kind: sourceKind } },
})
const assistantMessage = (blocks: Array<{ type: string; text?: string }>, seq = 0) => ({
  type: 'assistant/message', seq,
  data: { message: { content: blocks } },
})

describe('导出契约', () => {
  it('name/FILE_NAME 从 Host 入口转出；客户端半边的 inject 由包门禁断言', () => {
    expect(name).toBe('reply-tips')
    expect(FILE_NAME).toBe('.reply-tips.json')
  })
})

describe('latestTurnPair：同轮配对回扫', () => {
  it('空会话 / 无事件 → 空配对', () => {
    expect(latestTurnPair({ events: [] })).toEqual({ reply: '', question: '' })
    expect(latestTurnPair({} as SessionLike)).toEqual({ reply: '', question: '' })
  })

  it('只有用户提问没有回复 → reply/question 都为空（question 必须出现在回复之前）', () => {
    const session = { events: [userMessage('提问', 1)] }
    expect(latestTurnPair(session)).toEqual({ reply: '', question: '' })
  })

  it('最新一条非空助手回复 + 它之前最近的真实用户提问，凑成一轮', () => {
    const session = {
      events: [
        userMessage('第一问', 1),
        assistantMessage([{ type: 'text', text: '第一答' }], 2),
        userMessage('第二问', 3),
        assistantMessage([{ type: 'text', text: '第二答' }], 4),
      ],
    }
    expect(latestTurnPair(session)).toEqual({ reply: '第二答', question: '第二问' })
  })

  it('回复之后又来了新提问（尚无新回复）→ 仍配回复之前那问，不串轮', () => {
    const session = {
      events: [
        userMessage('问', 1),
        assistantMessage([{ type: 'text', text: '答' }], 2),
        userMessage('新一轮问题还没人回', 3),
      ],
    }
    expect(latestTurnPair(session)).toEqual({ reply: '答', question: '问' })
  })

  it('多条文本块拼成回复正文；非 text 块被忽略', () => {
    const session = {
      events: [
        userMessage('问', 1),
        assistantMessage([
          { type: 'text', text: '前段' },
          { type: 'image', url: 'x' },
          { type: 'text', text: '后段' },
        ], 2),
      ],
    }
    expect(latestTurnPair(session)).toEqual({ reply: '前段\n后段', question: '问' })
  })

  it('空的助手回复被跳过，继续向前找更早的非空回复', () => {
    const session = {
      events: [
        userMessage('问', 1),
        assistantMessage([{ type: 'text', text: '真答' }], 2),
        assistantMessage([], 3), // 空回复（如被打断）不算最新 finalized 回复
      ],
    }
    expect(latestTurnPair(session)).toEqual({ reply: '真答', question: '问' })
  })

  it('非真实用户的 user/message（source.kind ≠ user）不充当提问', () => {
    const session = {
      events: [
        userMessage('注入的消息', 1, 'plugin'),
        assistantMessage([{ type: 'text', text: '答' }], 2),
      ],
    }
    expect(latestTurnPair(session)).toEqual({ reply: '答', question: '' })
  })
})

describe('fallbackTips：规则兜底', () => {
  it('空文本 → 无建议', () => {
    expect(fallbackTips('')).toEqual([])
    expect(fallbackTips('   ')).toEqual([])
  })

  it('含代码围栏 → 解释 + 风险', () => {
    expect(fallbackTips('看这段\n```ts\nconst a = 1\n```')).toEqual([
      '解释这段代码', '指出这段代码的风险',
    ])
  })

  it('含点号文件名 → 这个文件改了什么', () => {
    expect(fallbackTips('改动在 a.ts 里')).toEqual(['这个文件改了什么'])
  })

  it('长文本（≥80 字）→ 总结 + 更简单版本', () => {
    const long = '长'.repeat(80)
    expect(fallbackTips(long)).toEqual(['总结要点', '给一个更简单的版本'])
  })

  it('规则叠加去重且最多 4 条', () => {
    // 同时命中围栏 + 文件名 + 长文本：候选 5 条，去重后截断到 4 条
    const text = '长'.repeat(80) + '\n```ts\nconst x = 1\n```\n改了 src/index.ts'
    const tips = fallbackTips(text)
    expect(tips.length).toBe(4)
    expect(tips).toEqual(['解释这段代码', '指出这段代码的风险', '这个文件改了什么', '总结要点'])
    expect(new Set(tips).size).toBe(tips.length)
  })

  it('什么都不命中 → 兜底「展开讲讲」', () => {
    expect(fallbackTips('嗯')).toEqual(['展开讲讲'])
  })
})

describe('buildSuggestionsPrompt：提示词形状', () => {
  it('带提问：提示词包含「用户的提问」与「助手的回复」两段', () => {
    const prompt = buildSuggestionsPrompt({ question: 'Q', reply: 'A' })
    expect(prompt.startsWith('你的任务：站在提问用户的角度')).toBe(true)
    expect(prompt).toContain('JSON 字符串数组')
    expect(prompt).toContain('用户的提问：\nQ')
    expect(prompt).toContain('助手的回复：\nA')
  })

  it('无提问：只包含回复段', () => {
    const prompt = buildSuggestionsPrompt({ question: '', reply: 'A' })
    expect(prompt).not.toContain('用户的提问：')
    expect(prompt).toContain('助手的回复：\nA')
  })

  it('长内容按上限截断：question 2000 字、reply 6000 字', () => {
    const prompt = buildSuggestionsPrompt({ question: 'q'.repeat(3000), reply: 'r'.repeat(9000) })
    expect(prompt).toContain('q'.repeat(2000))
    expect(prompt).not.toContain('q'.repeat(2001))
    expect(prompt).toContain('r'.repeat(6000))
    expect(prompt).not.toContain('r'.repeat(6001))
  })
})

describe('tryParseArray / linesFallback / parseModelOutput：多级解析', () => {
  it('tryParseArray：合法 JSON 数组 → 过滤/trim/限 4 条', () => {
    expect(tryParseArray('["a", " b ", "", 3]')).toEqual(['a', 'b'])
    expect(tryParseArray('[1,2]')).toEqual([])
    expect(tryParseArray('[]')).toEqual([])
  })

  it('tryParseArray：非法 JSON 直接抛错（解析链靠抛错逐级放宽）', () => {
    expect(() => tryParseArray('这不是 JSON')).toThrow()
  })

  it('linesFallback：剥围栏/列表符/引号、跳过代码行与超长行、去重、限 4 条', () => {
    const out = [
      '```json',
      '- 追问一',
      '1. 追问二',
      '“带引号的追问”',
      '`code line`',
      'x'.repeat(41),
      '- 追问一',
      '```',
    ].join('\n')
    expect(linesFallback(out)).toEqual(['追问一', '追问二', '带引号的追问'])
  })

  it('parseModelOutput：干净 JSON 数组 → json', () => {
    expect(parseModelOutput('["追问一","追问二"]')).toEqual({
      parsed: ['追问一', '追问二'], how: 'json',
    })
  })

  it('parseModelOutput：带围栏与前后缀杂讯 → 截取/去围栏后仍走 json', () => {
    const out = '好的：\n```json\n["追问一","追问二"]\n```\n希望有帮助'
    expect(parseModelOutput(out)).toEqual({
      parsed: ['追问一', '追问二'], how: 'json',
    })
  })

  it('parseModelOutput：非 JSON 但逐行可读 → lines', () => {
    expect(parseModelOutput('1. 追问一\n- 追问二')).toEqual({
      parsed: ['追问一', '追问二'], how: 'lines',
    })
  })

  it('parseModelOutput：无括号的干净短行会被逐行兜底收编（解析器故意宽松）', () => {
    expect(parseModelOutput('没有可用的输出')).toEqual({
      parsed: ['没有可用的输出'], how: 'lines',
    })
  })

  it('parseModelOutput：所有行都被跳过（超长/代码/标题行）→ none 空数组', () => {
    expect(parseModelOutput('x'.repeat(60))).toEqual({ parsed: [], how: 'none' })
    expect(parseModelOutput('`inline code`\n# heading')).toEqual({ parsed: [], how: 'none' })
  })
})

describe('withToggle / readToggleFile：开关文件读写', () => {
  it('空文件写入 → 只含该会话', () => {
    const file = withToggle('', 's1', true)
    expect(JSON.parse(file)).toEqual({ s1: true })
  })

  it('既有文件追加/覆盖其它会话、不动无关键', () => {
    const first = withToggle('', 's1', false)
    const second = withToggle(first, 's2', true)
    expect(JSON.parse(second)).toEqual({ s1: false, s2: true })
    const third = withToggle(second, 's1', true)
    expect(JSON.parse(third)).toEqual({ s1: true, s2: true })
  })

  it('畸形文件内容 → 当作空文件重建', () => {
    const file = withToggle('{{{', 's1', true)
    expect(JSON.parse(file)).toEqual({ s1: true })
  })

  it('readToggleFile：未设置/畸形/非布尔 → undefined；设置后往返一致', () => {
    expect(readToggleFile(undefined, 's1')).toBeUndefined()
    expect(readToggleFile('', 's1')).toBeUndefined()
    expect(readToggleFile('{{{', 's1')).toBeUndefined()
    expect(readToggleFile('{"s1":"yes"}', 's1')).toBeUndefined() // 值不是布尔
    expect(readToggleFile('{"s2":true}', 's1')).toBeUndefined() // 会话不存在
    const file = withToggle('', 's1', true)
    expect(readToggleFile(file, 's1')).toBe(true)
    expect(readToggleFile(withToggle(file, 's1', false), 's1')).toBe(false)
  })
})
