// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: th-large;

// HUB (GitHub loader)
// Runs the latest Hub.js from your GitHub repo.
// No widget Parameter needed. Keeps a copy so it still works offline.

const USER = "bashcrandicoot"
const REPO = "scriptable-ios"
const BRANCH = "main"
const FOLDER = ""
const name = "Hub"
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
  if (config.runsInApp) await w.presentMedium()
  Script.complete()
}
