var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name2, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name: name2, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name2, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name2]() {
    return __privateGet(this, extra);
  }, set [name2](x) {
    return __privateSet(this, extra, x);
  } }, name2));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name2) : __name(target, name2);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name2, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name2 in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name2];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name2] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name2, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/index.ts
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

// src/core.ts
var FILE_NAME = ".reply-tips.json";
function latestTurnPair(session) {
  const events = session?.events ?? [];
  let reply = "";
  let question = "";
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (!ev || typeof ev.type !== "string") continue;
    if (ev.type === "assistant/message") {
      if (reply !== "") continue;
      const text = messageText(dataOf(ev));
      if (text.trim() !== "") reply = text;
      continue;
    }
    if (ev.type === "user/message" && reply !== "" && question === "") {
      const um = ev.data;
      const src = um?.source;
      if (!src || src.kind !== "user") continue;
      const text = (um?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      if (text.trim() !== "") {
        question = text;
        break;
      }
    }
  }
  return { reply, question };
}
function dataOf(ev) {
  const data = ev.data;
  const message = data?.message;
  return message ?? void 0;
}
function messageText(message) {
  return (message?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
function fallbackTips(text) {
  const t = (text ?? "").trim();
  if (t === "") return [];
  const tips = [];
  if (t.includes("```")) {
    tips.push("\u89E3\u91CA\u8FD9\u6BB5\u4EE3\u7801");
    tips.push("\u6307\u51FA\u8FD9\u6BB5\u4EE3\u7801\u7684\u98CE\u9669");
  }
  if (/[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/.test(t)) tips.push("\u8FD9\u4E2A\u6587\u4EF6\u6539\u4E86\u4EC0\u4E48");
  if (t.length >= 80) {
    tips.push("\u603B\u7ED3\u8981\u70B9");
    tips.push("\u7ED9\u4E00\u4E2A\u66F4\u7B80\u5355\u7684\u7248\u672C");
  }
  const seen = [];
  for (const tip of tips) {
    if (!seen.includes(tip)) seen.push(tip);
  }
  const result = seen.slice(0, 4);
  if (result.length === 0) result.push("\u5C55\u5F00\u8BB2\u8BB2");
  return result;
}
function buildSuggestionsPrompt(pair) {
  const ctxText = pair.question !== "" ? `

\u7528\u6237\u7684\u63D0\u95EE\uFF1A
${pair.question.slice(0, 2e3)}

\u52A9\u624B\u7684\u56DE\u590D\uFF1A
${pair.reply.slice(0, 6e3)}` : `

\u52A9\u624B\u7684\u56DE\u590D\uFF1A
${pair.reply.slice(0, 6e3)}`;
  return "\u4F60\u7684\u4EFB\u52A1\uFF1A\u7AD9\u5728\u63D0\u95EE\u7528\u6237\u7684\u89D2\u5EA6\uFF0C\u987A\u7740\u300C\u7528\u6237\u63D0\u95EE\u300D\u7684\u65B9\u5411\uFF0C\u7ED9\u51FA 2 \u5230 3 \u6761\u7528\u6237\u6700\u53EF\u80FD\u63A5\u7740\u95EE\u7684\u5177\u4F53\u4E2D\u6587\u8FFD\u95EE\u3002\u56DE\u590D\u82E5\u8986\u76D6\u591A\u4E2A\u70B9\uFF0C\u4F18\u5148\u987A\u7740\u7528\u6237\u63D0\u95EE\u805A\u7126\u7684\u65B9\u5411\uFF0C\u4E0D\u8981\u6311\u4E0E\u63D0\u95EE\u65E0\u5173\u7684\u70B9\u3002\n\u751F\u6210\u8D28\u91CF\u8981\u6C42\uFF1A1. \u6BCF\u6761\u5FC5\u987B\u9489\u4F4F\u52A9\u624B\u56DE\u590D\u91CC\u7684\u5177\u4F53\u5185\u5BB9\u2014\u2014\u70B9\u540D\u5B83\u63D0\u5230\u7684\u6587\u4EF6\u3001\u51FD\u6570\u3001\u672F\u8BED\u3001\u6570\u5B57\u6216\u67D0\u4E2A\u8BBA\u65AD\uFF0C\u50CF\u771F\u4EBA\u987A\u7740\u8BDD\u9898\u8FFD\u95EE\uFF0C\u4E0D\u5199\u7A7A\u6CDB\u53E5\uFF1B2. \u7981\u6B62\u4E07\u80FD\u5E9F\u8BDD\uFF1A\u4E0D\u5F97\u4F7F\u7528\u300C\u5C55\u5F00\u8BB2\u8BB2\u300D\u300C\u8BE6\u7EC6\u8BF4\u8BF4\u300D\u300C\u4E3E\u4E2A\u4F8B\u5B50\u300D\u300C\u4E3A\u4EC0\u4E48\u8FD9\u6837\u300D\u300C\u7EE7\u7EED\u300D\u300C\u603B\u7ED3\u4E00\u4E0B\u300D\u8FD9\u7C7B\u4E0D\u770B\u56DE\u590D\u4E5F\u80FD\u5199\u51FA\u7684\u53E5\u5B50\uFF1B3. \u5B81\u7F3A\u6BCB\u6EE5\uFF1A\u6CA1\u6709\u5B9E\u8D28\u53EF\u8FFD\u95EE\u70B9\u65F6\u5B81\u53EF\u53EA\u7ED9 1 \u6761\uFF0C\u4E5F\u8981\u5177\u4F53\u6709\u7528\uFF0C\u4E0D\u8981\u51D1\u6570\uFF1B\u6BCF\u6761\u6700\u591A 24 \u4E2A\u6C49\u5B57\u3002\n\n\u8981\u6C42\uFF1A\u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5B57\u7B26\u4E32\u6570\u7EC4\uFF0C\u4E25\u683C\u7528 ASCII \u53CC\u5F15\u53F7\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u3001\u5E8F\u53F7\u3001\u4EE3\u7801\u5757\u56F4\u680F\u3001\u5217\u8868\u7B26\u53F7\u6216\u5176\u4ED6\u6587\u5B57\u3002\u8F93\u51FA\u5FC5\u987B\u4EE5 [ \u5F00\u5934\u3001\u4EE5 ] \u7ED3\u5C3E\u3002\n" + ctxText;
}
function tryParseArray(s) {
  const arr = JSON.parse(s);
  if (Array.isArray(arr)) {
    return arr.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim()).slice(0, 4);
  }
  return [];
}
function linesFallback(out) {
  const body = (out ?? "").replace(/```(?:json)?/gi, "").trim();
  const tips = [];
  const lines = body.split("\n");
  for (const line of lines) {
    let t = line.trim();
    if (!t) continue;
    t = t.replace(/^[-*•·\d.)、]+\s*/, "").trim();
    t = t.replace(/^["'\u201c\u2018\u300c]+/, "").replace(/["'\u201d\u2019\u300d]+$/, "").trim();
    if (!t) continue;
    if (/^[`#]/.test(t)) continue;
    if (t.length > 40) continue;
    if (!tips.includes(t)) tips.push(t);
    if (tips.length >= 4) break;
  }
  return tips;
}
function quotedFallback(out) {
  const body = String(out ?? "");
  const tips = [];
  const re = /["“\u201c'‘\u2018]([^"”\u201d\u2019'\u2018\u201c\u2018\u2019]{1,44})["”\u201d\u2019'\u2019]/g;
  let m;
  while ((m = re.exec(body)) !== null && tips.length < 4) {
    const t = (m[1] ?? "").trim();
    if (t !== "" && !tips.includes(t)) tips.push(t);
  }
  return tips;
}
function isJunkTip(t) {
  const s = (t ?? "").trim();
  if (s === "") return true;
  if (/^[\[\]{}<>()"'`#*•·_\-—、，。！？：；.…\s]+$/.test(s)) return true;
  if (/^[\[{]/.test(s)) return true;
  if (/^[\]}]$/.test(s)) return true;
  if (s.includes('":"')) return true;
  return false;
}
var cleanTips = (items) => {
  const out = [];
  for (const item of items) {
    if (!isJunkTip(item)) out.push(item);
  }
  return out;
};
function parseModelOutput(out) {
  const s = (out ?? "").trim();
  const candidates = [];
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) candidates.push(s.slice(start, end + 1));
  const noFence = s.replace(/```(?:json)?/gi, "").trim();
  if (noFence !== s) candidates.push(noFence);
  if (s !== "") candidates.push(s);
  const noTrailingComma = s.replace(/,\s*(?=[\]}])/g, "");
  if (noTrailingComma !== s) candidates.push(noTrailingComma);
  for (const candidate of candidates) {
    try {
      const parsed = cleanTips(tryParseArray(candidate));
      if (parsed.length > 0) return { parsed, how: "json" };
    } catch {
    }
  }
  const lines = cleanTips(linesFallback(out));
  if (lines.length > 0) return { parsed: lines, how: "lines" };
  const quoted = cleanTips(quotedFallback(out));
  if (quoted.length > 0) return { parsed: quoted, how: "lines" };
  return { parsed: [], how: "none" };
}
function withToggle(file, sessionId, enabled) {
  let all = {};
  if (file.trim() !== "") {
    try {
      const parsed = JSON.parse(file);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) all = parsed;
    } catch {
      all = {};
    }
  }
  all[sessionId] = enabled;
  return JSON.stringify(all, null, 2);
}
function readToggleFile(file, sessionId) {
  if (!file || file.trim() === "") return void 0;
  try {
    const parsed = JSON.parse(file);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed[sessionId] === "boolean") {
      return parsed[sessionId];
    }
  } catch {
  }
  return void 0;
}

// src/index.ts
function cwdOf(agent) {
  if (agent === null || typeof agent !== "object") return void 0;
  const record = agent;
  const headerCwd = record.session?.header?.cwd;
  if (typeof headerCwd === "string") return headerCwd;
  const sessionCwd = record.session?.cwd;
  if (typeof sessionCwd === "string") return sessionCwd;
  const agentCwd = record.header?.cwd;
  if (typeof agentCwd === "string") return agentCwd;
  return void 0;
}
var _getSuggestions_dec, _set_dec, _get_dec, _a, _init;
var ReplyTipsService = class extends (_a = TypertRemoteService, _get_dec = [Remote("get")], _set_dec = [Remote("set")], _getSuggestions_dec = [Remote("get-suggestions")], _a) {
  constructor(ctx) {
    super(ctx, "replyTips", { namespace: "replyTips" });
    __runInitializers(_init, 5, this);
    /** sessionId -> 开关（内存真相）。 */
    __publicField(this, "toggles", /* @__PURE__ */ new Map());
    /** sessionId -> 最近一次交付结果。 */
    __publicField(this, "cacheRec", /* @__PURE__ */ new Map());
    /** sessionId -> 生成进行中。 */
    __publicField(this, "busy", /* @__PURE__ */ new Set());
    /** sessionId -> 稳定性闸门观测（同一回复文本连续计数）。 */
    __publicField(this, "observed", /* @__PURE__ */ new Map());
    /** sessionId -> 已为新回复发起刷新（新一批落库前禁止回旧缓存）。 */
    __publicField(this, "notOld", /* @__PURE__ */ new Set());
  }
  async get(request) {
    const sessionId = request.sessionId;
    if (sessionId === "") return { enabled: false };
    return { enabled: await this.readEnabled(sessionId) };
  }
  async set(request) {
    const sessionId = request.sessionId;
    if (sessionId === "") return { enabled: false, saved: false };
    this.toggles.set(sessionId, request.enabled);
    const saved = await this.writeEnabled(sessionId, request.enabled);
    return { enabled: request.enabled, saved };
  }
  async getSuggestions(request) {
    const sessionId = request.sessionId;
    if (sessionId === "") return { suggestions: [], reason: "no-text", state: "idle" };
    return await this.generateSuggestions(sessionId, request.refresh === true);
  }
  /** 工作区文件绝对路径（取不到 cwd 时为 undefined）。 */
  filePathOf(sessionId) {
    const agents = this.ctx.get("agents");
    const cwd = agents === void 0 ? void 0 : cwdOf(agents.get(sessionId));
    return cwd === void 0 ? void 0 : `${cwd}/${FILE_NAME}`;
  }
  /** 经 fs 服务读取文本；不可用时 undefined。 */
  async readFileText(absPath) {
    const fs = this.ctx.get("fs");
    if (fs === void 0) return void 0;
    try {
      const target = await fs.resolve(absPath, {});
      return await fs.readText(target);
    } catch {
      return void 0;
    }
  }
  /** 经 fs 服务写文本；成功返回 true。 */
  async writeFileText(absPath, content) {
    const fs = this.ctx.get("fs");
    if (fs === void 0) return false;
    try {
      const target = await fs.resolve(absPath, {});
      await fs.writeText(target, content);
      return true;
    } catch {
      return false;
    }
  }
  /** 读开关：mem 命中直接用，否则读文件并回填。 */
  async readEnabled(sessionId) {
    const cached = this.toggles.get(sessionId);
    if (cached !== void 0) return cached;
    const abs = this.filePathOf(sessionId);
    if (abs === void 0) return false;
    const file = await this.readFileText(abs);
    const value = readToggleFile(file, sessionId);
    if (value !== void 0) this.toggles.set(sessionId, value);
    return value === true;
  }
  /** 写开关：mem 先落，再尽力落盘。 */
  async writeEnabled(sessionId, enabled) {
    const abs = this.filePathOf(sessionId);
    if (abs === void 0) return false;
    const file = await this.readFileText(abs) ?? "";
    return await this.writeFileText(abs, withToggle(file, sessionId, enabled));
  }
  /** 回扫会话事件：优先 sessionQuery.readSession，失败退回空集。 */
  async sessionEvents(sessionId) {
    const query = this.ctx.get("sessionQuery");
    if (query === void 0) return [];
    try {
      const snapshot = await query.readSession(sessionId);
      return snapshot?.events ?? [];
    } catch {
      return [];
    }
  }
  /** 真生成：默认模型 + llm.stream，两轮尝试 + 多级解析 + 规则兜底。 */
  async runGeneration(pair) {
    const llm = this.ctx.get("llm");
    if (llm === void 0) return { tips: fallbackTips(pair.reply), reason: "no-llm-service" };
    const models = this.ctx.get("agentDefaultModel");
    const selection = models?.currentSelection() ?? void 0;
    const provider = selection?.provider;
    const model = selection?.model;
    if (typeof provider !== "string" || typeof model !== "string") {
      return { tips: fallbackTips(pair.reply), reason: "no-selection" };
    }
    const prompt = buildSuggestionsPrompt(pair);
    let out = "";
    let finish = "";
    for (let attempt = 1; attempt <= 2 && out.trim() === ""; attempt += 1) {
      out = "";
      finish = "";
      const usePrompt = attempt === 1 ? prompt : `${prompt}
\u6CE8\u610F\uFF1A\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u601D\u8003/\u63A8\u7406\u8FC7\u7A0B\uFF1B\u601D\u8003\u8BF7\u5C3D\u91CF\u7B80\u77ED\uFF0C\u76F4\u63A5\u7ED9\u51FA\u6700\u7EC8 JSON \u6570\u7EC4\u3002`;
      const stream = llm.stream({
        provider,
        model,
        messages: [{ role: "user", content: [{ type: "text", text: usePrompt }] }],
        temperature: attempt === 1 ? 0 : 0.2,
        maxTokens: 8e3,
        reasoningEffort: "off"
      });
      try {
        for await (const chunk of stream) {
          if (chunk.type === "text-delta" && typeof chunk.text === "string") out += chunk.text;
          else if (chunk.type === "finish") finish = finishOf(chunk.reason);
        }
      } catch {
        return { tips: fallbackTips(pair.reply), reason: "stream-threw" };
      }
    }
    if (finish === "length" || finish === "max-tokens") {
      return { tips: fallbackTips(pair.reply), reason: `truncated(finish:${finish})` };
    }
    const parsed = parseModelOutput(out);
    if (parsed.parsed.length === 0) {
      const raw = out.replace(/\s+/g, " ").slice(0, 120);
      return { tips: fallbackTips(pair.reply), reason: `parse-failed(len:${out.length},finish:${finish},raw:${raw})` };
    }
    return { tips: parsed.parsed, reason: null };
  }
  /** 前台判定 + 闸门 + 缓存；真正生成在 busy 保护下进行。 */
  async generateSuggestions(sessionId, refresh) {
    const events = await this.sessionEvents(sessionId);
    const pair = latestTurnPair({ events });
    if (pair.reply.trim() === "") {
      return { suggestions: [], reason: "no-text", state: "idle" };
    }
    const last = this.cacheRec.get(sessionId);
    if (last !== void 0 && last.reply === pair.reply) {
      this.notOld.delete(sessionId);
      return { suggestions: last.tips, reason: last.reason, state: "fresh" };
    }
    if (refresh) this.notOld.add(sessionId);
    const current = this.observed.get(sessionId);
    const next = current !== void 0 && current.reply === pair.reply ? { reply: pair.reply, count: current.count + 1 } : { reply: pair.reply, count: 1 };
    this.observed.set(sessionId, next);
    if (next.count < 2) {
      if (last !== void 0 && !this.notOld.has(sessionId)) {
        return { suggestions: last.tips, reason: last.reason, state: "fresh" };
      }
      return { suggestions: [], reason: null, state: "generating" };
    }
    if (this.busy.has(sessionId)) {
      if (this.notOld.has(sessionId)) return { suggestions: [], reason: null, state: "generating" };
      return { suggestions: last?.tips ?? [], reason: last?.reason ?? null, state: "fresh" };
    }
    this.busy.add(sessionId);
    try {
      const result = await this.runGeneration(pair);
      this.cacheRec.set(sessionId, { reply: pair.reply, tips: result.tips, reason: result.reason });
      this.notOld.delete(sessionId);
      const state = "fresh";
      return { suggestions: result.tips, reason: result.reason, state };
    } finally {
      this.busy.delete(sessionId);
    }
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "get", _get_dec, ReplyTipsService);
__decorateElement(_init, 1, "set", _set_dec, ReplyTipsService);
__decorateElement(_init, 1, "getSuggestions", _getSuggestions_dec, ReplyTipsService);
__decoratorMetadata(_init, ReplyTipsService);
__publicField(ReplyTipsService, "inject", ["sessionQuery", "sessions", "agents", "agentDefaultModel", "llm", "fs"]);
function finishOf(reason) {
  if (typeof reason === "string") return reason;
  if (reason !== null && typeof reason === "object") {
    const record = reason;
    if (typeof record.reason === "string") return record.reason;
    if (typeof record.kind === "string") return record.kind;
    return JSON.stringify(reason);
  }
  return String(reason ?? "");
}
var name = "reply-tips";
function apply(ctx) {
  void new ReplyTipsService(ctx);
}
export {
  FILE_NAME,
  ReplyTipsService,
  apply,
  buildSuggestionsPrompt,
  fallbackTips,
  isJunkTip,
  latestTurnPair,
  linesFallback,
  name,
  parseModelOutput,
  quotedFallback,
  readToggleFile,
  tryParseArray,
  withToggle
};
