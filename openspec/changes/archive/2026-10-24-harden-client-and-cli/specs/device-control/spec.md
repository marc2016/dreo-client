## MODIFIED Requirements

### Requirement: Heater Power and Temperature Control
The `DreoHeater` class SHALL provide strongly typed methods to toggle power and set the target thermostat temperature in Celsius or Fahrenheit. Target temperatures SHALL be accepted only within 5–35 °C, or 41–95 °F when given in Fahrenheit; values outside this range or not finite SHALL be rejected with an error before any command is sent.

#### Scenario: Setting target temperature on heater
- **WHEN** `heater.setTargetTemperature(22)` is called
- **THEN** the client validates the temperature range and dispatches the corresponding temperature setting command

#### Scenario: Rejecting an out-of-range target temperature
- **WHEN** `heater.setTargetTemperature(50)` is called with the default Celsius unit
- **THEN** the call rejects with an error naming the allowed range, no command is dispatched, and the device state is unchanged

#### Scenario: Toggling heater power
- **WHEN** `heater.setPower(true)` or `heater.setPower(false)` is invoked
- **THEN** the client dispatches the power state command to the device
