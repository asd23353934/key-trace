## ADDED Requirements

### Requirement: Daily Heatmap Query

The system SHALL expose a query that returns per-day activity counts for a configurable rolling window of weeks. Activity SHALL be defined as the sum of `keydown` and `mousedown` columns from the `events` table; `mousemove`, `wheel`, and `mouse_distance` SHALL be excluded.

#### Scenario: Query returns rows for each day in the window

- **WHEN** the renderer queries `historical.heatmapDaily({ weeks: 53 })`
- **THEN** the system SHALL return an array of `{ date: 'YYYY-MM-DD', count: number }` covering days from `today - 53*7 + 1` to today inclusive (in the user's local timezone), with one entry per day that has any events; days with zero events MAY be omitted from the response

#### Scenario: Days outside the window are excluded

- **WHEN** the system aggregates events for the heatmap query
- **THEN** rows whose `minute_ts` represents a date earlier than the window start SHALL NOT be included

#### Scenario: Date keys use local timezone

- **WHEN** the system constructs the `date` field for a row
- **THEN** the `date` SHALL be the date in the user's local timezone (matching SQLite `date(..., 'localtime')` output format), not UTC

##### Example: window of 4 weeks ending on a fixed date

- **GIVEN** today is 2026-04-29 (Wednesday) and the events table contains events on 2026-04-01 and 2026-04-02 only
- **WHEN** the renderer queries with `weeks: 4`
- **THEN** the response covers dates from 2026-04-02 (today - 27 days) to 2026-04-29; the 2026-04-01 events SHALL NOT appear

### Requirement: Hourly Distribution Query

The system SHALL expose a query that returns the activity count distributed across the 24 hours of the day, aggregated over a configurable rolling window of days. Activity definition matches the heatmap query (`keydown + mousedown`).

#### Scenario: Query returns 24 hour buckets

- **WHEN** the renderer queries `historical.hourlyDistribution({ days: 7 })`
- **THEN** the system SHALL return an array of `{ hour: 0..23, count: number }` with exactly 24 entries; hours with zero events SHALL be present with `count = 0`

#### Scenario: Bucket assignment uses local hour-of-day

- **WHEN** an event timestamp is aggregated into an hour bucket
- **THEN** the hour SHALL be the local-time hour `[0..23]` of that timestamp, not the UTC hour

##### Example: hourly distribution for 2-day window

- **GIVEN** events occurred at local times 09:30 (10 events), 09:45 (5 events), 14:00 (3 events) over the last 2 days
- **WHEN** the renderer queries with `days: 2`
- **THEN** the response contains 24 entries; entry with `hour: 9` has `count: 15`; entry with `hour: 14` has `count: 3`; all other hours have `count: 0`

### Requirement: Heatmap Calendar Component

The system SHALL provide a renderer component that displays the daily heatmap data as a 7-row × N-column CSS grid where N equals the number of weeks in the window, with each cell colored according to its activity intensity.

#### Scenario: Cell positioning by day-of-week

- **WHEN** the heatmap renders
- **THEN** the row index of each cell SHALL correspond to the day of the week (Sunday = 0 or Monday = 1 per locale convention) and column index SHALL correspond to the week ending at that date

#### Scenario: Color intensity scaled by activity

- **WHEN** a cell with `count > 0` renders
- **THEN** the cell SHALL be assigned one of 4 non-empty intensity levels based on quantile-derived thresholds computed from the current dataset; cells with `count = 0` SHALL render with the empty (grey) color

#### Scenario: Cell tooltip shows date and count

- **WHEN** the user hovers over a cell
- **THEN** a native `title` tooltip SHALL display the cell date and activity count; format SHALL include both pieces of information in a human-readable form

#### Scenario: Component is stateless

- **WHEN** the component receives props `{ data, weeks }`
- **THEN** it SHALL NOT make tRPC queries internally and SHALL only render based on the supplied props

### Requirement: Hourly Chart Component

The system SHALL provide a renderer component that displays the hourly distribution as a bar chart with 24 bars (one per hour 0..23).

#### Scenario: Chart uses Recharts BarChart

- **WHEN** the component renders
- **THEN** it SHALL use the project's standard chart library (Recharts) for the bar rendering

#### Scenario: X axis labels show hour numbers

- **WHEN** the chart renders
- **THEN** the X axis SHALL show hour labels in 24-hour format (e.g. `0`, `6`, `12`, `18`, `23` or similar; not all 24 need labels but the labeling SHALL allow the user to identify the hour for any bar)

#### Scenario: Tooltip on bar hover

- **WHEN** the user hovers over a bar
- **THEN** the system SHALL display a tooltip with the hour and the activity count

#### Scenario: Component is stateless

- **WHEN** the component receives prop `{ data }`
- **THEN** it SHALL NOT make tRPC queries internally and SHALL only render based on the supplied data

### Requirement: tRPC API Surface

The system SHALL expose two new procedures under the existing `historical` namespace, both accepting a windowing parameter validated by a strict schema.

#### Scenario: heatmapDaily accepts weeks parameter

- **WHEN** the renderer calls `historical.heatmapDaily` with input `{ weeks: number }` where `weeks` is a positive integer between 1 and 104 inclusive
- **THEN** the system SHALL accept the call and return the heatmap data

#### Scenario: heatmapDaily rejects invalid input

- **WHEN** the renderer calls `historical.heatmapDaily` with input violating the schema (non-integer, ≤ 0, > 104, or wrong shape)
- **THEN** the system SHALL throw a `TRPCError` with code `BAD_REQUEST`

#### Scenario: hourlyDistribution accepts days parameter

- **WHEN** the renderer calls `historical.hourlyDistribution` with input `{ days: number }` where `days` is a positive integer between 1 and 365 inclusive
- **THEN** the system SHALL accept the call and return the hourly distribution

#### Scenario: hourlyDistribution rejects invalid input

- **WHEN** the renderer calls `historical.hourlyDistribution` with input violating the schema
- **THEN** the system SHALL throw a `TRPCError` with code `BAD_REQUEST`

### Requirement: Privacy Invariant

The system SHALL maintain the project-wide privacy floor: heatmap and hourly queries SHALL only return aggregate counts derived from `events.keydown` and `events.mousedown` columns. The query results SHALL NOT contain application names, window titles, raw event timestamps, or per-key data.

#### Scenario: Response shape excludes sensitive fields

- **WHEN** either query returns data
- **THEN** the response objects SHALL contain only `date` / `hour` and `count` fields and SHALL NOT contain `app_name`, window title, individual event records, or per-key counts
