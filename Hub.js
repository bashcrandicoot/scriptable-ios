// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: th-large;

/*
  HUB
  Medium widget (4x2) for Scriptable, in the same style as Agent Hub,
  Forecast, Radar and Reminders.

  Green online dot + "Hub" title, then four tiles you can tap:
    Forecast   current temperature and conditions  -> Weather
    Next up    next event with a live countdown    -> Calendar
    Reminders  open count and the top reminder     -> Reminders
    Agents     Grok Bot, Muse, ChatGPT, Gemini, Claude icons -> each app

  The agent icons reuse the ones AI Launcher downloaded. Run AI Launcher
  once in Scriptable if they show as symbols. The first run of this
  script asks for Calendar, Reminders and Location access.
*/

// ---------------- CONFIG ----------------
const CONFIG = {
  bgTopHex: "#1B1A20",
  bgBottomHex: "#0A0A0D",
  tileHex: "#24232A",
  tileRadius: 13,
  textHex: "#F2F0F6",
  dotHex: "#30D158",
  accent: { forecast: "#40C8E0", event: "#FF9F0A", reminders: "#8B7CFF", agents: "#30D158" },
  overdueHex: "#FF6B6B",
  units: "fahrenheit",        // "fahrenheit" or "celsius"
  lookAheadHours: 36,
  refreshMinutes: 15,
  fallbackLocation: { latitude: 40.7128, longitude: -74.006 },
}

const AGENTS = [
  { name: "Grok Bot", url: "grokbot://",      id: 6794501026, fallback: "bolt.fill" },
  { name: "Muse",     url: "hatch://",        id: 6760173601, fallback: "wand.and.stars" },
  { name: "ChatGPT",  url: "chatgpt://",      id: 6448311069, fallback: "bubble.left.fill" },
  { name: "Gemini",   url: "googlegemini://", id: 6477489729, fallback: "sparkles" },
  { name: "Claude",   url: "claude://",       id: 6473753684, fallback: "asterisk" },
]
// ----------------------------------------

const TEXT = new Color(CONFIG.textHex)
const dim = (a) => new Color(CONFIG.textHex, a)
const DEG = String.fromCharCode(176)
const MID = String.fromCharCode(183)

const fm = FileManager.local()
const DIR = fm.joinPath(fm.documentsDirectory(), "hub")
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true)
const LOC_CACHE = fm.joinPath(DIR, "location.json")
const WX_CACHE = fm.joinPath(DIR, "weather.json")
const ICON_DIR = fm.joinPath(fm.documentsDirectory(), "AI-Launcher-Icons")

const SIZE = mediumWidgetSize()

// ---------------- ENTRY POINT ----------------
const widget = await buildWidget()
if (config.runsInApp) await widget.presentMedium()
else Script.setWidget(widget)
Script.complete()

// ---------------- WIDGET ----------------
async function buildWidget() {
  const now = new Date()
  const [weather, event, reminders] = await Promise.all([getWeather(), getNextEvent(now), getReminders()])

  const w = new ListWidget()
  w.setPadding(12, 14, 12, 14)
  w.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000)
  const bg = new LinearGradient()
  bg.colors = [new Color(CONFIG.bgTopHex), new Color(CONFIG.bgBottomHex)]
  bg.locations = [0, 1]
  bg.startPoint = new Point(0, 0)
  bg.endPoint = new Point(1, 1)
  w.backgroundGradient = bg

  // Header
  const header = w.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()
  header.setPadding(0, 4, 0, 4)
  addOnlineDot(header)
  header.addSpacer(7)
  addText(header, "Hub", Font.semiboldSystemFont(13), TEXT)
  header.addSpacer()
  const df = new DateFormatter()
  df.dateFormat = "EEE d MMM"
  addText(header, df.string(now).toUpperCase(), Font.semiboldSystemFont(10), dim(0.5))

  w.addSpacer(8)

  // 2 x 2 tiles
  const gap = 6
  const tileW = Math.floor((SIZE.w - 28 - gap) / 2)
  const tileH = Math.floor((SIZE.h - 24 - 14 - 8 - gap) / 2)

  const row1 = w.addStack()
  row1.layoutHorizontally()
  forecastTile(newTile(row1, tileW, tileH, "weather://"), weather)
  row1.addSpacer(gap)
  eventTile(newTile(row1, tileW, tileH, "calshow://"), event, now)

  w.addSpacer(gap)

  const row2 = w.addStack()
  row2.layoutHorizontally()
  remindersTile(newTile(row2, tileW, tileH, "x-apple-reminderkit://"), reminders)
  row2.addSpacer(gap)
  agentsTile(newTile(row2, tileW, tileH, null), tileW)

  return w
}

function newTile(row, w, h, url) {
  const t = row.addStack()
  t.layoutVertically()
  t.size = new Size(w, h)
  t.cornerRadius = CONFIG.tileRadius
  t.backgroundColor = new Color(CONFIG.tileHex)
  t.setPadding(7, 10, 7, 10)
  if (url) t.url = url
  return t
}

function tileLabel(tile, symbol, label, hex) {
  const row = tile.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  const sym = SFSymbol.named(symbol) || SFSymbol.named("circle.fill")
  sym.applyFont(Font.semiboldSystemFont(9))
  const img = row.addImage(sym.image)
  img.imageSize = new Size(10, 10)
  img.tintColor = new Color(hex)
  row.addSpacer(4)
  addText(row, label, Font.semiboldSystemFont(8.5), dim(0.5))
  row.addSpacer()
  return row
}

function forecastTile(tile, wx) {
  tileLabel(tile, wx ? wx.symbol : "cloud.fill", "FORECAST", CONFIG.accent.forecast)
  tile.addSpacer()
  const main = tile.addStack()
  main.layoutHorizontally()
  main.bottomAlignContent()
  addText(main, wx ? wx.temp : "--" + DEG, Font.semiboldRoundedSystemFont(16), TEXT)
  main.addSpacer(5)
  addText(main, wx ? wx.condition : "Unavailable", Font.mediumSystemFont(10), dim(0.7))
  main.addSpacer()
  tile.addSpacer(1)
  addText(tile, wx ? wx.hiLo : " ", Font.mediumSystemFont(9), dim(0.45))
}

function eventTile(tile, event, now) {
  const live = event && event.start <= now
  tileLabel(tile, "calendar", live ? "NOW" : "NEXT UP", event ? event.hex : CONFIG.accent.event)
  tile.addSpacer()
  if (!event) {
    addText(tile, "Nothing scheduled", Font.semiboldSystemFont(12), TEXT)
    tile.addSpacer(1)
    addText(tile, "Free time", Font.mediumSystemFont(9), dim(0.45))
    return
  }
  addText(tile, event.title, Font.semiboldSystemFont(12), TEXT)
  tile.addSpacer(1)

  const target = live ? event.end : event.start
  const sub = tile.addStack()
  sub.layoutHorizontally()
  sub.centerAlignContent()
  if (target - now < 12 * 3600000) {
    // Live countdown that ticks on the home screen
    addText(sub, live ? "ends in " : "in ", Font.mediumSystemFont(9), new Color(CONFIG.dotHex))
    const t = sub.addDate(target)
    t.applyTimerStyle()
    t.font = Font.semiboldRoundedSystemFont(9)
    t.textColor = new Color(CONFIG.dotHex)
    t.lineLimit = 1
  } else {
    addText(sub, event.when, Font.mediumSystemFont(9), dim(0.45))
  }
  sub.addSpacer()
}

function remindersTile(tile, rem) {
  tileLabel(tile, "checklist", "REMINDERS", CONFIG.accent.reminders)
  tile.addSpacer()
  if (rem.error) {
    addText(tile, "Allow access", Font.semiboldSystemFont(12), TEXT)
    tile.addSpacer(1)
    addText(tile, "Run Hub in Scriptable", Font.mediumSystemFont(9), dim(0.45))
    return
  }
  const main = tile.addStack()
  main.layoutHorizontally()
  main.bottomAlignContent()
  addText(main, String(rem.open), Font.semiboldRoundedSystemFont(16), TEXT)
  main.addSpacer(5)
  addText(main, "open", Font.mediumSystemFont(10), dim(0.7))
  if (rem.overdue) {
    main.addSpacer(5)
    addText(main, rem.overdue + " overdue", Font.mediumSystemFont(10), new Color(CONFIG.overdueHex))
  }
  main.addSpacer()
  tile.addSpacer(1)
  addText(tile, rem.top || "All done", Font.mediumSystemFont(9), dim(0.45))
}

function agentsTile(tile, tileW) {
  tileLabel(tile, "sparkles", "AGENTS", CONFIG.accent.agents)
  tile.addSpacer()
  const row = tile.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  const inner = tileW - 20
  const icon = Math.min(24, Math.floor((inner - 4 * 5) / 5))
  const gap = Math.floor((inner - icon * 5) / 4)
  AGENTS.forEach((a, i) => {
    const cell = row.addStack()
    cell.size = new Size(icon, icon)
    cell.cornerRadius = Math.round(icon * 0.24)
    cell.backgroundColor = new Color("#2E2D35")
    cell.centerAlignContent()
    cell.url = a.url
    const saved = savedIcon(a.id)
    if (saved) {
      const img = cell.addImage(saved)
      img.imageSize = new Size(icon, icon)
      img.cornerRadius = Math.round(icon * 0.24)
    } else {
      const sym = SFSymbol.named(a.fallback) || SFSymbol.named("app")
      const img = cell.addImage(sym.image)
      img.imageSize = new Size(icon * 0.5, icon * 0.5)
      img.tintColor = TEXT
    }
    if (i < AGENTS.length - 1) row.addSpacer(gap)
  })
  tile.addSpacer(2)
}

function addText(stack, text, font, color) {
  const t = stack.addText(text)
  t.font = font
  t.textColor = color
  t.lineLimit = 1
  t.minimumScaleFactor = 0.7
  return t
}

function addOnlineDot(stack) {
  const glow = stack.addStack()
  glow.size = new Size(12, 12)
  glow.cornerRadius = 6
  glow.backgroundColor = new Color(CONFIG.dotHex, 0.25)
  glow.layoutHorizontally()
  glow.centerAlignContent()
  glow.addSpacer()
  const dot = glow.addStack()
  dot.size = new Size(7, 7)
  dot.cornerRadius = 3.5
  dot.backgroundColor = new Color(CONFIG.dotHex)
  glow.addSpacer()
}

// ---------------- DATA ----------------
function mediumWidgetSize() {
  let sw = 390
  try { sw = Math.min(Device.screenSize().width, Device.screenSize().height) } catch (e) {}
  if (sw >= 428) return { w: 364, h: 170 }
  if (sw >= 414) return { w: 360, h: 169 }
  if (sw >= 390) return { w: 338, h: 158 }
  return { w: 329, h: 155 }
}

function savedIcon(id) {
  try {
    const p = fm.joinPath(ICON_DIR, id + ".img")
    return fm.fileExists(p) ? fm.readImage(p) : null
  } catch (e) {
    return null
  }
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

async function getReminders() {
  try {
    const all = (await Reminder.allIncomplete()).filter(r => !r.isCompleted)
    const now = new Date()
    const today = startOfDay(now)
    const isOverdue = (r) => r.dueDate && (r.dueDateIncludesTime ? r.dueDate < now : r.dueDate < today)
    all.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return (b.priority ? 10 - b.priority : 0) - (a.priority ? 10 - a.priority : 0)
    })
    return { open: all.length, overdue: all.filter(isOverdue).length, top: all.length ? all[0].title : null }
  } catch (e) {
    console.log("Reminders: " + e)
    return { open: 0, overdue: 0, top: null, error: true }
  }
}

async function getNextEvent(now) {
  try {
    const end = new Date(now.getTime() + CONFIG.lookAheadHours * 3600000)
    const events = await CalendarEvent.between(now, end, [])
    const e = events.filter(ev => !ev.isAllDay && ev.endDate > now).sort((a, b) => a.startDate - b.startDate)[0]
    if (!e) return null
    const tf = new DateFormatter()
    tf.dateFormat = "h:mm a"
    const tomorrow = startOfDay(e.startDate).getTime() > startOfDay(now).getTime()
    let hex = CONFIG.accent.event
    try { if (e.calendar && e.calendar.color) hex = e.calendar.color.hex } catch (err) {}
    return {
      title: e.title || "Untitled event",
      start: e.startDate,
      end: e.endDate,
      when: (tomorrow ? "Tomorrow " : "") + tf.string(e.startDate),
      hex,
    }
  } catch (e) {
    console.log("Calendar: " + e)
    return null
  }
}

async function getLocation() {
  try {
    Location.setAccuracyToThreeKilometers()
    const l = await Location.current()
    const loc = { latitude: l.latitude, longitude: l.longitude }
    fm.writeString(LOC_CACHE, JSON.stringify(loc))
    return loc
  } catch (e) {
    if (fm.fileExists(LOC_CACHE)) return JSON.parse(fm.readString(LOC_CACHE))
    return CONFIG.fallbackLocation
  }
}

async function getWeather() {
  const loc = await getLocation()
  const unit = CONFIG.units === "celsius" ? "celsius" : "fahrenheit"
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + loc.latitude.toFixed(3) + "&longitude=" + loc.longitude.toFixed(3) +
    "&current=temperature_2m,weather_code,is_day" +
    "&daily=temperature_2m_max,temperature_2m_min" +
    "&temperature_unit=" + unit + "&timezone=auto&forecast_days=1"
  let data
  try {
    const req = new Request(url)
    req.timeoutInterval = 10
    data = await req.loadJSON()
    if (!data.current) throw new Error("bad response")
    fm.writeString(WX_CACHE, JSON.stringify(data))
  } catch (e) {
    console.log("Weather: " + e)
    if (fm.fileExists(WX_CACHE)) data = JSON.parse(fm.readString(WX_CACHE))
  }
  if (!data || !data.current) return null
  const [label, daySym, nightSym] = wmo(data.current.weather_code)
  const r = (n) => Math.round(n)
  return {
    temp: r(data.current.temperature_2m) + DEG,
    condition: label,
    hiLo: "H " + r(data.daily.temperature_2m_max[0]) + DEG + "  L " + r(data.daily.temperature_2m_min[0]) + DEG,
    symbol: data.current.is_day === 1 ? daySym : nightSym,
  }
}

function wmo(code) {
  const map = {
    0: ["Clear", "sun.max.fill", "moon.stars.fill"],
    1: ["Mostly clear", "sun.max.fill", "moon.fill"],
    2: ["Partly cloudy", "cloud.sun.fill", "cloud.moon.fill"],
    3: ["Overcast", "cloud.fill", "cloud.fill"],
    45: ["Fog", "cloud.fog.fill", "cloud.fog.fill"],
    48: ["Fog", "cloud.fog.fill", "cloud.fog.fill"],
    51: ["Drizzle", "cloud.drizzle.fill", "cloud.drizzle.fill"],
    53: ["Drizzle", "cloud.drizzle.fill", "cloud.drizzle.fill"],
    55: ["Drizzle", "cloud.drizzle.fill", "cloud.drizzle.fill"],
    56: ["Freezing drizzle", "cloud.sleet.fill", "cloud.sleet.fill"],
    57: ["Freezing drizzle", "cloud.sleet.fill", "cloud.sleet.fill"],
    61: ["Light rain", "cloud.rain.fill", "cloud.rain.fill"],
    63: ["Rain", "cloud.rain.fill", "cloud.rain.fill"],
    65: ["Heavy rain", "cloud.heavyrain.fill", "cloud.heavyrain.fill"],
    66: ["Freezing rain", "cloud.sleet.fill", "cloud.sleet.fill"],
    67: ["Freezing rain", "cloud.sleet.fill", "cloud.sleet.fill"],
    71: ["Light snow", "cloud.snow.fill", "cloud.snow.fill"],
    73: ["Snow", "cloud.snow.fill", "cloud.snow.fill"],
    75: ["Heavy snow", "snowflake", "snowflake"],
    77: ["Snow", "cloud.snow.fill", "cloud.snow.fill"],
    80: ["Showers", "cloud.sun.rain.fill", "cloud.moon.rain.fill"],
    81: ["Showers", "cloud.rain.fill", "cloud.rain.fill"],
    82: ["Heavy showers", "cloud.heavyrain.fill", "cloud.heavyrain.fill"],
    85: ["Snow showers", "cloud.snow.fill", "cloud.snow.fill"],
    86: ["Snow showers", "cloud.snow.fill", "cloud.snow.fill"],
    95: ["Thunderstorm", "cloud.bolt.rain.fill", "cloud.bolt.rain.fill"],
    96: ["Thunderstorm", "cloud.bolt.rain.fill", "cloud.bolt.rain.fill"],
    99: ["Thunderstorm", "cloud.bolt.rain.fill", "cloud.bolt.rain.fill"],
  }
  return map[code] || ["-", "cloud.fill", "cloud.fill"]
}
