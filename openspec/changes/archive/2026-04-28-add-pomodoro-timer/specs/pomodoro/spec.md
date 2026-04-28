## ADDED Requirements

### Requirement: Timer State Machine

The system SHALL maintain a Pomodoro timer state with exactly three phases (`idle`, `work`, `break`) and an independent `paused` flag that MAY be true only when the phase is `work` or `break`. Transitions SHALL only occur via user actions (start, stop, pause, resume, skipBreak) or automatic phase-end events.

#### Scenario: Start work from idle

- **WHEN** the user invokes `pomodoro.start` while phase is `idle`
- **THEN** the system SHALL set phase to `work`, set `paused` to false, set `remainingSec` to the configured work duration, and schedule a phase-end callback at `Date.now() + workDurationMs`

#### Scenario: Work phase auto-transitions to break

- **WHEN** the work phase reaches zero remaining seconds while not paused
- **THEN** the system SHALL persist the completed work session with `completed = 1`, transition phase to `break`, set `remainingSec` to the configured break duration, and emit a work-end notification if `notifyWorkEnd` is enabled

#### Scenario: Break phase auto-transitions to idle

- **WHEN** the break phase reaches zero remaining seconds while not paused
- **THEN** the system SHALL persist the completed break session with `completed = 1`, transition phase to `idle`, and emit a break-end notification if `notifyBreakEnd` is enabled

#### Scenario: Stop during work persists incomplete session

- **WHEN** the user invokes `pomodoro.stop` during phase `work`
- **THEN** the system SHALL persist the work session with `completed = 0` and `actual_duration_seconds` equal to elapsed seconds excluding paused time, transition phase to `idle`, and cancel the phase-end callback

#### Scenario: Skip break returns to idle without persistence

- **WHEN** the user invokes `pomodoro.skipBreak` during phase `break`
- **THEN** the system SHALL transition phase to `idle`, cancel the phase-end callback, and SHALL NOT persist the break session

#### Scenario: Skip break is rejected outside break phase

- **WHEN** the user invokes `pomodoro.skipBreak` while phase is `idle` or `work`
- **THEN** the system SHALL reject the request with an error and leave state unchanged

### Requirement: Pause and Resume

The system SHALL allow the user to pause and resume an active work or break session without losing remaining time. Paused time SHALL NOT count toward `actual_duration_seconds` of the persisted session.

#### Scenario: Pause during work freezes remaining seconds

- **WHEN** the user invokes `pomodoro.pause` during phase `work` with `paused = false`
- **THEN** the system SHALL set `paused` to true, cancel the active phase-end callback, and freeze the remaining seconds at the value at pause time

#### Scenario: Resume reschedules phase end

- **WHEN** the user invokes `pomodoro.resume` during phase `work` or `break` with `paused = true`
- **THEN** the system SHALL set `paused` to false, schedule a new phase-end callback at `Date.now() + remainingMs`, and continue the phase

#### Scenario: Pause is rejected when idle

- **WHEN** the user invokes `pomodoro.pause` while phase is `idle`
- **THEN** the system SHALL reject the request with an error

##### Example: pause and resume preserves remaining time

- **GIVEN** work session started with workDuration = 1500 seconds, 600 seconds elapsed at unpaused state
- **WHEN** user pauses, waits 60 seconds, then resumes
- **THEN** subsequent `getState` returns `remainingSec = 900`, and the persisted session at completion has `actual_duration_seconds = 1500` (excluding the 60 paused seconds)

### Requirement: Background Continuity

The system SHALL keep the timer running while the renderer window is closed or hidden, until the application quits.

#### Scenario: Timer survives renderer window close

- **WHEN** an active work session is running and the user closes the renderer window
- **THEN** the system SHALL continue counting down, emit notifications at phase-end, and persist completed sessions even with no renderer window open

#### Scenario: Timer state is lost on application quit

- **WHEN** an active work or break session is running and the user quits the application
- **THEN** the system SHALL NOT attempt to resume the session on next launch and the partial session SHALL NOT be persisted

### Requirement: Session Persistence

The system SHALL persist each completed work session and each completed break session to a `pomodoro_sessions` table in the existing SQLite database, with no application name, no window title, and no keystroke data.

#### Scenario: Completed work session row layout

- **WHEN** a work session reaches phase-end
- **THEN** the system SHALL insert one row with non-null values for `started_at` (epoch ms), `ended_at` (epoch ms), `type = 'work'`, `planned_duration_seconds`, `actual_duration_seconds`, and `completed = 1`

#### Scenario: Stopped session marks completed = 0

- **WHEN** the user invokes `pomodoro.stop` during phase `work` or `break`
- **THEN** the system SHALL insert one row with `completed = 0` and `actual_duration_seconds` equal to elapsed unpaused seconds at stop time

#### Scenario: Skipped break is not persisted

- **WHEN** the user invokes `pomodoro.skipBreak`
- **THEN** the system SHALL NOT insert any row for the break

#### Scenario: Persisted row contains no application or input data

- **WHEN** any pomodoro_sessions row is inserted
- **THEN** the row SHALL contain only the seven defined columns and SHALL NOT reference any tracker event, application name, window title, or keystroke

### Requirement: Streak Calculation

The system SHALL compute the current streak as the count of consecutive calendar days (in the local timezone) ending at today on which at least one work session with `completed = 1` exists. A day with no completed work session breaks the streak. Today (the current local date) without a completed session SHALL NOT break the streak; the count SHALL start from yesterday in that case.

#### Scenario: No completed sessions yields streak of zero

- **WHEN** `pomodoro_sessions` contains zero rows with `type = 'work' AND completed = 1`
- **THEN** the system SHALL return `streak = 0`

#### Scenario: Today completed extends streak

- **WHEN** today has at least one completed work session and the prior consecutive days each have at least one
- **THEN** the system SHALL return streak equal to the count of consecutive days from today backward inclusive

##### Example: streak across consecutive days

| Days with completed work session | Today | Streak |
| -------------------------------- | ----- | ------ |
| {today, today-1, today-2}        | done  | 3      |
| {today-1, today-2, today-3}      | none  | 3      |
| {today, today-2, today-3}        | done  | 1      |
| {today-2, today-3}               | none  | 0      |
| {} (empty)                       | none  | 0      |

### Requirement: tRPC API Surface

The system SHALL expose the following procedures under the `pomodoro` namespace via the existing tRPC router used by the renderer.

#### Scenario: getState returns current timer state

- **WHEN** the renderer queries `pomodoro.getState`
- **THEN** the system SHALL return `{ phase: 'idle' | 'work' | 'break', paused: boolean, remainingSec: number, plannedSec: number }` with `remainingSec` computed at query time

#### Scenario: getStats returns today count and streak

- **WHEN** the renderer queries `pomodoro.getStats`
- **THEN** the system SHALL return `{ todayCompleted: number, currentStreak: number }` derived from `pomodoro_sessions` where `type = 'work' AND completed = 1`

#### Scenario: Mutations are exposed for control

- **WHEN** the renderer invokes any of `pomodoro.start`, `pomodoro.pause`, `pomodoro.resume`, `pomodoro.stop`, `pomodoro.skipBreak`
- **THEN** the system SHALL accept the call when the current phase and paused state permit the action and SHALL reject otherwise with an error message identifying the invalid transition

### Requirement: Settings

The system SHALL expose persistent configuration for work duration, break duration, and notification toggles. Defaults SHALL be `workMin = 25`, `breakMin = 5`, `notifyWorkEnd = true`, `notifyBreakEnd = true`. Settings SHALL be stored as JSON in the application user-data directory and read on every `start` to determine phase durations.

#### Scenario: Update settings during idle takes effect on next start

- **WHEN** the user updates settings while phase is `idle`
- **THEN** the next `start` invocation SHALL use the new durations

#### Scenario: Update settings during active session does not affect current phase

- **WHEN** the user updates settings while phase is `work` or `break`
- **THEN** the current phase SHALL retain its `plannedSec` and the new durations SHALL apply on the next phase transition or new start

#### Scenario: Notification toggle controls emission

- **WHEN** `notifyWorkEnd = false` and a work phase reaches phase-end
- **THEN** the system SHALL persist the session and transition phase but SHALL NOT emit a desktop notification

### Requirement: Notification Behavior

The system SHALL emit Electron desktop notifications at phase-end events when the corresponding toggle is enabled, and clicking a notification SHALL focus the main application window.

#### Scenario: Work-end notification body

- **WHEN** a work phase reaches phase-end with `notifyWorkEnd = true` and `breakMin = 5`
- **THEN** the system SHALL emit a notification with title `key-trace` and a body indicating that the work session is complete and a 5-minute break has started

#### Scenario: Break-end notification body

- **WHEN** a break phase reaches phase-end with `notifyBreakEnd = true`
- **THEN** the system SHALL emit a notification with title `key-trace` and a body indicating that the break is over

#### Scenario: Notification click focuses main window

- **WHEN** the user clicks a phase-end notification
- **THEN** the system SHALL restore the main window if minimized and focus it

### Requirement: Privacy Invariant

The system SHALL NOT record any keystroke content, keystroke timing, key character, application name, window title, or input event payload in `pomodoro_sessions` or in any in-memory pomodoro state.

#### Scenario: pomodoro_sessions schema excludes sensitive columns

- **WHEN** the `pomodoro_sessions` table is created or migrated
- **THEN** the schema SHALL define exactly the seven columns `id`, `started_at`, `ended_at`, `type`, `planned_duration_seconds`, `actual_duration_seconds`, `completed` and no others

#### Scenario: In-memory pomodoro state excludes app context

- **WHEN** the renderer queries `pomodoro.getState` at any time
- **THEN** the response SHALL contain only the four documented fields and SHALL NOT include the active application name, window title, or any tracker event count
