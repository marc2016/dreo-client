# Proposal

## Why

Currently, `dreo-client` stores only the raw `token`, `region`, and `email` upon login. The CLI does not track token issuance time or expiration (`expires_in`), cannot display active session information without issuing arbitrary requests, lacks a clean `logout` command to remove stored credentials, and fails with cryptic network/auth errors once a token expires. Adding robust session lifecycle management, status inspection (`whoami`/`status`), session logout, and proactive expiration checks improves security, usability, and developer experience.

## What Changes

- **Session Metadata Tracking**: Save `createdAt` and computed `expiresAt` timestamps alongside `token`, `region`, and `email` in `~/.dreo/session.json`.
- **Session Status Inspection (`dreo status` / `dreo whoami`)**: Add CLI command to display current authenticated account, region, token lifetime, expiration date, and cloud session validity.
- **Session Termination (`dreo logout`)**: Add CLI command to remove local session files and confirm logout.
- **Proactive Expiration Validation**: Check local expiration timestamps before attempting API commands and provide clear guidance to re-authenticate when expired.
- **Interactive Menu Integration**: Add "Session-Status anzeigen" and "Abmelden (Logout)" actions to the interactive Inquirer terminal menu.

## Capabilities

### Modified Capabilities
- `cli`: Add requirements for session status inspection (`whoami`/`status`), session termination (`logout`), and proactive session expiration validation before command execution.

## Impact

- CLI command line interface (`bin/dreo.js`): Added subcommands `status`, `whoami`, `logout`.
- CLI interactive menu (`src/cli/interactive.ts`): Added menu options for session status and logout, plus proactive expiration prompt.
- Session storage format in `~/.dreo/session.json`: Backward-compatible addition of `createdAt` and `expiresAt` properties.

