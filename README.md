<div align="center">

# Claude's studio

**Watch your Claude Code sessions come alive in a cosy little office.**

Claude works at her desk. Agents walk in when she hires them. Desks catch fire when the errors pile up.
The team gathers for a morning standup, chats on the sofa and watches TV in the lounge.

[![Version 1.0.0](https://img.shields.io/badge/version-1.0.0-c8775a)](https://github.com/taminggg1-cmyk/claude-studio/releases)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757)](#install)
[![License: MIT](https://img.shields.io/badge/license-MIT-6b8f71)](LICENSE)
[![Windows, Linux and macOS](https://img.shields.io/badge/Windows%20%7C%20Linux%20%7C%20macOS-8a7766)](#install)
[![GitHub stars](https://img.shields.io/github/stars/taminggg1-cmyk/claude-studio?style=social)](https://github.com/taminggg1-cmyk/claude-studio/stargazers)

![Claude (a Dragonite character) at her desk while her team walks in through the door, each person with a name tag that says what they are doing](docs/images/hero.png)

[Install](#install) · [What you see](#what-you-see) · [Your own characters](#character-models) · [Try the demo](#how-it-works)

</div>

> [!TIP]
> If the studio makes your Claude Code day a bit nicer, please **give it a ⭐**. It helps other people find it.

## Install in one minute

You need [Claude Code](https://docs.claude.com/en/docs/claude-code/overview), Node.js and a Chromium-family browser
(Edge or Chrome on Windows).

```
git clone https://github.com/taminggg1-cmyk/claude-studio
claude plugin marketplace add ./claude-studio
claude plugin install pixel-office@pixel-office-local --scope user
```

On Linux one command does it all:
`curl -fsSL https://raw.githubusercontent.com/taminggg1-cmyk/claude-studio/main/install.sh | sh`

Start a new Claude Code session and the office opens next to your terminal. More details are under [Install](#install).

## In short

The studio is a Claude Code mod. It listens to what your sessions do (tool calls, agents, errors, commits, plan mode,
web searches...) and turns each one into something you can watch: a person walking in, a sticky note on the
whiteboard, a letter in the postbox, a fire. The office runs on a small server on your own computer, and what you do
in the window stays there unless you send it to a session from the *Ask the office* panel.

## New in 1.0

- **The lounge.** Characters who are not working hang out on the sofas, drink coffee, play the arcade and chat. When
  Claude hires an agent, one of them gets up and goes to a desk.
- **The lounge TV.** Six made-up channels drawn live. The people off duty watch, laugh, cheer and fight over the remote.
- **Outgoing mail.** Every commit is an envelope on Claude's desk. A push walks the pile to the red postbox.
- **Machines for long jobs.** Long or background commands get a little build-bot at the end of the desk.
- **The blueprint table and the library.** Plan mode sends Claude to a drafting table. Web searches send people to read
  in the library corner.
- **Desk gadgets.** An alarm clock counts down to scheduled runs. A desk phone rings for MCP tools ("On the phone ·
  Slack").
- **Morning standups and the wall calendar.** The first session of the day gathers the team at the whiteboard. The
  calendar marks each day you used Claude Code and keeps your streak.
- **The sessions card.** One row per session, most urgent first. Click a row to fly the camera there.
- **Sound.** Soft room sounds made on the spot (rain, a crackling fire, cheers) and a ding when a session waits for you.
- **Usage numbers on the token rack.** *ctx 42%* and *5h 87%*, coloured like the strips.

## Screenshots

All pictures come from the built-in demo pages (see *How it works*), so nothing in them is real work. They show the
author's own character models, which are not part of the studio (see [Credits](#credits)); without models everyone is
a built-in chibi figure.

<table>
<tr><td width="50%"><img src="docs/images/agents-arrive.gif" alt="Agents walking in through the door, being briefed and sitting down at their desks while a desk catches fire"><br><sub>Agents walk in, get their task from Claude and sit down. Too many errors, and a desk catches fire.</sub></td><td width="50%"><img src="docs/images/moods.jpg" alt="Every character standing in a row and cheering under confetti, each with a name tag"><br><sub>Every character in a row, cheering. Each one has a mood, a colour and their own lines.</sub></td></tr>
<tr><td width="50%"><img src="docs/images/lounge.png" alt="Characters off duty on the lounge sofas, watching TV and chatting"><br><sub>The lounge: whoever is not working hangs out on the sofas and chats.</sub></td><td width="50%"><img src="docs/images/tv.png" alt="The lounge TV's remote card showing a space documentary, with people watching"><br><sub>The lounge TV, with its remote. Six channels, and the watchers react.</sub></td></tr>
<tr><td width="50%"><img src="docs/images/plan-library.png" alt="Claude drawing a floor plan at the blueprint table while an agent reads in the library corner"><br><sub>Plan mode: Claude sketches at the blueprint table. Web research: an agent reads in the library.</sub></td><td width="50%"><img src="docs/images/standup.png" alt="Claude and the people off duty gathering at the whiteboard for the morning standup"><br><sub>The morning standup: everyone gathers at the whiteboard to hear how yesterday went.</sub></td></tr>
<tr><td width="50%"><img src="docs/images/phone.png" alt="Claude holding a desk phone to her ear, with a speech bubble saying Calling Slack and a brass alarm clock on her desk"><br><sub>Desk gadgets: the phone rings for MCP tools, and the alarm clock counts down to a scheduled run.</sub></td><td width="50%"><img src="docs/images/jobs.png" alt="Small build-bot machines at the end of Claude's desk"><br><sub>Long and background commands get a little machine at the end of the desk.</sub></td></tr>
<tr><td width="50%"><img src="docs/images/fire.png" alt="A desk on fire while Claude sprays it with a fire extinguisher"><br><sub>A run of errors sets a desk on fire. Claude fetches the extinguisher.</sub></td><td width="50%"><img src="docs/images/calendar.png" alt="A gold wall calendar with each day of use crossed off"><br><sub>The wall calendar keeps your streak. Thirty days in a row turns it gold.</sub></td></tr>
<tr><td width="50%"><img src="docs/images/overview.png" alt="The whole office with three sessions sharing it, the sessions card at the bottom right"><br><sub>Three sessions share one office. The sessions card lists them, most urgent first.</sub></td><td width="50%"><img src="docs/images/sessions-card.png" alt="The sessions card with one session that needs your OK and one waiting for your turn"><br><sub>A session that needs your OK pulses red. One waiting for you counts the time.</sub></td></tr>
<tr><td width="50%"><img src="docs/images/mail.png" alt="The red postbox by the door with agents walking in"><br><sub>Commits pile up as letters; a push takes them to the postbox.</sub></td><td width="50%"><img src="docs/images/interact.png" alt="The office with hint labels on everything you can click"><br><sub>Hover hints show what you can click: the cat, the plants, the coffee machine and more.</sub></td></tr>
<tr><td width="50%"><img src="docs/images/theme-neon-night.png" alt="The office at night in the Night neon theme, with a city skyline in the windows"><br><sub>Night neon theme, with the night sky outside.</sub></td><td width="50%"><img src="docs/images/theme-cabin.png" alt="The office in the warm Forest cabin theme"><br><sub>Forest cabin theme. There are eight themes in all.</sub></td></tr>
<tr><td width="50%"><img src="docs/images/weather-storm.png" alt="The office at night during a storm"><br><sub>Weather: a storm at night. The room can follow your real forecast.</sub></td><td width="50%"><img src="docs/images/weather-snow.png" alt="Snow falling outside the office windows"><br><sub>Weather: snow outside the windows.</sub></td></tr>
<tr><td width="50%"><img src="docs/images/design-panel.png" alt="The Ask the office panel open on the Design tab, with themes and colour pickers"><br><sub>The Design tab: themes, colours, floors, sofas and lamps.</sub></td><td width="50%"><img src="docs/images/shift-report.png" alt="A shift report card at the bottom left of the office"><br><sub>A shift report card when a session ends.</sub></td></tr>
</table>

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
- **The lounge.** Claude is never alone: the characters who are not working hang out in the lounge, off duty. They sit
  on the sofas (resting, reading, now and then dozing off), fetch a coffee and drink it at the bistro table, play the
  arcade machine once it is unlocked, and chat with each other. Every one to three minutes one of them walks over to
  Claude's desk to say hello (when Claude is busy, less often and more quietly). When Claude starts an agent, one of
  them gets up and walks to a desk instead of a stranger coming in through the door, and when the agent is done they go
  back to the sofa. Who goes is random; to choose, click someone in the lounge and press *Next to work*: their tag says
  *next up* and they take the next agent Claude starts (a character picked in *Add an agent* still wins). People off duty wear only their name tag, marked *off duty*, so the status pills are always the
  people really working. You choose who hangs out: the *Lounge* buttons in the *Characters* tab (until you choose, the
  first three agents do; without character models, three built-in figures do).
- **The lounge TV.** A flat screen on a low console faces the sofa. The people off duty sit down to watch it, and in
  *Auto* it is on while anyone watches. Six made-up channels are drawn live: a cooking show, a nature programme, a
  cartoon, a football match, a space documentary and a kitten cam. The picture's colour spills onto the watchers'
  faces, and they react: they laugh when the cartoon blob bonks his head, cheer a goal, gasp at a comet, and now and
  then say something about the show. Every few minutes someone grabs the remote and changes the channel. Click the TV
  (or the *On TV* tag over it) for the remote: the live picture, the channels, and *Auto*, *On* or *Off*. The choice
  stays in this window.
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
- **Outgoing mail.** Claude's git work arrives as post. Every commit puts an envelope on her desk. When she pushes,
  she picks up the pile, walks it to the red postbox by the door and posts the letters one by one. A pull request goes
  in as a parcel with a red bow, with confetti. Click the postbox to see, for each session, the commits that are not
  pushed yet. The mod reads git's own words in what Claude's shell commands print (the `[main 1a2b3c4] …` line after a
  commit, the `main -> main` lines after a push, the address `gh pr create` prints), so only real commits count, and it
  asks git which commits no remote has yet (`git log --branches --not --remotes`). Commits that were already waiting
  when the session started are on the desk too, and a push you make in your own terminal empties it as well. If Claude
  cannot get up (her desk is on fire), the letters fly to the postbox by themselves.
- **Machines for long jobs.** When a shell command runs for more than six seconds, a small build-bot pops up on the
  floor at the end of that person's desk: a walnut base, a pastel body, brass posts and a print head sliding over a
  growing print. A command Claude runs in the background (a dev server, a watch) gets one at once, and it stays after
  Claude moves on, until the command really ends; a monitor gets a lavender one with a lens that looks about. Hover
  over a machine to see the command and how long it has run. When the job ends, its lamp turns green with a puff and a
  ding, or red with a buzz if it failed, and the machine folds away. One person shows at most three machines, with a
  *+N* tag for the rest. The mod learns that a background command ended from the note Claude Code sends when it
  finishes, and from the list of work still running that each stop carries.
- **The blueprint table and the library.** When a session goes into plan mode, its Claude walks to the drafting table
  by the front desks, unrolls a blue sheet and sketches a floor plan that draws itself line by line. While the plan
  waits for your OK she stays at the table and waves now and then (the bell on her desk still rings). Approved, she
  rolls the sheet up, carries it back and cheers; refused, she crumples it into the basket with a sigh. One Claude
  works at the table at a time; the others plan at their desks. In the library corner on the right (a bookcase, a
  reading armchair, a floor lamp and a globe), whoever searches or reads the web, Claude or an agent, pulls a book and
  reads until they have done no web look-up for about 12 seconds (two readers at most). When Claude uses a skill, she
  fetches the manual with that skill's name on its spine, and it lies on her desk for a minute. Hover over the table or
  the bookcase to see what they are for and the last few searches and skills.
- **Desk gadgets.** When Claude schedules a run for later (a wake-up, or a cron job), a little brass alarm clock stands
  on her desk and counts down to the next one; hover over it to see what is coming. When the run starts, the clock
  shakes and rings, Claude jumps up, taps it off and sits back down. The first time a person uses an MCP tool (Slack,
  Notion, a browser...), a cream desk phone appears on their desk and stays. On each call it rings, the person lifts
  the receiver to their ear and says "Calling <Service>…", and their badge says *On the phone · <Service>* until they
  hang up.
- **The office grows.** The office keeps lifetime counts across all sessions (agents hired, tests passed, fires put
  out, files edited, sessions, commits) in `~/.claude/studio-stats.json`. A trophy shelf on the back wall shows them,
  with the next unlock. Milestones add things to the room: an aquarium (10 agents), an arcade machine (25 tests), a
  gold fire trophy (3 fires), a "SHIP IT" neon sign (100 files), a big plant (20 sessions) and paper planes gliding
  over the desks (50 commits), each with confetti and a banner. Pushes and pull requests are counted too
  (`pushes`, `pull-requests`), without a plaque of their own.
- **Standups and the wall calendar.** A paper calendar hangs on the back wall next to the trophy shelf. Each day you
  used Claude Code gets a red cross, today is circled, and the bottom says your streak (days in a row); hover over it
  to see the streak and your best one. The office keeps these days in `~/.claude/studio-stats.json` too. The first
  session of a new day starts a short standup: Claude and the people off duty gather at the whiteboard, Claude says how
  yesterday went ("Yesterday: 12 commits, 30 files, 2 fires."), someone answers, they cheer and go back. Anyone busy
  stays at work, and Claude goes back at once when her session gets busy. More milestones: a commit after midnight
  puts a little owl on the trophy shelf, a 7-day streak hangs a felt pennant over it, and a 30-day streak turns the
  calendar gold.
- **Shift reports.** When a session ends, a card at the bottom left says how its shift went: how long it ran, files
  changed, agents hired, tests passed, fires put out and commits made, with pushes, pull requests and commits not
  pushed yet when there were any. Click it to close it.
- **The sessions card.** A small card in the bottom-right corner lists every session in the room, one row each, with
  a dot in its Claude's colour and what it is doing. The most urgent come first: a session that needs your OK for a
  tool pulses red, one waiting for you shows how long (m:ss) in amber, then fires, compacting and coffee breaks, and
  otherwise what Claude is doing and how many agents are helping. Click a row to turn the camera to that session's
  Claude. Its bar folds the card into a pill ("3 sessions · 1 needs you"); the choice is remembered, and with only one
  session it starts folded.
- **Sound.** The office has soft room sounds, made on the spot with no sound files. A soft ding plays when a session
  finishes and waits for you (a session that needs your OK stays quiet; its red bell shows it). You also hear rain and
  distant thunder when the weather is wet, a crackle while a desk burns, and a pop or small cheer when someone
  celebrates. The speaker button at the top right, next to *Ask the office*, cycles *All sounds*, *Alerts only* and
  *Off*, and remembers your choice. The window opens with the browser's autoplay rule relaxed so alerts sound at once;
  if your browser still keeps the sound locked, the button shows a small dot and a click anywhere turns it on.
- **Ask the office.** The button at the top right opens a panel: send a prompt to any session (it goes in as if you
  typed it there, and runs as soon as that session is free), start an agent in a session, or open a new terminal
  running Claude Code in a folder (a new session, whose Claude walks in; tick *Remote Control* to reach that session
  from the Claude app on your phone or tablet). Only the window a session opened can do this:
  the session gives it a key in its address after a `#`, which the browser never sends anywhere.
- **Things to do in the room.** Hover over something and a hint says what a click does. Pet the cat (it wakes,
  purrs, and sometimes trots off to another cosy spot; it runs from fires; when Claude has worked alone at the big desk
  for about two minutes, it hops up and naps beside her laptop). Brew a coffee at the machine and click a
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
- **Sizes.** Characters can be made bigger or smaller: each one with its own size slider on the *Characters* tab, and
  everyone at once with *People's size* on the *Design* tab (70% to 200%; the two multiply). The change shows at once.
- **Pick who comes in.** The *Add an agent* tab has a *Character* list: the new agent walks in wearing the character you
  picked (or any free one). A session that was already open when the studio was updated keeps its old mod until you
  type `/reload-plugins` in it; the tab says so instead of sending in the wrong character.
- **The token rack.** A walnut server rack against the back wall has two LED strips. The left one (*ctx*) fills with how
  much of the context window is used. The right one (*5h*) fills with how much of your five-hour usage limit is used.
  They are green under 50 %, amber from 50 % to 80 %, and glowing hot pink from 80 %. The neon *tokens* sign above
  takes the colour of the fuller strip. A strip with no reading (for example no usage limit on your account) shows a
  slow grey scan. A small tag floats over the rack with both readings as numbers (*ctx 42%* · *5h 87%*), each with a
  dot in its strip's colour, or *--* when there is no reading.
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
  "lounge": ["agent-one.vrm"],
  "poster": { "file": "poster.png" }
}
```

- **VRM files work best** (`.vrm`, VRM 0.x or 1.0). They have a standard human skeleton, so every move works: typing,
  chin scratching, head in hands, cheering. A plain `.glb` also loads, but moves only as a whole.
- Agents take the models in turn; a newcomer gets one nobody in the room is wearing, if there is one. While someone is
  off duty in the lounge, a new agent is one of them.
- `lounge` lists the agents who hang out in the lounge when they are not working (the *Lounge* buttons in the
  *Characters* tab write it). Without it, the first three agents do; an empty list means nobody does.
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
| `office/features.js`, `office/features/` | The feature modules of the page (your turn, coffee breaks, whiteboard, briefings, paperwork, progress, shift reports, the ask panel, outgoing mail, the lounge, sound, job machines, the sessions card, the blueprint table and library, desk gadgets, standups, the usage tag). `features.js` says what hooks a feature may answer. |
| `office/server-features/` | The server's feature modules: the room's design, the weather and the characters (uploads, models.json). |
| `office/design.js`, `office/panel.js` | The themes and the rules a design must keep (shared by the page and the server); the panel and its tabs. |
| `hooks/features/` | The feature modules of the mod: what each feature tells the window (`kit.ts` describes the contract and the moments the core mod announces; `git.ts` reads commits, pushes and pull requests out of shell output). |
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
| `lounge` (or `lounge=N`), `catnap` | The lounge on a demo page: `?still=0&lounge` is Claude alone with the people off duty, `?demo&lounge` has agents getting up from the sofa and coming back; `lounge=5` with `models=0` asks for five built-in figures. `catnap` sends the cat to Claude's desk after 8 seconds alone instead of two minutes. |
| `tv` (or `tv=N`, `tv=card`) | The lounge TV on a demo page: `?still=0&lounge&tv` turns it on and gets everyone watching quickly; `tv=N` starts on channel N (1 to 6); `tv=card` also opens the remote. `focus=tv` starts close up. |
| `mail` (or `mail=look`, `mail=list`) | Outgoing mail on a demo page: three commits, a push and a pull request every 50 seconds (`?sessions=2&mail` gives the second session two letters waiting). `look` turns to the postbox; `list` also opens its list. |
| `jobs` | Job machines on a demo page (best with `?still=2&jobs`): a dev server that runs on, a long test run, a lint, a monitor, and a background command that fails, every 40 seconds. |
| `stations` (or `stations=plan`, `stations=library`, `stations=look`) | The blueprint table and the library: plan mode (approved, then refused on the next round), web research for Claude and the first agent, and a skill, every 80 seconds, e.g. `?still=2&stations`. `look` turns the camera to both corners. |
| `gadgets` | Desk gadgets: a wake-up that rings after a 20-second count-down (and every 45 seconds after), a cron job with a later time, and a phone call every 30 seconds (`?demo&gadgets`, or `?sessions=2&gadgets`). |
| `standup` (or `standup=look`, `standup=wall`), `streak=N` | A standup about 5 seconds after load, with sample counts for yesterday (`?still=0&lounge&standup`). `look` turns to the whiteboard, `wall` to the calendar. `streak=N` fakes an N-day streak (7 hangs the pennant, 30 turns the calendar gold). |
| `strip` | Opens the sessions card even with one session (try `?sessions=3&yourturn&strip`). |
| `sound` | Plays every sound in turn, every 3 seconds (`?demo&sound`). A headless page cannot be heard, so `window.__studioSound.log` lists what played. |
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
node tests/lounge-http.mjs
node tests/pick-http.mjs
node tests/standup-http.mjs
```

The three `.mjs` files start a throwaway office server on their own files and check its HTTP side: who hangs out in the
lounge, a character picked for an agent, and the days of use, streaks and once-a-day standup.

To look at the window without Claude Code, start a test server as shown under *How it works* (with its own
`CLAUDE_STUDIO_LOCK`, or it steps aside for the real office) and open `http://127.0.0.1:47811/` with `?lineup&chatty`
(every character in a row, all talking), `?demo` (a made-up busy session) or `?sessions=3` (three made-up sessions).

## Credits

The screenshots show the author's own character models. They are not part of the studio and are not in this
repository: each belongs to its maker, under its own licence.

- *Dragonite* by Chikenator22, and *Pikachu (Libre Cosplay)* by Heesokin. Pokémon characters are © Nintendo, Creatures
  and GAME FREAK.
- *Miku NT* (止丸式初音ミクNT) by 止丸 (@tomaru_o), and *Miku* by siroki_nagi. Hatsune Miku © Crypton Future Media,
  used under the Piapro Character License ([piapro.jp/license/pcl](https://piapro.jp/license/pcl)).
- *Chibi Akari* and *Chibi Yukari* by 灰色の猫 (@gray_laperm). 紲星あかり and 結月ゆかり are registered trademarks of
  Bumpy Factory (VOCALOMAKETS).
- *Evil Pomni* by Ppgrules945. Pomni is from *The Amazing Digital Circus* by Glitch Productions.
- *Catchua*: modelling by らてのす (@Latenos_), design by 苫杜ゆあ (@tomamori_yua).
- *Gyarufam* (ぎゃるふぁむ) by Nara, *Mochi* by かるみゃ糖, *Samueneko* (作務衣ねこ) by もやしちゃん, *LowPoly2* by
  KonnitiwaSekai, and *Mokuri* (レッサーモクリ): base model MOKURI project, edits by キノスラ and たびマル.

The studio's own code, room and built-in figures are under the [MIT licence](LICENSE).

---

<div align="center">

Made with Claude Code. If you enjoyed the studio, a ⭐ on GitHub means a lot.

</div>
