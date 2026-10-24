# client-core Specification

## Purpose
Provides cloud authentication, token lifecycle management, regional API endpoint routing, and device inventory retrieval for Dreo smart home accounts.

## Requirements

### Requirement: Cloud Authentication
The client SHALL authenticate with the Dreo Cloud using an email address and password, returning an access token and user metadata.

#### Scenario: Successful login with valid credentials
- **WHEN** valid account email, password, and region are provided
- **THEN** the client receives and stores a valid access token and returns user profile details

#### Scenario: Failed login with invalid credentials
- **WHEN** invalid account credentials or an unverified email are provided
- **THEN** the client raises an authentication error without persisting any token

### Requirement: Regional API Routing
The client SHALL support regional server endpoints, defaulting to Europe (EU) and allowing configuration for North America / Global (US).

#### Scenario: Request routed to EU endpoint
- **WHEN** region is set to `eu`
- **THEN** all REST requests are dispatched to the Dreo European cloud endpoint (`app-api-eu.dreo-cloud.com`)

#### Scenario: Request routed to US endpoint
- **WHEN** region is set to `us`
- **THEN** all REST requests are dispatched to the Dreo US cloud endpoint (`app-api.dreo-cloud.com`)

### Requirement: Device Inventory Retrieval
The client SHALL query the authenticated Dreo account for all registered devices, returning device metadata including serial number, product model, and initial reported states.

#### Scenario: Query device list after authentication
- **WHEN** the user calls `getDevices()` on an authenticated client
- **THEN** the client fetches the registered devices from the cloud and instantiates corresponding device models

### Requirement: Cloud API Error Reporting
The client SHALL treat a cloud response whose `code` field is present and non-zero as a failure and raise a typed error carrying the cloud code and message, instead of returning an empty or partial result. A response body that is not valid JSON SHALL raise an error identifying an invalid response rather than a network failure.

#### Scenario: Device list request rejected by the cloud
- **WHEN** `getDevices()` is called and the cloud answers with HTTP 200 and a body containing a non-zero `code`
- **THEN** the call rejects with an error that includes the cloud code and message, and no empty device list is returned

#### Scenario: Control command rejected by the cloud
- **WHEN** a device command is delivered over HTTP and the cloud answers with a non-zero `code`
- **THEN** the command rejects with a command error that includes the cloud code and message

#### Scenario: Successful response
- **WHEN** the cloud answers with `code` equal to `0` or without a `code` field
- **THEN** the response is processed normally

#### Scenario: Non-JSON response body
- **WHEN** the cloud answers with a body that cannot be parsed as JSON
- **THEN** the call rejects with an error stating that the response was invalid, not that the network request failed

### Requirement: Single Authorization Credential per Request
Authenticated REST requests SHALL carry the access token exactly once in the `Authorization` header (as `Bearer <token>`), so the server never receives a combined or duplicated credential value.

#### Scenario: Authenticated request headers
- **WHEN** an authenticated REST request is sent
- **THEN** the `Authorization` header value equals `Bearer <token>` with no repeated token

### Requirement: Devices Without Serial Number Are Ignored
Device discovery SHALL skip device records that provide neither `sn` nor `deviceSn`, because such devices cannot be addressed by commands or live updates.

#### Scenario: Device record without serial number
- **WHEN** the device list contains a record without `sn` and without `deviceSn`
- **THEN** that record is not returned by `getDevices()` and does not replace any other device

### Requirement: Client Resource Release
The client SHALL provide a way to release all network connections and timers it holds, after which a host process can exit without further action.

#### Scenario: Closing the client
- **WHEN** the user calls `client.close()`
- **THEN** any open WebSocket connection is closed, all heartbeat, reconnect and idle timers are cancelled, and no automatic reconnect is attempted afterwards
