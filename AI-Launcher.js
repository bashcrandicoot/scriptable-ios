// Medium Scriptable widget with five app icons in one row.
// Run once inside Scriptable to download the official App Store icons.
// Each icon opens its app directly via URL scheme.
// If an app's url is "", that icon falls back to its Shortcut.

const apps = [
  { name: "Grok Bot", url: "grokbot://",      shortcut: "Open Grok Bot", id: 6794501026, fallback: "bolt.fill" },
  { name: "Muse",     url: "hatch://",        shortcut: "Open Muse",     id: 6760173601, fallback: "wand.and.stars" },
  { name: "ChatGPT",  url: "chatgpt://",      shortcut: "Open ChatGPT",  id: 6448311069, fallback: "bubble.left.fill" },
  { name: "Gemini",   url: "googlegemini://", shortcut: "Open Gemini",   id: 6477489729, fallback: "sparkles" },
  { name: "Claude",   url: "claude://",       shortcut: "Open Claude",   id: 6473753684, fallback: "asterisk" },
];

const TILE = 48;
const RADIUS = 12;

function tapURL(app) {
  if (app.url) return app.url;
  return `shortcuts://run-shortcut?name=${encodeURIComponent(app.shortcut)}`;
}

const files = FileManager.local();
const cache = files.joinPath(files.documentsDirectory(), "AI-Launcher-Icons");
if (!files.fileExists(cache)) files.createDirectory(cache, true);

async function loadIcon(app) {
  const path = files.joinPath(cache, `${app.id}.img`);

  if (files.fileExists(path)) {
    const cached = files.readImage(path);
    if (cached) return cached;
  }

  if (!config.runsInApp) return null;

  let artwork;
  try {
    const lookup = new Request(`https://itunes.apple.com/lookup?country=us&id=${app.id}`);
    lookup.timeoutInterval = 8;
    const data = await lookup.loadJSON();
    artwork = data.results?.[0]?.artworkUrl512 || data.results?.[0]?.artworkUrl100;
  } catch (error) {
    console.log(`${app.name} artwork lookup: ${error}`);
  }

  try {
    if (!artwork) {
      const store = new Request(`https://apps.apple.com/us/app/id${app.id}`);
      store.timeoutInterval = 8;
      const html = await store.loadString();
      const tags = html.match(/<meta\b[^>]*>/gi) || [];
      const tag = tags.find(t => /\bproperty=["']og:image["']/i.test(t));
      artwork = tag?.match(/\bcontent=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&");
    }

    if (!artwork?.startsWith("https://")) return null;

    const request = new Request(artwork);
    request.timeoutInterval = 8;
    const icon = await request.loadImage();
    files.writeImage(path, icon);
    return icon;
  } catch (error) {
    console.log(`${app.name} icon: ${error}`);
    return null;
  }
}

const widget = new ListWidget();
widget.setPadding(12, 10, 12, 10);

const background = new LinearGradient();
background.colors = [new Color("1B1A20"), new Color("0A0A0D")];
background.locations = [0, 1];
background.startPoint = new Point(0, 0);
background.endPoint = new Point(1, 1);
widget.backgroundGradient = background;

const icons = await Promise.all(apps.map(loadIcon));

widget.addSpacer();

const row = widget.addStack();
row.layoutHorizontally();
row.centerAlignContent();
row.addSpacer();

apps.forEach((app, index) => {
  const tile = row.addStack();
  tile.size = new Size(TILE, TILE);
  tile.cornerRadius = RADIUS;
  tile.backgroundColor = new Color("24232A");
  tile.setPadding(0, 0, 0, 0);
  tile.centerAlignContent();
  tile.url = tapURL(app);

  const icon = icons[index];
  if (!icon) tile.addSpacer();

  const image = tile.addImage(icon || SFSymbol.named(app.fallback).image);
  image.imageSize = icon ? new Size(TILE, TILE) : new Size(23, 23);
  image.cornerRadius = RADIUS;

  if (!icon) {
    image.tintColor = new Color("F2F0F6");
    tile.addSpacer();
  }

  row.addSpacer();
});

widget.addSpacer();

Script.setWidget(widget);
if (config.runsInApp) await widget.presentMedium();
Script.complete();
