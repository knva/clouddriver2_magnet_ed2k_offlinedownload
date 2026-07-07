# GUI Batch Push Design

## Goal

Make the desktop GUI use a batch push path when the user clicks "push all", while keeping single-item push behavior unchanged.

## Scope

- Change the GUI `pushAll()` flow to submit one batch request for all eligible links.
- Keep `push(row)` and the existing single-item worker behavior unchanged.
- Add tests for the new batch path in the GUI and client layers.

## Non-Goals

- Do not change the HTTP compatibility API in `server.py`.
- Do not refactor the single-item push flow.
- Do not redesign the QML UI or button states beyond what is needed for batch status updates.

## Current State

`ClipboardController.pushAll()` currently finds rows with `pending` or `error` status and calls `push(row)` for each one. That means the GUI "push all" action becomes multiple single-link `add_offline_file()` calls, even though CloudDrive2 exposes the `AddOfflineFiles` RPC with a `urls` request field intended for offline-download submission.

## Proposed Approach

### Client layer

Add a batch-oriented method in `cd2_client.py` that accepts multiple URLs plus the target folder and check delay. The method will:

- ensure the destination folder exists once
- authenticate once
- call the existing `AddOfflineFiles` RPC once
- return the same response shape already used by the GUI (`success`, `errorMessage`, `resultFilePaths`)

Because the proto defines `urls` as a single string field, the client will encapsulate the request formatting needed for multiple URLs. The GUI will only pass a list of links and will not depend on the wire-format detail.

### GUI controller

Add a dedicated batch worker for the "push all" path. `ClipboardController.pushAll()` will:

- collect rows in `pending` or `error`
- mark those tasks as `sending`
- start one batch worker instead of looping through `push(row)`

When the batch worker finishes:

- if the batch call succeeds, each selected task becomes `done`
- if the batch call fails, each selected task becomes `error`
- the status text summarizes the batch outcome

Single-item pushes continue to use `PushWorker` and `_handle_push_finished()` exactly as they do now.

## Data Flow

1. User clicks the footer "push all" button in QML.
2. `ClipboardController.pushAll()` gathers eligible tasks.
3. A batch worker sends all URLs through the new client batch method.
4. The worker emits one completion signal containing the task ids and shared result.
5. The controller updates each task state and the footer status text.

## Error Handling

- If there are no eligible rows, keep the current "no links to push" style behavior.
- If the batch RPC raises an exception, all selected tasks move to `error` with the same failure message.
- If CloudDrive2 returns `success = false`, all selected tasks move to `error` with the returned error message.
- Existing single-item error handling remains unchanged.

## Testing

### `tests/test_cd2_client.py`

- add a failing test for the new batch client method
- verify it ensures the target folder once and issues one `AddOfflineFiles` call
- verify it passes the combined batch payload through the RPC request

### `tests/test_gui_app.py`

- add a failing test proving `pushAll()` does not call the single-item worker path
- verify one batch client call is made for all eligible tasks
- verify selected tasks transition to `done` on success
- verify task filtering still excludes rows already marked `sending` or `done`

## Risks

- CloudDrive2's batch formatting detail is not explicit beyond the `urls` field name, so the exact string encoding must stay isolated inside the client method.
- Batch success currently returns one shared result, so the GUI cannot infer per-link partial success unless the RPC exposes it. For this change, the GUI treats the batch call as all-or-nothing.

## Acceptance Criteria

- Clicking GUI "push all" results in one batch client call for all eligible rows.
- Clicking GUI single push still uses the existing single-item flow.
- Eligible rows end in `done` after a successful batch push.
- Eligible rows end in `error` after a failed batch push.
- The relevant automated tests pass.
