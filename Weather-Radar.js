// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: cloud-sun-rain;

/*
  MINIMAL WEATHER RADAR
  Large widget for Scriptable, styled to match the AI Launcher.

  Full-bleed radar image with a location tile on top and a radar
  time tile at the bottom.

  Radar (tried in this order, all free with no key):
    1. NWS: the ready-made image from your nearest NOAA radar station
       (radar.weather.gov), US only
    2. NOAA NEXRAD mosaic tiles via Iowa Environmental Mesonet, US only
    3. RainViewer tiles, worldwide
  Map for 2 and 3: CARTO dark basemap, OpenStreetMap data

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
  radarSource: "auto",        // "auto", "nws", "noaa" (US only) or "rainviewer"
  zoom: 7,                    // tiles only: 6 = wider area, 8 = closer (8+ NOAA only)
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
const DOT = String.fromCharCode(183)
const COPY = String.fromCharCode(169)
const DIAG = []   // short notes on what failed, shown in the bottom tile
let lastTileError = ""
const note = (m) => { console.log(m); if (DIAG.length < 3) DIAG.push(m) }

const fm = FileManager.local()
const DIR = fm.joinPath(fm.documentsDirectory(), "minimal-weather-radar")
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true)
const LOC_CACHE = fm.joinPath(DIR, "location.json")
const STATION_CACHE = fm.joinPath(DIR, "station.json")
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
  const radar = await getRadarMap(loc)

  const w = new ListWidget()
  w.setPadding(12, 14, 12, 14)
  w.url = radar.station ? "https://radar.weather.gov/station/" + radar.station + "/standard" : "weather://"
  w.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000)

  const bg = new LinearGradient()
  bg.colors = [new Color(CONFIG.bgTopHex), new Color(CONFIG.bgBottomHex)]
  bg.locations = [0, 1]
  bg.startPoint = new Point(0, 0)
  bg.endPoint = new Point(1, 1)
  w.backgroundGradient = bg
  if (radar.image) w.backgroundImage = radar.image

  // Location tile
  const head = w.addStack()
  head.layoutHorizontally()
  head.centerAlignContent()
  head.cornerRadius = CONFIG.tileRadius
  head.backgroundColor = new Color(CONFIG.tileHex, CONFIG.tileAlpha)
  head.setPadding(9, 12, 9, 12)

  const pin = SFSymbol.named("location.fill")
  if (pin) {
    pin.applyFont(Font.mediumSystemFont(11))
    const pi = head.addImage(pin.image)
    pi.imageSize = new Size(12, 12)
    pi.tintColor = TEXT
    head.addSpacer(6)
  }

  const place = head.addText((loc.name || "Current location").toUpperCase())
  place.font = Font.semiboldSystemFont(12)
  place.textColor = TEXT
  place.lineLimit = 1
  place.minimumScaleFactor = 0.7

  head.addSpacer()

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

  let whenText = radar.timeText
  if (radar.status) whenText += "  " + DOT + "  " + radar.status
  if (!radar.station && DIAG.length) whenText += "  " + DOT + "  " + DIAG.join(", ")
  const when = foot.addText(whenText)
  when.font = Font.mediumSystemFont(10)
  when.textColor = dim(0.55)
  when.lineLimit = 1
  when.minimumScaleFactor = 0.7

  foot.addSpacer()

  const creditText = radar.station ? radar.credit : radar.credit + " " + DOT + " " + COPY + " OSM " + DOT + " " + COPY + " CARTO"
  const credit = foot.addText(creditText)
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

  // 1. NWS station image (map and radar in one picture)
  if ((CONFIG.radarSource === "auto" && inUS) || CONFIG.radarSource === "nws") {
    const nws = await nwsRadar(loc, CW, CH)
    if (nws) return nws
    console.log("NWS radar failed, trying tiles")
  }

  // 2 and 3. Radar tiles on a dark map
  let order = ["rainviewer"]
  if (CONFIG.radarSource === "noaa") order = ["noaa"]
  else if ((CONFIG.radarSource === "auto" || CONFIG.radarSource === "nws") && inUS) order = ["noaa", "rainviewer"]

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
  if (!radarTiles.length) status = "Radar tiles " + (lastTileError || "failed")
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

// NWS "standard" radar image for the nearest radar station
async function nwsRadar(loc, CW, CH) {
  const station = await nwsStation(loc)
  if (!station) return null

  const url = "https://radar.weather.gov/ridge/standard/" + station + "_0.gif?" + Math.floor(Date.now() / 120000)
  const t = await loadTile(url)
  if (!t) {
    note("NWS image " + lastTileError)
    return null
  }

  const ctx = new DrawContext()
  ctx.size = new Size(CW, CH)
  ctx.respectScreenScale = false
  ctx.opaque = true
  ctx.setFillColor(new Color(CONFIG.bgBottomHex))
  ctx.fillRect(new Rect(0, 0, CW, CH))

  // Scale to fill the widget, centered
  const iw = t.img.size.width, ih = t.img.size.height
  const scale = Math.max(CW / iw, CH / ih)
  const dw = iw * scale, dh = ih * scale
  ctx.drawImageInRect(t.img, new Rect((CW - dw) / 2, (CH - dh) / 2, dw, dh))

  fadeBand(ctx, 0, CH * 0.22, CW, 0.6, true)
  fadeBand(ctx, CH * 0.82, CH * 0.18, CW, 0.6, false)

  const image = ctx.getImage()
  const df = new DateFormatter()
  df.dateFormat = "h:mm a"
  const timeText = df.string(new Date())
  try {
    fm.writeImage(MAP_CACHE, image)
    fm.writeString(TIME_CACHE, timeText)
  } catch (e) {}

  console.log("NWS radar " + station + ": " + iw + "x" + ih + ", " + t.bytes + " bytes")
  return { image, timeText, status: null, credit: "NWS " + station, station }
}

// Nearest radar station for this spot, from api.weather.gov (saved between runs)
async function nwsStation(loc) {
  const key = loc.latitude.toFixed(2) + "," + loc.longitude.toFixed(2)
  try {
    if (fm.fileExists(STATION_CACHE)) {
      const c = JSON.parse(fm.readString(STATION_CACHE))
      if (c.key === key && c.station) return c.station
    }
  } catch (e) {}

  try {
    const req = new Request("https://api.weather.gov/points/" + loc.latitude.toFixed(4) + "," + loc.longitude.toFixed(4))
    req.headers = { "User-Agent": "(scriptable-ios radar widget)", "Accept": "application/geo+json" }
    req.timeoutInterval = 10
    const data = await req.loadJSON()
    const station = data && data.properties && data.properties.radarStation
    if (!station) {
      note("NWS: no station")
      return null
    }
    fm.writeString(STATION_CACHE, JSON.stringify({ key, station }))
    return station
  } catch (e) {
    note("NWS lookup failed")
    console.log("NWS points lookup: " + e)
    return null
  }
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
      lastTileError = "HTTP " + code
      return null
    }
    const img = Image.fromData(data)
    if (!img) {
      lastTileError = "bad image"
      return null
    }
    const bytes = Math.floor(data.toBase64String().length * 3 / 4)
    return { img, bytes }
  } catch (e) {
    console.log("tile error: " + url + " " + e)
    lastTileError = "no connection"
    return null
  }
}

// ---------------- LOCATION ----------------
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
