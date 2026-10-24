# device-control Specification

## Purpose
Defines the hybrid device model hierarchy, parameter mapping, state synchronization, and typed device controls for Dreo smart appliances including heaters and fans.

## Requirements

### Requirement: Hybrid Device Model Instantiation
The system SHALL inspect each device model string from cloud discovery and instantiate a specialized class (e.g., `DreoHeater` or `DreoFan`) when recognized, or fallback to the generic `DreoDevice` class when unmapped.

#### Scenario: Instantiating a recognized heater
- **WHEN** a discovered device model matches a known heater identifier (e.g. `DR-HSH...` or Atom 316)
- **THEN** an instance of `DreoHeater` is returned possessing specialized thermostat and heating controls

#### Scenario: Instantiating an unrecognized device model
- **WHEN** a discovered device model is not in the known model catalog
- **THEN** a generic `DreoDevice` instance is returned exposing raw state and generic command methods

### Requirement: Heater Power and Temperature Control
The `DreoHeater` class SHALL provide strongly typed methods to toggle power and set the target thermostat temperature in Celsius or Fahrenheit.

#### Scenario: Setting target temperature on heater
- **WHEN** `heater.setTargetTemperature(22)` is called
- **THEN** the client validates the temperature range and dispatches the corresponding temperature setting command

#### Scenario: Toggling heater power
- **WHEN** `heater.setPower(true)` or `heater.setPower(false)` is invoked
- **THEN** the client dispatches the power state command to the device

### Requirement: Heater Mode and Feature Control
The `DreoHeater` class SHALL provide strongly typed methods for heater modes (Heat levels, Eco, Fan-Only), horizontal oscillation, child lock, and shutdown timer.

#### Scenario: Changing heater operation mode
- **WHEN** `heater.setMode(HeaterMode.Eco)` is called
- **THEN** the client dispatches the mode command and updates the internal device state representation

#### Scenario: Toggling oscillation and child lock
- **WHEN** `heater.setOscillation(true)` or `heater.setChildLock(true)` is called
- **THEN** the client sends the respective boolean flag commands to the cloud or active transport

### Requirement: State Change Event Dispatching
Each device instance SHALL emit local change events whenever its operational parameters are updated via polling or real-time push.

#### Scenario: Device state update event
- **WHEN** an updated state dictionary is received for a device
- **THEN** the device updates its internal state and emits a `change` event with the modified attributes
