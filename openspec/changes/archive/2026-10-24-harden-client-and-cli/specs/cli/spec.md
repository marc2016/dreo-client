## MODIFIED Requirements

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

## ADDED Requirements

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
