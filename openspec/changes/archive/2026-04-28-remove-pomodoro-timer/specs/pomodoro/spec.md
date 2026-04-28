## REMOVED Requirements

### Requirement: Timer State Machine

**Reason**: The Pomodoro feature requires the user to actively initiate work sessions. The user does not use the Pomodoro work technique, so this feature provides zero value in actual operation while occupying dashboard space and adding maintenance overhead. Aligns with the project's "do not design for hypothetical needs" rule.

**Migration**: No migration required. The feature is removed entirely. Any existing `pomodoro_sessions` rows in development databases remain as harmless orphans; new installations will not create the table.

### Requirement: Pause and Resume

**Reason**: Removed together with the Timer State Machine; pause and resume only made sense within an active Pomodoro session.

**Migration**: No migration required.

### Requirement: Background Continuity

**Reason**: Removed together with the Timer State Machine; background continuity was a property of the timer.

**Migration**: No migration required. The application continues to track keyboard, mouse, and active window in the background regardless of Pomodoro removal.

### Requirement: Session Persistence

**Reason**: Removed together with the Timer State Machine; no sessions are produced after removal.

**Migration**: Existing `pomodoro_sessions` table on developer machines is left in place as an orphan. New installations will not create it because `src/utility/index.ts` no longer issues `CREATE TABLE pomodoro_sessions`.

### Requirement: Streak Calculation

**Reason**: Removed together with Session Persistence; streak is derived from sessions.

**Migration**: No migration required.

### Requirement: tRPC API Surface

**Reason**: All `pomodoro.*` procedures (`getState`, `getStats`, `getSettings`, `start`, `pause`, `resume`, `stop`, `skipBreak`, `updateSettings`) are removed. Renderer can no longer call them.

**Migration**: The renderer code that called these procedures (`PomodoroCard.tsx`, App.tsx pomodoro sections) is removed in the same change. No external clients exist.

### Requirement: Settings

**Reason**: Removed together with the timer; settings only governed Pomodoro durations and notification toggles.

**Migration**: Any existing `pomodoro-settings.json` file in the application user-data directory is left untouched as an orphan and is harmless. New installations will not create it.

### Requirement: Notification Behavior

**Reason**: Removed together with the timer; notifications were emitted at Pomodoro phase-end events.

**Migration**: No migration required. The application no longer emits work-end or break-end notifications.

### Requirement: Privacy Invariant

**Reason**: Removed together with the table that the invariant constrained. The project-wide privacy floor (per the project CLAUDE.md) continues to apply to all remaining capabilities (tracker, storage).

**Migration**: No migration required.
