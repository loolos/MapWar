---
description: Start a dedicated test server, verify gameplay with browser, and shut down the server.
---

1. Start a new development server instance in the background.
    - Use `run_command` with `npm run dev`.
    - **CRITICAL**: Save the `CommandId` returned by this call.

2. Wait for the server to initialize.
    - Use `command_status` (waiting 2-5 seconds) to check the output.
    - Confirm the port number (e.g., http://localhost:5173).

3. Run the verification task using `browser_subagent`.
    - Navigate to the local URL found in step 2.
    - Perform the required testing steps (e.g., UI checks, gameplay loop).

4. Terminate the server process immediately after verification.
    - Use `send_command_input` with the `CommandId` saved from step 1.
    - Set `Terminate: true`.
    - This ensures we don't leave stray servers running (like the one that caused port conflicts previously).
