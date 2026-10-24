# Design

## Context

The Dreo CLI stores session state in `~/.dreo/session.json`. Currently, this file contains only `token`, `region`, and optionally `email`. The Dreo OAuth endpoint does not issue refresh tokens, but it does supply `expires_in` (typically 30 to 90 days). Without metadata on when the token was acquired or when it expires, the CLI cannot alert users to expired sessions before issuing requests, and users have no dedicated commands to inspect or destroy session credentials.

## Goals / Non-Goals

**Goals:**
- Store `createdAt` and `expiresAt` timestamps in `~/.dreo/session.json` on successful login.
- Provide `dreo status` / `dreo whoami` commands to inspect authenticated email, region, token lifetime, and remaining days/hours.
- Provide `dreo logout` to remove `session.json` and revoke the local session.
- Add proactive local expiration checking before attempting authenticated API calls.
- Integrate session inspection and logout into the interactive `@inquirer/prompts` menu.

**Non-Goals:**
- Storing user passwords locally (for security, cleartext passwords will not be persisted).
- Background token renewal daemons.

## Decisions

### 1. Centralized Session Manager (`src/cli/session.ts`)
- **Decision**: Extract session reading, saving, deleting, and validation logic into a dedicated helper module (`src/cli/session.ts`) rather than duplicating it across `bin/dreo.js` and `src/cli/interactive.ts`.
- **Alternatives Considered**: Keeping session logic duplicated or solely in `bin/dreo.js`. Centralizing in `src/cli/session.ts` allows shared TypeScript types and clean unit testing.

### 2. Session Schema & Expiration Computation
- **Decision**:
  ```ts
  export interface StoredSession {
    token: string;
    region: DreoRegion;
    email?: string;
    createdAt?: string; // ISO string
    expiresAt?: string; // ISO string
  }
  ```
  When `login()` returns `expires_in` (in seconds), compute `expiresAt = new Date(Date.now() + (auth.expires_in ?? 2592000) * 1000).toISOString()`. Default to 30 days if `expires_in` is absent.
- **Alternatives Considered**: Using UNIX epoch milliseconds. ISO strings are human-readable when users inspect `~/.dreo/session.json` manually.

### 3. Subcommand Aliases
- **Decision**: Support both `dreo status` and `dreo whoami` as equivalent aliases for session inspection.
- **Alternatives Considered**: Supporting only one. Supporting both caters to common CLI conventions (`whoami` from unix/npm, `status` from git/system services).

## Risks / Trade-offs

- **Clock drift / local clock inaccuracies**:
  - *Mitigation*: If the local clock indicates expiration, still allow users to force a refresh or run `dreo login`. If an API call fails with HTTP 401 even before the local expiration date, catch the 401 and suggest re-authenticating.
- **Backward compatibility with existing `session.json`**:
  - *Mitigation*: Handle legacy sessions lacking `createdAt` or `expiresAt` gracefully (treat them as active with unknown expiration rather than throwing an error).

