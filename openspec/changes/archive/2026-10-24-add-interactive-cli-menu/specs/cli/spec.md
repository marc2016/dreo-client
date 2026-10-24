# Spec Delta

## ADDED Requirements

### Requirement: Interactive Terminal Menu
The CLI SHALL provide an interactive terminal menu when executed without subcommands or via `dreo menu` / `dreo interactive`, prompting the user through authentication, device listing, device control, and live monitoring.

#### Scenario: Launching interactive menu without arguments
- **WHEN** the user runs `dreo` in an interactive terminal without arguments
- **THEN** the CLI presents a navigable menu with options to login, inspect devices, control devices, or monitor live events

#### Scenario: Interactive device control flow
- **WHEN** the user selects a device from the interactive menu
- **THEN** the CLI displays device-appropriate controls (e.g., target temperature and modes for heaters, speed for fans) and sends the selected commands immediately

