# Jeng Architecture

## Core ideas

Jeng is the most bare-bones agentic harness possible.
Out of the box, it knows how to create gadgets to interact with the system and how to commit protocols into memory.
The idea is that Jeng grows with you, evolving to fit specifically your needs.
This should make Jeng particularly well suited to work with local or weaker models.

### Jeng concepts

- **AGENTS file** is a file containing information that should always be loaded into the agent's context.
- **Gadget** is a bun script, written in TypeScript, with a special header with information describing how to use the gadget that is added to Jeng's context.
- **Protocol** is a Markdown file with information committed by Jeng, including a special header that gives Jeng information about when it should load the protocol.
- **Action** is something that Jeng can do out-of-the-box.
    - **Create Gadget** creates a new Gadget that can be used later. This checks the Gadget to make sure it is valid and rejects it otherwise, then puts it to the user to approve. A name that already exists is rewritten.
    - **Create Protocol** creates a new Protocol that can be referenced later. This checks the structure of the protocol to make sure it is valid and rejects it otherwise, then puts it to the user to approve. A name that already exists is rewritten.
    - **Test Gadget** runs a Gadget the model just wrote and throws it away afterwards. It goes through the same gates and the same approval as creating one, so iterating on a Gadget costs a read rather than a rewrite of the home.
    - **Delete Gadget** and **Delete Protocol** remove memory for good. There is no undo and no backup, so both require a reason and put the bytes that are going away to the user.
    - **Load Protocol** pulls a Protocol's body into context when its `when` matches the task.
    - **Load Gadget** hands back a Gadget's whole source, which is otherwise described by its header alone. A gadget the model wrote earlier has left its context, so this is the only way to see what one actually does before rewriting it, and it is learn-only because a work run would have nothing to do with the source.
    - **Load UI** hands over the language a Gadget's `ui` argument is written in, and is the only description of an interface that costs nothing until it is asked for. Which of the two languages it hands over is decided by what the run can draw in.
    - **End** hands control back to the user. It is the only way a turn finishes, so an answer is a call rather than text. Content may be left out of it, because a model that has already said its answer in plain text ends rather than being made to say it twice.
    - **Compact** replaces the transcript with a summary the model writes, so a long turn can keep going instead of running out of context.
- **Config file** is a JSON file named through `-c`/`--config`, holding the homes to load and the model to talk to.
    - It exists so one disk can carry several agents, each with a config of its own.
    - It is the only source of configuration once found, so the environment is a fallback rather than a second voice.
    - Anything it leaves out falls back to the same default the environment would have supplied, which keeps a config file from having to be complete.
- **Style** is the set of tokens a frontend draws in: colors, roundness, fonts, and everything else that
    could be configured. It is segmented by frontend, since a terminal has no roundness and a window has no
    selection highlight. Six are built in, each on a color combination from Wada Sanzo's dictionary.
    - It comes from the config file, then `JENG_STYLE`, then `simple-dark`. It is the one key that keeps
      reading the environment after a config file is found, because a style is presentation rather than
      identity.
- **Mode** is which of the two shapes of Jeng is running: `learn` grows the home, `work` uses only what it holds.
    - It comes from `--mode` and nowhere else. A config file describes an agent, and the mode is a decision about this run rather than a fact about the agent, so it is not written down anywhere the user has to keep in step with it.
    - Learn is the default, because an agent that cannot grow cannot get started.

## Modes

The same agent is two things depending on what it is allowed to do to its home, and the difference is worth more prompt than anything else Jeng spends context on.

- **Learn mode is told what Jeng is for before it is told how a turn goes.** A model that does not know it is meant to grow will finish every task with whatever it happens to have, which is a working agent that never improves. So the identity comes first and says the home is the point, then says how to gain an ability, when to commit a protocol and when to delete one.
- **Work mode gets the rules of a turn and nothing else.** What it grows is already there, so the only remaining question is what to do with it. The prompt is a fraction of learn's, which is the whole reason to have it: an agent with 8k of context gets a much larger share of it for the task.
- **The actions are removed, not discouraged.** Work mode's tool does not list the actions that change the home and does not carry the arguments only they need, so a model cannot spend a turn talking itself into one and a small model never sees the words at all. `test_gadget` goes with them, because a throwaway gadget in a run that cannot keep anything is a turn wasted, and so does `load_ui`, which exists only to describe writing one. `load_gadget` goes too, because source it cannot rewrite is a gadget description with more words on it.
- **A call that names one anyway is refused, and told which mode would have it.** A model asked to work will sometimes reach for what it was asked not to, and a refusal that only says no leaves it with nothing to do instead of something to try.
- **A mode changes the prompt and the tool, never the conversation.** Switching mid-session rewrites neither the history nor what is on disk, and takes hold at the next model call rather than halfway through the current one, so a turn is never spent in two modes at once.
- **The user is shown which mode is in force by color.** A style gives each mode a color, and the window and the terminal read the same one, so the same sentence reads the same way in both. Learn is gold and work is blue in the default style, but that is the style's decision rather than jeng's. The prompt box is bordered in the mode's color because that box is the one thing on screen that is always there to read it. It is washed in a fainter version of the same color, because the transcript scrolls under it and a border showing through reads as a broken one. A line drawn on the surface takes the mode's color darkened rather than the bright one, since a bright accent fills a block but is not there at all as a rule. The user wears a third color, because they are neither mode. What the user answered wears it too, since an approval or a turn-down is the user talking rather than the model reporting on itself.

## Turns

A turn is one message from the user to the moment Jeng hands control back, which it only does through `end`. Keeping a turn well formed is most of what separates an agent that works from one that spirals, so the rules are few and stated once.

- Every message Jeng sends is one call. Text on its own is progress, not an answer, and a model that narrates and then keeps working is doing the right thing rather than finishing. Text the model cannot follow with a call is nudged once, and an empty `end` is the answer to that nudge.
- **A reply is one row, and a turn is as many of them as the model took.** Words arriving a word at a time are one message however many pieces they arrive in, but two replies are two messages even when nothing but words came between them — which is what a model that narrates, is nudged and narrates again produces. So the agent numbers its replies and the transcript merges on that number, and a mode switch or a tool call still splits rows for its own reasons.
- An assistant message carrying a call is always followed by the message carrying that call's result, in the history as well as in the request. A history that keeps the request and forgets the result replays a call the model never saw answered, which is what sends it round again.
- The same action with the same arguments twice in a row means nothing changed in between, so the call is refused and the model is told to say what it knows instead. The turn keeps going, because a repeat is a nudge and not a stop. The same action again *after* something else is legitimate, because the context moved.
- **`input` is a string, and one parse decides whether it is any use.** The schema says a string because a gadget's fields are the model's to write, and a model writes them far more reliably as text it composes than as a nested object a schema has to permit. What the string spells out has to be a JSON object, and anything else — a list, a bare word, an object sent unquoted — comes back as an error rather than reaching a gadget that would trip over it. There is one message for all of them, because they are one mistake wearing different clothes: the shape of what was sent, not which part of it was wrong. The reason a call was refused is what the model is told, including when its arguments were not json at all, because a model that cannot see why is a model that repeats itself.
- A gadget is named after the header it was validated against, not after whatever the model called it, so the name the model reads back is the name on disk.
- Creating a gadget or protocol that already exists rewrites it. The model cannot edit files, so refusing would leave it unable to fix memory it is unhappy with.
- There is no turn limit, because a model that gets stuck should be interrupted rather than cut off at some number the user has to guess. `--max-turns` puts one back for whoever wants one, and stops a turn by returning `stopped after N turns without ending`, which is the only thing in Jeng that ends a turn besides `end` and an interrupt.

### Interruptions and injections

The user is not held back while Jeng works, in either direction.

- The input box stays focused, so anything typed during a turn reaches the model between two of its calls rather than interrupting one. A tool call is only ever answered immediately, so that boundary is the one point where a new user message cannot break a call from its result.
- Aborting throws out of the model request before the reply is recorded, so an interrupted turn leaves nothing half-finished in the history.
- A model request that fails is waited out rather than given up on: one second, doubling, capped at thirty, and a gateway that says how long to wait is believed. It retries forever, because a flaky request is not the model's fault and only the user should decide a turn is over. The reason is said once per turn, since an hour-long outage is one thing to read about. The wait is abortable, so `esc` cuts a backoff short like anything else.
- A gadget already running is not abortable, because a gadget is a function called in-process rather than a process of its own. Interrupting takes effect once it returns — except at an interface or an approval, which are points where the turn is waiting on a human rather than on the model.

## Gadget UI

A gadget may take a second argument, `ui`, draw something with it and await what the user answers. It is
how Jeng puts an interaction in front of someone that it could not have written as prose.

- `ui` is a port, not an implementation. Core defines the vocabulary of what can be drawn and the shape
  of an answer, and the host that runs Jeng draws them and collects the answers, because core has no
  idea what a terminal or a window is. There are two of those ports, `setUi` and `setGui`, for the same
  reason `setApprove` exists: an interface cannot hand one over before it has rendered.
- **Which port a host took is what the run can draw.** A gadget that draws a widget tree needs the
  first, one that draws a react component needs the second, and a run with neither is headless. So the
  surface is not a flag anybody sets but a consequence of what the host installed, and the three gates
  that depend on it — what a gadget is offered, what it may be run, and what it may be created — all
  read the same one value.
- **A draw is one thing in the vocabulary of the surface that will show it.** Core carries a `Draw`
  rather than a widget, because a react component is named in a file rather than described by data, and
  the host is the only thing that can turn a file into something on a screen. Both frontends draw the
  same transcript entries and differ only in what they do with that one variant.
- **One call is one round trip.** A tree of widgets is one thing to be asked, and it resolves to
  `{ name: answer }` for every field filled in. Named fields are what make composition worth anything:
  a gadget can ask three things at once instead of three times, which is the difference between an
  interface shaped for the task and a questionnaire.
- **A field the user walked away from is missing, not empty.** Absent rather than blank, because the
  model has one check to write and it cannot get it wrong. The same is true of a form the user closed,
  and of a widget tree that only drew something.
- **No submit key.** `enter` answers the focused field, and the form is sent when the last one has an
  answer, so no key has to outrank a control's own `enter`. `esc` abandons the form, which is the same
  answer `esc` already gives an approval. A react component has no such rule to keep: it calls `answer`
  when the user has decided something, because it is the one holding the keys.
- **A field the user cannot answer is not a field.** A `select` with no options is a drawing, because
  offering it would take the focus and hold the keys while being impossible to answer — the form would
  come up, promise `enter answer`, and swallow every keystroke. What is reported as a field and what is
  drawn as one form are the same `fields()`, so they cannot drift.
- **A form is one at a time, and it keeps its own answers.** A gadget that asks without waiting can
  leave more than one up; the rest wait rather than reaching for the keys. Each form is keyed by a
  number the agent gave it, because the wrapper around a draw is built twice — once for the transcript
  and once by the host — and only the number survives to say they were one form. It cannot be the object
  the gadget passed: a window is handed its state as JSON, where being the same object stops meaning
  anything, and a form the window cannot recognise is one whose gadget has been left no way to answer.
- **An approval is drawn once too, but as the card rather than as the record.** The transcript keeps it
  either way, so scrolling back shows what was allowed; while it is still being answered the window shows
  only the card, since the record has no buttons and is the same form a second time. The number says which
  one is which, for the same reason a form's does.
- **An interface is drawn once, in the transcript.** A form being filled in is part of the scroll
  region rather than a panel below it, so a tall one scrolls with everything else instead of taking
  rows the prompt needs and being the one thing on screen that cannot be scrolled through. Drawn
  twice, once live and once in the transcript, it is only reachable in the copy nobody can move. The
  live tree is left out of the transcript and put back carrying its answers, so what was asked
  and what was answered stays in place and scrolling back shows the decision the gadget went on to
  make. Exactly twice, no more: a window rebuilds its rows from a number and a component holds
  whatever it is holding, so a state push that changes nothing changes nothing on screen. Naming
  rows by the object holding them would tear the whole scroll down and put it back on every word
  the model says, which is what took a gadget apart while the user was in the middle of one.
- **The window holds what it was shown, because a path is the only thing in a record that can go
  missing.** A widget tree is recorded as the tree, and an approval as its source, but a component
  is recorded as the file it was loaded from — and a gadget run as a draft lives in a temp folder
  that is removed the moment the turn is over. So the source is read at the moment of the draw, while
  the file is still there, and kept for as long as the conversation that drew it. What is kept is
  what was drawn rather than what is on disk now, so a gadget rewritten later leaves the record of
  it as it was actually shown.
- **A gadget that draws is declared in its header**, with `ui: true` for a widget tree or `gui: true`
  for a react component, because whether it has an interface has to be known before it runs rather
  than discovered while it runs. The header also decides the extension, because a gadget that writes
  jsx has to be a `.tsx` file for anything to parse it.
- **No UI means no such gadget.** Absence of a `ui` or a `gui` is what makes a run headless, and a
  headless run leaves both kinds out of the context, refuses to create one and refuses to run one.
  Offering something that cannot work would spend a turn to say so.
- **The language is disclosed, not assumed.** It is fetched with `load_ui` and lives beside the types
  it describes so the two cannot drift, and which of the two it hands over depends on the surface the
  run is in. Nothing else in the tool describes an interface, so a model that never writes one never
  pays for the vocabulary.
- **The vocabulary is what the runtime can actually draw**, and that is checked rather than assumed:
  `text`, `markdown`, `code`, `diff`, `box`, `select`, `input` and `textarea` each have a test that waits
  for the frame that proves they drew. A react component is checked the other way round, by refusing a
  `gui: true` gadget that exports no component to draw.
    - Highlighting is a tree-sitter parser warming up in a worker, so the first markdown or diff takes a
      moment to appear. The grammars are bundled, so nothing is downloaded, but a test that reads a frame
      immediately proves nothing and has to wait for the draw it wants.
    - A select is as tall as it is told and no taller, so its height and whether it spends a row on a
      description are both worked out from the options it was given, and capped so a long list scrolls
      inside the transcript instead of pushing the prompt off the screen.
    - A diff has to be a real unified diff, because a malformed one is reported in the frame rather than
      refused. `git diff` output is already one.
    - `image` is left out because it fails the whole native frame render rather than drawing nothing,
      which in a transcript means a corrupted screen rather than a missing picture.

### Two halves of one file

A gadget that draws a component is a single file that is both run in bun and drawn in a window, which
is the whole of its cost and most of its rules.

- **The component is found by name in the gadget's own source.** The host is told which file, not which
  component, so the header is the only thing that decides what a gadget draws and a new export cannot
  quietly change what an existing one shows.
- **Each half is bundled for the world it runs in.** The bun half because a home folder is a folder of
  scripts with no `node_modules` in it for a jsx runtime or react to be resolved from, and the window
  half because a react component is not a thing a terminal can be given. The file is compiled per run
  rather than per install, because which gadgets exist is decided by a model writing them.
- **The component brings its own react and is given its own root.** React is inlined into a gadget's
  chunk rather than shared with the window's, so two copies can never end up inside one tree; and
  anything a component imports from `node:` is replaced with an empty module rather than refused, so a
  gadget whose bun half needs it still draws.
- **A component that will not build rejects `ui` with the reason.** The alternative is a gadget waiting
  forever on a form that is never going to appear.
- **A component needs nothing to look like part of the app.** The window's stylesheet is on the
  document, so a component that uses its custom properties and plain elements is already consistent,
  and there is no component library for a gadget to have to agree to.

## Gadget Dependencies

A gadget may import packages from npm, and a home is where the ones it can import are installed.

- **A home is a bun project.** `<home>/package.json`, `<home>/bun.lock` and `<home>/node_modules`,
  which is what a gadget at `<home>/gadgets/name.ts` resolves against by walking up. Nothing needs
  to rewrite a specifier, in either half, because bun already looks there first.
- **Bun is not something a user has to install.** A compiled `jeng` carries the runtime, so the
  install is done by asking that executable to be the bun CLI, and a gadget is checked by parsing
  it in-process rather than by shelling out to `bun build`. Jeng is the only thing on PATH.
- **A gadget's packages are resolved by jeng rather than by bun's ambient resolution.** A compiled
  `jeng` does not look in the home when a gadget is loaded from it, so the load fails with a bare
  "cannot find package" for a package that is installed and sitting right there. Each package the
  source imports is resolved against the folders above the gadget before it is loaded, which is
  both what makes it work and what lets a genuinely absent one be named. A component is exempt:
  it is bundled, so it carries its packages with it.
- **`node_modules` being present is what turns bun's auto-install off.** That is the whole safety
  argument: with it, a gadget resolves from the lockfile or not at all, and the global cache is
  never consulted. Without it there is nothing to import from either, since a package a gadget
  wants has to have been asked for.
- **The list is a call argument rather than a header line.** The model states it, validation checks
  it, and `create_gadget` installs it — one place where a package is named, rather than two that
  can disagree. The trade is that the approval shows the source rather than the package list.
- **What is pruned is read off the remaining gadgets, not off what they declared.** A scan of every
  gadget left in the home is what has to stay installed, so a package another gadget is still using
  survives however little that gadget said about it. `delete_gadget` prunes after the deletion,
  because the remaining gadgets are what the answer depends on.
- **A prune that fails is said rather than thrown.** The gadget is gone whatever npm does, and
  reporting a successful deletion as a failure would be a worse lie than a leftover package.
- **A test installs nothing.** A draft lives outside the home, so bun resolves what it imports on
  its own and there is nothing in the home to prune afterwards. The cost is that a test imports
  `latest` where the committed gadget imports the locked version.
- **A gadget's component can use a package too**, which means it has to be one a browser can run.
  The window resolves it from the home rather than from wherever the file being bundled sits, because
  a kept draft is written out beside the server rather than where it was drawn. Only the gadget's
  own imports are asked for; a dependency's resolve from where it was installed.

## Gadget State

A gadget may take a third argument, `state`, and use it to leave something for another gadget or for a
later session. It has two halves, and the two are the same shape on purpose so a gadget written against
one works against the other.

- `state.session` and `state.persistent` both offer `await get(key)` and `await set(key, value)`, both
  async, because a gadget cannot know which one it is holding without checking and there is no reason
  for it to have to.
- **Session state is one object for the whole run**, shared by every gadget whatever home it came from,
  and it holds any value at all. That is what lets one gadget hand a parsed document or a live handle to
  the next without writing it to disk in between.
- **Persistent state is per home**, in `<home>/.state`, and outlives the session. A gadget keeps what it
  commits in the home it came from, so two homes are two agents' memories rather than one shared drawer.
- `clear` empties the session state along with the transcript, because a scratch is only meaningful
  against the conversation it was made in. Persistent state is untouched: it is not part of the
  conversation at all.
- **Only json can be committed.** A function, a `NaN` or a value containing itself is refused by name
  rather than dropped, because `JSON.stringify` would drop it silently and the gadget would read back a
  `null` and never learn why.
- Every read and write goes to the file, so a second Jeng on the same home merges keys instead of
  writing out a whole-file copy it read before the other one did.
- A `.state` that is not a json object is an error naming the file rather than an empty map, because
  reading a broken file as empty throws the keys away without ever saying so.
- `test_gadget` gets the real thing, so a gadget that commits during a test really has committed it. The
  alternative would be a test that behaves differently from the run it is standing in for.

## Sessions

A conversation is written down so a later run can be the same conversation, which is one file per run in `<first home>/sessions`, named after when it started.

- **A session is named by its own beginning.** The file name is that timestamp with the colons swapped out, which is legal on every platform and sorts the way it happened, so a list of them needs no ordering of its own. The milliseconds are in there so two runs started in the same second do not write over each other.
- **It is kept in the first home, not in all of them.** A second home is another agent's memory rather than a filing cabinet for this one's conversations, and one home per session is one place to look for it.
- **Two halves travel together.** The model gets its history and the protocols it had committed; the user gets the transcript, so a session picked back up can be read as well as continued. A one-shot run has no transcript to keep — it printed one to stdout — so what it records is the model's side, which is what picking it back up is for.
- **What is not kept is as deliberate as what is.** The system prompt is rebuilt every turn out of the homes, the `AGENTS.md` chain and the memory, which is why the memory is kept and a prompt is not. A gadget's scratch does not travel either: it holds live handles that mean nothing in another process. Persistent state in `<home>/.state` already outlives the session on its own.
- **A record of a component whose file is gone is dropped rather than kept.** A `test_gadget` lives in a temp folder that is removed the moment the turn is over, and what it drew was only ever held in memory, so there is nothing left to draw. The window drops those rows on the way in; a widget tree is data and needs nothing.
- **A session carries the run it was**: the cwd, the homes, the config file and the mode. Picking one back up is therefore a different agent in a different folder rather than a transcript replayed into this one, and the two travel together as a pair — which is also why the CLI refuses `--session` alongside `--config`, `--home` or `--mode` rather than quietly dropping one of them.
- **It is written on a cadence, before a clear, and on the way out.** Five exchanges is about not paying for a file write nobody notices, not about not losing anything: a run killed outright loses what it said since the last write. A clear writes first and then takes a new name, because what came before is a session of its own now.
- **The write is synchronous**, because the save worth the most is the one on the way out of the process, and an awaited write loses the session exactly when it was asked for. The record is taken at the moment `save` is called rather than when the write lands, so a save asked for before a clear still holds what the clear is about to throw away.
- **Core owns the files and the conversation owns the moment.** `jeng-core` reads, writes and lists them, and knows only what a list needs: the name, the title, the two timestamps. `jeng-view` decides when a conversation is worth writing and what a session has to hold, through a port the host fills in. Neither can do the other's half, which is the whole reason the port exists.
- **A title is the first thing that was asked**, on one line, because a list is read rather than searched. It comes from the transcript where there is one and from the history where there is not.

## Configuration

`config` is the single definition of where Jeng's homes and model come from, so a caller never has to know how they were chosen.

- Resolution is one function, because homes and model are decided together and disagreeing with each other would be the confusing case.
- A resolved config names the file it came from, so a host that was never given one can still say which config it is running.
- A config file that cannot be read, parsed or understood is an error rather than a silent fallback, because an agent quietly running on the wrong model or the wrong memory is worse than one that refuses to start.
- `createAgent` never reads config itself; it takes homes and a model as given. A library should not depend on the caller's working directory, and the CLI is the only place that knows about `-c`.
- The working directory it is given is also the directory it runs in, because a gadget is a script and a script runs somewhere. A window launched from an app icon has a process directory nobody chose, so a gadget left in it would work in the wrong place while the header said otherwise. It is the process that moves rather than a path handed to a gadget, because a relative path only means anything where it is resolved.
- The context window is configured rather than assumed, because a wrong guess is what makes an agent compact too late to be useful.

## Styles

A style is a set of tokens, and a token is a decision that would otherwise be hardcoded somewhere. Colors, roundness, fonts, and the shape of everything either frontend draws are all of them.

- **A style is config, so it is read where config is read.** `jeng.json` can name one of the builtins, point at a file of your own, or inline one; `JENG_STYLE` names a builtin or points at a file. A config file that says nothing about style still lets `JENG_STYLE` work, which is the one place style differs from the model beside it in the file — a style is how something looks rather than which agent it is, so it is not silenced by the file's existence.
- **A token left out is a token not chosen.** Any token a style omits keeps the default style's value, so a style that sets one colour is a style rather than an incomplete document. A token that does not exist, or a value that is not a string, is an error naming it — a style that quietly loses half its colours is indistinguishable from one that was never read.
- **The two halves are genuinely different vocabularies.** The window has roundness and a serif and no selection highlight; the terminal has a selection highlight and neither of the others. So a style is `{ gui, tui }` rather than one flat list, and each frontend reads only its own half.
- **Six styles, each from a different place in an atlas.** Sanzo Wada's dictionary of color combinations, which pairs colors that were never meant to be neighbours — one hue and almost none of it, a serious pair held to a narrow range, and three that will not sit next to each other without a fight. Distinctness is the point of picking from it rather than from taste, and `style.test.ts` holds each one to filling every token and to a paper the others do not have.
- **The window is styled through the stylesheet it is served.** `roots()` writes one custom property per token onto `:root` and the loopback server appends it to `theme.css`, which is why the window needs no new request and no state field for it. The three `--jeng-accent*` names are not tokens: the window points them at whichever mode is in force, so a gadget writing `var(--jeng-accent)` gets the mode too.
- **The terminal is styled by filling in what it already reads.** `theme.ts` exports its values rather than declaring them, and `dress` puts the style in place once before the first frame. Module bindings are live, so this is one place written and seven read, rather than a style threaded through every component to reach a border.
- **The stylesheet's own `:root` is the default style, token for token.** So a page that loaded `theme.css` on its own is still a complete window, and a test holds the two to being the same thing — a stylesheet that has drifted from the style it defaults to is two sources of truth and one of them is wrong.
- **Every style is a valid window, and a readable one.** The window is photographed against the real stylesheet for each of the six, because "these are six palettes" is a claim about pixels and not about code — and the five nobody is looking at are exactly where a palette that reads badly survives. Legibility is not left to the eye either: `contrast.ts` holds every style to the pairs the stylesheet actually draws, which is the only place a two-ground problem shows up. A colour can only be dimmed against one ground, so `dim` is for the desk and `muted` is for the paper and neither is ever asked to do the other's job.

## Context

Jeng cannot see how full its own context is, so it is told: the token count from the last request is the first line of its context, and past four fifths of the window that line tells it to compact.

- The model decides *what* to keep by writing the summary, and *when* to do it by reading the number. Jeng does not truncate on its own, because a summary it wrote itself is worth more than the most recent messages.
- Compaction drops the transcript and nothing else. Loaded protocols are memory rather than conversation, so they survive it.
- The count is one request old, which is exact enough: it is the size of the request the model is about to make.

## Headers

Both concepts that Jeng reads out of its home carry a header, so the model can be told what exists without being shown everything.

A **Protocol** header is YAML frontmatter, because a protocol is a document and has no reason to look like anything else.

```markdown
---
name: deploy-flow
description: the steps to put this service live
when: deploying to a real environment
---
```

A **Gadget** header is a leading block comment holding the same `field: value` lines.
A gadget is a script that Jeng imports and runs, so its header has to leave the file valid TypeScript.
Frontmatter would not.

```ts
/**
 * name: greet
 * description: greets whoever is named in the input
 */

export default async (input: { who: string }) => `hi ${input.who}`
```

A gadget's default export takes the action's `input` and its return value becomes the action's result.
A gadget may take a second argument, `ui`, which draws something and answers with what the user filled
in; its return value is still the action's result, because what the user sees and what Jeng reads are
two different things. What it draws is a widget tree in a terminal and a react component in a window,
and `* ui: true` or `* gui: true` in the header is which. A third argument, `state`, is what a gadget
uses to leave something for another gadget or for a later session, and needs no declaration, because
unlike an interface there is no run in which having state is a claim that cannot be kept.

## Validation

`validate` is the single definition of what a valid gadget or protocol is, and both creation actions go through it before touching the disk.

- Rejections are phrased as one sentence naming the offending field, because that sentence is read by the model, who then gets to fix its own attempt.
- Nothing is written until validation passes, so a rejected creation leaves the home exactly as it was.
- A Gadget the model has not had approved yet lives in a draft outside the home, so a run that is cut short cannot leave a half-written Gadget behind for a later run to find.
- A Gadget is compiled but never executed at creation time, so writing a gadget cannot run arbitrary code before anyone has looked at it. Testing one is the one time it is executed, and that is also the one time it is put to the user first.
- A Gadget that imports a package it did not ask for is refused, because the model asked for the source and not for what the source would download. The check is a scan rather than a resolve, which is what keeps validation off the network.
- A Gadget's packages are installed only after its approval, because installing runs the lifecycle scripts of code the user has not read. One `bun add` for the whole list, so a package that does not exist leaves no manifest behind, and a failed install commits nothing.
- A Gadget or Protocol whose name already exists is overwritten rather than rejected, because the model has no way to edit a file it is unhappy with. It is still validated first, so a rewrite cannot be a way in either, and it is still approved, so a rewrite cannot be a way around being read.
- An approval names the verb as well as the thing, because "rewrite" and "delete" are not the same decision as "create" even when the bytes are identical. The user is always shown the bytes at stake, whether they are about to land or about to go.

```ts
/**
 * name: greet
 * description: greets
 * gui: true
 */

export function View(props: { who: string }) { /* ... */ }

export default async (input: { who: string }) => `hi ${input.who}`
```

## Stack

- **bun** is used as the runtime that powers Jeng.
- **TypeScript** is the main programming language for Jeng.
- **OpenTUI** powers the CLI's TUI.
- **Electrobun** with **Hutch** builds and runs the desktop app, on **Chromium** through the system
  webview.
- **commander** to simplify declaration of the CLI itself.
- **React** and **JSX** powers Jeng's UIs, reactivity and state management.
- **Biome** for linting and formatting (`bun run check`).
- **git** for version management.

## Packages

Four packages, in one direction of dependence: `jeng-core` ← `jeng-view` ← {`jeng-cli`, `jeng-gui`}.

- **jeng-core** is the harness and nothing else. It has no pixels, no dom and no react of its own
  except the one copy it needs to compile a gadget that draws a component. Everything a frontend can
  vary — what a draw looks like, which port it takes, which keys it answers to — is a parameter here.
  A style is a token set rather than a pixel, so the six builtins and the resolution of them sit
  here too: both frontends already read config from one place, and a style nobody resolves twice is
  a style that can disagree with itself.
- **jeng-view** is the conversation as state: the transcript log, the queue of forms waiting to be
  answered, and the approval waiting to be decided. It draws nothing and imports no framework, which
  is what lets a terminal and a window agree about what a turn was without either of them having read
  the other's code.
- **jeng-cli** is the terminal: the executable, the one-shot and piped runs, and the TUI.
- **jeng-gui** is the window: an Electrobun main process that runs the agent in bun, and a react-dom
  view that is a pure function of the state it is sent.

## The window

The desktop app is a second frontend rather than a mode, because a gadget that draws a component cannot
run in a terminal and pretending otherwise would mean offering it somewhere it cannot work.

- **The conversation lives in bun and the window is told about it.** There is one copy of the state and
  the view holds none, so nothing in the browser can disagree with the agent about what happened. The
  bridge carries that state whole, on every change, and the handful of requests a user can make.
- **The window owns its config and its working directory, and applies either by building another
  agent.** A window started from an app launcher was never handed either, and homes, model and the
  `AGENTS.md` chain are all settled when an agent is built, so there is nothing to change but the
  agent itself. The mode carries across, because dropping from work to learn would quietly hand back
  the ability to write to a home.
- **What it picked is a plain text file rather than another store.** `~/.jeng/knownconfigs` is a list
  of paths a person is meant to read, edit and delete, which is the same promise `jeng.json` makes.
- **The window is served over a loopback socket rather than bundled into the app.** One `bun build`
  path then covers a dev run and a packaged app, and the view can be rebuilt without relaunching the
  native side.
- **Anything the view shares with the terminal has to be importable by a browser.** `@jeng/view` takes
  `@jeng/core` for types only, which is what lets the window load the barrel instead of a path around
  it: the agent, the tool schema and the gadget compiler stay out of a bundle with no use for them.
  `place` is the rule about how a path is said, and it is worded rather than computed so both frontends
  can hold to the same one without either of them reaching for `node:path`. `compact` is the same for the
  context count, so a header that could not fit five digits in a terminal says the same short one in a
  window that could.
- **`node:` is dropped for a gadget and refused for the window.** A gadget has a bun half that needs it
  and a component half that does not, so swapping it for an empty module builds cleanly and throws the
  first time anything is called off it. The window has no bun half at all, so `window.test.ts` builds
  it with `node:` refused, which fails the moment anything the window can reach asks for one.
- **What crosses into the window is data, and only data.** The state is serialised as JSON, so anything
  in it that is not data is either dropped without a word or, worse, mistaken for something it is not:
  an object identity that no longer means identity once it has been written down and read back. So the
  resolve that answers a form is held beside the state instead of inside it, and everything a window has
  to recognise is numbered rather than recognised by what it holds — a draw, an approval, and every row
  of the transcript.
- **A gadget's component is compiled when the window asks for it**, because which gadgets exist is
  decided by a model writing them and not by anything that ships with the app. This is also why the
  app runs from source: compiling needs react on disk to compile against.

## File Structure

The following structure includes only the most relevant files and paths of the project.

- `.` (the root of the project)
    - `/package.json` (top level workspace package)
    - `/biome.json` (linter and formatter configuration)
    - `/hutch.config.ts`, `/electrobun.config.ts` (the desktop app's build)
    - `/README.md`
    - `/ARCHITECTURE.md`
    - `/AGENTS.md`
    - `/packages`
        - `/jeng-core` (core jeng behaviors)
            - `/package.json`
            - `/src` (TypeScript files with the core behavior of jeng, `style/` being the six builtin
                styles and the one function that decides which one is in force)
            - `/test`
                `/unit` (unit tests; structure mirrors `../src`)
                `/e2e` (tests mirroring realistic uses of this library)
        - `/jeng-view` (the conversation as state, shared by both frontends)
            - `/package.json`
            - `/src` (the transcript log, the queue of things waiting on a user, and `place.ts`, which is how a path is said)
            - `/test/unit` (unit tests; structure mirrors `../src`)
        - `/jeng-cli` (the CLI and the TUI)
            - `/package.json`
            - `/src` (the TypeScript files with the CLI and TUI used to interact with Jeng through a console)
            - `/test`
                - `/unit` (unit tests; structure mirrors `../src`)
                - `/e2e` (tests simulating user journeys interacting with Jeng's CLI)
        - `/jeng-gui` (the desktop app)
            - `/package.json`
            - `/src` (`main` is the bun main process, `view` is the react-dom window, `picker.tsx` is what the window is pointed at, and `rpc.ts` is the contract between the two halves)
            - `/test/unit` (unit tests; structure mirrors `../src`)
            - `/test/e2e` (the window photographed in a browser, one picture per scenario, compared against the picture kept last)

## Code organization

Each `/src` folder contains a structure of modules and sub-modules.
Folders inside `/src` describe modules with sub-modules and should always have an `index.ts` file.
Each module should only import from sibling modules; there shouldn't be direct imports from the internals of a module.


## Testing strategy

There are two types of tests:

- Unit tests mirror the structure of the source code and validate the behaviors of each exported structure independently.
- E2E tests describe the end to end utilization of the package they're part of.

The window is also photographed. A styling change is one nobody can argue with once it can be looked at, so
each scenario in `jeng-gui/test/e2e` is rendered against the real stylesheet, put in front of a real browser and
compared pixel for pixel against the picture kept last. A name that has never been seen before is simply
recorded; anything that moves fails and writes a diff beside the picture, saying where it moved. The pictures
are kept in the repo so a change shows up as one, and the run's own render and diffs go to `artifacts/pictures`
because that is where they are read. Browsers come from `playwright-core`, which installs none, so a machine
that has not run it before needs `bunx playwright@1.58.2 install chromium`.
