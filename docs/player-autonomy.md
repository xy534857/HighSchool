# Player autonomy and school obligations

The controllable student now uses the same native Soar kernel, tuning routines,
needs and personal policy installation as the NPCs. `controlled` grants input
permission; it no longer disables cognition. The school pack enables autonomy by
default. Worlds without that option retain the previous opt-in player behavior.

## Control ownership

`foundation/autonomy.js` contains input arbitration. `SchoolService` owns the
manual queue. A manual command cancels an interruptible automatic task (releasing
its resource lease) and takes priority over subsequent autonomous decisions.
A manually directed task, queued command or manually opened conversation keeps
ownership until it ends. Non-interruptible work completes before the queue runs.
After manual completion the default grace is two game minutes; cancellation gives
three. The footer exposes an autonomy switch and labels task ownership.

The authored `skip-class` action uses the generic `autonomy.defer` effect. It
blocks automatic actions in the `class` group until the end of the current
period; it does not disable needs or attendance. Explicitly returning to class
clears that deferral. The next lesson has its own schedule. Disabling autonomy is
also available, and does not exempt the player from world rules.

## Configurable obligations

`school-tuning.json` now declares `obligations`. Each definition supplies members,
period, weekdays, room, valid attendance actions, supervisor conditions/actions,
grace, absence threshold, remediation action and messages. No student ID or school
room is embedded in the generic obligation evaluator. `prepare-class` and
`prepare-teach` start ten minutes before a class. Class periods apply on weekdays.

For this pack, five accumulated game minutes without attending permit a teacher
reminder; fifteen minutes produce a missing-class record and a fifteen-minute
makeup exercise. Physical classroom presence alone is insufficient: the student
must actually be performing the declared class action. Tasks are sampled before
completion/renewal, avoiding false absence at the boundaries of continuous study.
Only a teacher who is physically in the classroom and performing a supervision
action can issue a record. The teacher does not learn an absent student's location
or private activity. Notifications use an explicit school-notice channel, not
speech audible across rooms. A returning student receives a classroom response.

Records persist in world state. Observed notifications and their provenance enter
the recipient's native Soar episodic/semantic memory. Records have stable IDs per
student and scheduled period; reminders and assignments are emitted once. Late
arrival does not itself create a makeup assignment. Returning or completing
makeup preserves the original attendance record.

After school, pending records bind as personal `obligation` roles to the authored
`make-up-work` action. This requires walking to the student's desk and completing
fifteen minutes of real work; its effect settles exactly one outstanding record.
The routine takes priority over elective activities, consuming time the student
would otherwise have spent on them. Players may still override it. It is not an
automatic grade drop, expulsion or a complete disciplinary simulation.

## Rule authoring and saves

The model contract exposes obligations, routines and the obligation candidate
fields. New domain obligations can use the same mechanism by adding tuning,
without a character-specific branch in the kernel. Policies and memory conditions
can choose remedial interactions through the existing native compilation path.
No external model calls are required for this repair.

An additive school revision migrates old embedded content on load, preserving
custom actions outside the upgraded authored IDs, actor memory, native rules,
goals and queued commands. Player rules are installed only if absent. Arbitration
state, the autonomy switch, period deferrals, attendance and unfinished work are
saved and restored.

## Verification

`tests/campus/player-autonomy.test.mjs` exercises no-input class and lunch,
manual interruption and queues, purposeful skipping, teacher memory, return,
real makeup completion, save/load idempotency, late arrival, and absent-supervisor
visibility. The situation regression now tests that the player is not cast or
assigned a situation plan, allowing the player's independent everyday autonomy.
Existing physical interactions and multi-turn consent/loan tests are retained.
Browser checks use the same visible controls as a player, with no injected game
state or fake model output.

Final validation (2026-09-09): `npm test` passed 21/21, including the legacy
content upgrade and all foundation/campus regressions. Browser UI evidence is in
`research/campus/player-autonomy-browser.json` and the matching screenshot. It
records automatic class participation, manually deferring at 09:06 and walking
to the playground, teacher absence/makeup notifications at 09:19, automatic
attendance in the next lesson, and restoration at 10:44 with one makeup still due.
The cooperative situation tests run in the authored after-school occurrence,
where there is time to negotiate and work; morning preparation yields to class.
No model API calls were made.
