# Daily Verdict

**A social prediction game for Reddit** built on [Devvit Web](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview) with [GameMaker](https://developers.reddit.com/docs/quickstart/quickstart-gamemaker) reveal polish.

Built for [The Reddit Daily Games Hackathon](https://redditdailygames2026.devpost.com/).

---

## What is Daily Verdict?

Every day, a new moral dilemma or social scenario appears as an interactive post in your subreddit. Players make two choices before seeing any results:

1. **Verdict** - What's the right call? (4 options)
2. **Prediction** - What will the majority say? (4 options)

Results stay hidden until the reveal window. Players return for scoring, streaks, and leaderboard rankings. The comment thread becomes a battleground as players try to influence the vote.

### Why It Wins

- **Not a poll.** It's a social prediction game.
- **Delayed reveal** creates a second session and return visits.
- **Influence bonus** rewards commenting and persuasion (no NLP needed).
- **UGC pipeline** lets users submit future cases; mods approve and schedule.
- **GameMaker polish** for an animated courtroom reveal experience.

---

## Game States

### State 1: Open (Vote)
- Case text with 3-5 sentences
- Verdict picker (4 large thumb-friendly buttons)
- Prediction picker (4 buttons)
- Sticky submit bar at bottom
- Countdown to close

### State 2: Voted (Waiting)
- Shows your picks
- Countdown to reveal
- CTA to comment (enables Influence Bonus tracking)

### State 3: Revealed (Results)
- Majority verdict stamp with animation
- Distribution chart with bar fills
- Score breakdown (prediction, verdict, timing, influence, streak)
- Daily leaderboard
- GameMaker animated courtroom reveal (with CSS fallback)

---

## Scoring System

| Component | Points | How to Earn |
|-----------|--------|-------------|
| Prediction Match | +60 | Predicted the majority verdict |
| Verdict Match | +30 | Voted with the majority |
| Timing Bonus | 0-20 | Earlier correct predictions score higher |
| Influence Bonus | +15 | Your verdict's share rises 3%+ after your comment |
| Streak Bonus | 0-10 | Consecutive days played |
| **Max per day** | **135** | |

---

## Tech Stack

- **Platform:** Devvit Web (Reddit Developer Platform)
- **Server:** Hono (Node.js) with Redis for persistence
- **Client:** Vanilla TypeScript, CSS animations
- **Reveal:** GameMaker WASM (with CSS fallback)
- **Build:** Vite with `@devvit/start`

---

## Project Structure

```
src/
  client/
    splash.html/ts/css    # Inline feed card (entry point)
    game.html/ts/css      # Main game interface (all states)
    index.html/main.ts    # GameMaker reveal experience
    style.css             # Reveal styles
  server/
    index.ts              # Server entry (Hono)
    routes/
      api.ts              # Client-facing API (/api/*)
      menu.ts             # Mod menu items
      forms.ts            # Form handlers
      triggers.ts         # App install trigger
      scheduler.ts        # Internal scheduler endpoints
    core/
      post.ts             # Reddit post creation
    services/
      redis.ts            # Redis operations & key management
      scoring.ts          # Score computation & leaderboards
      validation.ts       # Input validation & safety
    data/
      seed-cases.ts       # 14 seed cases (game never goes dark)
  shared/
    types.ts              # Shared TypeScript types
```

---

## Setup & Development

### Prerequisites

- Node.js >= 22.2.0
- [Devvit CLI](https://developers.reddit.com/docs/get-started/install)
- A test subreddit with < 200 subscribers

### Quick Start

```bash
# Install dependencies
npm install

# Login to Reddit Developer Platform
devvit login

# Start playtest (builds + deploys to test subreddit)
devvit playtest

# Or build only
npm run build
```

### Deploy

```bash
# Full deploy (type-check + upload)
npm run deploy

# Deploy and publish
npm run launch
```

### GameMaker Integration

The reveal experience supports GameMaker WASM. To add your GameMaker scene:

1. Build your GameMaker project for HTML5/WASM
2. Copy the output files (`runner.js`, `runner.wasm`, `runner.data`, etc.) to `public/`
3. Create a `public/runner.json` manifest file
4. The game client will automatically detect and load the GameMaker scene
5. If GameMaker fails to load, the CSS fallback reveal is shown

The GameMaker scene receives reveal data via `window.DV_REVEAL_PAYLOAD` and sends events back via `window.DV_onGameMakerEvent()`.

**GameMaker Scene Design:**
- Courtroom background
- Four verdict stamp animations
- Gavel hit animation
- Results bar fill animation
- Tap to stamp the final verdict, then show score

---

## API Endpoints

### Client-Facing (`/api/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/init` | Initialize user context |
| GET | `/api/today` | Get today's case + user vote + status |
| POST | `/api/vote` | Submit verdict + prediction |
| GET | `/api/reveal?caseId=` | Get reveal data with scores |
| GET | `/api/archive?days=7` | Get past revealed cases |
| POST | `/api/submit-case` | Submit a user case |
| POST | `/api/comment-mark` | Record first comment time |
| GET | `/api/mod/pending` | Get pending submissions |
| POST | `/api/mod/approve` | Approve + schedule submission |
| POST | `/api/mod/reject` | Reject submission with reason |

### Internal Scheduler (`/internal/scheduler/`)

| Endpoint | Cron | Purpose |
|----------|------|---------|
| `daily-post` | `0 12 * * *` | Create today's case + Reddit post |
| `snapshots` | `*/10 * * * *` | Snapshot vote distributions |
| `close` | `*/5 * * * *` | Close expired voting windows |
| `reveal` | `*/5 * * * *` | Reveal cases past reveal time |

---

## Devvit Rules Compliance

- No doxxing, names, contact details
- No explicit sexual content
- No hate, threats, harassment
- No medical/legal advice scenarios
- No self-harm content
- Content validation on all submissions
- Rate limiting (3 submissions/user/day)
- Mod queue for all user-generated cases
- Seed cases ship with the app (14 cases, cycles)

---

## Hackathon Categories Targeted

1. **Best Daily Game** - Full daily game loop with recurring content
2. **Best Use of GameMaker** - Animated courtroom reveal scene
3. **Best Mobile Game Play** - One-column layout, thumb-size buttons, sticky submit
4. **Best Use of User Contributions** - Case submission + mod approval pipeline
