/**
 * 海底捞小程序 自动签到脚本
 * 支持环境：QuantumultX / Loon / Surge / Egern / 青龙面板(Node.js)
 *
 * ============================== 功能 ==============================
 * 1. QX / Loon / Surge / Egern：MitM 拦截海底捞签到小程序的请求，
 *    自动提取 _HAIDILAO_APP_TOKEN + Cookie，写入 BoxJS 持久化存储
 *    （BoxJS 内 "hdl_cookie" 这个 key，可在 BoxJS 面板里直接查看/编辑/
 *    删除账号数据），并弹窗提示"Cookie获取成功"。
 * 2. 同一份脚本，定时任务运行时会自动切到"签到模式"：读取 BoxJS 里
 *    保存的所有账号，逐一签到，并把结果整理成一条通知弹窗推送。
 * 3. 青龙(Node.js) 环境下：账号信息通过环境变量传入，签到后调用同目录下
 *    的 sendNotify.js 使用 Telegram 机器人推送图文通知。
 *
 * ============================== 使用方法 ==============================
 *
 * 【第一步：抓取 Cookie（QX / Loon / Surge / Egern 任选其一）】
 * 打开海底捞小程序 -> 进入"签到"页面（每日签到入口），
 * 触发下面规则拦截一次即可写入 BoxJS，此后无需重复操作，
 * Cookie 过期后重新打开一次签到页面刷新即可。
 *
   --- QuantumultX (rewrite_local) ---
   ^https:\/\/superapp-public\.kiwa-tech\.com\/activity\/wxapp\/signin\/(query|signin) url script-request-header https://raw.githubusercontent.com/xxx/haidilao_sign.js
   [mitm]
   hostname = superapp-public.kiwa-tech.com

   --- Loon (插件 [Script]) ---
   http-request ^https:\/\/superapp-public\.kiwa-tech\.com\/activity\/wxapp\/signin\/(query|signin) script-path=haidilao_sign.js, requires-body=false, timeout=15, tag=海底捞抓取Cookie
   [MITM]
   hostname = superapp-public.kiwa-tech.com

   --- Surge (模块 [Script]) ---
   http-request ^https?:\/\/superapp-public\.kiwa-tech\.com\/activity\/wxapp\/signin\/(query|signin) script-path=haidilao_sign.js, requires-body=false, timeout=15
   [MITM]
   hostname = %APPEND% superapp-public.kiwa-tech.com

   --- Egern (模块 [Script]，写法与 Surge 基本一致) ---
   http-request ^https?:\/\/superapp-public\.kiwa-tech\.com\/activity\/wxapp\/signin\/(query|signin) script-path=haidilao_sign.js, requires-body=false
   [MITM]
   hostname = superapp-public.kiwa-tech.com

 * 【第二步：配置签到定时任务】
 * QX / Loon / Surge / Egern：单独建一条 cron 任务/定时脚本，脚本路径同上，
 * 不挂在 MitM 规则里、直接由定时器触发即可（脚本会自动识别出不在 $request
 * 环境下运行，从而进入"批量签到"模式）。建议 08:30 左右执行。
 *
 * 青龙面板：
 *   1. 把本文件放到 /ql/data/scripts/haidilao_sign.js
 *   2. 保证同目录下已有 sendNotify.js（青龙自带）
 *   3. 环境变量 HDL_COOKIE，多账号用 & 或换行分隔，单账号格式：
 *        token@cookie@备注
 *      其中 cookie、备注可省略（用空字符串占位），例如：
 *        TOKEN_APP_xxxx@tfstk=xxx;acw_tc=xxx@13500000000
 *        TOKEN_APP_yyyy@@13300000000
 *   4. 定时规则建议：30 8 * * *
 *      新建任务：task haidilao_sign.js
 *
 * ============================== BoxJS 数据管理 ==============================
 * 存储 key：hdl_cookie （JSON 数组，字段：token / cookie / ua / remark / updateTime）
 * 在 BoxJS -> 数据 -> 搜索 "hdl_cookie" 即可直接查看 / 修改 / 删除账号，
 * 无需额外安装 tile 订阅。
 */

// ==================== 常量 ====================
const BOX_KEY = 'hdl_cookie'
const HOST = 'superapp-public.kiwa-tech.com'
const CAPTURE_PATH_REG = /\/activity\/wxapp\/signin\/(query|signin)/
const DEFAULT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.69(0x18004539) NetType/4G Language/zh_CN miniProgram/wx1ddeb67115f30d1a'

// ==================== 平台探测 ====================
const isQuanX = typeof $task !== 'undefined'
const isLoon = typeof $loon !== 'undefined'
const isSurge =
  typeof $httpClient !== 'undefined' &&
  typeof $loon === 'undefined' &&
  typeof $environment !== 'undefined' &&
  !!($environment['surge-version'] || $environment['stash-version'])
const isEgern =
  typeof $httpClient !== 'undefined' &&
  typeof $environment !== 'undefined' &&
  !!$environment['egern-version']
const isNode = typeof require === 'function' && !isQuanX && !isLoon && !isSurge && !isEgern
const isRequestScope = typeof $request !== 'undefined'

var _axios = null

const DEBUG_LOG = false
function logDebug() {
  if (!DEBUG_LOG) return
  const args = Array.prototype.slice.call(arguments)
  console.log('[haidilao_sign][DEBUG]', ...args)
}

function logInfo() {
  const args = Array.prototype.slice.call(arguments)
  console.log('[haidilao_sign]', ...args)
}

// ==================== 入口 ====================
;(async () => {
  const startTime = Date.now()
  logInfo('脚本启动，时间：', new Date().toLocaleString('zh-CN', { hour12: false }))
  logDebug('平台探测结果：', { isQuanX, isLoon, isSurge, isEgern, isNode, isRequestScope })
  try {
    if (isNode) {
      logDebug('进入青龙/Node 模式 nodeMain()')
      await nodeMain()
    } else if (isRequestScope && CAPTURE_PATH_REG.test(($request && $request.url) || '')) {
      logDebug('进入 Cookie 抓取模式 captureMain()，命中 URL：', $request && $request.url)
      await captureMain()
    } else {
      logDebug('进入代理端定时签到模式 proxyCronMain()')
      await proxyCronMain()
    }
    logInfo(`脚本执行完毕，耗时 ${((Date.now() - startTime) / 1000).toFixed(1)} 秒`)
  } catch (e) {
    console.log('[haidilao_sign] 顶层异常：' + (e && e.message ? e.message : e))
    if (e && e.stack) console.log('[haidilao_sign] 堆栈：\n' + e.stack)
    safeDone({})
  }
})()

// ==================== 抓取 Cookie 模式 ====================
async function captureMain() {
  const headers = $request.headers || {}
  const token = pickHeader(headers, '_HAIDILAO_APP_TOKEN')
  const cookie = pickHeader(headers, 'Cookie')
  const ua = pickHeader(headers, 'User-Agent') || DEFAULT_UA

  if (!token) {
    logInfo('未捕获到 _HAIDILAO_APP_TOKEN，跳过')
    safeDone({})
    return
  }

  const list = readAccounts()
  let account = list.find(a => a.token === token)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })

  if (account) {
    account.cookie = cookie || account.cookie
    account.ua = ua || account.ua
    account.updateTime = now
    logInfo(`已更新账号 Cookie：${maskAccount(account)}`)
  } else {
    account = { token, cookie: cookie || '', ua, remark: '', updateTime: now }
    list.push(account)
    logInfo(`已捕获新账号：${maskAccount(account)}`)
  }
  writeAccounts(list)
  logInfo(`当前共 ${list.length} 个账号已存入 BoxJS(${BOX_KEY})`)

  notify(
    '🔔 海底捞小程序签到',
    'Cookie获取成功',
    `账号：${maskAccount(account)}\n已写入 BoxJS(${BOX_KEY})，共 ${list.length} 个账号`
  )

  safeDone({})
}

// ==================== 定时批量签到模式 ====================
async function proxyCronMain() {
  const list = readAccounts()
  if (!list.length) {
    logInfo('未找到任何账号，跳过')
    notify('🔔 海底捞小程序签到', '未找到账号', '请先打开海底捞小程序签到页面，触发一次 Cookie 抓取')
    safeDone({})
    return
  }
  logInfo(`共 ${list.length} 个账号，开始逐一签到`)

  const blocks = []
  for (let i = 0; i < list.length; i++) {
    const account = list[i]
    logInfo(`[账号${i + 1}/${list.length}] 开始处理：${maskAccount(account)}`)
    const block = await signInOneAccount(account, i + 1, httpRequestProxy)
    blocks.push(block)
    const statusLine = block.split('\n')[1] || ''
    logInfo(`[账号${i + 1}/${list.length}] 处理结果：${statusLine}`)
    if (i < list.length - 1) await sleep(1500)
  }

  const body = blocks.join('\n---------------------------\n')
  notify('🔔 海底捞小程序签到', '', body)
  logInfo('弹窗通知已发送')
  safeDone({})
}

// ==================== 青龙 Node.js 模式 ====================
async function nodeMain() {
  logDebug('nodeMain 开始，process.version =', process.version)
  let sendNotify
  try {
    sendNotify = require('./sendNotify.js')
    logDebug('sendNotify.js 加载成功')
  } catch (e) {
    logInfo('未找到 sendNotify.js，通知将仅打印到日志：' + e.message)
  }

  const raw = process.env.HDL_COOKIE || ''
  logDebug('HDL_COOKIE 原始长度：', raw.length)
  const list = parseNodeAccounts(raw)
  logInfo(`共 ${list.length} 个账号`)
  if (!list.length) {
    const msg = '未检测到环境变量 HDL_COOKIE，请按 token@cookie@备注 的格式配置'
    logInfo(msg)
    if (sendNotify) await sendNotify.sendNotify('🔔 海底捞小程序签到', msg)
    return
  }

  const blocks = []
  for (let i = 0; i < list.length; i++) {
    const account = list[i]
    logInfo(`[账号${i + 1}/${list.length}] 开始处理：${maskAccount(account)}`)
    const block = await signInOneAccount(account, i + 1, httpRequestNode)
    blocks.push(block)
    const statusLine = block.split('\n')[1] || ''
    logInfo(`[账号${i + 1}/${list.length}] 处理结果：${statusLine}`)
    if (i < list.length - 1) await sleep(1500)
  }

  const title = '🔔 海底捞小程序签到'
  const content = blocks.join('\n---------------------------\n')
  if (sendNotify) {
    await sendNotify.sendNotify(title, content)
    logInfo('Telegram 通知已发送')
  } else {
    console.log(title + '\n' + content)
  }
}

function parseNodeAccounts(raw) {
  return raw
    .split(/[\n&]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const [token, cookie, remark] = s.split('@')
      return { token: (token || '').trim(), cookie: (cookie || '').trim(), remark: (remark || '').trim(), ua: DEFAULT_UA }
    })
    .filter(a => a.token)
}

// ==================== 核心签到逻辑（跨平台通用） ====================
// httpFn(method, path, body, account) => Promise<Object>  解析后的 JSON
async function signInOneAccount(account, index, httpFn) {
  const label = maskAccount(account)
  try {
    logDebug(`[账号${index}] 步骤1：查询签到状态 signin/query`)
    let queryData = await callApi(httpFn, account, 'POST', '/activity/wxapp/signin/query', {})
    let today = pickTodayEntry(queryData)
    logDebug(`[账号${index}] 今日记录：`, today)
    logDebug(`[账号${index}] 完整签到列表(用于核对连续天数)：`, JSON.stringify(queryData.signinQueryDetailList))

    if (!today) {
      return `账号${index}：【${label}】\n❌签到失败：未获取到今日签到信息（Cookie 可能已过期，请重新抓取）`
    }

    let alreadySigned = today.dailySigninStatus === 2
    let todayReward = 0

    if (!alreadySigned) {
      logDebug(`[账号${index}] 步骤2：执行签到 signin/signin`)
      await callApi(httpFn, account, 'POST', '/activity/wxapp/signin/signin', { signinSource: 'MiniApp' })
      // 重新查询以获取签到后的最新状态
      logDebug(`[账号${index}] 步骤3：签到后重新查询状态`)
      queryData = await callApi(httpFn, account, 'POST', '/activity/wxapp/signin/query', {})
      today = pickTodayEntry(queryData) || today

      logDebug(`[账号${index}] 步骤4：查询今日碎片明细`)
      const detail = await callApi(httpFn, account, 'POST', '/activity/wxapp/signin/queryFragmentDetail', {
        pageSize: 5,
        currPage: 1
      })
      todayReward = sumTodayFragment(detail)
      if (!todayReward) todayReward = (today.fragment || 0) + (today.fragmentSeries || 0)
    }

    logDebug(`[账号${index}] 步骤5：查询碎片总数 queryFragment`)
    const fragmentData = await callApi(httpFn, account, 'POST', '/activity/wxapp/signin/queryFragment', {})
    const total = (fragmentData && fragmentData.total) || 0

    logDebug(`[账号${index}] 步骤6：查询签到期数 queryFragmentAccumulate`)
    let periodNo = ''
    try {
      const accumData = await callApi(httpFn, account, 'POST', '/activity/wxapp/signin/queryFragmentAccumulate', {})
      periodNo = accumData && accumData.periodNo
    } catch (e) {
      logDebug(`[账号${index}] 查询期数失败，忽略：`, e.message)
    }
    const expireLine = buildExpireLine(total, fragmentData && fragmentData.expireDate, periodNo)

    const cycleDay = clampCycleDay(today.daysSeries)
    const bar = progressBar(cycleDay, 7)
    const realStreak = computeRealStreak(queryData.signinQueryDetailList, today)
    logDebug(`[账号${index}] 真实连续签到天数计算结果：`, realStreak, '（周期第几天 cycleDay=', cycleDay, '）')

    const lines = []
    lines.push(`账号${index}：【${label}】`)
    if (alreadySigned) {
      lines.push('✅今日已签到')
    } else {
      lines.push('✅签到成功')
      lines.push(`碎片：+${todayReward}`)
    }
    lines.push(`总碎片：${total}`)
    lines.push(`连续签到：${realStreak}天`)

    const dayFinal = queryData.signinQueryDetailList.find(d => d.daysSeries === 7)
    if (dayFinal && dayFinal.dishesCount > 0 && dayFinal.dishes) {
      lines.push(`🎁本期惊喜菜品：${dayFinal.dishes}`)
    }

    lines.push('')
    lines.push('周期签到')
    lines.push(`${bar} ${cycleDay}/7天`)
    if (expireLine) {
      lines.push('')
      lines.push(expireLine)
      lines.push('')
    }

    return lines.join('\n')
  } catch (e) {
    console.log(`[haidilao_sign][账号${index}] 异常：` + (e && e.message ? e.message : e))
    if (e && e.stack) console.log(`[haidilao_sign][账号${index}] 堆栈：\n` + e.stack)
    return `账号${index}：【${label}】\n❌签到失败：${e && e.message ? e.message : e}`
  }
}

async function callApi(httpFn, account, method, path, body) {
  logDebug('callApi ->', method, path, 'body=', JSON.stringify(body))
  const resp = await httpFn(method, path, body, account)
  let json = resp
  if (typeof resp === 'string') {
    try {
      json = JSON.parse(resp)
    } catch (e) {
      throw new Error('接口返回非 JSON：' + path + '，原始内容：' + String(resp).slice(0, 200))
    }
  }
  if (!json || json.success !== true) {
    throw new Error((json && (json.msg || json.code)) || ('请求失败：' + path))
  }
  return json.data
}

function pickTodayEntry(queryData) {
  if (!queryData) return null
  const list = queryData.signinQueryDetailList || []
  return list.find(d => d.currentOr === 1) || list[0] || null
}

function sumTodayFragment(detailList) {
  if (!Array.isArray(detailList) || !detailList.length) return 0
  const todayStr = formatDate(new Date())
  return detailList
    .filter(d => (d.createTime || '').indexOf(todayStr) === 0)
    .reduce((sum, d) => sum + (d.fragmentCount || 0), 0)
}

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function clampCycleDay(daysSeries) {
  let n = Number(daysSeries) || 1
  if (n < 1) n = 1
  if (n > 7) n = ((n - 1) % 7) + 1
  return n
}

function computeRealStreak(list, todayEntry) {
  if (!Array.isArray(list) || !list.length || !todayEntry) return 1
  const idx = list.findIndex(d => d.currentOr === 1)
  if (idx === -1) return 1
  let streak = 0
  for (let i = idx; i >= 0; i--) {
    const status = list[i].dailySigninStatus
    if (status === 2) {
      streak++
    } else {
      break
    }
  }
  return streak || 1
}

function progressBar(current, total) {
  const filled = '▰'.repeat(Math.max(0, Math.min(current, total)))
  const empty = '▱'.repeat(Math.max(0, total - current))
  return filled + empty
}

function buildExpireLine(total, expireDateStr, periodNo) {
  if (!total || !expireDateStr) return ''
  const dateOnly = expireDateStr.slice(0, 10) // "2026-07-26"
  const m = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''

  const bjTodayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
  const t = bjTodayStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const nowDateOnlyMs = Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]))
  const expireDateOnlyMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const diffDays = Math.round((expireDateOnlyMs - nowDateOnlyMs) / 86400000)
  const periodLabel = periodNo ? `第${periodNo}期签到` : '本期签到'

  if (diffDays <= 0) {
    return `⚠️ ${periodLabel}碎片已于${dateOnly}过期，请留意后续活动`
  }
  return `⚠️ ${periodLabel}碎片将于${dateOnly} (${diffDays}天后)过期，请及时兑换！`
}

// ==================== 账号脱敏显示 ====================
function maskAccount(account) {
  const remark = (account.remark || '').trim()
  const phoneReg = /^1\d{10}$/
  if (phoneReg.test(remark)) {
    return remark.slice(0, 3) + '****' + remark.slice(7)
  }
  if (remark) return remark
  const token = account.token || ''
  if (token.length <= 10) return token
  return token.slice(0, 6) + '...' + token.slice(-4)
}

// ==================== HTTP 请求 ====================
function buildHeaders(account) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    ReqType: 'APPH5',
    Origin: `https://${HOST}`,
    Referer: `https://${HOST}/app-sign-in/?SignInToken=${account.token}&source=MiniApp`,
    'User-Agent': account.ua || DEFAULT_UA,
    _HAIDILAO_APP_TOKEN: account.token,
    Cookie: account.cookie || ''
  }
}

function httpRequestProxy(method, path, body, account) {
  const url = `https://${HOST}${path}`
  const options = {
    url,
    headers: buildHeaders(account),
    body: body ? JSON.stringify(body) : undefined
  }

  return new Promise((resolve, reject) => {
    const cb = (err, resp, data) => {
      if (err) {
        reject(new Error(typeof err === 'string' ? err : JSON.stringify(err)))
        return
      }
      resolve(data)
    }
    try {
      if (isQuanX) {
        // QuantumultX 使用 $task.fetch
        const qxOpts = { url, headers: options.headers, body: options.body, method }
        $task.fetch(qxOpts).then(
          resp => resolve(resp.body),
          err => reject(new Error(typeof err === 'string' ? err : JSON.stringify(err)))
        )
      } else if (method === 'GET') {
        $httpClient.get(options, cb)
      } else {
        $httpClient.post(options, cb)
      }
    } catch (e) {
      reject(e)
    }
  })
}

// ==================== HTTP 请求：青龙 Node.js（axios）====================
function httpRequestNode(method, path, body, account) {
  logDebug('httpRequestNode 调用：', method, path, '当前 _axios 是否已加载：', !!_axios)
  if (!_axios) {
    try {
      _axios = require('axios')
      logDebug('axios require 成功')
    } catch (e) {
      throw new Error('缺少 axios 依赖，请在青龙依赖管理中安装 axios：' + e.message)
    }
  }
  const url = `https://${HOST}${path}`
  return _axios({
    url,
    method,
    headers: buildHeaders(account),
    data: body || {},
    timeout: 15000
  })
    .then(r => {
      logDebug(`响应 ${path}：`, r.status, JSON.stringify(r.data).slice(0, 200))
      return r.data
    })
    .catch(e => {
      const detail = e.response ? `HTTP ${e.response.status}：${JSON.stringify(e.response.data).slice(0, 200)}` : e.message
      console.log(`[haidilao_sign] 请求失败 ${path}：${detail}`)
      throw new Error(`请求 ${path} 失败：${detail}`)
    })
}

// ==================== BoxJS 持久化存储 ====================
function readAccounts() {
  try {
    const raw = readStore(BOX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

function writeAccounts(list) {
  writeStore(JSON.stringify(list), BOX_KEY)
}

function readStore(key) {
  if (typeof $persistentStore !== 'undefined') return $persistentStore.read(key)
  if (typeof $prefs !== 'undefined') return $prefs.valueForKey(key)
  return null
}

function writeStore(value, key) {
  if (typeof $persistentStore !== 'undefined') return $persistentStore.write(value, key)
  if (typeof $prefs !== 'undefined') return $prefs.setValueForKey(value, key)
  return false
}

// ==================== 弹窗通知 ====================
function notify(title, subtitle, content) {
  try {
    if (typeof $notify !== 'undefined') {
      // QuantumultX
      $notify(title, subtitle || '', content || '')
    } else if (typeof $notification !== 'undefined') {
      // Loon / Surge / Egern
      $notification.post(title, subtitle || '', content || '')
    } else {
      console.log(`${title}\n${subtitle}\n${content}`)
    }
  } catch (e) {
    console.log('[haidilao_sign] 通知发送失败：' + e)
  }
}

// ==================== 其它工具函数 ====================
function pickHeader(headers, name) {
  if (!headers) return ''
  const lower = name.toLowerCase()
  const key = Object.keys(headers).find(k => k.toLowerCase() === lower)
  return key ? headers[key] : ''
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function safeDone(obj) {
  try {
    if (typeof $done !== 'undefined') $done(obj || {})
  } catch (e) {
    console.log('[haidilao_sign] $done 调用异常：' + e)
  }
}
