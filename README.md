# Forge

A private training log and coach for strength, running and body composition. Runs on your laptop, desktop
and phone, works offline, and costs nothing to run. It works with no account at all, storing everything on
the device you enter it on — and optional sync keeps your devices in step through a free Supabase project
you own.

---

## Running it

```bash
npm install     # once
npm run dev     # open the printed http://localhost:5173 URL
```

For the fast, installable version:

```bash
npm run build
npm run preview
```

## Putting it on your phone and desktop (free)

The app is a PWA, so once it is reachable over HTTPS you install it like a native app.

**Option A — GitHub Pages (free, recommended).** Push this folder to a **public** GitHub repository, then in
the repo go to *Settings → Pages → Build and deployment → Source: GitHub Actions*. This step cannot be
automated: a workflow's own token is not allowed to create a Pages site, so the first deploy fails until Pages
has been switched on by hand once. The included workflow
(`.github/workflows/deploy.yml`) builds and publishes on every push to `main`. Your app lives at
`https://<your-username>.github.io/<repo-name>/`. (Pages is free for public repos; private repos need a paid
plan, so use Option B if you want it private.)

**Option B — Netlify or Cloudflare Pages (free tier, works with private repos).** Connect the repo, set the
build command to `npm run build` and the publish directory to `dist`. Both free tiers are far beyond what a
single-user app needs.

**Option C — no hosting at all.** Run `npm run dev` on your laptop and open
`http://<your-laptop-ip>:5173` from your phone on the same Wi-Fi. Free, but only works while your laptop is
awake and on the same network, and iOS will not let you install it as an app over plain HTTP.

### Installing it as an app

Once it is on HTTPS, install it and it stops being a website: its own icon on the home screen, its own window
with no browser bar, its own entry in the app switcher, offline launch, and long-press shortcuts straight to
logging a lift, a run or your weight. *Settings → Install as an app* has a real install button where the
browser supports one, and the exact taps where it does not.

- **iPhone / iPad** — open in **Safari** (Chrome on iOS cannot install apps) → Share → *Add to Home Screen*.
- **Android** — Chrome → menu → *Install app*.
- **Mac / Windows** — Chrome or Edge → the install icon in the address bar.

This is the free and permanent route, and it is what the app is built for. HTTPS is the one requirement, which
is why it needs one of the free hosts above rather than `npm run dev` — iOS in particular will not install
over plain HTTP.

### Is the iPhone install permanent?

Yes. *Add to Home Screen* is free and does not expire — the icon stays until you delete it, and it survives
reboots and iOS updates. There is no re-signing, no developer account, no 7-day limit. (The 7-day limit people
run into is a different thing entirely: sideloading a *native* app built with a free Apple ID.)

Two details worth knowing, neither of which affects the install itself:

- **Storage.** iOS can clear a web app's stored data if you go a long stretch without opening it. Using the app
  resets that clock, so in practice regular use is enough. The real answer is that **with sync switched on this
  is recoverable**: sign in and the app pulls your whole history back down. It is also why baking the project
  credentials into the build (`.env.example`) is worth doing — then a restore is a sign-in, not a re-setup.
  This matters more than it sounds on iOS: a home-screen app gets its own storage, separate from the Safari
  tab you added it from, so it starts out empty and signs in fresh.
- **Background sync.** iOS will not run sync while the app is closed. It syncs when you open it, come back to
  it, or reconnect — which is exactly when it matters.

**What about a real App Store / Play Store download?** Possible, but that is where the free part ends:

- **Android** is genuinely cheap: [PWABuilder](https://www.pwabuilder.com) turns this app into a signed
  APK/AAB for free, which you can install directly on your own phone. A Play Store listing is a one-time $25.
- **iOS** is not free. The App Store requires the Apple Developer Program at **$99/year**. Sideloading with a
  free Apple ID works but the app stops running after 7 days until you re-sign it in Xcode.

The store route buys very little here. The installed web app already gives you the icon, the standalone window,
offline launch, home-screen shortcuts, sync — and, on iOS 16.4 and later, **web push notifications work in
home-screen web apps too**. What stays genuinely native-only is Apple Health / HealthKit, home-screen widgets,
and Live Activities.

## Offline

The app is offline-first, which matters because gym basements have no signal. Once installed:

- **It launches with no connection.** The app itself is cached on the device by a service worker, so a dead
  network — or a dead host — does not stop it opening. (Verified by killing the server and reloading.)
- **Logging never touches the network.** Sets, runs and weigh-ins are written to the device immediately, and
  the coach, charts and recommendations all recalculate locally. There is no spinner and nothing to wait for.
- **Sync catches up on its own.** While offline the app says so, tells you how many changes are queued, and
  uploads them the moment a connection returns. A failed sync retries, and being offline is never reported as
  an error.
- **The in-progress session is saved as you type**, so a phone that locks or an app the OS evicts mid-workout
  loses nothing.
- **Storage is marked persistent** where the browser allows it, so the OS does not evict your log under
  storage pressure. Browsers usually grant this to installed apps and decline for ordinary tabs — one more
  reason to install it rather than use it from a browser tab, and to keep exporting backups.

## Cross-device sync (optional, free)

Off by default — the app is fully usable without it. Switching it on keeps your phone, laptop and desktop in
step through a Supabase project that belongs to you.

The schema lives in `supabase/migrations/`, so if you connect Supabase's GitHub integration to this repository
it applies on push and stays version-controlled. It is written to be safe to re-run, so connecting the
integration to a project you already set up by hand is a no-op rather than an error.

**Setup, once, about five minutes:**

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, paste and run [`supabase/migrations/20260731000000_init_records.sql`](supabase/migrations/20260731000000_init_records.sql). That creates
   one `records` table and the row-level-security policy that makes your rows readable only by you.
3. In *Authentication → Sign In / Providers*, leave **Email** enabled and turn **off** "Confirm email".
   Sign-in is then an email and a password with no round trip through your inbox — no link to wait for, no
   single-use token for a mail app to consume by previewing it, and identical behaviour in the installed app
   and the browser. (The tradeoff: nothing proves the address is real, so a typo means no password reset. For
   a log you and a few friends use, that is a fair trade; leave confirmation on if you would rather it be
   proven.)
4. In the app: *Settings → Cross-device sync*, paste the **Project URL** and the **anon public** key from
   Supabase → Settings → API, and save.
5. Choose **Create account**, enter your email and a password, and you are signed in.

On any other device, the app opens on a sign-in screen: sign in and your history is pulled down before the
app opens. Nothing else to set up — this repository commits its own project in `.env.production`, so the
deployed app already knows where to sync. Point a fork elsewhere with `.env.local` or a repository variable
(see `.env.example`).

After that it is automatic: a few seconds after you log something, and whenever the app is reopened or comes
back online. There is a *Sync now* button and a last-synced line if you want to check.

**Forgotten password, or would rather not have one?** *Use an email link instead* on the sign-in screen sends
a magic link. Two caveats worth knowing: a link is single-use, and some mail apps consume it just by
generating a preview; and in an installed app, opening a link can bounce you out to the browser. Both are
solved by the 6-digit code shown alongside — add `{{ .Token }}` to the Supabase *Magic Link* email template
(Authentication → Emails) to have the code in the email.

**How conflicts are handled.** Every workout, run, body entry, template and your settings is synced as its
own record with its own timestamp — not as one big document. So logging on your phone at the gym and editing
yesterday's session on your laptop the same day keeps both. Only if the *same* record is edited in two places
does one win, and it is the more recent edit. Deleting a workout, run or entry syncs on purpose; *Erase all
data* is local only and does not wipe your synced history.

`npm test` runs the merge tests covering these cases, including deletions racing edits and two devices
logging the same day.

**Privacy.** The anon key in the app is meant to be public — row-level security is the protection, and it
restricts every row to the signed-in owner. Never put the `service_role` key in the app; it bypasses that.
Supabase's free tier pauses a project after roughly a week of no activity; normal use keeps it awake, and a
paused project is restored from the dashboard.

## Sharing it with friends

The sync schema is already multi-user: every row is scoped to `auth.uid()`, so several people can sign into
the same project from the same deployed URL and each one only ever sees their own log. No code changes
needed. Pick whichever of these fits.

**Option 1 — share your deployment, share your project.** Easiest for them: they open your URL, install it,
enter their email, and they are running. Do these two things in the Supabase dashboard first:

- *Authentication → Sign In / Providers* → turn **off** "Allow new users to sign up", then add each friend
  under *Authentication → Users → Invite*. Without this, anyone who finds the URL can create an account in
  your project (their data would still be private from everyone else — this is about not hosting strangers).
  Note that turning signups off also disables *Create account* in the app, so invite each friend rather than
  telling them to sign themselves up.
- Bake the project credentials into the build (`.env.example`) so they never have to paste a URL or key.

Free-tier headroom is not the constraint: 500 MB of database against a few hundred KB per person per year,
and 50,000 monthly active users. The two things that will actually bite are the **built-in email sender's
few-per-hour limit** (stagger the invites, or plug in a free SMTP provider) and the **project pausing after
about a week of inactivity** — more people using it makes that less likely, not more.

Be straight with them about one thing: you are the project owner, so you can read their rows from the SQL
editor. Row-level security constrains the API, not the owner.

**Option 2 — share the app, not the project.** They open your URL and set up their own free Supabase project
in Settings (5 minutes, the in-app instructions walk through it). Nobody's data touches anyone else's
infrastructure, and you are not administering accounts for your friends. Best if they would rather own their
data, or if you do not want to be the person whose project pausing breaks their sync.

**Option 3 — they just run it locally.** No sync, no account, no project. One device, no setup at all.

`select user_id, count(*), max(updated_at) from public.records group by user_id;` shows who is using it.

What is *not* included is anything social — no shared leaderboards, comparing lifts, or sending each other
programs. Each person's log is fully isolated. That is a separate feature (a profiles table, opt-in sharing
policies, and UI) rather than a setting.

## Backups

Sync is not a backup — it is a mirror, so a bad import propagates. Keep real backups:

- *Settings → Export backup (JSON)* and keep the file in iCloud/Drive/Dropbox.
- *Settings → Import backup* restores it, and (with sync on) republishes it to your other devices.
- *Export CSV* if you ever want the raw rows in a spreadsheet.
- Don't clear your browser's site data for the app's domain without exporting first — with sync off, that is
  your only copy.

---

## What it tracks

**Lifting.** 60+ exercises mapped to muscle groups and movement patterns, plus custom exercises. Log sets,
reps, load, RPE and warm-ups; the previous session's sets are shown on every card so you know what to beat.
Templates pre-fill a session, **Repeat last session** pre-fills the numbers too, and the in-progress session is
saved continuously so a locked phone never loses your work.

Progression is tracked as **estimated 1RM** (Epley) from your best set each session, so a heavy triple and a
set of ten are directly comparable, alongside per-session tonnage and a six-week trend. Beat a best and the
session says so when you save it.

### How to enter a load

**Total weight, bar included.** A 45 lb bar with two 45s per side is entered as `225`, not `90`. Every card
states the convention under the exercise name, because getting it wrong is silent: nothing downstream can tell
a per-side entry from a total, so the estimated 1RM, the tonnage and the block's next prescribed load all
quietly become wrong together.

- **Barbell** — the total load including the bar. The card shows the **per-side plate breakdown** beneath the
  sets, so you enter what you lifted and read off what to hang on the bar. Set your bar weight in Settings (a
  women's bar is 35 lb, a trap bar can be 60), and any total your plates cannot make is flagged rather than
  rounded away.
- **Dumbbell** — the weight of *one* dumbbell, which is how everybody talks about them. Note the consequence:
  bilateral dumbbell work therefore counts toward tonnage at half the weight actually moved.
- **Machine or cable** — whatever the machine reads.
- **Pull-ups, dips, push-ups** — only the weight you *added*. Leave it blank for bodyweight alone; your logged
  bodyweight on that date is added automatically, so a weighted pull-up is compared on total load.
- **Planks and carries** — seconds, not weight.

**Warm up** on any exercise card generates a ramp to your top set — three sets at roughly 40/60/80%, descending
in reps, snapped to loads the plates can make and marked as warm-ups so they never count toward volume.

### Rest between sets

Configured under *Settings → In the gym*, three ways:

- **One duration** — the same countdown after every set (default 90 seconds).
- **By exercise** — a longer rest after compounds than after isolation and core work (default 3 minutes and 1
  minute). Two to three minutes on a heavy squat is what lets the next set match the last; a minute is plenty
  on a curl.
- **Off** — no timer at all. Logging a set just logs it.

The timer is a chip beside the *+ Set* button rather than a modal, so it never blocks logging, with **+30** for
when you need longer and a tap to dismiss. It buzzes on completion where the browser supports it.

**Running.** Distance, time, type (easy / long / tempo / intervals / race), HR, elevation, RPE. Derived:
pace, weekly distance, best time at every standard distance, **Riegel** predictions for the distances you
have not raced, **VDOT** from your best effort and the five training paces that follow from it, plus the
**acute-to-chronic workload ratio** for injury risk and your easy/hard intensity split.

**Body.** Weight, body fat (entered, or estimated from waist/neck/hips with the **US Navy** formula), BMI,
lean mass, fat mass, nine tape measurements and resting HR. Rate of change is a regression fitted through all
your weigh-ins, not a comparison of two days, so water weight does not drive decisions.

**Physique** — a rotatable wireframe body on the Body tab, built from your measurements. Three layers, each a
genuinely different construction rather than the same shape at three sizes:

- **Frame** — an actual skeleton: skull and jaw, a stack of vertebrae, ribcage hoops, sternum, clavicles,
  scapulae, iliac plates and sacrum, and faceted limb bones down to fingers and metatarsals. Straight and
  hard-edged, no curves.
- **Muscle** — 60-plus individual bellies, each swept along the bone it actually attaches to and tapering to a
  tendon at both ends, with its own peak position: a vastus medialis peaks just above the knee, a
  gastrocnemius peaks high into a long Achilles, a biceps past the midpoint. Chest, abs (a paired grid with a
  real linea alba groove), obliques, serratus, lats, traps, erectors, all three deltoid heads, biceps,
  triceps, forearms, glutes, quads, hamstrings, adductors, calves, tibialis and neck. The grooves between
  bellies are left as gaps, because that separation is what "lean" looks like.
- **Fat** — discrete deposits at the sites human bodies actually store fat, built the same way as the muscles
  and coloured by site. Men fill the abdomen first, then the flanks (love handles), lower back, chest and the
  back of the arms; women fill the hips and outer thighs first, then the seat, breasts and lower abdomen. Each
  deposit both thickens *and* spreads as fat mass grows, so a lean body shows small pockets and a heavy one
  shows the masses that dominate its shape. That difference in pattern is why the same body-fat percentage
  looks so different on a man and a woman.

**Identifying the parts.** With a single layer showing, every part is coloured individually with a key beside
the model — chest, shoulders, abs, obliques, back, biceps, triceps, forearms, glutes, quads, hamstrings, calves,
neck, and seven bone regions. Hues are the eight validated categorical slots reused across the body, assigned so
that **no two anatomically touching parts ever share one** (and so the palette's weakest pair, orange against
yellow, never lands on neighbours). Both rules are asserted in the tests.

**Muscles stay aligned with the body.** Every belly is placed by anatomical rule and then *fitted* to the lean
surface it belongs inside — trunk muscles to the torso, arm muscles to the arm, leg muscles to the leg — so
nothing can poke through the skin or drift into the space a limb occupies. The fitting is verified rather than
assumed: a test asserts the raw placement genuinely overflows (so the fitting is doing work), that every fitted
belly then sits inside its section, that fitting constrains without gutting the bellies, and that left and right
stay mirrored.

**Combined view: one surface, not stacked shells.** With muscle and fat both on, the app draws a *single* skin
whose shape is displaced by the muscle underneath — pushed out over each belly, left alone in the grooves
between them — with the strength of that relief set by your actual fat thickness. Lean, and it reads as a lean
body with visible muscle definition; carrying more fat, and the relief flattens and the fat curves are what
remain. It is a mannequin of your body rather than a diagram of it. Relief is centred so it adds shape without
adding size, which the tests assert.

In the combined view the muscle field carves the skin and the fat deposits then swell it locally, so a heavier
body gets a belly and love handles rather than a uniformly wider ring.

The relief measures distance to the nearest muscle *surface* rather than to its centre, which is what lets it
carry through a fat layer of any thickness — and the band it carries over scales with your own fat thickness, so
a small belly like an ab pad still reaches the skin. Tests assert that a lean abdomen shows measurable ridges,
that the ridges shrink monotonically as body fat rises, and that a high-body-fat abdomen is smooth.

**Solid, not transparent.** Each layer fills its own form and writes depth, so the far side is hidden: a front
view shows only the front, and a side view shows the near arm and the side of the leg, with the chest reading in
silhouette. Scrolling over the model zooms it (as in any 3D viewer) rather than scrolling the page.

Switching layers therefore changes the *structure*, not just the colour:

- *Fat off* → every muscle at essentially no fat: completely stripped.
- *Muscle off* → the same bodyweight draped straight over the bare skeleton. Smooth everywhere, no definition
  anywhere.
- *Both off* → bones only.

A timeline scrubs from your first log to a 26-week projection, reshaping the body at each date from that date's
weight and body fat — what you looked like in April, and where the current trend leads. Projections use your
measured rate of change (including your measured lean-mass trend) and stop at your goal weight.

**Why it reads as the right build.** Several things had to be right at once, and each was a real bug found by
measuring rather than by eye:

- **Girths are solved against the shape actually drawn.** Solving the semi-axes with the ellipse perimeter
  formula and then drawing a superellipse overshot every measurement by 4–6% — about 10% too much
  cross-section everywhere, which is why the body read as bigger than its own numbers.
- **Relief carves inward, it does not bulge outward.** A tape measure bridges the grooves between muscles, so a
  measured girth describes the outer envelope. Centring the displacement pushed nearly the whole surface out
  (the bellies sit just under the skin, so almost every point is over one) and inflated the body by an inch.
- **The muscle field samples muscle surfaces, not ring centres.** One sphere per ring, sized to the ring's
  widest extent, turns a flat belly like a pectoral into a three-inch ball that swallows every groove near it —
  so the skin came out smooth no matter how lean the body was.
- **The widest point of the trunk is the armpit, not the nipple line**, which is what produces the straight
  diagonal lat line instead of a rounded barrel.
- **The widest point of the pelvis is the greater trochanter, and it is low** — around half standing height.
  Applying the measured hip width up at the iliac crest made the lower abdomen protrude.
- **A knee is sized by its joint, not as a fraction of the thigh.** Deriving it from thigh girth made the knee
  come out wider than the calf, so the leg had no narrowing anywhere and read as one long tube.
- **Arms hang against the lats.** Forcing a wide gap pushed the hands outside the shoulder line, and the arms
  read as separate strips floating beside the body.

*What it is:* the arithmetic is real. The fat shell's volume is set to match your actual fat mass, distributed
the way each sex stores it; muscle bellies are sized from the gap between bone and lean surface, so they grow
and shrink with measured lean mass. Modelled body volume agrees with the volume implied by your bodyweight and
body fat to within a few percent — that is an automated test, not a claim.

*What it is not:* a scan or a likeness. Tape measurements do not determine shape, so treat it as a directional
picture of composition, and judge fine detail from the mirror. Everything is generated procedurally — no model
file, nothing to license — so it reads as an anatomical diagram rather than a sculpted figure.

## Training blocks

The Coach tab has two halves. **Plan** says what to do next; **Advice** says what is going wrong. The advice is
reactive by design — it catches problems — but progressive overload needs a decision made *in advance* about
what load to attempt next, and a block is that decision written down.

Pick a structure (Upper/Lower 4-day, Full-body 3-day, PPL 6-day, or a lift-and-run hybrid) and you get a
4–6 week block with a deload in the final week. From then on the only interaction is **Start this session**,
which opens the log with every set, rep target and load already filled in — you correct what actually happened
and save. Three things make it more than a checklist:

- **Prescriptions are read out of your log, never stored.** There is no "current weight" field to go stale, so
  editing history or logging on another device changes tomorrow's targets automatically, and a block that syncs
  to a new device works immediately. Repeating a block picks up from the loads you finished on, for free.
- **Rotation, not a calendar.** Sessions advance when you train, not when the week does. Miss Tuesday and it is
  still waiting rather than putting you behind — the difference between a plan you keep and one you abandon in
  week 2. Log something outside the plan and it simply does not count against it.
- **Fatigue still wins.** The plan is consulted immediately *after* the rest-day check and nowhere before it. A
  block that talks over your own recovery signals turns a missed session into an injury.

Progression is **double progression**: the load holds until every working set reaches the top of its rep range,
then steps up (5 lb on compounds, 2.5 lb on isolation) and drops back to the bottom of the range. It reads the
*lowest* rep count across your top sets, not the best one — judging on the best set lets the load run away from
you. One short set repeats the week. Warm-ups are excluded. Deload weeks cut to two-thirds of the sets at 90% of
the load. Every prescription will tell you where its number came from if you tap it.

Adding this needed no database migration: the sync table stores each record as a jsonb payload keyed by
`(user_id, tbl, id)`, so a training block is just a new value of `tbl`, and a device on the previous version
ignores rows it does not recognise instead of failing on them.

## What the coach actually does

The Advice half returns a ranked list — each item says what to change, what the data says,
*why* it matters, and the specific next action. It watches for:

- Muscle groups below their weekly set target, and any that have had no direct work at all
- Push/pull and upper/lower imbalances, and volume concentrated into too few sessions
- Lifts that have stalled for six weeks — read differently when you are in a deficit
- Volume or session RPE running ahead of what you can recover from, and stretches without a rest day
- Weight trending faster or slower than the productive range for your goal, and stalls
- **Lean mass falling** during a cut — the signal that the deficit, protein or lifting stimulus is wrong
- Running load jumping too fast (ACWR > 1.3), too much or too little intensity, long run development
- Distance to your goal race time, and the pace work that closes it
- Calorie and protein targets, recalculated from your current weight, body fat and logged training

- A training block that has run out, so the plan never lapses silently

The **Today** card picks your next session. With a block running that is the next session in its rotation, with
its prescribed loads on the card and a button that opens it pre-filled. Without one it falls back to whichever of
lifting or running is furthest behind the week's plan, led by the muscle groups furthest below target. Either
way, a rest day wins when the fatigue markers say so.

### The numbers behind it

| Quantity | Method |
| --- | --- |
| Estimated 1RM | Epley, capped at 12 reps |
| Set volume | Direct muscles 1.0 per set, assisting muscles 0.5 |
| Weekly set targets | Goal-scaled landmarks, then capped to what your training days can hold |
| Load progression | Double progression on the lowest rep count across top sets; 5 lb compound / 2.5 lb isolation |
| Deload | Two-thirds of the sets at 90% of the load |
| Maintenance calories | Mifflin–St Jeor × activity factor + measured training burn |
| Fat-loss rate target | 0.5–1.0% of bodyweight per week |
| Protein | 2.0–2.6 g per kg of lean mass, highest in a deficit |
| Body fat from tape | US Navy circumference method |
| Race predictions | Riegel (exponent 1.06) |
| Training paces | Daniels VDOT |
| Injury-risk load | 7-day distance ÷ 4-week average distance (target 0.8–1.3) |
| Body shells | Girth → superelliptical cross-sections; fat shell volume matched to fat mass |
| Fat distribution | Sex-specific regional weighting (abdominal vs gynoid) |
| Body volume check | Siri two-compartment densities (fat 0.9, fat-free 1.1 g/cm³) |

These are estimates from population formulas. When the trend on the Body tab disagrees with the calorie
number for two weeks running, the trend is right — the app adjusts on it.

---

## Project layout

```
src/lib/types.ts       data model
src/lib/exercises.ts   exercise library, muscle + pattern mapping, templates
src/lib/calc.ts        all the sports-science math (1RM, VDOT, ACWR, Navy BF, TDEE, trends)
src/lib/recommend.ts   the coaching engine and volume targets
src/lib/program.ts     training blocks: rotation, double progression, deloads, presets
src/lib/gym.ts         plate math, warm-up ramps, rest durations, PR detection
src/lib/store.tsx      on-device persistence, change tracking, backup and restore
src/lib/physique.ts    measurements -> the three body shells (frame / lean / full)
src/lib/bodyMesh.ts    the smooth outer shell (the fat layer)
src/lib/anatomy.ts     joints plus the mesh primitives all layers share
src/lib/muscles.ts     the individual muscle bellies
src/lib/fatDeposits.ts the fat deposits, by sex-specific storage site
src/lib/skeletonMesh.ts  the bones
src/lib/timeline.ts    body composition at any past or projected date
src/components/BodyScan.tsx  the three.js wireframe renderer
src/lib/sync.ts        Supabase sync: auth, pull, record-by-record merge, push
supabase/migrations/    the table and security policy sync needs, as a migration
scripts/test-sync.mjs  sync merge tests (npm test)
scripts/test-coach.mjs     fatigue, load accounting, units and CSV escaping
scripts/test-gym.mjs       plate math, warm-up ramps, rest durations, PR detection
scripts/test-program.mjs   block rotation, progression arithmetic and deloads
scripts/test-physique.mjs  physique model + mesh tests
src/components/        UI primitives and chart wrappers
src/screens/           Today, Lift, Run, Body, Coach (Plan + Advice), Settings, Onboarding
scripts/make-icons.mjs generates the app icons (npm run icons)
```

`npm run build` typechecks and bundles; `npm run typecheck` checks without emitting anything. There are no paid
services, API keys or external calls anywhere in the app.
