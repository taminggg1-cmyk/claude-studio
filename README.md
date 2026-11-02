# Claude's studio

A cosy office for Claude Code. When you start Claude Code, a window opens next to the terminal. It shows a small
office loft from above at an angle, like a building in a tycoon game. Claude works at her desk in this office.

## What you see

- **Claude** sits at her desk. She types, reads, scratches her chin while she thinks, and sometimes drinks from her
  coffee mug. She wears your own character model if you have set one up (see *Character models* below); otherwise
  she is a built-in chibi figure with silver-lilac hair and a terracotta cape.
- **One office for every session.** All the Claude Code sessions you have open work in the same office, in one
  window. The first session opens the window. Each later session sends its own Claude into that room: they walk in
  through the door and take a desk pod of their own. The first session's Claude wears Claude's own model and sits at
  the big desk. The others wear the next free character, and their name tag says "Claude · <folder>". When a session
  ends, its Claude and its agents walk out together. The window closes 45 seconds after the last session ends.
- **Agents.** When Claude starts an agent (for example an Explore or a Plan agent), a new person walks in through the
  door. They go to the nearest free desk, pull out the chair, sit down, and switch on their screen and desk lamp.
  When the agent finishes, the person stands up, switches the screen off and walks out. If every desk is taken, the
  new person waits with a coffee until a desk is free.
- **Name tags and badges.** A small pill floats above each person's head. It starts with their name tag, in their own
  colour, and then says what they are doing right now, for example *Thinking*, *Reading*, *Refactoring*, *Testing*
  or *Idle*. Claude's tag has a star and her role (for example *Claude · lead*) and shows the file or command she is
  working on. For agents, the agent type (*Explore*, *Plan*...) and the file show when you click them or zoom in
  close, so a busy room keeps its labels short. Clicking a person also shows their persona card (a short text about
  who they are) and their task.
- **Speech bubbles.** People talk. Each one has their own lines (see *Personas* below) and says one when they sit
  down, get into the flow, stop to think, hit a run of errors, see their desk catch fire, cheer, or leave. Claude
  also says something when she hands a task to an agent. Now and then someone says something about nothing much.
  Their mouth moves while the bubble is up. At most two people chat at once; hello, goodbye, cheers and errors always
  get a line.
- **Moods.** Each person shows how their work is going:
  - *In the flow* (editing files, running commands): typing fast, head bobbing, music notes floating up.
  - *Thinking*: scratching the chin, a pen turning in the other hand, question marks circling the head.
  - *Cheering* (a test run passes, a run of errors ends, an agent finishes its task): arms up, a fist pump, confetti
    over the desk, and the badge says *Yes!*.
  - *Stressed* (a tool call failed): slumped over the desk, head in hands, sweat drops, steam puffing from the ears.
    The badge counts the errors in a row.
- **When things go wrong.** Errors in a row build up. After 3, smoke curls up from that person's desk. After 5, cartoon
  fire breaks out around the desk, with glowing little bugs in the flames, and the sprinklers come on. The person
  jumps up and runs laps round their desk pod with their hands on their head. Claude (or the first free colleague,
  if it is Claude's desk that burns) runs to the fire point by the aisle, takes the extinguisher and sprays the fire.
  The next successful edit or command puts the fire out: a hiss of steam, everyone goes back to their desk, and the
  extinguisher goes back on its hook. A run of errors with nothing new for three minutes also fades by itself.
  Failed look-arounds (a search that finds nothing, a file that is not there) do not count as errors.
- **Your turn.** When a session finishes and waits for you, its Claude stands up, waves and says "Your turn!", and a
  small brass bell on her desk glows. When a session needs you to approve a tool call, the bell swings and glows red,
  her badge says *Needs your OK · <tool>*, she waves again every 25 seconds, and the window's title starts with "(!)".
  (In auto mode a request the classifier settles may show for a moment too: the mod cannot tell those apart.)
- **Coffee breaks.** A Claude who has waited for you for more than 45 seconds gets up, fetches a coffee and goes to the
  bistro table, the lounge or the sofa. Two Claudes on a break sit together and chat. She walks back to her desk as
  soon as you type, or when a tool call needs your OK.
- **The whiteboard.** Each session's task list shows as sticky notes on the rolling whiteboard, one column per
  session in its Claude's colour: finished tasks fade and get a tick, the task in progress has a red dot. When the list
  changes, that Claude walks over and writes on the board (at most once every 40 seconds).
- **Briefings and reports.** A new agent first stops at its Claude's desk: she says what the task is, the agent says
  "On it!", then goes to its own desk. An agent that finished walks back, puts a folder on her desk ("Report's on your
  desk!") and leaves. The folders pile up and fade after 30 seconds.
- **Paperwork.** When Claude Code compacts a session's conversation, its Claude carries a box of papers to the shredder
  by the right wall, the context strip on the token rack drains, she stretches and goes back to work.
- **The office grows.** The office keeps lifetime counts across all sessions (agents hired, tests passed, fires put
  out, files edited, sessions) in `~/.claude/studio-stats.json`. A trophy shelf on the back wall shows them, with the
  next unlock. Milestones add things to the room: an aquarium (10 agents), an arcade machine (25 tests), a gold fire
  trophy (3 fires), a "SHIP IT" neon sign (100 files) and a big plant (20 sessions), each with confetti and a banner.
- **Shift reports.** When a session ends, a card at the bottom left says how its shift went: how long it ran, files
  changed, agents hired, tests passed and fires put out. Click it to close it.
- **Ask the office.** The button at the top right opens a panel: send a prompt to any session (it goes in as if you
  typed it there, and runs as soon as that session is free), start an agent in a session, or open a new terminal
  running Claude Code in a folder (a new session, whose Claude walks in; tick *Remote Control* to reach that session
  from the Claude app on your phone or tablet). Only the window a session opened can do this:
  the session gives it a key in its address after a `#`, which the browser never sends anywhere.
- **Things to do in the room.** Hover over something and a hint says what a click does. Pet the cat (it wakes,
  purrs, and sometimes trots off to another cosy spot; it runs from fires). Brew a coffee at the machine and click a
  person to hand it over (a stressed worker calms down for a minute). Water the plants (they grow, and shrink back
  slowly if you forget them). Switch the lamps off and on. Feed the fish, play a 20-second Bug Catcher game on the
  arcade machine, and after a fire catch the glowing bugs for the jar on the trophy shelf. Clicking a person makes them
  wave and say something, and still opens their card. What you do here stays in this window: it never reaches Claude.
- **Your own design.** The panel's *Design* tab changes the room: eight ready-made themes (cosy loft, Scandinavian,
  night neon, forest cabin, pastel, monochrome, sunset, ocean), a colour for each part (walls, floor, wood, accents,
  sofa, rugs, desks, plants, pots), the floor (oak, concrete, carpet, tiles), sofa, rug, plant and lamp styles, the
  poster, and how warm the lamps are. You see changes at once; *Save* keeps the design (in
  `~/.claude/studio-room.json`) and shows it in every window. *Export* saves the design as a file and *Import* reads
  one, so you can swap designs with friends.
- **Real weather.** Type your city in the *Weather* tab. The office then follows today's forecast from Open-Meteo (free,
  no account; only your city's position is sent, every 30 minutes): clouds dim the light, rain runs down the windows,
  snow piles up on the sills, storms flash, fog hazes the glass. A small line under the info box shows the weather.
- **Your own characters.** In the *Characters* tab, drop in a `.vrm` file. The office checks it, reads its name, author
  and licence (and asks you to confirm you may use it when the licence limits that), saves it to
  `~/.claude/studio-models`, and asks Claude (the small Haiku model, in one of your sessions) to write it a persona:
  name, colour, a short text and speech lines. You can make any character Claude's own, an agent, or switch it off
  (`unused` in models.json), edit or rewrite its persona, or remove it (the file moves to a `removed` folder). Reload
  the window to see the change.
- **The token rack.** A walnut server rack against the back wall has two LED strips. The left one (*ctx*) fills with how
  much of the context window is used. The right one (*5h*) fills with how much of your five-hour usage limit is used.
  They are green under 50 %, amber from 50 % to 80 %, and glowing hot pink from 80 %. The neon *tokens* sign above
  takes the colour of the fuller strip. A strip with no reading (for example no usage limit on your account) shows a
  slow grey scan.
- **Day and night** follow your computer's clock: daylight from 7:00 to 17:30, dusk until 19:30, dawn from 5:00. At
  night the windows show a city skyline and the lamps, pendants and screens glow warmly.
- **The room**: oak herringbone and polished concrete floors, travertine desks in pods, a curved bouclé sofa, a
  coffee counter with an espresso machine, fluted glass, paper lanterns, many plants, a wall clock that shows your
  local time, a framed poster, and a sleeping cat.

## Using the window

- Drag to turn the room a little. Right-drag (or Shift-drag) to move it. Scroll to zoom.
- Double-click a person to look at them closely. Double-click the floor to see the whole room again.
- Type `/office` in Claude Code to open the window again if you closed it, or to bring it back to its place.
- Type `/office right` to keep the window on the right half of the screen, or `/office corner` to keep it in the
  top-right quarter (the default). The choice is remembered for later sessions.
- Type `/office night` or `/office day` to keep the sky that way, and `/office auto` to follow the clock again. The
  choice is remembered for later sessions.
- Type `/office pane` to open the older, smaller office inside the terminal instead.

## Character models

You can dress the people in your own 3D character models. They live outside this folder, in
`%USERPROFILE%\.claude\studio-models\`, so they can never end up in a repository: most model licences forbid
passing the files on. That folder holds the model files and a `models.json` that says who wears what:

```json
{
  "claude": { "file": "my-claude.vrm", "credit": "Model by ..." },
  "agents": [{ "file": "agent-one.vrm" }, { "file": "agent-two.vrm" }],
  "poster": { "file": "poster.png" }
}
```

- **VRM files work best** (`.vrm`, VRM 0.x or 1.0). They have a standard human skeleton, so every move works: typing,
  chin scratching, head in hands, cheering. A plain `.glb` also loads, but moves only as a whole.
- Agents take the models in turn; a newcomer gets one nobody in the room is wearing, if there is one.
- `poster` hangs your own picture in the frame on the back wall.
- Hovering over the box at the top left shows the `credit` lines.
- Check each model's licence before you use it. Only use models whose licence lets you use them like this.
- Delete `models.json` (or a line in it) to go back to the built-in people.

### Personas

Each model in `models.json` can carry a `persona`: who the person wearing it is.

```json
{
  "file": "my-claude.vrm",
  "persona": {
    "name": "Juniper",
    "role": "Claude · lead",
    "color": "#1fb3a8",
    "about": "The studio's lead. She hums while she types.",
    "lines": {
      "hello": ["Good morning, studio!"],
      "flow": ["In the groove now ♪"],
      "thinking": ["Which note comes next…?"],
      "delegating": ["Could you take this verse for me?"],
      "stressed": ["Off-key again… one more take."],
      "panic": ["Stop the music! STOP!"],
      "celebrate": ["Perfect pitch! It passes!"],
      "idle": ["Who wants tea?"],
      "bye": ["See you next session!"]
    }
  }
}
```

- `name` goes on the name tag. `color` is the tag's colour and the bubble's border (a `#rrggbb` colour).
- `role` is used for Claude only. An agent's role on the tag is always its agent type.
- `about` shows on the card when you click the person.
- `lines` lists what they may say at each moment; one is picked at random, never the same one twice in a row. A
  moment you leave out uses plain built-in lines. `delegating` is Claude's alone.
- A person without a persona (or with no models at all) is named after their agent type and gets the plain lines.
- The window reads `models.json` each time it opens. To see a change at once, press F5 in the window.

The window opens in the top-right quarter of the screen you are working on (the screen of the window that has the
keyboard when Claude Code starts), and the keyboard goes back to your terminal, so you can keep typing. A session that
starts while the window is open opens nothing new: its Claude walks into the room that is already there. The window
closes by itself once every Claude Code session has ended.

If the window does not land in its place, `%TEMP%\claude-studio-window.log` says what the placing helper
(`office/place-window.ps1`) did on its last run.

## How it works

| Part | What it does |
| --- | --- |
| `hooks/register.tsx` | The mod. It watches Claude's tool calls and agents, and decides what each person is doing. At the start of each interactive session it joins the shared office (starting the server below if none is running) and, if no office window is open, opens one. |
| `office/server.mjs` | The one shared server, on your own computer only (`127.0.0.1`). The first session starts it as a process of its own, so it outlives that session. It writes `~/.claude/studio-office.json` (its port, a random token and its process id) so later sessions can find it. It serves the page, collects every session's studio and passes them all to the window. It lets a session go after 35 quiet seconds and stops 45 seconds after the last session has gone. |
| `office/office.js` | The page: it builds the scene, places people at desks, shows moods, day and night, and the badges. |
| `office/room.js`, `kit.js` | The room and its furniture (with the token rack and the fire point), and shared textures and helpers. |
| `office/motion.js` | How people move: walking, sitting, and every pose (typing, thinking, cheering, slumping, panicking, spraying). |
| `office/people.js` | The built-in chibi people. |
| `office/avatars.js` | Loads your character models and moves their skeletons with the same poses. |
| `office/persona.js` | Personas: the name, colour, card text and speech lines of each person, read from `models.json`. |
| `office/fx.js` | The little effects: notes, question marks, sweat, steam, smoke, fire, bugs, water, foam and confetti. |
| `office/chaos.js` | Smoke and fire after errors in a row, the panic laps, and fetching and using the extinguisher. |
| `office/features.js`, `office/features/` | The feature modules of the page (your turn, coffee breaks, whiteboard, briefings, paperwork, progress, shift reports, the ask panel). `features.js` says what hooks a feature may answer. |
| `office/server-features/` | The server's feature modules: the room's design, the weather and the characters (uploads, models.json). |
| `office/design.js`, `office/panel.js` | The themes and the rules a design must keep (shared by the page and the server); the panel and its tabs. |
| `hooks/features/` | The feature modules of the mod: what each feature tells the window (`kit.ts` describes the contract and the moments the core mod announces). |
| `office/vendor/` | three.js 0.170.0 with helper files including its GLTF loader (MIT licence, see `THREE_LICENSE`), and three-vrm 3.5.5 (MIT licence, see `THREE_VRM_LICENSE`). They are included so the window works offline. |
| `hooks/studio.tsx` | The older terminal version of the office, used by `/office pane` and when the window cannot open. |

On Windows the window opens as an app window in Microsoft Edge, or in Google Chrome if Edge is not installed (on Linux and macOS, see *Install*). If neither is
installed, it opens in your default browser. It needs Node.js on your `PATH` (`node --version` should work).

To see the office without Claude Code, start the server and open the page with `?demo`:

```
CLAUDE_STUDIO_LOCK=/tmp/test-office.json OFFICE_PORT=47811 node office/server.mjs
```

(The lock-file setting keeps a test server apart from the real office.) Then open `http://127.0.0.1:47811/?demo`.
The demo invents a busy session: agents come and go, and every 90 seconds or so the first agent hits a run of errors,
its desk catches fire and Claude puts it out. `?sessions=3` invents three sessions sharing the office instead: they
join a few seconds apart, and after a minute one ends and its team walks out. The server stops after 45 seconds
unless a session writes to it.

More switches for checking one thing at a time (add them after `?`, joined with `&`):

| Switch | What it does |
| --- | --- |
| `lineup` | Everyone stands in a row facing you, one of each character, going through the moods together. |
| `still=N` | A frozen scene with N agents at their desks. |
| `mood=flow`, `thinking`, `stressed` or `celebrate` | Everyone in that mood. |
| `chaos=1` (or `chaos=claude`) | Five errors in a row for the first agent (or for Claude): smoke, fire and the extinguisher. |
| `hour=22`, `sky=night` or `sky=day` | Sets the time of day. |
| `usage=60,90` | Fills the rack's strips: context 60 %, five-hour limit 90 %. |
| `models=0` | The built-in people only. |
| `focus=claude` (or an agent's id, or `rack`, `poster`, `fire`) and `zoom=3` | Starts close up. |
| `debug` | Prints positions, moods, fires and draw calls to the console every second. |
| `yourturn`, `coffee`, `whiteboard`, `briefing`, `paperwork`, `shift` (or `shift=now`), `progress=N` (`&grow`) | Fakes one feature's data on a demo page, e.g. `?sessions=2&coffee`. |
| `design=<theme>` (`loft`, `scandi`, `neon`, `cabin`, `pastel`, `mono`, `sunset`, `ocean`), `weather=<kind>` (`clear`, `partly`, `cloudy`, `fog`, `drizzle`, `rain`, `heavy`, `storm`, `snow`), `interact` (hints on everything clickable; `&bugs` lets bugs loose), `characters` | The room's design, the weather, the things to click, and sample cards in the Characters tab. |

## Install

The studio was made and tested on Windows 11 and also runs on Linux (for example Ubuntu 24.04) and macOS. It needs
Node.js on your `PATH` (`node --version` should work) and a Chromium-family browser: Microsoft Edge or Google Chrome
on Windows; Google Chrome, Chromium, Edge, Brave or Vivaldi on Linux (otherwise it opens in your default browser).

This repository is its own marketplace. Clone it, then add it from a terminal:

```
git clone https://github.com/taminggg1-cmyk/claude-studio
claude plugin marketplace add ./claude-studio
claude plugin install pixel-office@pixel-office-local --scope user
```

After that, every new Claude Code session opens the studio. The install reads the cloned folder in place, so a change
made there shows up in the next session (or after `/reload-plugins`).

### On Linux

One command installs it, and running it again updates it:

```
curl -fsSL https://raw.githubusercontent.com/taminggg1-cmyk/claude-studio/main/install.sh | sh
```

Or step by step:

```
sudo apt install nodejs git            # or Node.js from nodejs.org / nvm; any recent version
git clone https://github.com/taminggg1-cmyk/claude-studio ~/claude-studio
claude plugin marketplace add ~/claude-studio
claude plugin install pixel-office@pixel-office-local --scope user
```

- The window opens as an app window of the first browser it finds (Chrome, Chromium, Edge, Brave, Vivaldi). On a
  tiling window manager it is tiled like any window. In i3, add this to `~/.config/i3/config` to float it in the
  top-right corner instead:

  ```
  for_window [title="^Claude's studio"] floating enable, resize set 960 560, move position 960 0
  ```

- `/office` brings the window forward (through `i3-msg` in i3, or `wmctrl` where it is installed), or opens a new one.
- *New session* in the panel opens a new tmux window in that folder when tmux is running, else a new terminal
  (`x-terminal-emulator`, GNOME Terminal, Konsole, Alacritty, kitty, WezTerm, foot, xterm...).
- The office server runs in a session of its own (`setsid`), so it keeps going when the terminal that started it
  closes, and stops 45 seconds after the last Claude Code session ends.

No character models come with the studio. Without any, everyone is a built-in chibi figure; see *Character models*
above to add your own.

## Tests

From the cloned folder:

```
claude plugin validate .
claude plugin test .
```

To look at the window without Claude Code, start a test server as shown under *How it works* (with its own
`CLAUDE_STUDIO_LOCK`, or it steps aside for the real office) and open `http://127.0.0.1:47811/` with `?lineup&chatty`
(every character in a row, all talking), `?demo` (a made-up busy session) or `?sessions=3` (three made-up sessions).
