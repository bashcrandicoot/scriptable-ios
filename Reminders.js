// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: tasks;

/*
  MINIMAL REMINDERS
  Medium widget (4x2) for Scriptable, styled to match the AI Launcher.

  Green online dot + "Reminders" title with the open count, then your
  next open reminders: overdue first, then by due date, then undated
  ones by priority. Tap the widget to open the Reminders app.

  The first run asks for access to Reminders. Run it once inside
  Scriptable and tap Allow.
*/

// ---------------- CONFIG ----------------
const CONFIG = {
  bgTopHex: "#1B1A20",
  bgBottomHex: "#0A0A0D",
  tileHex: "#24232A",
  tileRadius: 13,
  textHex: "#F2F0F6",
  dotHex: "#30D158",          // green online dot
  overdueHex: "#FF6B6B",      // overdue due dates
  maxRows: 4,                 // reminders shown (4 fits a medium widget)
  lists: [],                  // only these lists, e.g. ["Work", "Home"]; empty = all lists
  refreshMinutes: 15,
}
// ----------------------------------------

const TEXT = new Color(CONFIG.textHex)
const dim = (a) => new Color(CONFIG.textHex, a)
const DOT = String.fromCharCode(183)

// ---------------- ENTRY POINT ----------------
const widget = await buildWidget()
if (config.runsInApp) await widget.presentMedium()
else Script.setWidget(widget)
Script.complete()

// ---------------- WIDGET ----------------
async function buildWidget() {
  const { items, error } = await loadReminders()

  const w = new ListWidget()
  w.setPadding(12, 14, 12, 14)
  w.url = "x-apple-reminderkit://"
  w.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000)

  const bg = new LinearGradient()
  bg.colors = [new Color(CONFIG.bgTopHex), new Color(CONFIG.bgBottomHex)]
  bg.locations = [0, 1]
  bg.startPoint = new Point(0, 0)
  bg.endPoint = new Point(1, 1)
  w.backgroundGradient = bg

  // Title row: green dot + Reminders, open count on the right
  const header = w.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()
  header.setPadding(0, 4, 0, 4)

  addOnlineDot(header)
  header.addSpacer(7)

  const title = header.addText("Reminders")
  title.font = Font.semiboldSystemFont(13)
  title.textColor = TEXT
  title.lineLimit = 1

  header.addSpacer()

  if (!error) {
    const overdue = items.filter(r => r.overdue).length
    let countText = items.length === 1 ? "1 open" : items.length + " open"
    if (overdue) countText += "  " + DOT + "  " + overdue + " overdue"
    const count = header.addText(countText)
    count.font = Font.mediumSystemFont(10)
    count.textColor = overdue ? new Color(CONFIG.overdueHex, 0.9) : dim(0.5)
    count.lineLimit = 1
  }

  w.addSpacer(8)

  // List tile
  const tile = w.addStack()
  tile.layoutVertically()
  tile.cornerRadius = CONFIG.tileRadius
  tile.backgroundColor = new Color(CONFIG.tileHex)
  tile.setPadding(9, 12, 9, 12)

  if (error) {
    addMessage(tile, error)
  } else if (!items.length) {
    addMessage(tile, "All done. Nothing open.")
  } else {
    const shown = items.slice(0, CONFIG.maxRows)
    shown.forEach((r, i) => {
      addRow(tile, r)
      if (i < shown.length - 1) tile.addSpacer(6)
    })
    if (items.length > shown.length) {
      tile.addSpacer(5)
      const more = tile.addText("+" + (items.length - shown.length) + " more")
      more.font = Font.mediumSystemFont(9)
      more.textColor = dim(0.4)
    }
  }

  // Let the tile fill the remaining height
  const filler = tile.addStack()
  filler.addSpacer()
  tile.addSpacer()

  return w
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

function addRow(tile, r) {
  const row = tile.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  // Empty circle in the list's color, like the Reminders app
  const ring = row.addStack()
  ring.size = new Size(11, 11)
  ring.cornerRadius = 5.5
  ring.borderWidth = 1.5
  ring.borderColor = r.color
  row.addSpacer(8)

  if (r.priority) {
    const bang = row.addText("!".repeat(r.priority) + " ")
    bang.font = Font.boldSystemFont(12)
    bang.textColor = new Color(CONFIG.overdueHex, 0.9)
  }

  const name = row.addText(r.title)
  name.font = Font.mediumSystemFont(12)
  name.textColor = TEXT
  name.lineLimit = 1

  row.addSpacer()

  if (r.dueText) {
    row.addSpacer(6)
    const due = row.addText(r.dueText)
    due.font = Font.mediumSystemFont(10)
    due.textColor = r.overdue ? new Color(CONFIG.overdueHex) : dim(0.5)
    due.lineLimit = 1
  }
}

function addMessage(tile, text) {
  const t = tile.addText(text)
  t.font = Font.mediumSystemFont(12)
  t.textColor = dim(0.6)
}

// ---------------- REMINDERS ----------------
async function loadReminders() {
  let all
  try {
    if (CONFIG.lists.length) {
      const cals = []
      for (const name of CONFIG.lists) {
        try { cals.push(await Calendar.forRemindersByTitle(name)) } catch (e) { console.log("No list named " + name) }
      }
      all = cals.length ? await Reminder.allIncomplete(cals) : []
    } else {
      all = await Reminder.allIncomplete()
    }
  } catch (e) {
    console.log("Reminders: " + e)
    return { items: [], error: "Run this once in Scriptable and allow Reminders access." }
  }

  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const items = all.filter(r => !r.isCompleted).map(r => {
    const due = r.dueDate || null
    const hasTime = !!r.dueDateIncludesTime
    let overdue = false
    if (due) overdue = hasTime ? due < now : due < startToday
    let color = dim(0.5)
    try { if (r.calendar && r.calendar.color) color = r.calendar.color } catch (e) {}
    return {
      title: r.title || "Untitled",
      due,
      overdue,
      dueText: due ? formatDue(due, hasTime, now) : "",
      priority: priorityMarks(r.priority),
      color,
      created: r.creationDate ? r.creationDate.getTime() : 0,
    }
  })

  // Overdue and dated first (soonest first), then undated by priority, then oldest first
  items.sort((a, b) => {
    if (a.due && b.due) return a.due - b.due
    if (a.due) return -1
    if (b.due) return 1
    if (a.priority !== b.priority) return b.priority - a.priority
    return a.created - b.created
  })

  return { items, error: null }
}

// Apple stores priority as 1 (high), 5 (medium), 9 (low), 0 (none)
function priorityMarks(p) {
  if (!p) return 0
  if (p <= 4) return 3
  if (p === 5) return 2
  return 1
}

function formatDue(due, hasTime, now) {
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((day(due) - day(now)) / 86400000)

  const tf = new DateFormatter()
  tf.dateFormat = "h:mm a"
  const time = hasTime ? " " + tf.string(due) : ""

  if (diff === 0) return hasTime ? tf.string(due) : "Today"
  if (diff === 1) return "Tomorrow" + time
  if (diff === -1) return "Yesterday"
  if (diff < -1) return Math.abs(diff) + "d overdue"
  if (diff < 7) {
    const wf = new DateFormatter()
    wf.dateFormat = "EEE"
    return wf.string(due) + time
  }
  const df = new DateFormatter()
  df.dateFormat = "MMM d"
  return df.string(due)
}
