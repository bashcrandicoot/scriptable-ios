# scriptable-ios

Home screen widgets for [Scriptable](https://scriptable.app) on iOS.

| Script | Widget size | What it shows |
| --- | --- | --- |
| `AI-Launcher.js` | Medium | Grok Bot, Muse, ChatGPT, Gemini and Claude icons that open each app |
| `Weather-Calendar.js` | Medium | Current weather and the month calendar with event dots |
| `Weather-Radar.js` | Large | RainViewer radar centered on your location, with state outlines and your location name |
| `Loader.js` | Any | Downloads and runs the latest version of one of the scripts above |

## Setup

1. Add `Loader.js` to Scriptable (it is the only script that goes on the phone).
2. Add a Scriptable widget, set **Script** to `Loader`, and set **Parameter** to the script name without `.js`:
   - `AI-Launcher` (medium)
   - `Weather-Calendar` (medium)
   - `Weather-Radar` (large)
3. Run `Loader` inside Scriptable once with `DEFAULT` set to `"AI-Launcher"` so the app icons download.

Edit a script here and the widgets pick up the change on their next refresh. The loader keeps the last downloaded copy, so widgets still work offline.

## One loader per widget

If you'd rather not use the Parameter field, the `loaders/` folder has a loader for each widget with the script name built in. Add the one you want to Scriptable and pick it as the widget's script.

## Data sources

- Weather: [Open-Meteo](https://open-meteo.com)
- Radar: [RainViewer](https://www.rainviewer.com); state outlines from [us-atlas](https://github.com/topojson/us-atlas)
