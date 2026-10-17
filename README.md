# Workout-a-lot

A strength-training log in the spirit of the Strong app, with Claude built in as a coach that can read your training data and act in the app.

Built with Expo (React Native + TypeScript) for iOS and Android. A web build is included for previewing.

## Features

**Logging (Strong-style)**
- Start an empty workout or start from a template. Each exercise has a set table (Set / Previous / Weight / Reps / ✓).
- The "Previous" column shows your last performance. Completing an empty set fills it in from that.
- Set types: tap the set number to cycle normal → warm-up (W) → drop (D) → failure (F). Hold it to delete the set.
- A rest timer starts when you complete a set (per-exercise or default rest, with −15/+15/Skip). The phone buzzes when it ends.
- Barbell, dumbbell, machine, cable, weighted/assisted bodyweight, reps-only, duration and cardio (distance + time) exercises.
- About 70 built-in exercises, plus custom ones.

**History and progress**
- Workout history with duration, volume, best set per exercise and personal records (🏆).
- PRs are detected when you finish a workout: estimated 1RM, heaviest weight, best set volume, and reps for bodyweight moves.
- Exercise detail: records, estimated-1RM trend, predicted rep maxes, a kg/lb plate calculator, and full set history.
- Templates: build them by hand, save any past workout as one (hold its card in History), or have the coach make them.
- Profile: workouts per week, body-weight log, kg/lb, default rest and bar weight.

**Claude coach (Coach tab)**

The coach is Claude, running a tool-use loop against your local data. It can:

| Tool | What it does |
|---|---|
| `get_training_overview` | Frequency, recent workouts, templates, estimated 1RMs, body weight, current workout |
| `search_exercises` | Look up exercise ids in the library |
| `get_exercise_history` | Every session and the all-time bests for an exercise |
| `list_workouts` | Finished workouts with every set |
| `create_template` | Save a routine to your Workout tab |
| `start_workout` | Start a workout, empty or from a template |
| `get_active_workout` / `add_exercise_to_workout` / `update_active_set` | Plan or log sets in the workout in progress |
| `create_custom_exercise` / `log_measurement` | Add exercises and body measurements |

So you can ask things like "Build me a 4-day upper/lower split and save it as templates", "How's my bench progressing?" or "Set up today's squat session with progressive overload". You can also use it mid-workout via **✦ Ask Coach**.

Implementation notes (`src/claude/`):
- Uses the official `@anthropic-ai/sdk`. The default model is `claude-opus-5-5`; you can switch to Sonnet 5.5 or Haiku 5.5 in Profile.
- Replies stream in. On native this goes through `expo/fetch`, because React Native's built-in fetch can't stream responses.
- Requests use adaptive thinking, `effort: "medium"`, prompt caching, and `fallbacks: "default"`, which retries a refused request on Anthropic's recommended fallback model (Haiku has no fallback, so it's left off there).
- Tools are `strict` and stream their inputs as they're generated. Every input is validated in `tools.ts` before it touches your data.
- Turns that end in a refusal, or that get cut off at `max_tokens`, never run their tools.
- The conversation history is append-only, so thinking blocks stay valid from turn to turn.

## Setup

```bash
npm install
npx expo start          # then open in Expo Go, an iOS simulator, or an Android emulator
```

In the app, go to **Profile → Coach** and paste an Anthropic API key (from console.anthropic.com).

On iOS and Android the key is kept in the Keychain or Keystore (`expo-secure-store`) and is sent only to `api.anthropic.com`. The app calls the API directly from the device with your own key; there is no backend.

> If you ship this to other users, put a small backend in front of the API instead of having each user bring a key.

## Development

```bash
npm test                # unit tests: training math, reducer, persistence, Claude tools, and the agent loop
npm run typecheck
npx expo export --platform web   # web bundle in dist/
```

Project layout:

```
src/
  app/            Expo Router screens: (tabs)/ Profile, History, Workout, Exercises, Coach;
                  workout.tsx (the active workout), exercise/[id].tsx, template/[id].tsx
  domain/         types, exercise library, 1RM / PR / volume / plate math
  store/          pure reducer, persisted store (SQLite key-value store on device, localStorage on web)
  claude/         tool definitions + executor, agent loop, SDK client, chat hook
  ui/             theme, shared components, exercise picker
tests/            Vitest suites
```

Data is stored locally. Weights are always stored in kg and converted for display, so switching units never rewrites your history.
