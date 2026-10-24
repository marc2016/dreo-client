## MODIFIED Requirements

### Requirement: Optional WebSocket Lifecycle Management
The client SHALL allow users to explicitly start and stop persistent real-time monitoring without requiring a persistent connection for REST operations. A WebSocket connection that the client opens on its own to deliver a device command SHALL be short-lived: it SHALL close after a bounded idle period unless monitoring has been started explicitly, and it SHALL NOT by itself keep the host process alive.

#### Scenario: Starting real-time monitoring
- **WHEN** the user calls `client.startMonitoring()`
- **THEN** the client opens a secure WebSocket connection to the regional Dreo streaming endpoint using the authenticated access token

#### Scenario: Stopping real-time monitoring
- **WHEN** the user calls `client.stopMonitoring()`
- **THEN** the client terminates the WebSocket connection, cancels ping/pong timers, and closes the stream cleanly

#### Scenario: Connection opened for a single command
- **WHEN** a device command is sent while monitoring is not active and the client opens a WebSocket connection to deliver it
- **THEN** that connection is closed automatically after the idle period without further commands, and no reconnect is scheduled for it

#### Scenario: Command while monitoring is active
- **WHEN** a device command is sent while monitoring was started explicitly
- **THEN** the command uses the existing connection and the connection stays open until monitoring is stopped

## ADDED Requirements

### Requirement: Stale Connection Isolation
Events emitted by a WebSocket connection that has already been replaced or closed by the client SHALL NOT change the state of the current connection.

#### Scenario: Reconnect immediately after disconnect
- **WHEN** the client disconnects and immediately connects again, and the previous socket reports its close afterwards
- **THEN** the new connection stays open, reports as connected, keeps its heartbeat, and no additional reconnect is scheduled

### Requirement: Connection Follows Credential and Region Changes
When the access token or region is changed while a WebSocket connection is open, the client SHALL re-establish the connection using the new token and regional endpoint.

#### Scenario: Region changed while connected
- **WHEN** `client.setRegion()` is called with a different region while a WebSocket connection is open
- **THEN** the existing connection is closed and a new connection to the new region's endpoint is opened

#### Scenario: Token changed while connected
- **WHEN** `client.setToken()` is called with a different token while a WebSocket connection is open
- **THEN** the existing connection is closed and a new connection authenticated with the new token is opened
