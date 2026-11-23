// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: cloud-sun-rain;

/*
  MINIMAL WEATHER RADAR
  Large widget for Scriptable, styled to match the AI Launcher.

  Radar map centered on your location, with a location tile on top and
  a scan time tile at the bottom. Built the same way as the radar
  script that worked: RainViewer 256px radar tiles drawn on a dark
  background with US state outlines (us-atlas), no separate base map.

  Radar:  RainViewer (free, no API key, max zoom 7)
  Lines:  us-atlas state outlines via jsDelivr (downloaded once, then saved)
*/

// ---------------- CONFIG ----------------
const CONFIG = {
  bgHex: "#1B1A20",           // map background
  tileHex: "#24232A",
  tileAlpha: 0.9,
  tileRadius: 13,
  textHex: "#F2F0F6",
  lineHex: "#8A8796",         // state outline color
  zoom: 7,                    // 3 to 7 (7 is closest)
  refreshMinutes: 15,
  // To test, center the map somewhere it is raining, e.g.
  // testLocation: { latitude: 47.61, longitude: -122.33, name: "Seattle" },
  testLocation: null,
  fallbackLocation: { latitude: 40.7128, longitude: -74.006, name: "New York" },
}
// ----------------------------------------

const TEXT = new Color(CONFIG.textHex)
const dim = (a) => new Color(CONFIG.textHex, a)

// Map canvas: a large widget at 2x, iOS scales it to fill
const S = 2
const WIDTH = 364 * S
const HEIGHT = 382 * S
const TILE = 256

const fm = FileManager.local()
const DIR = fm.joinPath(fm.documentsDirectory(), "minimal-weather-radar")
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true)
const LOC_CACHE = fm.joinPath(DIR, "location.json")
const ATLAS_CACHE = fm.joinPath(DIR, "us-states.json")

// ---------------- ENTRY POINT ----------------
const widget = await buildWidget()
if (config.runsInApp) await widget.presentLarge()
else Script.setWidget(widget)
Script.complete()

// ---------------- WIDGET ----------------
async function buildWidget() {
  const loc = CONFIG.testLocation || await getLocation()
  const place = { lat: loc.latitude, lon: loc.longitude, zoom: Math.max(3, Math.min(7, CONFIG.zoom)) }
  const radar = await loadRadar(place)

  const w = new ListWidget()
  w.backgroundColor = new Color(CONFIG.bgHex)
  if (radar) w.backgroundImage = radar.image
  w.setPadding(12, 14, 12, 14)
  w.url = "weather://"   // tap opens the Apple Weather app
  w.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000)

  // Title tile: green "online" dot + Radar on the left, location on the right
  const head = w.addStack()
  head.layoutHorizontally()
  head.centerAlignContent()
  head.cornerRadius = CONFIG.tileRadius
  head.backgroundColor = new Color(CONFIG.tileHex, CONFIG.tileAlpha)
  head.setPadding(9, 12, 9, 12)

  const glow = head.addStack()
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

  head.addSpacer(7)

  const title = head.addText("Radar")
  title.font = Font.semiboldSystemFont(13)
  title.textColor = TEXT
  title.lineLimit = 1

  head.addSpacer()

  const pin = SFSymbol.named("location.fill")
  if (pin) {
    pin.applyFont(Font.mediumSystemFont(11))
    const pi = head.addImage(pin.image)
    pi.imageSize = new Size(10, 10)
    pi.tintColor = dim(0.7)
    head.addSpacer(5)
  }

  const name = head.addText((loc.name || "Current location").toUpperCase())
  name.font = Font.semiboldSystemFont(10)
  name.textColor = dim(0.7)
  name.lineLimit = 1
  name.minimumScaleFactor = 0.7

  w.addSpacer()

  // Scan time tile
  const foot = w.addStack()
  foot.layoutHorizontally()
  foot.centerAlignContent()
  foot.cornerRadius = CONFIG.tileRadius
  foot.backgroundColor = new Color(CONFIG.tileHex, CONFIG.tileAlpha)
  foot.setPadding(7, 12, 7, 12)

  const clock = new DateFormatter()
  clock.locale = Device.locale()
  clock.useNoDateStyle()
  clock.useShortTimeStyle()

  let status = "Unavailable"
  if (radar) {
    const scan = new Date(radar.time * 1000)
    const stale = Date.now() - scan.getTime() > 30 * 60 * 1000
    status = (stale ? "Old scan " : radar.cached ? "Saved " : "Scan ") + clock.string(scan)
  }
  const when = foot.addText(status)
  when.font = Font.mediumSystemFont(10)
  when.textColor = dim(0.55)
  when.lineLimit = 1
  when.minimumScaleFactor = 0.7

  foot.addSpacer()

  const credit = foot.addText("Weather data by RainViewer")
  credit.font = Font.regularSystemFont(7.5)
  credit.textColor = dim(0.4)
  credit.lineLimit = 1
  credit.minimumScaleFactor = 0.7

  return w
}

// ---------------- RADAR ----------------
function request(url) {
  const req = new Request(url)
  req.timeoutInterval = 9
  return req
}

function project(lat, lon, world) {
  const phi = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180
  return {
    x: (lon + 180) / 360 * world,
    y: (1 - Math.asinh(Math.tan(phi)) / Math.PI) * world / 2,
  }
}

async function loadAtlas() {
  try {
    if (fm.fileExists(ATLAS_CACHE)) return JSON.parse(fm.readString(ATLAS_CACHE))
    const atlas = await request("https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json").loadJSON()
    if (!atlas.arcs || !atlas.transform) return null
    fm.writeString(ATLAS_CACHE, JSON.stringify(atlas))
    return atlas
  } catch (error) {
    console.log("State outlines: " + error)
    return null
  }
}

// Map math runs in 1x map units, then everything is scaled by S onto the canvas
function drawStateLines(canvas, atlas, world, left, top) {
  if (!atlas) return
  const { scale, translate } = atlas.transform
  const w = WIDTH / S, h = HEIGHT / S
  const path = new Path()

  for (const arc of atlas.arcs) {
    let lon = 0
    let lat = 0
    let previous

    for (const [dx, dy] of arc) {
      lon += dx
      lat += dy
      const point = project(lat * scale[1] + translate[1], lon * scale[0] + translate[0], world)
      const x = point.x + Math.round((left + w / 2 - point.x) / world) * world - left
      const y = point.y - top

      if (previous && Math.abs(x - previous.x) < world / 2 &&
          Math.max(x, previous.x) >= 0 && Math.min(x, previous.x) <= w &&
          Math.max(y, previous.y) >= 0 && Math.min(y, previous.y) <= h) {
        path.move(new Point(previous.x * S, previous.y * S))
        path.addLine(new Point(x * S, y * S))
      }
      previous = { x, y }
    }
  }

  canvas.addPath(path)
  canvas.setStrokeColor(new Color(CONFIG.lineHex, 0.6))
  canvas.setLineWidth(0.65 * S)
  canvas.strokePath()
}

async function radarImage(place, frame, host, atlas) {
  const w = WIDTH / S, h = HEIGHT / S
  const count = 2 ** place.zoom
  const world = count * TILE
  const center = project(place.lat, place.lon, world)
  const left = center.x - w / 2
  const top = center.y - h / 2
  const tiles = []

  for (let y = Math.floor(top / TILE); y <= Math.floor((top + h - 1) / TILE); y++) {
    if (y < 0 || y >= count) continue
    for (let x = Math.floor(left / TILE); x <= Math.floor((left + w - 1) / TILE); x++) {
      const wrapX = (x % count + count) % count
      const url = host + frame.path + "/256/" + place.zoom + "/" + wrapX + "/" + y + "/2/1_1.png"
      tiles.push({ url, x: x * TILE - left, y: y * TILE - top })
    }
  }

  const images = await Promise.all(tiles.map(tile => request(tile.url).loadImage()))
  const canvas = new DrawContext()
  canvas.size = new Size(WIDTH, HEIGHT)
  canvas.opaque = true
  canvas.respectScreenScale = false
  canvas.setFillColor(new Color(CONFIG.bgHex))
  canvas.fillRect(new Rect(0, 0, WIDTH, HEIGHT))

  tiles.forEach((tile, i) => {
    canvas.drawImageInRect(images[i], new Rect(tile.x * S, tile.y * S, TILE * S, TILE * S))
  })
  drawStateLines(canvas, atlas, world, left, top)

  // You-are-here marker
  const x = WIDTH / 2
  const y = HEIGHT / 2
  canvas.setFillColor(new Color(CONFIG.bgHex, 0.86))
  canvas.fillEllipse(new Rect(x - 7 * S, y - 7 * S, 14 * S, 14 * S))
  canvas.setStrokeColor(dim(0.8))
  canvas.setLineWidth(1.2 * S)
  canvas.strokeEllipse(new Rect(x - 6 * S, y - 6 * S, 12 * S, 12 * S))
  canvas.setFillColor(TEXT)
  canvas.fillEllipse(new Rect(x - 2 * S, y - 2 * S, 4 * S, 4 * S))
  return canvas.getImage()
}

async function loadRadar(place) {
  const path = fm.joinPath(DIR, [place.lat.toFixed(4), place.lon.toFixed(4), place.zoom].join("_") + ".json")
  let cached

  try {
    if (fm.fileExists(path)) cached = JSON.parse(fm.readString(path))
  } catch (error) {
    console.log(error)
  }

  try {
    const [meta, atlas] = await Promise.all([
      request("https://api.rainviewer.com/public/weather-maps.json").loadJSON(),
      loadAtlas(),
    ])
    const frames = (meta.radar && meta.radar.past) || []
    const frame = frames[frames.length - 1]

    if (!frame || !frame.path || !frame.time || !meta.host || !meta.host.startsWith("https://")) {
      throw new Error("No radar scan returned.")
    }

    const hasOutlines = Boolean(atlas)
    if (cached && cached.time === frame.time && cached.hasOutlines === hasOutlines) {
      const image = Image.fromData(Data.fromBase64String(cached.png))
      if (image) return { image, time: frame.time, cached: false }
    }

    const image = await radarImage(place, frame, meta.host, atlas)
    try {
      const png = Data.fromPNG(image).toBase64String()
      fm.writeString(path, JSON.stringify({ time: frame.time, png, hasOutlines }))
    } catch (error) {
      console.log("Radar cache: " + error)
    }
    return { image, time: frame.time, cached: false }
  } catch (error) {
    console.log("Radar: " + error)
    if (cached && cached.png) {
      const image = Image.fromData(Data.fromBase64String(cached.png))
      if (image) return { image, time: cached.time, cached: true }
    }
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
