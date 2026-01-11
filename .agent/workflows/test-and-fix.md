---
description: Run type checks and tests, analyze failures, and apply fixes.
---
// turbo-all

1. Run type checking to catch compilation errors.
2. Run `npm run check`

3. Run unit tests to identify logic failures.
4. Run `npm test`

5. Analyze the output. If there are failures:
    - Locate the failing test file and line number.
    - Read the test code to understand the expectation.
    - Read the source code to understand the actual behavior.
    - **AI Debugging Tip**: Use `console.error` instead of `console.log` in AI code. Vitest often suppresses `stdout` but shows `stderr` for failing tests.
    - **Verbose Testing**: Run `npx vitest run --reporter=verbose path/to/test.ts` to see full output if logs are missing.
    - specific tool usage: `grep_search` to find error strings or `view_file` to examine code.

6. Fix the issues.
    - Update the code if the logic is bugged.
    - Update the test if the expectation is outdated (e.g. due to new mechanics like Aura).

7. Check for skipped tests.
    - Search for `.skip` in test files.
    - If found, enable them one by one and fix the underlying issues.

8. Re-run tests to verify the fix.
9. Run `npm test`
