// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: th-large;

/*
  HUB
  Medium widget (4x2) for Scriptable, in the same style as Agent Hub,
  Forecast, Radar and Reminders.

  A personal hub with info the other widgets don't show:
    Battery   level, charging state and a bar
    Sun       next sunset or sunrise and how much daylight is left
    Air       air quality (US AQI) and UV index
    Progress  how far through the week and the year you are

  Sun and air data come from Open-Meteo (free, no key). The first run
  asks for Location access: run it once in Scriptable and tap Allow.
*/

// ---------------- CONFIG ----------------
const CONFIG = {
  bgTopHex: "#1B1A20",
  bgBottomHex: "#0A0A0D",
  tileHex: "#24232A",
  tileRadius: 13,
  textHex: "#F2F0F6",
  dotHex: "#30D158",
  accent: { battery: "#30D158", sun: "#FF9F0A", air: "#40C8E0", progress: "#8B7CFF" },
  weekStartsOnMonday: true,
  refreshMinutes: 30,
  fallbackLocation: { latitude: 40.7128, longitude: -74.006 },
}
// ----------------------------------------

const TEXT = new Color(CONFIG.textHex)
const dim = (a) => new Color(CONFIG.textHex, a)
const MID = String.fromCharCode(183)

const fm = FileManager.local()
const DIR = fm.joinPath(fm.documentsDirectory(), "hub")
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true)
const LOC_CACHE = fm.joinPath(DIR, "location.json")
const SUN_CACHE = fm.joinPath(DIR, "sun.json")
const AIR_CACHE = fm.joinPath(DIR, "air.json")

const SIZE = mediumWidgetSize()

// ---------------- ENTRY POINT ----------------
const widget = await buildWidget()
if (config.runsInApp) await widget.presentMedium()
else Script.setWidget(widget)
Script.complete()

// ---------------- WIDGET ----------------
async function buildWidget() {
  const now = new Date()
  const loc = await getLocation()
  const [sun, air] = await Promise.all([getSun(loc), getAir(loc)])

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
  const barW = tileW - 20

  const row1 = w.addStack()
  row1.layoutHorizontally()
  batteryTile(newTile(row1, tileW, tileH), barW)
  row1.addSpacer(gap)
  sunTile(newTile(row1, tileW, tileH), sun, now)

  w.addSpacer(gap)

  const row2 = w.addStack()
  row2.layoutHorizontally()
  airTile(newTile(row2, tileW, tileH), air)
  row2.addSpacer(gap)
  progressTile(newTile(row2, tileW, tileH), now, barW)

  return w
}

function newTile(row, w, h) {
  const t = row.addStack()
  t.layoutVertically()
  t.size = new Size(w, h)
  t.cornerRadius = CONFIG.tileRadius
  t.backgroundColor = new Color(CONFIG.tileHex)
  t.setPadding(6, 10, 6, 10)
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
}

function mainLine(tile, value, unit, unitColor) {
  const main = tile.addStack()
  main.layoutHorizontally()
  main.bottomAlignContent()
  addText(main, value, Font.semiboldRoundedSystemFont(15), TEXT)
  if (unit) {
    main.addSpacer(5)
    addText(main, unit, Font.mediumSystemFont(10), unitColor || dim(0.7))
  }
  main.addSpacer()
}

function bar(tile, pct, hex, width) {
  const track = tile.addStack()
  track.layoutHorizontally()
  track.size = new Size(width, 4)
  track.cornerRadius = 2
  track.backgroundColor = dim(0.12)
  const fillW = Math.max(4, Math.round(width * Math.max(0, Math.min(1, pct))))
  const fill = track.addStack()
  fill.size = new Size(fillW, 4)
  fill.cornerRadius = 2
  fill.backgroundColor = new Color(hex)
  track.addSpacer()
}

function batteryTile(tile, barW) {
  let level = 0, charging = false
  try { level = Device.batteryLevel() } catch (e) {}
  try { charging = Device.isCharging() } catch (e) {}
  const pct = Math.round(level * 100)
  const low = pct <= 20 && !charging
  const hex = low ? "#FF6B6B" : CONFIG.accent.battery
  const symbol = charging ? "battery.100.bolt" : pct > 60 ? "battery.75" : pct > 30 ? "battery.50" : "battery.25"

  tileLabel(tile, symbol, "BATTERY", hex)
  tile.addSpacer()
  mainLine(tile, pct + "%", charging ? "charging" : low ? "low" : "", charging ? new Color(CONFIG.accent.battery) : low ? new Color("#FF6B6B") : null)
  tile.addSpacer(4)
  bar(tile, level, hex, barW)
}

function sunTile(tile, sun, now) {
  if (!sun) {
    tileLabel(tile, "sun.horizon.fill", "SUN", CONFIG.accent.sun)
    tile.addSpacer()
    mainLine(tile, "--", "")
    tile.addSpacer(1)
    addText(tile, "Sun times unavailable", Font.mediumSystemFont(9), dim(0.45))
    return
  }
  const tf = new DateFormatter()
  tf.dateFormat = "h:mm a"
  const beforeSunrise = now < sun.sunrise
  const daytime = now >= sun.sunrise && now < sun.sunset

  if (daytime) {
    tileLabel(tile, "sunset.fill", "SUNSET", CONFIG.accent.sun)
    tile.addSpacer()
    mainLine(tile, tf.string(sun.sunset), "")
    tile.addSpacer(1)
    addText(tile, duration(sun.sunset - now) + " of daylight left", Font.mediumSystemFont(9), dim(0.45))
  } else {
    const next = beforeSunrise ? sun.sunrise : sun.tomorrowSunrise
    tileLabel(tile, "sunrise.fill", "SUNRISE", CONFIG.accent.sun)
    tile.addSpacer()
    mainLine(tile, next ? tf.string(next) : "--", beforeSunrise ? "today" : "tomorrow")
    tile.addSpacer(1)
    addText(tile, "Daylight " + duration(sun.sunset - sun.sunrise), Font.mediumSystemFont(9), dim(0.45))
  }
}

function airTile(tile, air) {
  tileLabel(tile, "aqi.medium", "AIR", CONFIG.accent.air)
  tile.addSpacer()
  if (!air) {
    mainLine(tile, "--", "")
    tile.addSpacer(1)
    addText(tile, "Air data unavailable", Font.mediumSystemFont(9), dim(0.45))
    return
  }
  const q = aqiLevel(air.aqi)
  mainLine(tile, "AQI " + air.aqi, q.label, new Color(q.hex))
  tile.addSpacer(1)
  addText(tile, "UV " + air.uv + "  " + MID + "  " + uvLabel(air.uv), Font.mediumSystemFont(9), dim(0.45))
}

function progressTile(tile, now, barW) {
  tileLabel(tile, "chart.bar.fill", "PROGRESS", CONFIG.accent.progress)
  tile.addSpacer()

  // Week
  const dow = (now.getDay() + 7 - (CONFIG.weekStartsOnMonday ? 1 : 0)) % 7
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow)
  const weekPct = (now - weekStart) / (7 * 86400000)
  // Year
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1)
  const yearPct = (now - yearStart) / (yearEnd - yearStart)

  progressRow(tile, "Week", weekPct, CONFIG.accent.progress, barW)
  tile.addSpacer(5)
  progressRow(tile, "Year", yearPct, CONFIG.accent.air, barW)
}

// One line: label, bar, percent
function progressRow(tile, label, pct, hex, barW) {
  const row = tile.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  const labelW = 30, pctW = 30
  const l = row.addStack()
  l.size = new Size(labelW, 12)
  l.layoutHorizontally()
  addText(l, label, Font.mediumSystemFont(9), dim(0.6))
  l.addSpacer()
  bar(row, pct, hex, barW - labelW - pctW)
  const p = row.addStack()
  p.size = new Size(pctW, 12)
  p.layoutHorizontally()
  p.addSpacer()
  addText(p, Math.round(pct * 100) + "%", Font.semiboldRoundedSystemFont(10), TEXT)
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

// ---------------- HELPERS ----------------
function duration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  return h ? h + "h " + m + "m" : m + "m"
}

function aqiLevel(aqi) {
  if (aqi <= 50) return { label: "Good", hex: "#30D158" }
  if (aqi <= 100) return { label: "Moderate", hex: "#FFD60A" }
  if (aqi <= 150) return { label: "Sensitive", hex: "#FF9F0A" }
  if (aqi <= 200) return { label: "Unhealthy", hex: "#FF6B6B" }
  if (aqi <= 300) return { label: "Very unhealthy", hex: "#BF5AF2" }
  return { label: "Hazardous", hex: "#A2453D" }
}

function uvLabel(uv) {
  if (uv < 3) return "Low"
  if (uv < 6) return "Moderate"
  if (uv < 8) return "High"
  if (uv < 11) return "Very high"
  return "Extreme"
}

function mediumWidgetSize() {
  let sw = 390
  try { sw = Math.min(Device.screenSize().width, Device.screenSize().height) } catch (e) {}
  if (sw >= 428) return { w: 364, h: 170 }
  if (sw >= 414) return { w: 360, h: 169 }
  if (sw >= 390) return { w: 338, h: 158 }
  return { w: 329, h: 155 }
}

// ---------------- DATA ----------------
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

async function loadJSON(url, cachePath) {
  try {
    const req = new Request(url)
    req.timeoutInterval = 10
    const data = await req.loadJSON()
    if (data && !data.error) {
      fm.writeString(cachePath, JSON.stringify(data))
      return data
    }
    throw new Error(data && data.reason ? data.reason : "bad response")
  } catch (e) {
    console.log(url + ": " + e)
    if (fm.fileExists(cachePath)) return JSON.parse(fm.readString(cachePath))
    return null
  }
}

async function getSun(loc) {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + loc.latitude.toFixed(3) + "&longitude=" + loc.longitude.toFixed(3) +
    "&daily=sunrise,sunset&timezone=auto&forecast_days=2"
  const data = await loadJSON(url, SUN_CACHE)
  if (!data || !data.daily || !data.daily.sunrise) return null
  // Open-Meteo gives local times like "2026-11-23T06:54"; read them as phone-local time
  const t = (s) => s ? new Date(s.length === 16 ? s + ":00" : s) : null
  return {
    sunrise: t(data.daily.sunrise[0]),
    sunset: t(data.daily.sunset[0]),
    tomorrowSunrise: t(data.daily.sunrise[1]),
  }
}

async function getAir(loc) {
  const url =
    "https://air-quality-api.open-meteo.com/v1/air-quality" +
    "?latitude=" + loc.latitude.toFixed(3) + "&longitude=" + loc.longitude.toFixed(3) +
    "&current=us_aqi,uv_index&timezone=auto"
  const data = await loadJSON(url, AIR_CACHE)
  if (!data || !data.current || data.current.us_aqi == null) return null
  return {
    aqi: Math.round(data.current.us_aqi),
    uv: Math.round(data.current.uv_index || 0),
  }
}
