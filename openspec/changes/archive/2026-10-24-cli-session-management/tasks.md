# Tasks

## 1. Centralized Session Management Module

- [x] 1.1 Implement `src/cli/session.ts` with `StoredSession` interface, `loadSession`, `saveSession`, `clearSession`, `isSessionExpired`, and `formatSessionInfo` functions; verify functions handle missing files and legacy format gracefully.

## 2. CLI Command Integration

- [x] 2.1 Update `bin/dreo.js` to add `status`, `whoami`, and `logout` subcommands, update `login` to store `createdAt` and `expiresAt`, and enforce proactive expiration checks before command dispatch; verify via CLI invocation.
- [x] 2.2 Update `src/cli/interactive.ts` to store expiration timestamps on login, show session details in the main menu, and provide an interactive logout action; verify menu choices.

## 3. Verification & Testing

- [x] 3.1 Add unit tests for `session.ts` in `tests/session.test.ts`, update `README.md` with documentation for `dreo status`, `dreo whoami`, and `dreo logout`, and verify full test suite and build (`npm run build && npm test`).

