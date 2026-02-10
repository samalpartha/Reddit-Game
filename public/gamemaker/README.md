# GameMaker Assets

Place your exported GameMaker HTML5/WASM files here:

## Required Files

After building your GameMaker project for HTML5 export:

1. `runner.js` - GameMaker runtime JavaScript
2. `runner.wasm` - WebAssembly binary
3. `runner.data` - Game data package
4. `runner.json` - Manifest file (create manually, see below)
5. `audio-worklet.js` - Audio processing (if applicable)
6. `game.unx` - Game package file

## runner.json Format

Create a `runner.json` file in the `public/` directory (NOT in this subdirectory):

```json
{
  "manifestFiles": [
    "runner.data",
    "runner.js",
    "runner.wasm",
    "audio-worklet.js",
    "game.unx"
  ],
  "manifestFilesMD5": [
    "<md5 of runner.data>",
    "<md5 of runner.js>",
    "<md5 of runner.wasm>",
    "<md5 of audio-worklet.js>",
    "<md5 of game.unx>"
  ],
  "runner": {
    "version": "1.0.0",
    "yyc": false
  }
}
```

## Data Bridge

The game client passes reveal data to GameMaker via:

```javascript
window.DV_REVEAL_PAYLOAD = {
  majorityLabel: "Right Call",
  majorityIndex: 0,
  labels: ["Right Call", "Wrong Call", "It Depends", "Everyone's Wrong"],
  counts: [150, 80, 45, 25],
  percentages: [50, 27, 15, 8],
  voters: 300,
  userScore: { ... },
  streak: { current: 5, best: 12, lastPlayedDate: "20260209" }
};
```

GameMaker can read this via `js_call("window.DV_REVEAL_PAYLOAD")`.

To send events back to the web client:

```gml
// In GameMaker GML
js_call("window.DV_onGameMakerEvent", json_stringify({
  type: "reveal_complete",
  data: {}
}));
```

## GameMaker Scene Design

The reveal scene should include:
- Courtroom background (dark theme: #0e0e12, #1a1a2e)
- Four verdict stamp sprites (green, red, orange, blue)
- Gavel hit animation triggered on load
- Results bar fill animation (read from DV_REVEAL_PAYLOAD)
- Tap-to-stamp interaction for the majority verdict
- Score display after stamp
- "Done" button to signal reveal_complete event

Color palette:
- Green (#4caf50) for verdict index 0
- Red (#f44336) for verdict index 1
- Orange (#ff9800) for verdict index 2
- Blue (#2196f3) for verdict index 3
- Gold (#f0c040) for accents
- Background (#0e0e12)
