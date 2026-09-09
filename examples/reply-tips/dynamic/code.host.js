// code.host — reply-tips Host 半边（动态 Cordis 插件，纯 JS async 函数体）。
//
// 职责：开关状态唯一真源 + fs 落盘；建议生成（sessionQuery 取会话事件 → llm.stream
// 真生成 → 多级解析 → reply 指纹缓存）；三个 package-private RPC handler。
// 运行环境：Host 沙箱求值时全局有 harness（harness.handle），返回的插件经 loader 挂载，
// apply(ctx) 的 ctx 是 host root（ctx.get 到已挂服务）。纯逻辑与
// examples/reply-tips/src/index.ts 导出一致（Node vitest 已钉住）。
//
// 注意：本文件是 async 函数体，按顺序执行——harness.handle 注册与状态初始化必须在
// return 之前，return 放最后一行。

var ROOT = null
var FILE = '.reply-tips.json'
var toggles = {} // sessionId -> boolean（普通对象承载）
var cacheRec = {} // sessionId -> { reply, tips, reason }（最近一次交付结果）
var busySync = {} // sessionId -> true（一次生成进行中，防并发重复）
var observed = {} // sessionId -> { reply, count }（稳定性闸门：同一回复文本连续 n 次轮询一致才算定稿）
var notOld = {} // sessionId -> true（已为新回复发起 refresh：新一批落库前禁止把旧缓存塞回）

function own(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function agentOf(sessionId) {
  try {
    var svc = ROOT.get('agents')
    if (!svc || typeof svc.get !== 'function') return undefined
    return svc.get(sessionId)
  } catch (e) { return undefined }
}

function cwdOf(sessionId) {
  try {
    var ag = agentOf(sessionId)
    if (!ag) return undefined
    if (ag.session && ag.session.header && typeof ag.session.header.cwd === 'string') return ag.session.header.cwd
    if (ag.session && typeof ag.session.cwd === 'string') return ag.session.cwd
    if (ag.header && typeof ag.header.cwd === 'string') return ag.header.cwd
  } catch (e) { /* noop */ }
  return undefined
}

function filePathOf(sessionId) {
  var c = cwdOf(sessionId)
  if (!c) return undefined
  return c + '/' + FILE
}

// ---- 会话事件读取（防御式多通道归一） ----

async function sessionEvents(sessionId) {
  var note = ''
  var sq
  try { sq = ROOT.get('sessionQuery') } catch (e) { sq = undefined }
  if (sq && typeof sq.readSession === 'function') {
    try {
      var snap = await sq.readSession(sessionId)
      if (snap && Array.isArray(snap.events)) {
        note = 'readSession:' + snap.events.length
        return { events: snap.events, note: note }
      }
      note = 'readSession:no-events'
    } catch (e) {
      note = 'readSession-threw:' + String((e && e.message) || e).slice(0, 80)
    }
  } else {
    note = 'readSession:missing'
  }
  try {
    var sessions = ROOT.get('sessions')
    if (sessions && typeof sessions.get === 'function') {
      var sess = sessions.get(sessionId)
      if (sess) {
        if (Array.isArray(sess.events)) {
          note += '|fb:' + sess.events.length
          return { events: sess.events, note: note }
        }
        if (sess.log && Array.isArray(sess.log.events)) {
          note += '|fb:' + sess.log.events.length
          return { events: sess.log.events, note: note }
        }
        note += '|fb:no-array'
      } else {
        note += '|fb:no-session'
      }
    } else {
      note += '|fb:missing'
    }
  } catch (e) {
    note += '|fb-threw:' + String((e && e.message) || e).slice(0, 80)
  }
  return { events: [], note: note }
}

function normalizeEvent(record) {
  if (!record || typeof record !== 'object') return null
  var ev = record.event && typeof record.event === 'object' ? record.event : record
  if (!ev || typeof ev !== 'object') return null
  if (typeof ev.type !== 'string') return null
  return ev
}

// ---- 文本抽取与同轮配对（与 src/index.ts latestTurnPair 语义一致） ----

function assistantContent(ev) {
  var data = ev.data
  if (!data || typeof data !== 'object') return undefined
  var message = data.message
  if (!message || typeof message !== 'object') return undefined
  return message.content
}

function textBlocks(content) {
  if (!Array.isArray(content)) return ''
  var parts = []
  for (var i = 0; i < content.length; i++) {
    var block = content[i]
    if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

function userText(ev) {
  var data = ev.data
  if (!data || typeof data !== 'object') return ''
  var src = data.source
  if (!src || src.kind !== 'user') return ''
  return textBlocks(data.content)
}

function latestTurnPair(events) {
  var reply = ''
  var question = ''
  for (var i = events.length - 1; i >= 0; i--) {
    var ev = events[i]
    if (!ev) continue
    var type = ev.type
    if (type === 'assistant/message') {
      if (reply !== '') continue
      var text = textBlocks(assistantContent(ev))
      if (text && text.trim() !== '') reply = text
      continue
    }
    if (type === 'user/message' && reply !== '' && question === '') {
      var q = userText(ev)
      if (q && q.trim() !== '') {
        question = q
        break
      }
    }
  }
  return { reply: reply, question: question }
}

// ---- 解析 / 兜底 / 提示词（与 src/index.ts 一致） ----

function tryParseArray(s) {
  var arr = JSON.parse(s)
  if (Array.isArray(arr)) {
    var out = []
    for (var i = 0; i < arr.length && out.length < 4; i++) {
      var x = arr[i]
      if (typeof x === 'string' && x.trim() !== '') out.push(x.trim())
    }
    return out
  }
  return []
}

function linesFallback(out) {
  var body = String(out || '').replace(/```(?:json)?/gi, '').trim()
  var tips = []
  var lines = body.split('\n')
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim()
    if (!t) continue
    t = t.replace(/^[-*•·\d.)、]+\s*/, '').trim()
    t = t.replace(/^["'\u201c\u2018\u300c]+/, '').replace(/["'\u201d\u2019\u300d]+$/, '').trim()
    if (!t) continue
    if (/^[`#]/.test(t)) continue
    if (t.length > 40) continue
    if (tips.indexOf(t) === -1) tips.push(t)
    if (tips.length >= 4) break
  }
  return tips
}

function quotedFallback(out) {
  var body = String(out || '')
  var tips = []
  var re = /["“\u201c'‘\u2018]([^"”\u201d\u2019'\u2018\u201c\u2018\u2019]{1,44})["”\u201d\u2019'\u2019]/g
  var m
  while ((m = re.exec(body)) !== null && tips.length < 4) {
    var t = (m[1] || '').trim()
    if (t && tips.indexOf(t) === -1) tips.push(t)
  }
  return tips
}

function isJunkTip(t) {
  if (typeof t !== 'string') return true
  var s = t.trim()
  if (!s) return true
  if (/^[\[\]{}<>()"'`#*•·_\-—、，。！？：；.…\s]+$/.test(s)) return true
  if (/^[\[{]/.test(s)) return true
  if (/^[\]}]$/.test(s)) return true
  if (s.indexOf('":"') !== -1) return true
  return false
}

function parseModelOutput(raw) {
  var s = String(raw || '').trim()
  var candidates = []
  var start = s.indexOf('[')
  var end = s.lastIndexOf(']')
  if (start !== -1 && end !== -1 && end > start) candidates.push(s.slice(start, end + 1))
  var noFence = s.replace(/```(?:json)?/gi, '').trim()
  if (noFence !== s) candidates.push(noFence)
  if (s !== '') candidates.push(s)
  var noTrailingComma = s.replace(/,\s*(?=[\]}])/g, '')
  if (noTrailingComma !== s) candidates.push(noTrailingComma)
  for (var c = 0; c < candidates.length; c++) {
    try {
      var parsed = tryParseArray(candidates[c])
      var cleaned = []
      for (var k = 0; k < parsed.length; k++) {
        if (!isJunkTip(parsed[k])) cleaned.push(parsed[k])
      }
      if (cleaned.length > 0) return cleaned
    } catch (e) { /* next */ }
  }
  var lines = linesFallback(s)
  var cleanedLines = []
  for (var j = 0; j < lines.length; j++) {
    if (!isJunkTip(lines[j])) cleanedLines.push(lines[j])
  }
  if (cleanedLines.length > 0) return cleanedLines
  var quoted = quotedFallback(s)
  var cleanedQuoted = []
  for (var q = 0; q < quoted.length; q++) {
    if (!isJunkTip(quoted[q])) cleanedQuoted.push(quoted[q])
  }
  if (cleanedQuoted.length > 0) return cleanedQuoted
  return []
}

function fallbackTips(text) {
  var t = String(text || '').trim()
  if (t === '') return []
  var tips = []
  if (t.indexOf('```') !== -1) {
    tips.push('解释这段代码')
    tips.push('指出这段代码的风险')
  }
  if (/[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/.test(t)) tips.push('这个文件改了什么')
  if (t.length >= 80) {
    tips.push('总结要点')
    tips.push('给一个更简单的版本')
  }
  var seen = []
  for (var i = 0; i < tips.length && seen.length < 4; i++) {
    if (seen.indexOf(tips[i]) === -1) seen.push(tips[i])
  }
  if (seen.length === 0) seen.push('展开讲讲')
  return seen
}

function buildPrompt(pair) {
  var ctxText = pair.question !== ''
    ? '\n\n用户的提问：\n' + pair.question.slice(0, 2000) + '\n\n助手的回复：\n' + pair.reply.slice(0, 6000)
    : '\n\n助手的回复：\n' + pair.reply.slice(0, 6000)
  return '你的任务：站在提问用户的角度，顺着「用户提问」的方向，给出 2 到 3 条用户最可能接着问的具体中文追问。'
    + '回复若覆盖多个点，优先顺着用户提问聚焦的方向，不要挑与提问无关的点。'
    + '\n生成质量要求：'
    + '1. 每条必须钉住助手回复里的具体内容——点名它提到的文件、函数、术语、数字或某个论断，像真人顺着话题追问，不写空泛句；'
    + '2. 禁止万能废话：不得使用「展开讲讲」「详细说说」「举个例子」「为什么这样」「继续」「总结一下」这类不看回复也能写出的句子；'
    + '3. 宁缺毋滥：没有实质可追问点时宁可只给 1 条，也要具体有用，不要凑数；每条最多 24 个汉字。'
    + '\n\n要求：只输出一个 JSON 字符串数组，严格用 ASCII 双引号，不要任何解释、序号、代码块围栏、列表符号或其他文字。'
    + '输出必须以 [ 开头、以 ] 结尾。\n' + ctxText
}

// ---- 开关文件读写（经 fs 服务；失败则退回内存态） ----

async function readFileText(absPath) {
  try {
    var fs = ROOT.get('fs')
    if (!fs || typeof fs.resolve !== 'function' || typeof fs.readText !== 'function') return undefined
    var target = await fs.resolve(absPath, {})
    return await fs.readText(target)
  } catch (e) { return undefined }
}

async function writeFileText(absPath, content) {
  try {
    var fs = ROOT.get('fs')
    if (!fs || typeof fs.resolve !== 'function' || typeof fs.writeText !== 'function') return false
    var target = await fs.resolve(absPath, {})
    await fs.writeText(target, content)
    return true
  } catch (e) { return false }
}

async function readEnabled(sessionId) {
  if (own(toggles, sessionId)) return toggles[sessionId] === true
  var abs = filePathOf(sessionId)
  if (!abs) return false
  var file = await readFileText(abs)
  var v = toggleValueOf(file, sessionId)
  if (typeof v === 'boolean') toggles[sessionId] = v
  return v === true
}

function toggleValueOf(file, sessionId) {
  if (!file || file.trim() === '') return undefined
  try {
    var parsed = JSON.parse(file)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed[sessionId] === 'boolean') {
      return parsed[sessionId]
    }
  } catch (e) { /* unset */ }
  return undefined
}

function withToggle(file, sessionId, enabled) {
  var all = {}
  if (file && file.trim() !== '') {
    try {
      var parsed = JSON.parse(file)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) all = parsed
    } catch (e) { all = {} }
  }
  all[sessionId] = enabled
  return JSON.stringify(all, null, 2)
}

async function writeEnabled(sessionId, enabled) {
  toggles[sessionId] = enabled
  var abs = filePathOf(sessionId)
  if (!abs) return
  var file = (await readFileText(abs)) || ''
  var next = withToggle(file, sessionId, enabled)
  await writeFileText(abs, next)
}

// ---- 建议生成核心（前台只判定+缓存，LLM 生成后台异步） ----

async function runGeneration(sessionId, pair) {
  var tips
  var reason
  try {
    var llmSvc
    try { llmSvc = ROOT.get('llm') } catch (e) { llmSvc = undefined }
    var hasLlm = !!llmSvc && typeof llmSvc.stream === 'function'
    var sel
    var hasSel = false
    if (hasLlm) {
      try {
        var dm = ROOT.get('agentDefaultModel')
        if (dm && typeof dm.currentSelection === 'function') {
          sel = dm.currentSelection()
          hasSel = !!(sel && typeof sel.provider === 'string' && typeof sel.model === 'string')
        }
      } catch (e) { hasSel = false }
    }
    if (!hasLlm) {
      reason = 'no-llm-service'
      tips = fallbackTips(pair.reply)
    } else if (!hasSel) {
      reason = 'no-selection'
      tips = fallbackTips(pair.reply)
    } else {
      var prompt = buildPrompt(pair)
      var attempts = 0
      var out = ''
      var finish = ''
      var kinds = []
      var threw = false
      while (attempts < 2 && out.trim() === '') {
        attempts += 1
        out = ''
        finish = ''
        kinds = []
        var usePrompt = attempts === 1
          ? prompt
          : prompt + '\n注意：不要输出任何思考/推理过程；思考请尽量简短，直接给出最终 JSON 数组。'
        var temperature = attempts === 1 ? 0 : 0.2
        try {
          var stream = llmSvc.stream({
            provider: sel.provider,
            model: sel.model,
            messages: [{ role: 'user', content: [{ type: 'text', text: usePrompt }] }],
            temperature: temperature,
            maxTokens: 8000,
            reasoningEffort: 'off',
          })
          for await (var chunk of stream) {
            if (!chunk || typeof chunk !== 'object') continue
            if (typeof chunk.type === 'string' && kinds.indexOf(chunk.type) === -1 && kinds.length < 8) kinds.push(chunk.type)
            if (chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text
            else if (chunk.type === 'finish') {
              var fr = chunk.reason
              finish = typeof fr === 'string'
                ? fr
                : (fr && typeof fr === 'object'
                    ? (typeof fr.reason === 'string' ? fr.reason : (typeof fr.kind === 'string' ? fr.kind : JSON.stringify(fr)))
                    : String(fr || ''))
            }
          }
        } catch (e) {
          threw = true
          break
        }
      }
      if (threw) {
        reason = 'stream-threw'
        tips = fallbackTips(pair.reply)
      } else if (finish === 'length' || finish === 'max-tokens') {
        reason = 'truncated(finish:' + String(finish) + ')'
        tips = fallbackTips(pair.reply)
      } else {
        var parsed = parseModelOutput(out)
        if (parsed.length === 0) {
          var rawSnip = String(out || '').replace(/\s+/g, ' ').slice(0, 120)
          reason = 'parse-failed(len:' + out.length + ',finish:' + String(finish).slice(0, 40) + ',kinds:' + kinds.join('/') + ',raw:' + rawSnip + ')'
          tips = fallbackTips(pair.reply)
        } else {
          reason = null
          tips = parsed
        }
      }
    }
  } catch (e) {
    reason = 'stream-threw'
    tips = fallbackTips(pair.reply)
  }
  cacheRec[sessionId] = { reply: pair.reply, tips: tips, reason: reason }
  return { tips: tips, reason: reason }
}

async function generateSuggestions(sessionId, refresh) {
  var rootNote = ROOT ? '' : 'root:null|'
  var fetched = await sessionEvents(sessionId)
  var pair = latestTurnPair(fetched.events)

  if (!pair.reply || pair.reply.trim() === '') {
    var summary = rootNote + fetched.note + '|reply:' + pair.reply.length
    return { suggestions: [], reason: 'no-text(' + summary.slice(0, 160) + ')', state: 'idle' }
  }
  var last = own(cacheRec, sessionId) ? cacheRec[sessionId] : undefined
  if (last && last.reply === pair.reply) {
    notOld[sessionId] = false
    return { suggestions: last.tips, reason: last.reason === undefined ? null : last.reason, state: 'fresh' }
  }
  // refresh 且回复确实变了：立“不再回旧缓存”标记
  if (refresh === true) notOld[sessionId] = true
  // 稳定性闸门：同一回复文本连续两次观测一致才视为定稿（避开思考/流式中的半成品）。
  var cur = observed[sessionId]
  if (cur && cur.reply === pair.reply) {
    cur.count += 1
  } else {
    observed[sessionId] = { reply: pair.reply, count: 1 }
    cur = observed[sessionId]
  }
  var stable = cur.count >= 2
  if (!stable) {
    if (last && notOld[sessionId] !== true) {
      // 常规轮询且未做新回复刷新：旧胶囊保留到新一批就绪
      return { suggestions: last.tips, reason: last.reason === undefined ? null : last.reason, state: 'fresh' }
    }
    // refresh 已清空或等待新一批：不塞回旧缓存，保持“获取中”
    return { suggestions: [], reason: null, state: 'generating' }
  }
  // 并发的下一轮轮询若撞上生成中：没做刷新则回上一批（不闪），刷新等待中则保持“获取中”
  if (busySync[sessionId] === true) {
    if (notOld[sessionId] === true) {
      return { suggestions: [], reason: null, state: 'generating' }
    }
    return {
      suggestions: last && Array.isArray(last.tips) ? last.tips : [],
      reason: last ? (last.reason === undefined ? null : last.reason) : null,
      state: 'fresh',
    }
  }
  busySync[sessionId] = true
  try {
    var result = await runGeneration(sessionId, pair)
    notOld[sessionId] = false
    return { suggestions: result.tips, reason: result.reason === undefined ? null : result.reason, state: 'fresh' }
  } finally {
    busySync[sessionId] = false
  }
}

// ---- RPC handlers（沙箱全局 harness；apply 之后 Client 才会调用） ----

harness.handle('reply-tips.get', async function (args) {
  var sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
  if (sessionId === '') return { enabled: false }
  var enabled = await readEnabled(sessionId)
  return { enabled: enabled }
})

harness.handle('reply-tips.set', async function (args) {
  var sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
  var enabled = !!(args && args.enabled === true)
  if (sessionId === '') return { enabled: false, saved: false }
  await writeEnabled(sessionId, enabled)
  return { enabled: enabled, saved: true }
})

harness.handle('reply-tips.get-suggestions', async function (args) {
  var sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
  if (sessionId === '') return { suggestions: [], reason: 'no-text', state: 'idle' }
  var refresh = !!(args && args.mode === 'refresh')
  var result = await generateSuggestions(sessionId, refresh)
  return {
    suggestions: result.suggestions,
    reason: result.reason === undefined ? null : result.reason,
    state: result.state === undefined ? 'fresh' : result.state,
  }
})

// ---- 插件本体：apply 捕获 host root ctx ----

return {
  inject: ['sessionQuery', 'sessions', 'agents', 'agentDefaultModel', 'llm', 'fs'],
  apply(ctx) {
    ROOT = ctx
  },
}
