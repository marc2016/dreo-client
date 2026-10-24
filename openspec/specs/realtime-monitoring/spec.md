# realtime-monitoring Specification

## Purpose
Enables optional real-time push synchronization and command dispatching over persistent WebSocket connections to the Dreo cloud streaming servers.

## Requirements

### Requirement: Optional WebSocket Lifecycle Management
The client SHALL allow users to explicitly start and stop persistent real-time monitoring without requiring a persistent connection for REST operations.

#### Scenario: Starting real-time monitoring
- **WHEN** the user calls `client.startMonitoring()`
- **THEN** the client opens a secure WebSocket connection to the regional Dreo streaming endpoint using the authenticated access token

#### Scenario: Stopping real-time monitoring
- **WHEN** the user calls `client.stopMonitoring()`
- **THEN** the client terminates the WebSocket connection, cancels ping/pong timers, and closes the stream cleanly

### Requirement: Automatic Keepalive and Reconnection
The WebSocket connection SHALL maintain keepalive heartbeats and automatically re-establish connectivity upon unexpected disconnection or network interruption.

#### Scenario: Periodic ping keepalive
- **WHEN** the WebSocket connection is active
- **THEN** heartbeat ping frames are periodically exchanged to verify connection liveness and prevent timeout

#### Scenario: Automatic reconnect on connection loss
- **WHEN** the WebSocket stream disconnects unexpectedly while monitoring is enabled
- **THEN** the client schedules an exponential backoff reconnect attempt without crashing the host process

### Requirement: Live Push Event Processing
Incoming real-time WebSocket payloads SHALL be parsed and routed to matching device instances to update their state and notify subscribers immediately.

#### Scenario: Incoming device telemetry message
- **WHEN** the WebSocket server sends a reported device status payload
- **THEN** the client matches the serial number to the registered device and triggers state updates and `deviceUpdate` events
