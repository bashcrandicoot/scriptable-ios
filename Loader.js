// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: cloud-download-alt;

// GITHUB LOADER
// Runs the latest version of a widget script from your GitHub repo.
// Put the script's file name (without .js) in the widget's Parameter
// field, e.g. Weather-Radar. Keeps a copy so it still works offline.

const USER = "bashcrandicoot"
const REPO = "scriptable-ios"
const BRANCH = "main"
const FOLDER = ""                 // e.g. "widgets/" if the files are in a folder
const DEFAULT = "Weather-Radar"   // used when you run it inside Scriptable

const name = ((args.widgetParameter || DEFAULT) + "").trim().replace(/\.js$/, "")
const url = "https://raw.githubusercontent.com/" + USER + "/" + REPO + "/" + BRANCH + "/" + FOLDER + encodeURIComponent(name) + ".js"

const lfm = FileManager.local()
const dir = lfm.joinPath(lfm.documentsDirectory(), "github-cache")
if (!lfm.fileExists(dir)) lfm.createDirectory(dir, true)
const cachePath = lfm.joinPath(dir, name + ".js")

let source = null
try {
  const req = new Request(url)
  req.timeoutInterval = 10
  const text = await req.loadString()
  if (req.response.statusCode !== 200) throw new Error("HTTP " + req.response.statusCode + " for " + url)
  source = text
  lfm.writeString(cachePath, source)
} catch (e) {
  console.log("Download failed, using saved copy: " + e)
  if (lfm.fileExists(cachePath)) source = lfm.readString(cachePath)
}

if (source) {
  await eval("(async () => {\n" + source + "\n})()")
} else {
  const w = new ListWidget()
  w.backgroundColor = new Color("#1B1A20")
  const t = w.addText("Couldn't load " + name + ".js from GitHub")
  t.textColor = new Color("#F2F0F6")
  t.font = Font.mediumSystemFont(12)
  Script.setWidget(w)
  if (config.runsInApp) await w.presentSmall()
  Script.complete()
}
