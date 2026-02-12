# ⚖️ Daily Verdict

> **A social prediction game for Reddit** — vote, predict, debate, and compete in rapid-fire rounds.

Built on [Devvit Web](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview) with [GameMaker](https://developers.reddit.com/docs/quickstart/quickstart-gamemaker) integration for [The Reddit Daily Games Hackathon](https://redditdailygames2026.devpost.com/). See the [GameMaker Quickstart](https://developers.reddit.com/docs/quickstart/quickstart-gamemaker) for setup details.

## Live Demo

Play the game live at: [r/red_dit_game_dev](https://www.reddit.com/r/red_dit_game_dev/)

---

## What Is Daily Verdict?

Every **5 minutes**, a new moral dilemma or social scenario appears as an interactive post in your subreddit. Players make **two blind choices** before seeing any results:

1. **Verdict** — What's the right call? *(4 options)*
2. **Prediction** — What will the *majority* say? *(4 options)*

Results stay **hidden** until the reveal window (1 minute after voting closes). While waiting, play the **Verdict Courtroom** mini-game to earn bonus points! Players return for scoring, streaks, and leaderboard rankings. The comment thread becomes a battleground as players try to influence the vote for bonus points.

**It's not a poll. It's a social prediction game — with rapid-fire rounds all day long.**

---

## Key Features

| Feature | Description |
|---------|-------------|
| **5-Minute Cycles** | Rapid gameplay loop — 4m voting + 1m reveal delay = constant action |
| **Dual-Choice Mechanic** | Vote your opinion AND predict the crowd — creates a unique strategic layer |
| **Delayed Reveal** | Results hidden until reveal time, driving return visits and anticipation |
| **Verdict Courtroom Mini-Game** | Defense attorney simulation — deflect counter-arguments to earn bonus points |
| **Influence Bonus** | Commenting and persuading others earns extra points (+15 max) |
| **Canvas Reveal Experience** | Spectacular HTML5 Canvas animated reveal with particles, physics stamps, and racing bars |
| **Share Your Score** | Canvas-rendered score cards with clipboard copy and native share support |
| **Streak System** | Consecutive round play rewards with escalating bonuses |
| **Dual Leaderboards** | Per-round and weekly leaderboards with medal rankings |
| **UGC Pipeline** | Community case submissions with full mod approval queue |
| **32 Seed Cases** | Reddit-culture scenarios ship with the app — the game never goes dark |
| **GameMaker Ready** | WASM GameMaker bridge preserved for premium courtroom reveal scenes |
| **Mobile-First** | Thumb-friendly, one-column layout optimized for Reddit's webview |

---

## Game States

### State 1: Open (Vote)

- Case scenario with rich storytelling
- Verdict picker (4 large thumb-friendly buttons with glow selection)
- Prediction picker (4 buttons — predict the majority)
- **Play Verdict Courtroom** mini-game button — accessible before voting too!
- Countdown urgency: timer shifts **green → yellow → red** as deadline approaches
- Branded scale loading animation
- First-time onboarding overlay

### State 2: Voted (Waiting)

- Your picks displayed with reveal countdown
- CTA to comment (enables Influence Bonus tracking)
- **Play Verdict Courtroom** mini-game button — earn bonus points while waiting!
- Play Verdict Courtroom accessible directly from the **feed card** (splash view)
- Archive access to past rounds

### State 3: Revealed (Results)

- Animated verdict stamp with glow and bounce
- Distribution bars with staggered race animation
- Score breakdown with animated count-up
- **Share Your Score** button — generates a canvas card and copies to clipboard
- Streak display with fire animations
- Per-round & weekly leaderboard with medal colors
- Mini-Game Bonus displayed in score breakdown
- GameMaker animated reveal button (expanded mode)

### State 4: Archive

- Past cases with tap-through to full detail view
- Complete results, bars, and score for each past case

---

## Scoring System

| Component | Points | How to Earn |
|-----------|--------|-------------|
| Prediction Match | +60 | Predicted the majority verdict correctly |
| Verdict Match | +30 | Your verdict aligned with the majority |
| Timing Bonus | 0–20 | Earlier correct predictions score higher |
| Influence Bonus | +15 | Your verdict's share rises 3%+ after your comment |
| Streak Bonus | 0–10 | Consecutive rounds played |
| Mini-Game Bonus | 0–10 | Verdict Courtroom: successfully defending your case earns points (max 10) |
| **Max per round** | **145** | |

---

## Architecture

```mermaid
graph TD
    subgraph Client
        Splash[Splash Feed Card] -->|Play/Vote| Game[Expanded Game View]
        Game -->|Reveal Phase| Reveal[Canvas/GameMaker Reveal]
        Game -->|Waiting Phase| MiniGame[Verdict Courtroom]
    end

    subgraph Server_Hono[Hono Server (Devvit Web)]
        API[API Routes]
        Scheduler[Cron Scheduler]
        Triggers[App Triggers]
    end

    subgraph Data_Redis[Redis (Devvit KV)]
        Cases
        Votes
        Scores
        Leaderboards
    end

    Game -->|Fetch/Post| API
    MiniGame -->|Submit Score| API
    API -->|Read/Write| Data_Redis
    Scheduler -->|Create/Close/Reveal| Data_Redis
    Scheduler -->|Snapshot| Data_Redis
```

### Client Entrypoints

| Entrypoint | File | Purpose |
|------------|------|---------|
| **Splash** | `splash.html/ts/css` | Inline feed card — "Today's Verdict" teaser with play button |
| **Game** | `game.html/ts/css` | Full game interface — vote, results, archive, submit, mod queue |
| **Reveal** | `index.html/main.ts/style.css` | Canvas reveal experience with GameMaker fallback |

### Server Architecture

| Layer | File | Purpose |
|-------|------|---------|
| **Entry** | `server/index.ts` | Hono app setup, global error/404 handlers, health check |
| **API Routes** | `server/routes/api.ts` | 10 client-facing endpoints with mod authorization |
| **Scheduler** | `server/routes/scheduler.ts` | 4 cron tasks: daily post, snapshots, close, reveal |
| **Triggers** | `server/routes/triggers.ts` | App install handler |
| **Menus/Forms** | `server/routes/menu.ts`, `forms.ts` | Mod menu items and form handlers |
| **Post Creator** | `server/core/post.ts` | Reddit post creation logic |
| **Redis Service** | `server/services/redis.ts` | All Redis operations with key management |
| **Scoring** | `server/services/scoring.ts` | Score computation, leaderboard building |
| **Validation** | `server/services/validation.ts` | Input validation and content safety |
| **Seed Data** | `server/data/seed-cases.ts` | 32 built-in cases for out-of-box content |

---

## Tech Stack

| Technology | Role |
|------------|------|
| **Devvit Web** | Reddit Developer Platform — posts, server, scheduler, forms |
| **Hono** | Lightweight web framework for server API routes |
| **Redis** | Devvit KV store for all game state persistence |
| **TypeScript** | End-to-end type safety, client and server |
| **HTML5 Canvas** | Spectacular animated reveal experience |
| **Vite** | Frontend build tooling with `@devvit/start` |
| **Vitest** | Server-side unit testing (47+ tests) |
| **GameMaker** | Optional WASM reveal scene (bridge preserved) |

---

## Project Structure

```
src/
  client/
    splash.html/ts/css      # Inline feed card (entry point)
    game.html/ts/css         # Main game interface (all states)
    index.html/main.ts       # Canvas reveal experience
    style.css                # Reveal styles
    gamemaker/bridge.ts      # GameMaker JS bridge
  server/
    index.ts                 # Server entry (Hono)
    routes/
      api.ts                 # Client-facing API (/api/*)
      menu.ts                # Mod menu items
      forms.ts               # Form handlers
      triggers.ts            # App install trigger
      scheduler.ts           # Cron scheduler endpoints
    core/
      post.ts                # Reddit post creation
    services/
      redis.ts               # Redis operations & key management
      scoring.ts             # Score computation & leaderboards
      validation.ts          # Input validation & safety
    data/
      seed-cases.ts          # 32 seed cases
  shared/
    types.ts                 # Shared TypeScript interfaces
```

---

## API Endpoints

### Client-Facing (`/api/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/init` | Initialize user context (username, mod status) |
| GET | `/api/today` | Get today's case, user vote, aggregate data |
| POST | `/api/vote` | Submit verdict + prediction |
| GET | `/api/reveal?caseId=` | Get reveal data with score breakdown |
| GET | `/api/archive?days=7` | Get past revealed cases with scores |
| POST | `/api/submit-case` | Submit a user case for mod review |
| POST | `/api/comment-mark` | Record first comment time for influence tracking |
| POST | `/api/minigame-score` | Submit Verdict Courtroom mini-game score for bonus |
| GET | `/api/leaderboard/weekly` | Get weekly leaderboard |
| GET | `/api/mod/pending` | Get pending case submissions (mod only) |
| POST | `/api/mod/approve` | Approve + schedule a submission (mod only) |
| POST | `/api/mod/reject` | Reject submission with reason (mod only) |
| POST | `/api/mod/delete-case` | Delete a case (mod only) |

### Internal Scheduler (`/internal/scheduler/`)

| Endpoint | Cron | Purpose |
|----------|------|---------|
| `daily-post` | `0 */2 * * *` | Create new round's case + Reddit post (every 5 mins) |
| `snapshots` | `*/10 * * * *` | Snapshot vote distributions for influence tracking |
| `close` | `*/1 * * * *` | Close expired voting windows |
| `reveal` | `*/1 * * * *` | Reveal cases past reveal time, compute scores |

---

## Setup & Development

### Prerequisites

- Node.js >= 22.2.0
- [Devvit CLI](https://developers.reddit.com/docs/get-started/install) (`npm install -g devvit`)
- A test subreddit with < 200 subscribers

### Quick Start

```bash
# Install dependencies
npm install

# Login to Reddit Developer Platform
devvit login

# Start local playtest (builds + deploys to test subreddit)
devvit playtest

# Or build only
npm run build
```

### Testing

```bash
# Run server-side unit tests
npm test

# Type check
npm run typecheck
```

### Deploy

```bash
# Full deploy (type-check + upload)
npm run deploy

# Deploy and publish to the community
npm run launch
```

---

## GameMaker Integration

The reveal experience supports GameMaker WASM for a premium courtroom animation. The Canvas fallback provides a spectacular experience out of the box.

### How It Works

1. On reveal, the client checks for `runner.json`
2. If GameMaker assets are found, it loads the WASM runtime
3. Reveal data is passed via `window.DV_REVEAL_PAYLOAD`
4. GameMaker sends events back via `window.DV_onGameMakerEvent()`
5. If GameMaker is unavailable, the HTML5 Canvas reveal plays automatically

### Adding a GameMaker Scene

1. Build your GameMaker project for HTML5/WASM export
2. Copy output files (`runner.js`, `runner.wasm`, `runner.data`) to `public/`
3. Create `public/runner.json` manifest file
4. The game auto-detects and loads the scene

### Canvas Reveal Features (Built-in Fallback)

- Particle confetti explosion matching verdict color
- Physics-based stamp drop with bounce and rotation
- Screen shake on stamp impact
- Bars race animation with gradient fills
- Score counter with golden glow effect
- Streak fire particle system
- Interactive "Back to Game" button

---

## Verdict Courtroom Mini-Game

A **defense attorney simulation** bonus game. Available from the Voted view while waiting for results.

### How to Play

- **Defend your verdict** against rapid-fire counter-arguments
- **Controls**: Choose the best response strategy:
  - **Refute**: Use facts to counter the argument
  - **Agree**: Concede a minor point to build credibility
  - **Deflect**: Pivot to a stronger talking point
- **Time Pressure**: Respond before the timer runs out!

### Scoring

- **Correct Response**: Earn points and maintain credibility
- **Wrong Response**: Lose credibility (health)
- **Bonus**: Every 50 minigame points = +1 verdict bonus (max 10)

### Architecture

```
Voted View → "Play Verdict Courtroom" button → Canvas mini-game
  → POST /api/minigame-score → Redis (best per case+user)
  → Scoring service reads best → miniGameBonus in ScoreBreakdown
```

---

## Content Safety & Devvit Rules Compliance

- **No personal information**: Names, contact details, and locations rejected
- **Content filtering**: No explicit, hateful, threatening, or harmful content
- **Medical/legal safety**: No scenarios requiring professional advice
- **Rate limiting**: 3 case submissions per user per day
- **Mod approval**: All user-generated cases require moderator review
- **Seed content**: 32 pre-approved cases ship with the app
- **Validation**: Server-side input validation on all endpoints
- **Authorization**: Mod-only endpoints protected with `requireMod()` checks

---

## Hackathon Categories

| Category | How We Qualify |
|----------|----------------|
| **Best Daily Game** | Rapid-fire 5-minute rounds, Verdict Courtroom mini-game, scoring, streaks, and leaderboards |
| **Best Use of GameMaker** | GameMaker WASM bridge with courtroom reveal scene + Canvas fallback ([quickstart](https://developers.reddit.com/docs/quickstart/quickstart-gamemaker)) |
| **Best Mobile Game Play** | One-column layout, thumb-size buttons, touch mini-game, sticky submit bar, safe area support |
| **Best Use of User Contributions** | Case submission pipeline with mod approval, priority scheduling |

---

## License

Built for the Reddit Daily Games Hackathon 2026. See `devvit.json` for app configuration.
