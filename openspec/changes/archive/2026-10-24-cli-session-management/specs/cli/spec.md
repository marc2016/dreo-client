# Spec Delta

## ADDED Requirements

### Requirement: CLI Session Status Inspection
The CLI SHALL allow inspecting the current authentication status, active account email, configured region, and token expiration timeframe.

#### Scenario: Display active session information
- **WHEN** the user executes `dreo status` or `dreo whoami` with an active session
- **THEN** the CLI displays the authenticated email, region, session creation date, expiration date, and remaining validity period

#### Scenario: Inspect status when unauthenticated
- **WHEN** the user executes `dreo status` or `dreo whoami` without an existing session file
- **THEN** the CLI reports that no active session exists and suggests logging in

### Requirement: CLI Session Termination
The CLI SHALL allow removing the stored session credentials to log out the user from the current workstation.

#### Scenario: Successful logout
- **WHEN** the user executes `dreo logout`
- **THEN** the CLI deletes the local session file and prints a confirmation message

#### Scenario: Logout when already logged out
- **WHEN** the user executes `dreo logout` without an existing session file
- **THEN** the CLI informs the user that no active session was found

### Requirement: Proactive Session Expiration Validation
The CLI SHALL check whether a stored session token has passed its expiration timestamp before executing authenticated commands, warning the user and preventing failed network requests.

#### Scenario: Executing command with expired session
- **WHEN** the user executes a command requiring authentication and the cached session expiration timestamp is in the past
- **THEN** the CLI aborts the command, warns that the session has expired, and prompts the user to re-authenticate

