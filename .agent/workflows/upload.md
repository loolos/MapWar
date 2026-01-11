---
description: Verify code correctness, fix errors, and push to repository.
---
// turbo-all

1.  **Verification**:
    -   Run `npm run check` (runs TypeScript check and Vitest).
    -   Run `npm run build` to ensure the production build works.

2.  **Fix Errors (Loop)**:
    -   If any command in Step 1 fails:
        -   Read the error output carefully.
        -   Open the relevant files and fix the issues (syntax errors, type errors, failing tests).
        -   Rerun Step 1.
    -   Continue this loop until `npm run check` and `npm run build` pass successfully.

3.  **Commit and Push**:
    -   Run `git status` to review changes.
    -   Run `git add .` to stage all changes.
    -   Run `git commit -m "Auto-upload: Verified and Fixed"` (or a more descriptive message if you can generate one based on the changes).
    -   Run `git push` to upload to the repository.
