// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: heartbeat;

/*
  DAILY PULSE
  Large widget for Scriptable. Built from the Figma mockup
  "Daily Pulse - Large widget".

  - Header: green online dot, title, today's date
  - Progress rings: how much of the day has passed, reminders done
    today, battery level
  - Next up: your next calendar event with a LIVE countdown that ticks
    every second on the home screen
  - Hourly: current temperature and a 12-hour temperature curve

  Data: Calendar, Reminders, battery (all on your phone) and
  Open-Meteo for weather (free, no key).

  The first run asks for Calendar, Reminders and Location access.
  Run it once inside Scriptable and tap Allow on each.
*/

// ---------------- CONFIG ----------------
const CONFIG = {
  bgHex: "#0D0C11",
  textHex: "#F2F0F6",
  green: "#30D158",
  purple: "#8B7CFF",
  teal: "#40C8E0",
  glowPurple: "#6D4CFF",
  glowTeal: "#14B8A6",
  units: "fahrenheit",        // "fahrenheit" or "celsius"
  lookAheadHours: 36,         // how far ahead to look for the next event
  refreshMinutes: 15,
  fallbackLocation: { latitude: 40.7128, longitude: -74.006, name: "New York" },
}
// ----------------------------------------

const TEXT = new Color(CONFIG.textHex)
const dim = (a) => new Color(CONFIG.textHex, a)
const DEG = String.fromCharCode(176)
const DASH = String.fromCharCode(8211)
const MID = String.fromCharCode(183)

const fm = FileManager.local()
const DIR = fm.joinPath(fm.documentsDirectory(), "daily-pulse")
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true)
const LOC_CACHE = fm.joinPath(DIR, "location.json")
const WX_CACHE = fm.joinPath(DIR, "weather.json")

// Large widget size in points for this phone
const SIZE = largeWidgetSize()
const K = SIZE.h / 382        // scale against the 364x382 mockup
const S = 3                   // draw images at 3x for sharp edges

// ---------------- ENTRY POINT ----------------
const widget = await buildWidget()
if (config.runsInApp) await widget.presentLarge()
else Script.setWidget(widget)
Script.complete()

// ---------------- WIDGET ----------------
async function buildWidget() {
  const now = new Date()
  const [tasks, event, weather] = await Promise.all([getTasks(now), getNextEvent(now), getWeather()])
  const battery = getBattery()
  const dayPct = (now - startOfDay(now)) / 86400000

  const w = new ListWidget()
  w.setPadding(16, 16, 14, 16)
  w.backgroundColor = new Color(CONFIG.bgHex)
  w.backgroundImage = drawGlows()
  w.url = "calshow://"
  w.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000)

  // Header
  const header = w.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()
  addOnlineDot(header)
  header.addSpacer(7)
  addText(header, "Daily Pulse", Font.semiboldSystemFont(14), TEXT)
  header.addSpacer()
  const df = new DateFormatter()
  df.dateFormat = "EEE d MMM"
  addText(header, df.string(now).toUpperCase(), Font.semiboldSystemFont(11), dim(0.5))

  w.addSpacer(Math.round(14 * K))

  // Rings + legend
  const ringSize = Math.round(112 * K)
  const ringsRow = w.addStack()
  ringsRow.layoutHorizontally()
  ringsRow.centerAlignContent()
  const ringImg = ringsRow.addImage(drawRings(ringSize, [
    { pct: dayPct, color: CONFIG.green },
    { pct: tasks.total ? tasks.done / tasks.total : 0, color: CONFIG.purple },
    { pct: battery.level, color: CONFIG.teal },
  ]))
  ringImg.imageSize = new Size(ringSize, ringSize)
  ringsRow.addSpacer(18)

  const legend = ringsRow.addStack()
  legend.layoutVertically()
  addLegendRow(legend, CONFIG.green, "DAY", Math.round(dayPct * 100) + "%", "of today")
  legend.addSpacer(Math.round(10 * K))
  addLegendRow(legend, CONFIG.purple, "TASKS", tasks.total ? tasks.done + "/" + tasks.total : "0", tasks.total ? "done" : "due today")
  legend.addSpacer(Math.round(10 * K))
  addLegendRow(legend, CONFIG.teal, "BATTERY", Math.round(battery.level * 100) + "%", battery.charging ? "charging" : "charged")
  ringsRow.addSpacer()

  w.addSpacer(Math.round(14 * K))

  // Next up card
  addNextUp(w, event, now)

  w.addSpacer(Math.round(14 * K))

  // Hourly weather
  addHourly(w, weather)

  w.addSpacer()
  return w
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
  glow.backgroundColor = new Color(CONFIG.green, 0.25)
  glow.layoutHorizontally()
  glow.centerAlignContent()
  glow.addSpacer()
  const dot = glow.addStack()
  dot.size = new Size(7, 7)
  dot.cornerRadius = 3.5
  dot.backgroundColor = new Color(CONFIG.green)
  glow.addSpacer()
}

function addLegendRow(legend, hex, label, value, sub) {
  const row = legend.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const pip = row.addStack()
  pip.size = new Size(4, 26)
  pip.cornerRadius = 2
  pip.backgroundColor = new Color(hex)
  row.addSpacer(8)

  const col = row.addStack()
  col.layoutVertically()
  addText(col, label, Font.semiboldSystemFont(9), dim(0.5))
  col.addSpacer(1)
  const v = col.addStack()
  v.layoutHorizontally()
  v.bottomAlignContent()
  addText(v, value, Font.semiboldRoundedSystemFont(17), TEXT)
  v.addSpacer(4)
  const s = addText(v, sub, Font.mediumSystemFont(11), dim(0.45))
  s.minimumScaleFactor = 0.6
}

function addNextUp(w, event, now) {
  const card = w.addStack()
  card.layoutHorizontally()
  card.centerAlignContent()
  card.backgroundColor = new Color("#FFFFFF", 0.06)
  card.borderColor = new Color("#FFFFFF", 0.08)
  card.borderWidth = 1
  card.cornerRadius = 16
  card.setPadding(12, 12, 12, 14)

  const bar = card.addStack()
  bar.size = new Size(4, 36)
  bar.cornerRadius = 2
  bar.backgroundColor = event ? event.color : dim(0.25)
  card.addSpacer(12)

  const info = card.addStack()
  info.layoutVertically()

  if (!event) {
    addText(info, "NEXT UP", Font.semiboldSystemFont(9), dim(0.5))
    info.addSpacer(2)
    addText(info, "Nothing on the calendar", Font.semiboldSystemFont(15), TEXT)
    info.addSpacer(2)
    addText(info, "Enjoy the free time", Font.mediumSystemFont(11), dim(0.55))
    card.addSpacer()
    return
  }

  const live = event.start <= now
  addText(info, live ? "HAPPENING NOW" : "NEXT UP", Font.semiboldSystemFont(9), dim(0.5))
  info.addSpacer(2)
  addText(info, event.title, Font.semiboldSystemFont(15), TEXT)
  info.addSpacer(2)
  addText(info, event.when + (event.place ? "  " + MID + "  " + event.place : ""), Font.mediumSystemFont(11), dim(0.55))

  card.addSpacer()

  // Live countdown pill: iOS updates timer text every second on the home screen
  const target = live ? event.end : event.start
  const soon = target - now < 12 * 3600000
  const pill = card.addStack()
  pill.layoutHorizontally()
  pill.centerAlignContent()
  pill.backgroundColor = new Color(CONFIG.green, 0.16)
  pill.cornerRadius = 10
  pill.setPadding(5, 9, 5, 9)
  if (soon) {
    addText(pill, live ? "ends" : "in", Font.mediumSystemFont(11), new Color(CONFIG.green))
    pill.addSpacer(4)
    const timer = pill.addDate(target)
    timer.applyTimerStyle()
    timer.font = Font.boldRoundedSystemFont(13)
    timer.textColor = new Color(CONFIG.green)
    timer.lineLimit = 1
  } else {
    addText(pill, event.dayLabel, Font.boldRoundedSystemFont(13), new Color(CONFIG.green))
  }
}

function addHourly(w, wx) {
  const head = w.addStack()
  head.layoutHorizontally()
  head.bottomAlignContent()
  addText(head, wx ? wx.temp : "--" + DEG, Font.semiboldRoundedSystemFont(20), TEXT)
  head.addSpacer(6)
  addText(head, wx ? wx.condition : "Weather unavailable", Font.mediumSystemFont(12), dim(0.7))
  head.addSpacer()
  if (wx) addText(head, wx.hiLo, Font.mediumSystemFont(11), dim(0.5))

  if (!wx || !wx.hourly.length) return

  w.addSpacer(6)
  const sw = SIZE.w - 32
  const sh = Math.round(54 * K)
  const spark = w.addImage(drawSparkline(wx.hourly.map(h => h.temp), sw, sh))
  spark.imageSize = new Size(sw, sh)

  w.addSpacer(6)
  const ticks = w.addStack()
  ticks.layoutHorizontally()
  const labels = [0, 3, 6, 9, 12].filter(i => i < wx.hourly.length).map(i => i === 0 ? "Now" : wx.hourly[i].label)
  labels.forEach((l, i) => {
    addText(ticks, l, Font.mediumSystemFont(10), dim(i === 0 ? 0.85 : 0.4))
    if (i < labels.length - 1) ticks.addSpacer()
  })
}

// ---------------- DRAWING ----------------

function drawGlows() {
  const W = SIZE.w * S, H = SIZE.h * S
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.respectScreenScale = false
  ctx.opaque = true
  ctx.setFillColor(new Color(CONFIG.bgHex))
  ctx.fillRect(new Rect(0, 0, W, H))
  // Soft blurred blobs: many faint ellipses stacked from large to small
  softBlob(ctx, W * 0.10, H * 0.02, W * 0.62, CONFIG.glowPurple, 0.42)
  softBlob(ctx, W * 0.92, H * 0.95, W * 0.58, CONFIG.glowTeal, 0.30)
  softBlob(ctx, W * 0.80, H * 0.02, W * 0.34, CONFIG.green, 0.12)
  return ctx.getImage()
}

function softBlob(ctx, cx, cy, radius, hex, strength) {
  const steps = 36
  for (let i = 0; i < steps; i++) {
    const r = radius * (1 - i / steps)
    ctx.setFillColor(new Color(hex, strength / steps * 1.6))
    ctx.fillEllipse(new Rect(cx - r, cy - r * 0.86, r * 2, r * 1.72))
  }
}

function drawRings(size, rings) {
  const px = size * S
  const ctx = new DrawContext()
  ctx.size = new Size(px, px)
  ctx.respectScreenScale = false
  ctx.opaque = false
  const c = px / 2
  const thick = 12 * K * S
  const gap = 3 * K * S

  rings.forEach((ring, i) => {
    const r = c - thick / 2 - i * (thick + gap)
    const color = new Color(ring.color)
    // Track
    strokeArc(ctx, c, r, 0, 1, new Color(ring.color, 0.16), thick)
    // Progress with round caps
    const pct = Math.max(0, Math.min(1, ring.pct))
    if (pct > 0.005) {
      strokeArc(ctx, c, r, 0, pct, color, thick)
      for (const p of [0, pct]) {
        const a = -Math.PI / 2 + p * 2 * Math.PI
        ctx.setFillColor(color)
        ctx.fillEllipse(new Rect(c + r * Math.cos(a) - thick / 2, c + r * Math.sin(a) - thick / 2, thick, thick))
      }
    }
  })
  return ctx.getImage()
}

function strokeArc(ctx, c, r, from, to, color, width) {
  const path = new Path()
  const steps = Math.max(8, Math.ceil((to - from) * 120))
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (from + (to - from) * i / steps) * 2 * Math.PI
    const p = new Point(c + r * Math.cos(a), c + r * Math.sin(a))
    if (i === 0) path.move(p)
    else path.addLine(p)
  }
  ctx.addPath(path)
  ctx.setStrokeColor(color)
  ctx.setLineWidth(width)
  ctx.strokePath()
}

function drawSparkline(temps, w, h) {
  const W = w * S, H = h * S
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.respectScreenScale = false
  ctx.opaque = false

  const lo = Math.min(...temps) - 2, hi = Math.max(...temps) + 2
  const pad = 8 * S
  const pts = temps.map((t, i) => ({
    x: pad / 2 + i * (W - pad) / (temps.length - 1),
    y: 6 * S + (1 - (t - lo) / (hi - lo || 1)) * (H - 12 * S),
  }))

  // Smooth curve: cubic segments with horizontal handles, sampled densely
  const curve = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], mx = (a.x + b.x) / 2
    for (let s = 0; s <= 20; s++) {
      const t = s / 20, u = 1 - t
      curve.push({
        x: u * u * u * a.x + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y,
      })
    }
  }

  // Gradient fill under the curve: 2px columns that fade toward the bottom.
  // Columns and bands touch exactly (no overlap) so there are no seams.
  const bands = 12
  let j = 0
  for (let x = Math.floor(curve[0].x); x < Math.ceil(curve[curve.length - 1].x); x += 2) {
    while (j < curve.length - 2 && curve[j + 1].x < x) j++
    const p = curve[j], q = curve[j + 1]
    const t = q.x === p.x ? 0 : Math.max(0, Math.min(1, (x - p.x) / (q.x - p.x)))
    const top = Math.round(p.y + (q.y - p.y) * t)
    const span = H - top
    for (let b = 0; b < bands; b++) {
      const y0 = Math.round(top + span * b / bands)
      const y1 = Math.round(top + span * (b + 1) / bands)
      if (y1 <= y0) continue
      ctx.setFillColor(new Color(CONFIG.teal, 0.34 * Math.pow(1 - b / bands, 1.4)))
      ctx.fillRect(new Rect(x, y0, 2, y1 - y0))
    }
  }

  // Line
  const path = new Path()
  curve.forEach((p, i) => i === 0 ? path.move(new Point(p.x, p.y)) : path.addLine(new Point(p.x, p.y)))
  ctx.addPath(path)
  ctx.setStrokeColor(new Color(CONFIG.teal))
  ctx.setLineWidth(2 * S)
  ctx.strokePath()

  // "Now" dot
  const n = pts[0]
  ctx.setFillColor(new Color(CONFIG.textHex, 0.2))
  ctx.fillEllipse(new Rect(n.x - 7 * S, n.y - 7 * S, 14 * S, 14 * S))
  ctx.setFillColor(TEXT)
  ctx.fillEllipse(new Rect(n.x - 4 * S, n.y - 4 * S, 8 * S, 8 * S))
  return ctx.getImage()
}

// ---------------- DATA ----------------
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function largeWidgetSize() {
  // Large widget sizes in points by screen width (portrait)
  let sw = 390
  try { sw = Math.min(Device.screenSize().width, Device.screenSize().height) } catch (e) {}
  if (sw >= 428) return { w: 364, h: 382 }
  if (sw >= 414) return { w: 360, h: 379 }
  if (sw >= 390) return { w: 338, h: 354 }
  return { w: 329, h: 345 }
}

function getBattery() {
  let level = 0, charging = false
  try { level = Device.batteryLevel() } catch (e) {}
  try { charging = Device.isCharging() } catch (e) {}
  return { level, charging }
}

async function getTasks(now) {
  try {
    const endToday = new Date(startOfDay(now).getTime() + 86400000)
    const [done, open] = await Promise.all([Reminder.completedToday(), Reminder.allIncomplete()])
    const dueOpen = open.filter(r => r.dueDate && r.dueDate < endToday).length
    return { done: done.length, total: done.length + dueOpen }
  } catch (e) {
    console.log("Reminders: " + e)
    return { done: 0, total: 0 }
  }
}

async function getNextEvent(now) {
  try {
    const end = new Date(now.getTime() + CONFIG.lookAheadHours * 3600000)
    const events = await CalendarEvent.between(now, end, [])
    const e = events
      .filter(ev => !ev.isAllDay && ev.endDate > now)
      .sort((a, b) => a.startDate - b.startDate)[0]
    if (!e) return null

    const tf = new DateFormatter()
    tf.dateFormat = "h:mm a"
    const sameDay = startOfDay(e.startDate).getTime() === startOfDay(now).getTime()
    const tomorrow = startOfDay(e.startDate).getTime() === startOfDay(now).getTime() + 86400000
    const dayLabel = sameDay ? tf.string(e.startDate) : tomorrow ? "Tomorrow" : "Soon"
    let color = new Color(CONFIG.purple)
    try { if (e.calendar && e.calendar.color) color = e.calendar.color } catch (err) {}
    return {
      title: e.title || "Untitled event",
      start: e.startDate,
      end: e.endDate,
      when: (sameDay ? "" : tomorrow ? "Tomorrow " : "") + tf.string(e.startDate) + " " + DASH + " " + tf.string(e.endDate),
      place: (e.location || "").split("\n")[0].slice(0, 28),
      dayLabel,
      color,
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
    "&current=temperature_2m,weather_code" +
    "&hourly=temperature_2m" +
    "&daily=temperature_2m_max,temperature_2m_min" +
    "&temperature_unit=" + unit + "&timezone=auto&forecast_days=2"

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

  // Next 13 hours starting with the current hour (times are local to the location)
  const nowKey = (data.current.time || "").slice(0, 13)
  let startIdx = data.hourly.time.findIndex(t => t.slice(0, 13) === nowKey)
  if (startIdx < 0) startIdx = 0
  const hourly = []
  for (let i = startIdx; i < Math.min(startIdx + 13, data.hourly.time.length); i++) {
    const hr = parseInt(data.hourly.time[i].slice(11, 13), 10)
    const label = (hr % 12 === 0 ? 12 : hr % 12) + (hr < 12 ? "A" : "P")
    hourly.push({ temp: data.hourly.temperature_2m[i], label })
  }

  const r = (n) => Math.round(n)
  return {
    temp: r(data.current.temperature_2m) + DEG,
    condition: wmo(data.current.weather_code),
    hiLo: "H " + r(data.daily.temperature_2m_max[0]) + DEG + "  L " + r(data.daily.temperature_2m_min[0]) + DEG,
    hourly,
  }
}

function wmo(code) {
  const map = {
    0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain",
    65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow",
    73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers",
    82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm",
    96: "Thunderstorm", 99: "Thunderstorm",
  }
  return map[code] || "-"
}
