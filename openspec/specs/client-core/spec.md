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
