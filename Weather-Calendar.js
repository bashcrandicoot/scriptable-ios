// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: calendar-alt;

/*
  MINIMAL WEATHER + CALENDAR
  Medium widget (4x2) for Scriptable, styled to match the AI Launcher.

  Left tile:  current weather (location, temperature, condition, high/low)
  Right tile: full month calendar (today highlighted, past days dimmed,
              dots under days that have events)

  Weather comes from Open-Meteo, which is free and needs no API key.
*/

// ---------------- CONFIG ----------------
const CONFIG = {
  bgTopHex: "#1B1A20",
  bgBottomHex: "#0A0A0D",
  tileHex: "#24232A",
  tileRadius: 13,
  textHex: "#F2F0F6",
  todayHex: "#F2F0F6",
  todayTextHex: "#0A0A0D",
  units: "fahrenheit",
  weekStartsOnMonday: false,
  showEventDots: true,
  refreshMinutes: 30,
  fallbackLocation: { latitude: 40.7128, longitude: -74.006, name: "New York" },
}
// ----------------------------------------

const TEXT = new Color(CONFIG.textHex)
const dim = (a) => new Color(CONFIG.textHex, a)

const fm = FileManager.local()
const DIR = fm.joinPath(fm.documentsDirectory(), "minimal-weather-cal")
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true)
const LOC_CACHE = fm.joinPath(DIR, "location.json")
const WX_CACHE = fm.joinPath(DIR, "weather.json")

// ---------------- ENTRY POINT ----------------
const widget = await buildWidget()
if (config.runsInApp) await widget.presentMedium()
else Script.setWidget(widget)
Script.complete()

// ---------------- WIDGET ----------------
async function buildWidget() {
  const now = new Date()
  const [weather, eventDays] = await Promise.all([getWeather(), getEventDays(now)])

  const w = new ListWidget()
  w.setPadding(12, 14, 12, 14)
  w.url = "calshow://"
  w.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000)

  const bg = new LinearGradient()
  bg.colors = [new Color(CONFIG.bgTopHex), new Color(CONFIG.bgBottomHex)]
  bg.locations = [0, 1]
  bg.startPoint = new Point(0, 0)
  bg.endPoint = new Point(1, 1)
  w.backgroundGradient = bg

  const TILE_H = 134

  const main = w.addStack()
  main.layoutHorizontally()
  main.centerAlignContent()

  // Weather tile
  const left = main.addStack()
  left.layoutHorizontally()
  left.size = new Size(0, TILE_H)
  left.cornerRadius = CONFIG.tileRadius
  left.backgroundColor = new Color(CONFIG.tileHex)
  left.setPadding(12, 12, 12, 8)
  left.url = "weather://"

  const wx = left.addStack()
  wx.layoutVertically()

  // Title: green "online" dot + Forecast
  const top = wx.addStack()
  top.layoutHorizontally()
  top.centerAlignContent()

  const glow = top.addStack()
  glow.size = new Size(12, 12)
  glow.cornerRadius = 6
  glow.backgroundColor = new Color("30D158", 0.25)
  glow.layoutHorizontally()
  glow.centerAlignContent()
  glow.addSpacer()
  const dot = glow.addStack()
  dot.size = new Size(7, 7)
  dot.cornerRadius = 3.5
  dot.backgroundColor = new Color("30D158")
  glow.addSpacer()

  top.addSpacer(6)

  const title = top.addText("Forecast")
  title.font = Font.semiboldSystemFont(12)
  title.textColor = TEXT
  title.lineLimit = 1
  title.minimumScaleFactor = 0.8

  wx.addSpacer()

  const temp = wx.addText(weather.temp)
  temp.font = Font.ultraLightSystemFont(38)
  temp.textColor = TEXT
  temp.lineLimit = 1
  temp.minimumScaleFactor = 0.6

  wx.addSpacer(1)

  // Condition with its weather icon
  const condRow = wx.addStack()
  condRow.layoutHorizontally()
  condRow.centerAlignContent()
  const sym = SFSymbol.named(weather.symbol) || SFSymbol.named("cloud")
  sym.applyFont(Font.mediumSystemFont(11))
  const icon = condRow.addImage(sym.image)
  icon.imageSize = new Size(12, 12)
  icon.tintColor = TEXT
  icon.resizable = true
  condRow.addSpacer(4)
  const cond = condRow.addText(weather.condition)
  cond.font = Font.mediumSystemFont(11)
  cond.textColor = TEXT
  cond.lineLimit = 1
  cond.minimumScaleFactor = 0.7

  wx.addSpacer(3)

  const hl = wx.addText(weather.hiLo)
  hl.font = Font.regularSystemFont(10)
  hl.textColor = dim(0.55)
  hl.lineLimit = 1
  hl.minimumScaleFactor = 0.8

  wx.addSpacer(2)

  const loc = wx.addText(weather.place)
  loc.font = Font.semiboldSystemFont(8.5)
  loc.textColor = dim(0.45)
  loc.lineLimit = 1
  loc.minimumScaleFactor = 0.7

  left.addSpacer()

  main.addSpacer(8)

  // Calendar tile
  const CAL_W = 164, CAL_H = 114
  const right = main.addStack()
  right.size = new Size(CAL_W + 20, TILE_H)
  right.cornerRadius = CONFIG.tileRadius
  right.backgroundColor = new Color(CONFIG.tileHex)
  right.setPadding(10, 10, 10, 10)
  right.centerAlignContent()
  right.url = "calshow://"
  const cal = right.addImage(drawCalendar(now, eventDays, CAL_W, CAL_H))
  cal.imageSize = new Size(CAL_W, CAL_H)

  return w
}

// ---------------- CALENDAR ----------------
function drawCalendar(now, eventDays, W, H) {
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = false
  ctx.respectScreenScale = true

  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startShift = CONFIG.weekStartsOnMonday ? 1 : 0
  const offset = (new Date(year, month, 1).getDay() - startShift + 7) % 7
  const rows = Math.ceil((offset + daysInMonth) / 7)

  const headerH = 17
  const weekH = 14
  const cellW = W / 7
  const cellH = (H - headerH - weekH) / rows

  const df = new DateFormatter()
  df.dateFormat = "MMMM"
  ctx.setFont(Font.boldSystemFont(10.5))
  ctx.setTextColor(TEXT)
  ctx.setTextAlignedLeft()
  ctx.drawTextInRect(df.string(now).toUpperCase(), new Rect(cellW / 2 - 4, 0, W, headerH))
  ctx.setFont(Font.mediumSystemFont(10.5))
  ctx.setTextColor(dim(0.4))
  ctx.setTextAlignedRight()
  ctx.drawTextInRect(String(year), new Rect(0, 0, W - cellW / 2 + 4, headerH))

  let labels = ["S", "M", "T", "W", "T", "F", "S"]
  if (CONFIG.weekStartsOnMonday) labels = labels.slice(1).concat(labels[0])
  ctx.setFont(Font.semiboldSystemFont(8))
  ctx.setTextColor(dim(0.4))
  ctx.setTextAlignedCenter()
  labels.forEach((l, i) => ctx.drawTextInRect(l, new Rect(i * cellW, headerH, cellW, weekH)))

  const fs = 10
  for (let d = 1; d <= daysInMonth; d++) {
    const idx = offset + d - 1
    const col = idx % 7
    const row = Math.floor(idx / 7)
    const x = col * cellW
    const y = headerH + weekH + row * cellH
    const textY = y + (cellH - fs * 1.22) / 2

    if (d === today) {
      const r = Math.min(cellW, cellH) - 0.5
      ctx.setFillColor(new Color(CONFIG.todayHex))
      ctx.fillEllipse(new Rect(x + (cellW - r) / 2, y + (cellH - r) / 2, r, r))
      ctx.setFont(Font.boldSystemFont(fs))
      ctx.setTextColor(new Color(CONFIG.todayTextHex))
    } else {
      ctx.setFont(Font.regularSystemFont(fs))
      ctx.setTextColor(d < today ? dim(0.35) : dim(0.92))
    }
    ctx.setTextAlignedCenter()
    ctx.drawTextInRect(String(d), new Rect(x, textY, cellW, fs * 1.4))

    if (CONFIG.showEventDots && d !== today && eventDays.has(d)) {
      const s = 2.4
      ctx.setFillColor(d < today ? dim(0.35) : dim(0.85))
      ctx.fillEllipse(new Rect(x + (cellW - s) / 2, y + cellH - s - 0.3, s, s))
    }
  }

  return ctx.getImage()
}

async function getEventDays(now) {
  const days = new Set()
  if (!CONFIG.showEventDots) return days
  try {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const events = await CalendarEvent.between(start, end, [])
    for (const e of events) {
      const s = new Date(Math.max(e.startDate.getTime(), start.getTime()))
      const last = new Date(Math.min(e.endDate.getTime() - 1, end.getTime() - 1))
      const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate())
      while (cur <= last) {
        days.add(cur.getDate())
        cur.setDate(cur.getDate() + 1)
      }
    }
  } catch (e) {
    // Calendar access denied: skip the dots
  }
  return days
}

// ---------------- WEATHER ----------------
async function getLocation() {
  try {
    Location.setAccuracyToThreeKilometers()
    const l = await Location.current()
    let name = ""
    try {
      const geo = await Location.reverseGeocode(l.latitude, l.longitude)
      if (geo && geo.length) name = geo[0].locality || geo[0].subAdministrativeArea || geo[0].name || ""
    } catch (e) {}
    const loc = { latitude: l.latitude, longitude: l.longitude, name }
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
    data = await new Request(url).loadJSON()
    if (!data.current) throw new Error("bad response")
    fm.writeString(WX_CACHE, JSON.stringify(data))
  } catch (e) {
    if (fm.fileExists(WX_CACHE)) data = JSON.parse(fm.readString(WX_CACHE))
  }

  if (!data || !data.current) {
    return { place: loc.name || "-", temp: "--" + String.fromCharCode(176), condition: "Unavailable", hiLo: "", symbol: "cloud" }
  }

  const code = data.current.weather_code
  const isDay = data.current.is_day === 1
  const [label, daySym, nightSym] = wmo(code)
  const r = (n) => Math.round(n)
  const deg = String.fromCharCode(176)
  return {
    place: (loc.name || "Current location").toUpperCase(),
    temp: r(data.current.temperature_2m) + deg,
    condition: label,
    hiLo: "H " + r(data.daily.temperature_2m_max[0]) + deg + "   L " + r(data.daily.temperature_2m_min[0]) + deg,
    symbol: isDay ? daySym : nightSym,
  }
}

function wmo(code) {
  const map = {
    0: ["Clear", "sun.max", "moon.stars"],
    1: ["Mostly Clear", "sun.max", "moon"],
    2: ["Partly Cloudy", "cloud.sun", "cloud.moon"],
    3: ["Overcast", "cloud", "cloud"],
    45: ["Fog", "cloud.fog", "cloud.fog"],
    48: ["Fog", "cloud.fog", "cloud.fog"],
    51: ["Light Drizzle", "cloud.drizzle", "cloud.drizzle"],
    53: ["Drizzle", "cloud.drizzle", "cloud.drizzle"],
    55: ["Heavy Drizzle", "cloud.drizzle", "cloud.drizzle"],
    56: ["Freezing Drizzle", "cloud.sleet", "cloud.sleet"],
    57: ["Freezing Drizzle", "cloud.sleet", "cloud.sleet"],
    61: ["Light Rain", "cloud.rain", "cloud.rain"],
    63: ["Rain", "cloud.rain", "cloud.rain"],
    65: ["Heavy Rain", "cloud.heavyrain", "cloud.heavyrain"],
    66: ["Freezing Rain", "cloud.sleet", "cloud.sleet"],
    67: ["Freezing Rain", "cloud.sleet", "cloud.sleet"],
    71: ["Light Snow", "cloud.snow", "cloud.snow"],
    73: ["Snow", "cloud.snow", "cloud.snow"],
    75: ["Heavy Snow", "snowflake", "snowflake"],
    77: ["Snow Grains", "cloud.snow", "cloud.snow"],
    80: ["Showers", "cloud.sun.rain", "cloud.moon.rain"],
    81: ["Showers", "cloud.rain", "cloud.rain"],
    82: ["Heavy Showers", "cloud.heavyrain", "cloud.heavyrain"],
    85: ["Snow Showers", "cloud.snow", "cloud.snow"],
    86: ["Snow Showers", "cloud.snow", "cloud.snow"],
    95: ["Thunderstorm", "cloud.bolt.rain", "cloud.bolt.rain"],
    96: ["Thunderstorm", "cloud.bolt.rain", "cloud.bolt.rain"],
    99: ["Thunderstorm", "cloud.bolt.rain", "cloud.bolt.rain"],
  }
  return map[code] || ["-", "cloud", "cloud"]
}
