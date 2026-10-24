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
The CLI SHALL allow sending immediate control commands to a device specified by its serial number.

#### Scenario: Changing heater settings via CLI
- **WHEN** the user executes `dreo set <serial-number> --power on --temp 21 --mode eco`
- **THEN** the CLI sends the commands to the target device and reports the success response

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
