// Medium Scriptable widget: "Agent Hub" title with a green online dot,
// and six app icons in two rows of three.
// Run once inside Scriptable to download the icons (App Store artwork for
// apps, the site's home screen icon for web apps).
// Each icon opens its app directly via URL scheme. Web apps open their
// address (iOS opens it in Safari; widgets can't launch a home screen web
// app directly). If an app's url is "", that icon falls back to its Shortcut.

const apps = [
  { name: "Grok Bot", url: "grokbot://",      shortcut: "Open Grok Bot", id: 6794501026, fallback: "bolt.fill" },
  { name: "Muse",     url: "hatch://",        shortcut: "Open Muse",     id: 6760173601, fallback: "wand.and.stars" },
  { name: "ChatGPT",  url: "chatgpt://",      shortcut: "Open ChatGPT",  id: 6448311069, fallback: "bubble.left.fill" },
  { name: "Gemini",   url: "googlegemini://", shortcut: "Open Gemini",   id: 6477489729, fallback: "sparkles" },
  { name: "Claude",   url: "claude://",       shortcut: "Open Claude",   id: 6473753684, fallback: "asterisk" },
  // Web app: change url/site to the exact address you saved to your Home Screen
  { name: "Antigravity", url: "https://antigravity.google", site: "https://antigravity.google", shortcut: "Open Antigravity", id: "antigravity", fallback: "arrow.up.circle.fill" },
];

const PER_ROW = 3;

const TILE = 46;
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

  if (app.site) return await loadWebIcon(app, path);

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

// Scriptable has no URL class, so resolve links by hand
function resolveURL(href, base) {
  if (/^https?:\/\//i.test(href)) return href;
  const origin = base.match(/^https?:\/\/[^/]+/i)[0];
  if (href.startsWith("//")) return "https:" + href;
  if (href.startsWith("/")) return origin + href;
  const dir = base.replace(/[?#].*$/, "").replace(/[^/]*$/, "");
  return (dir.length > origin.length ? dir : origin + "/") + href;
}

// Home screen icon for a web app: the page's apple-touch-icon, then the
// standard /apple-touch-icon.png, then its largest favicon
async function loadWebIcon(app, path) {
  const candidates = [];
  try {
    const page = new Request(app.site);
    page.timeoutInterval = 8;
    const html = await page.loadString();
    const links = html.match(/<link\b[^>]*>/gi) || [];
    const href = (re) => {
      const tag = links.find(t => re.test(t));
      return tag?.match(/\bhref=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&");
    };
    const touch = href(/\brel=["'][^"']*apple-touch-icon[^"']*["']/i);
    const fav = href(/\brel=["'][^"']*\bicon\b[^"']*["']/i);
    for (const h of [touch, fav]) if (h) candidates.push(resolveURL(h, app.site));
  } catch (error) {
    console.log(`${app.name} page: ${error}`);
  }
  candidates.push(resolveURL("/apple-touch-icon.png", app.site));

  for (const url of candidates) {
    try {
      const req = new Request(url);
      req.timeoutInterval = 8;
      const icon = await req.loadImage();
      if (icon && icon.size.width >= 32) {
        files.writeImage(path, icon);
        return icon;
      }
    } catch (error) {
      console.log(`${app.name} icon ${url}: ${error}`);
    }
  }
  return null;
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

// Title row: green "online" dot + Agent Hub
const header = widget.addStack();
header.layoutHorizontally();
header.centerAlignContent();
header.setPadding(0, 6, 0, 6);

const glow = header.addStack();
glow.size = new Size(12, 12);
glow.cornerRadius = 6;
glow.backgroundColor = new Color("30D158", 0.25);
glow.centerAlignContent();
glow.layoutHorizontally();
glow.addSpacer();
const dot = glow.addStack();
dot.size = new Size(7, 7);
dot.cornerRadius = 3.5;
dot.backgroundColor = new Color("30D158");
glow.addSpacer();

header.addSpacer(7);

const title = header.addText("Agent Hub");
title.font = Font.semiboldSystemFont(13);
title.textColor = new Color("F2F0F6");
title.lineLimit = 1;

header.addSpacer();

widget.addSpacer();

// Icons: rows of PER_ROW, spread evenly
for (let r = 0; r * PER_ROW < apps.length; r++) {
  if (r > 0) widget.addSpacer(10);
  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.addSpacer();

  apps.slice(r * PER_ROW, r * PER_ROW + PER_ROW).forEach((app, i) => {
    const index = r * PER_ROW + i;
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
    image.imageSize = icon ? new Size(TILE, TILE) : new Size(22, 22);
    image.cornerRadius = RADIUS;

    if (!icon) {
      image.tintColor = new Color("F2F0F6");
      tile.addSpacer();
    }

    row.addSpacer();
  });
}

widget.addSpacer();

Script.setWidget(widget);
if (config.runsInApp) await widget.presentMedium();
Script.complete();
