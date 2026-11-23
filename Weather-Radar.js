// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: cloud-sun-rain;

/*
  MINIMAL WEATHER RADAR
  Large widget for Scriptable, styled to match the AI Launcher.

  Full-bleed radar map centered on your location, with a weather tile
  on top and a radar time tile at the bottom.

  Radar:   NOAA NEXRAD mosaic via Iowa Environmental Mesonet (US, free,
           no key, updated every 5 minutes). Outside the US, or if NOAA
           is down, it falls back to RainViewer (free, no key).
  Map:     CARTO dark basemap, OpenStreetMap data
  Weather: Open-Meteo (free, no API key)

  SETUP
  Paste into a Scriptable script, then add a LARGE Scriptable widget
  to your home screen and choose this script.
*/

// ---------------- CONFIG ----------------
const CONFIG = {
  bgTopHex: "#1B1A20",
  bgBottomHex: "#0A0A0D",
  tileHex: "#24232A",
  tileAlpha: 0.9,
  tileRadius: 13,
  textHex: "#F2F0F6",
  units: "fahrenheit",        // "fahrenheit" or "celsius"
  radarSource: "auto",        // "auto", "noaa" (US only) or "rainviewer"
  zoom: 7,                    // 6 = wider area, 8 = closer (8+ works with NOAA only)
  radarColor: 2,              // RainViewer only: 2 = Universal Blue (the only free scheme)
  smooth: true,               // RainViewer only: soften the radar edges
  showSnow: true,             // RainViewer only: separate colors for snow
  refreshMinutes: 10,
  // To test, center the map somewhere it is raining, e.g.
  // testLocation: { latitude: 47.61, longitude: -122.33, name: "Seattle" },
  testLocation: null,
  fallbackLocation: { latitude: 40.7128, longitude: -74.006, name: "New York" },
}
// ----------------------------------------

const TEXT = new Color(CONFIG.textHex)
const dim = (a) => new Color(CONFIG.textHex, a)
const DEG = String.fromCharCode(176)
const DOT = String.fromCharCode(183)
const COPY = String.fromCharCode(169)

const fm = FileManager.local()
const DIR = fm.joinPath(fm.documentsDirectory(), "minimal-weather-radar")
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true)
const LOC_CACHE = fm.joinPath(DIR, "location.json")
const WX_CACHE = fm.joinPath(DIR, "weather.json")
const MAP_CACHE = fm.joinPath(DIR, "map.png")
const TIME_CACHE = fm.joinPath(DIR, "time.txt")

// ---------------- ENTRY POINT ----------------
const widget = await buildWidget()
if (config.runsInApp) await widget.presentLarge()
else Script.setWidget(widget)
Script.complete()

// ---------------- WIDGET ----------------
async function buildWidget() {
  const loc = CONFIG.testLocation || await getLocation()
  const [weather, radar] = await Promise.all([getWeather(loc), getRadarMap(loc)])

  const w = new ListWidget()
  w.setPadding(12, 14, 12, 14)
  w.url = "weather://"
  w.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000)

  const bg = new LinearGradient()
  bg.colors = [new Color(CONFIG.bgTopHex), new Color(CONFIG.bgBottomHex)]
  bg.locations = [0, 1]
  bg.startPoint = new Point(0, 0)
  bg.endPoint = new Point(1, 1)
  w.backgroundGradient = bg
  if (radar.image) w.backgroundImage = radar.image

  // Weather tile
  const head = w.addStack()
  head.layoutHorizontally()
  head.centerAlignContent()
  head.cornerRadius = CONFIG.tileRadius
  head.backgroundColor = new Color(CONFIG.tileHex, CONFIG.tileAlpha)
  head.setPadding(10, 12, 10, 12)

  const info = head.addStack()
  info.layoutVertically()

  const top = info.addStack()
  top.layoutHorizontally()
  top.centerAlignContent()
  const sym = SFSymbol.named(weather.symbol) || SFSymbol.named("cloud")
  sym.applyFont(Font.mediumSystemFont(12))
  const icon = top.addImage(sym.image)
  icon.imageSize = new Size(14, 14)
  icon.tintColor = TEXT
  icon.resizable = true
  top.addSpacer(5)
  const place = top.addText(weather.place)
  place.font = Font.semiboldSystemFont(10)
  place.textColor = dim(0.7)
  place.lineLimit = 1
  place.minimumScaleFactor = 0.7

  info.addSpacer(4)

  const cond = info.addText(weather.condition)
  cond.font = Font.mediumSystemFont(13)
  cond.textColor = TEXT
  cond.lineLimit = 1
  cond.minimumScaleFactor = 0.7

  info.addSpacer(2)

  const hl = info.addText(weather.hiLo)
  hl.font = Font.regularSystemFont(10)
  hl.textColor = dim(0.55)
  hl.lineLimit = 1

  head.addSpacer()

  const temp = head.addText(weather.temp)
  temp.font = Font.ultraLightSystemFont(40)
  temp.textColor = TEXT
  temp.lineLimit = 1
  temp.minimumScaleFactor = 0.6

  w.addSpacer()

  // Radar time tile
  const foot = w.addStack()
  foot.layoutHorizontally()
  foot.centerAlignContent()
  foot.cornerRadius = CONFIG.tileRadius
  foot.backgroundColor = new Color(CONFIG.tileHex, CONFIG.tileAlpha)
  foot.setPadding(7, 12, 7, 12)

  const rIcon = SFSymbol.named("dot.radiowaves.left.and.right")
  if (rIcon) {
    rIcon.applyFont(Font.mediumSystemFont(10))
    const ri = foot.addImage(rIcon.image)
    ri.imageSize = new Size(12, 12)
    ri.tintColor = TEXT
    foot.addSpacer(5)
  }

  const label = foot.addText("RADAR")
  label.font = Font.boldSystemFont(10)
  label.textColor = TEXT

  foot.addSpacer(5)

  const when = foot.addText(radar.status ? radar.timeText + "  " + DOT + "  " + radar.status : radar.timeText)
  when.font = Font.mediumSystemFont(10)
  when.textColor = dim(0.55)
  when.lineLimit = 1
  when.minimumScaleFactor = 0.7

  foot.addSpacer()

  const credit = foot.addText(radar.credit + " " + DOT + " " + COPY + " OSM " + DOT + " " + COPY + " CARTO")
  credit.font = Font.regularSystemFont(7.5)
  credit.textColor = dim(0.4)
  credit.lineLimit = 1
  credit.minimumScaleFactor = 0.7

  return w
}

// ---------------- RADAR MAP ----------------
async function getRadarMap(loc) {
  const cached = (why) => ({
    image: fm.fileExists(MAP_CACHE) ? fm.readImage(MAP_CACHE) : null,
    timeText: fm.fileExists(TIME_CACHE) ? fm.readString(TIME_CACHE) : "--",
    status: why,
    credit: "Radar",
  })

  // Canvas at 3x a large widget; iOS scales it to fill
  const S = 3
  const CW = 364 * S, CH = 382 * S
  const inUS = loc.latitude > 18 && loc.latitude < 55 && loc.longitude > -135 && loc.longitude < -60
  let order = ["rainviewer"]
  if (CONFIG.radarSource === "noaa") order = ["noaa"]
  else if (CONFIG.radarSource === "auto" && inUS) order = ["noaa", "rainviewer"]

  // RainViewer stops at zoom 7, NOAA tiles go closer
  const wantZ = Math.max(1, Math.min(10, CONFIG.zoom))
  let radar = null
  let Z = wantZ
  for (const src of order) {
    Z = src === "rainviewer" ? Math.min(7, wantZ) : wantZ
    const grid = tileGrid(loc, Z, S, CW, CH)
    radar = src === "noaa" ? await noaaTiles(grid, Z) : await rainviewerTiles(grid, Z)
    if (radar && radar.tiles.some(t => t.img)) break
    console.log(src + " radar failed, trying next source")
  }

  const grid = tileGrid(loc, Z, S, CW, CH)
  const subs = ["a", "b", "c", "d"]
  const bases = await Promise.all(grid.map(g =>
    loadTile("https://" + subs[(g.x + g.y) % 4] + ".basemaps.cartocdn.com/dark_all/" + Z + "/" + g.x + "/" + g.y + "@2x.png")
  ))

  const radarTiles = radar ? radar.tiles.filter(t => t.img) : []
  const baseCount = bases.filter(b => b).length
  console.log("Map tiles: " + baseCount + "/" + grid.length + ", radar tiles: " + radarTiles.length + "/" + grid.length)
  radarTiles.forEach(t => console.log("radar tile bytes: " + t.bytes))
  if (!baseCount && !radarTiles.length) return cached("Offline")

  let status = null
  if (!radarTiles.length) status = "Radar unavailable"
  else if (radarTiles.every(t => t.bytes < radar.emptyBytes)) status = "No rain in view"
  else if (!baseCount) status = "Map unavailable"

  const ctx = new DrawContext()
  ctx.size = new Size(CW, CH)
  ctx.respectScreenScale = false
  ctx.opaque = true

  ctx.setFillColor(new Color(CONFIG.bgBottomHex))
  ctx.fillRect(new Rect(0, 0, CW, CH))

  grid.forEach((g, i) => { if (bases[i]) ctx.drawImageInRect(bases[i].img, g.rect) })
  if (radar) grid.forEach((g, i) => { const t = radar.tiles[i]; if (t && t.img) ctx.drawImageInRect(t.img, g.rect) })

  // Fade the top and bottom so the tiles read cleanly
  fadeBand(ctx, 0, CH * 0.3, CW, 0.55, true)
  fadeBand(ctx, CH * 0.82, CH * 0.18, CW, 0.5, false)

  // You-are-here marker
  const mx = CW / 2, my = CH / 2
  ctx.setFillColor(new Color("#FFFFFF", 0.18))
  ctx.fillEllipse(new Rect(mx - 30, my - 30, 60, 60))
  ctx.setFillColor(new Color(CONFIG.bgBottomHex))
  ctx.fillEllipse(new Rect(mx - 15, my - 15, 30, 30))
  ctx.setFillColor(TEXT)
  ctx.fillEllipse(new Rect(mx - 10, my - 10, 20, 20))

  const image = ctx.getImage()

  const df = new DateFormatter()
  df.dateFormat = "h:mm a"
  const timeText = df.string(radar && radar.time ? radar.time : new Date())

  try {
    fm.writeImage(MAP_CACHE, image)
    fm.writeString(TIME_CACHE, timeText)
  } catch (e) {}

  return { image, timeText, status, credit: radar ? radar.credit : "Radar" }
}

// Which map tiles cover the widget, and where each one goes
function tileGrid(loc, Z, S, CW, CH) {
  const n = Math.pow(2, Z)
  const tilePx = 256 * S
  const worldPx = n * tilePx
  const latRad = loc.latitude * Math.PI / 180
  const cx = (loc.longitude + 180) / 360 * worldPx
  const cy = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * worldPx
  const left = cx - CW / 2
  const topY = cy - CH / 2
  const x0 = Math.floor(left / tilePx), x1 = Math.floor((left + CW - 1) / tilePx)
  const y0 = Math.floor(topY / tilePx), y1 = Math.floor((topY + CH - 1) / tilePx)
  const grid = []
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (ty < 0 || ty >= n) continue
      grid.push({
        x: ((tx % n) + n) % n,
        y: ty,
        rect: new Rect(tx * tilePx - left, ty * tilePx - topY, tilePx, tilePx),
      })
    }
  }
  return grid
}

// NOAA NEXRAD base reflectivity mosaic, served by Iowa Environmental Mesonet
async function noaaTiles(grid, Z) {
  const bust = Math.floor(Date.now() / 300000)
  for (const layer of ["nexrad-n0q-900913", "nexrad-n0q"]) {
    const tiles = await Promise.all(grid.map(g =>
      loadTile("https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/" + layer + "/" + Z + "/" + g.x + "/" + g.y + ".png?" + bust)
    ))
    if (tiles.some(t => t)) {
      return { tiles: tiles.map(t => t || {}), credit: "NOAA " + DOT + " IEM", emptyBytes: 400, time: new Date() }
    }
  }
  return null
}

// RainViewer fallback (works worldwide, max zoom 7)
async function rainviewerTiles(grid, Z) {
  let meta
  try {
    const req = new Request("https://api.rainviewer.com/public/weather-maps.json")
    req.timeoutInterval = 10
    meta = await req.loadJSON()
  } catch (e) {
    console.log("RainViewer meta: " + e)
    return null
  }
  const frames = (meta && meta.radar && meta.radar.past) || []
  if (!meta.host || !frames.length) return null
  const frame = frames[frames.length - 1]
  const opts = (CONFIG.smooth ? "1" : "0") + "_" + (CONFIG.showSnow ? "1" : "0")
  const tiles = await Promise.all(grid.map(g =>
    loadTile(meta.host + frame.path + "/512/" + Z + "/" + g.x + "/" + g.y + "/" + CONFIG.radarColor + "/" + opts + ".png")
  ))
  return { tiles: tiles.map(t => t || {}), credit: "RainViewer", emptyBytes: 1500, time: new Date(frame.time * 1000) }
}

function fadeBand(ctx, y, h, W, maxAlpha, fromTop) {
  const steps = 30
  for (let i = 0; i < steps; i++) {
    const t = i / steps
    const a = maxAlpha * Math.pow(fromTop ? 1 - t : t, 2)
    ctx.setFillColor(new Color("#000000", a))
    ctx.fillRect(new Rect(0, y + (h / steps) * i, W, h / steps + 1))
  }
}

async function loadTile(url) {
  try {
    const req = new Request(url)
    req.timeoutInterval = 10
    const data = await req.load()
    const code = req.response ? req.response.statusCode : 0
    if (code !== 200 || !data) {
      console.log("tile " + code + ": " + url)
      return null
    }
    const img = Image.fromData(data)
    if (!img) return null
    const bytes = Math.floor(data.toBase64String().length * 3 / 4)
    return { img, bytes }
  } catch (e) {
    console.log("tile error: " + url + " " + e)
    return null
  }
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

async function getWeather(loc) {
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
    return { place: (loc.name || "-").toUpperCase(), temp: "--" + DEG, condition: "Unavailable", hiLo: "", symbol: "cloud" }
  }

  const code = data.current.weather_code
  const isDay = data.current.is_day === 1
  const [label, daySym, nightSym] = wmo(code)
  const r = (v) => Math.round(v)
  return {
    place: (loc.name || "Current location").toUpperCase(),
    temp: r(data.current.temperature_2m) + DEG,
    condition: label,
    hiLo: "H " + r(data.daily.temperature_2m_max[0]) + DEG + "   L " + r(data.daily.temperature_2m_min[0]) + DEG,
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
