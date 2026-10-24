# cli Specification

## Purpose
Provides an executable command-line interface (CLI) for authenticating, inspecting devices, adjusting settings, and observing live WebSocket telemetry from the terminal.

## Requirements

### Requirement: CLI Authentication and Configuration
The CLI SHALL allow authenticating with Dreo credentials and caching the resulting token and chosen region locally for subsequent commands.

#### Scenario: Login via CLI
- **WHEN** the user executes `dreo login --user <email> --password <pass> --region <eu|us>`
- **THEN** credentials are authenticated against the cloud and session configuration is stored securely in the user profile directory

### Requirement: CLI Device Listing and Status Inspection
The CLI SHALL list all registered devices with their serial numbers, model types, and current power/temperature states, and allow deep inspection of a specific device.

#### Scenario: Listing devices
- **WHEN** the user executes `dreo list`
- **THEN** a formatted table of all discovered devices with their serial numbers, names, models, and connection statuses is displayed

#### Scenario: Inspecting single device state
- **WHEN** the user executes `dreo get <serial-number>`
- **THEN** the full current state dictionary and parsed attributes are output in readable JSON or tabular format

### Requirement: CLI Device Control
The CLI SHALL allow sending immediate control commands to a device specified by its serial number. Control flags SHALL be applied through the device type's typed controls, so that the same protocol values are sent as from the library API, and flag values SHALL be validated before any command is sent.

#### Scenario: Changing heater settings via CLI
- **WHEN** the user executes `dreo set <serial-number> --power on --temp 21 --mode eco`
- **THEN** the CLI sends the commands to the target device and reports the success response

#### Scenario: Heater mode flag uses device mode values
- **WHEN** the user executes `dreo set <heater-serial> --mode heat --level 2`
- **THEN** the CLI sends the heater's heat mode at level 2 using the same parameters as the library's heat-level control

#### Scenario: Invalid flag value
- **WHEN** the user passes a flag without a valid value, such as `--oscillate` without `on`/`off`, `--mode` with an unknown mode, or a non-numeric `--temp`
- **THEN** the CLI exits with a non-zero status and an error naming the flag, and no command is sent

#### Scenario: Flag not supported by the device type
- **WHEN** the user passes a heater-only flag such as `--temp` for a fan, or a fan-only flag such as `--speed` for a heater
- **THEN** the CLI exits with a non-zero status and an error stating that the flag is not supported for that device, and no command is sent

### Requirement: CLI Live Stream Monitoring
The CLI SHALL provide a monitoring mode that connects via WebSocket and streams live status updates to stdout until interrupted.

#### Scenario: Monitoring live stream in terminal
- **WHEN** the user executes `dreo monitor`
- **THEN** the CLI starts real-time monitoring and prints formatted timestamped events as devices report state changes

### Requirement: Interactive Terminal Menu
The CLI SHALL provide an interactive terminal menu when executed without subcommands or via `dreo menu` / `dreo interactive`, prompting the user through authentication, device listing, device control, and live monitoring.

#### Scenario: Launching interactive menu without arguments
- **WHEN** the user runs `dreo` in an interactive terminal without arguments
- **THEN** the CLI presents a navigable menu with options to login, inspect devices, control devices, or monitor live events

#### Scenario: Interactive device control flow
- **WHEN** the user selects a device from the interactive menu
- **THEN** the CLI displays device-appropriate controls (e.g., target temperature and modes for heaters, speed for fans) and sends the selected commands immediately

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

### Requirement: CLI Process Termination
One-shot CLI commands and the interactive menu SHALL release all network connections when they finish, so the process exits on its own. Interrupting the interactive menu with Ctrl+C SHALL end the program without printing a stack trace.

#### Scenario: Process exits after a control command
- **WHEN** the user executes `dreo set <serial-number> --power on` and the command succeeds
- **THEN** the CLI prints the result and the process exits without waiting for further input or timeouts

#### Scenario: Leaving the interactive menu
- **WHEN** the user chooses "Beenden" in the interactive menu after controlling a device
- **THEN** the process exits immediately

#### Scenario: Ctrl+C in the interactive menu
- **WHEN** the user presses Ctrl+C at any interactive prompt
- **THEN** the CLI prints a short goodbye message, releases connections, and exits without an error stack trace

### Requirement: Separate CLI Entry Point
The package SHALL expose the interactive menu and session helpers through a dedicated `dreo-client/cli` entry point, and the main `dreo-client` entry point SHALL NOT load interactive prompt dependencies.

#### Scenario: Importing the library
- **WHEN** a consumer imports or requires `dreo-client`
- **THEN** the client, device classes, errors and types are available without loading the interactive prompt library

#### Scenario: Importing CLI helpers
- **WHEN** a consumer imports `dreo-client/cli`
- **THEN** `runInteractiveMenu` and the session helpers (`loadSession`, `saveSession`, `clearSession`, `isSessionExpired`, `formatSessionInfo`) are available
