// code.client — reply-tips Client 半边（动态 Cordis 插件，纯 JS async 函数体）。
//
// 职责：每会话一个 controller（读/乐观写 Host 开关、拉建议、多组件订阅）；两个槽组件：
//   ReplyTipsToggle → conversation.input.right（发送按钮旁，order 10）
//   ReplyTipsRow    → conversation.input.dock （聊天框上方，order 30）
// 点建议 → inputActions.setDraft('')/setDraft(tip)/submit()（与手打+回车同路径）。
// React 与 host（host.call）由求值器以参数注入，本文件无 import。
// 注意：async 函数体按顺序执行——controller 初始化与组件/工具函数必须在 return 之前。

var controllers = new Map()
var TIMER = null // 由 apply 闭包插件 ctx 注入（动态半边无浏览器 timer 全局）

function apiFor(sessionId) {
  var api = controllers.get(sessionId)
  if (api) return api
  api = {
    state: { enabled: false, ready: false, saving: false, tips: [], reason: undefined, err: undefined, loading: false, fetching: false },
    listeners: new Set(),
  }
  api.snapshot = function () { return api.state }
  api.notify = function () {
    var fns = Array.from(api.listeners)
    for (var i = 0; i < fns.length; i++) {
      try { fns[i]() } catch (e) { /* noop */ }
    }
  }
  api.ensure = function () {
    if (api.state.ready) return Promise.resolve()
    return host.call('reply-tips.get', { sessionId: sessionId }).then(function (res) {
      api.state = Object.assign({}, api.state, {
        enabled: !!(res && res.enabled === true),
        ready: true,
        err: undefined,
      })
      api.notify()
    }).catch(function (e) {
      api.state = Object.assign({}, api.state, { ready: true, err: String((e && e.message) || e) })
      api.notify()
    })
  }
  api.setEnabled = function (enabled) {
    var prev = api.state.enabled
    api.state = Object.assign({}, api.state, { enabled: enabled, saving: true, err: undefined })
    api.notify()
    return host.call('reply-tips.set', { sessionId: sessionId, enabled: enabled }).then(function (res) {
      api.state = Object.assign({}, api.state, {
        enabled: !!(res && res.enabled === true),
        saving: false,
        ready: true,
      })
      api.notify()
    }).catch(function (e) {
      api.state = Object.assign({}, api.state, {
        enabled: prev,
        saving: false,
        err: String((e && e.message) || e),
      })
      api.notify()
    })
  }
  api.beginFetch = function () {
    // 回合结束边沿（refresh）：先清掉上一轮胶囊并显示“获取中”，再拉新一批
    api.state = Object.assign({}, api.state, { tips: [], reason: undefined, err: undefined, fetching: true, loading: false })
    api.notify()
    return api.fetchTips('refresh')
  }
  api.fetchTips = function (mode) {
    if (api.state.loading) return Promise.resolve()
    api.state = Object.assign({}, api.state, { loading: true })
    api.notify()
    return host.call('reply-tips.get-suggestions', { sessionId: sessionId, mode: mode === 'refresh' ? 'refresh' : 'poll' }).then(function (res) {
      if (res && res.state === 'generating') {
        // 边沿刷新但正文尚未定稿：保持“获取中”，等下一拍
        api.state = Object.assign({}, api.state, {
          tips: [],
          reason: undefined,
          err: undefined,
          loading: false,
          fetching: true,
        })
        api.notify()
        return
      }
      var tips = res && Array.isArray(res.suggestions) ? res.suggestions : []
      api.state = Object.assign({}, api.state, {
        tips: tips,
        reason: res ? res.reason : undefined,
        err: undefined,
        loading: false,
        fetching: false,
      })
      api.notify()
    }).catch(function (e) {
      api.state = Object.assign({}, api.state, {
        loading: false,
        fetching: false,
        err: 'call-failed: ' + String((e && e.message) || e),
      })
      api.notify()
    })
  }
  api.subscribe = function (fn) {
    api.listeners.add(fn)
    return function () { api.listeners.delete(fn) }
  }
  controllers.set(sessionId, api)
  return api
}

function useStore(api) {
  var pair = React.useState(api.snapshot())
  var state = pair[0]
  var setState = pair[1]
  React.useEffect(function () {
    var alive = true
    var unsub = api.subscribe(function () {
      if (alive) setState(api.snapshot())
    })
    return function () { alive = false; unsub() }
  }, [api])
  return state
}

function sessionIdOf(props) {
  if (props && typeof props.sessionId === 'string' && props.sessionId !== '') return props.sessionId
  if (props && props.session && props.session.header && typeof props.session.header.id === 'string') {
    return props.session.header.id
  }
  return ''
}

function busyOf(props) {
  var input = props && props.input
  if (!input) return false
  return input.phase === 'adjudicating' || input.phase === 'submitting'
}

function sendTip(inputActions, text) {
  if (!inputActions || !text) return
  inputActions.setDraft('')
  inputActions.setDraft(text)
  inputActions.submit()
}

// ---- 开关按钮：conversation.input.right ----

function ReplyTipsToggle(props) {
  var sessionId = sessionIdOf(props)
  var api = React.useMemo(function () { return apiFor(sessionId) }, [sessionId])
  var state = useStore(api)
  React.useEffect(function () {
    if (sessionId) api.ensure()
  }, [api, sessionId])
  if (!sessionId) return null
  return React.createElement('button', {
    type: 'button',
    'aria-pressed': state.enabled === true,
    title: state.enabled ? '关闭推荐提示' : '开启推荐提示',
    onClick: function () { api.setEnabled(!(state.enabled === true)) },
    style: {
      marginLeft: '4px',
      fontSize: '12px',
      padding: '2px 6px',
      cursor: 'pointer',
      borderRadius: '6px',
      border: state.enabled === true ? '1px solid currentColor' : '1px solid transparent',
      opacity: state.saving ? 0.6 : 1,
    },
  }, '\uD83D\uDCA1 \u63A8\u8350')
}

// ---- 建议行：conversation.input.dock ----

function ReplyTipsRow(props) {
  var sessionId = sessionIdOf(props)
  var api = React.useMemo(function () { return apiFor(sessionId) }, [sessionId])
  var state = useStore(api)
  React.useEffect(function () {
    if (sessionId) api.ensure()
  }, [api, sessionId])
  React.useEffect(function () {
    if (!sessionId || state.enabled !== true) return undefined
    api.fetchTips()
    if (TIMER && typeof TIMER.interval === 'function') {
      var stop = TIMER.interval(function () { api.fetchTips() }, 800)
      return function () {
        try { if (typeof stop === 'function') stop() } catch (e) { /* noop */ }
      }
    }
    return undefined
  }, [api, sessionId, state.enabled])

  var sessionRunning = typeof props.useSession === 'function'
    ? props.useSession(function (s) { return !!(s && s.running) })
    : undefined
  var prevRunning = React.useRef(undefined)
  React.useEffect(function () {
    var was = prevRunning.current
    prevRunning.current = sessionRunning
    // 回合结束边沿（running true→false）：清空旧胶囊→显示“获取中”→拉新一批
    if (was === true && sessionRunning === false) api.beginFetch()
  }, [api, sessionRunning])

  if (!sessionId || state.enabled !== true) return null
  var inputActions = props.inputActions
  var busy = busyOf(props)
  var children = []
  if (state.fetching || (state.loading && state.tips.length === 0)) {
    children.push(React.createElement('span', {
      key: 'loading',
      style: { fontSize: '12px', color: 'var(--dsw-text-muted, #888)' },
    }, '\u63A8\u8350\u95EE\u9898\u83B7\u53D6\u4E2D\u2026'))
  }
  for (var i = 0; i < state.tips.length; i++) {
    ;(function (tip) {
      children.push(React.createElement('button', {
        key: 'tip' + i,
        type: 'button',
        disabled: busy,
        title: '发送：' + tip,
        onClick: function () { if (!busy) sendTip(inputActions, tip) },
        style: {
          fontSize: '12px',
          padding: '2px 10px',
          cursor: busy ? 'default' : 'pointer',
          borderRadius: '999px',
          border: '1px solid rgba(127,127,127,.4)',
          background: 'transparent',
          maxWidth: '48ch',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      }, '\uD83D\uDCA1 ' + tip))
    })(state.tips[i])
  }
  if (state.reason && state.tips.length > 0) {
    children.push(React.createElement('span', {
      key: 'note',
      style: { fontSize: '11px', color: 'var(--dsw-text-muted, #999)', alignSelf: 'center' },
    }, '\u751F\u6210\u5931\u8D25(' + state.reason + ') \u5DF2\u7528\u89C4\u5219\u515C\u5E95'))
  }
  if (!state.fetching && !state.loading && state.tips.length === 0) {
    var info = state.reason
      ? '\u6682\u65E0\u5EFA\u8BAE(' + state.reason + ')'
      : (state.err ? '\u8C03\u7528\u5931\u8D25\uFF1A' + state.err : '\u6682\u65E0\u5EFA\u8BAE')
    children.push(React.createElement('span', {
      key: 'status',
      style: { fontSize: '11px', color: 'var(--dsw-text-muted, #999)', alignSelf: 'center' },
    }, info))
  }
  return React.createElement('div', {
    style: {
      width: '100%',
      maxWidth: 'var(--dsh-composer-card-max-width, 760px)',
      margin: '0 auto',
      padding: '0 4px 4px',
      boxSizing: 'border-box',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
    },
  }, children)
}

// ---- 插件本体：注册两个槽（return 放最后） ----

return {
  inject: ['slots', 'timer'],
  apply(ctx) {
    try {
      TIMER = ctx.timer || (ctx.get ? ctx.get('timer') : undefined)
    } catch (e) { TIMER = undefined }
    var slots = ctx.get('slots')
    if (slots === undefined) return
    slots.inject('conversation.input.right', function () {
      return slots.register({
        name: 'conversation.input.right',
        id: 'reply-tips-toggle',
        order: 10,
        label: function () { return 'Reply tips toggle' },
      }, ReplyTipsToggle)
    })
    slots.inject('conversation.input.dock', function () {
      return slots.register({
        name: 'conversation.input.dock',
        id: 'reply-tips-row',
        order: 30,
        label: function () { return 'Reply tips row' },
      }, ReplyTipsRow)
    })
  },
}
