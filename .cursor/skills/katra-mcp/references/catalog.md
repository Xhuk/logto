# Staff MCP catalog

Use these values as-is. Do not invent neighbors.

## Tenant feature keys

A missing key means the feature is enabled. Patch only keys that must change.

- `mfa`
- `organizations`
- `enterpriseSso`
- `customJwt`
- `bringYourUi`
- `actions`
- `samlApplications`
- `customDomains`
- `passkeySignIn`

## Application types

`Native`, `SPA`, `Traditional`, `MachineToMachine`, `Protected`.

`Traditional`, `MachineToMachine`, and `Protected` need `logto_create_application_secret` after create. Create does not return a secret.

## Hook events

`PostRegister`, `PostSignIn`, `PostSignInAdaptiveMfaTriggered`, `PostResetPassword`, `User.Created`, `User.Deleted`, `User.Data.Updated`, `User.SuspensionStatus.Updated`, `TrustedDevice.Created`, `TrustedDevice.Deleted`, `Role.Created`, `Role.Deleted`, `Role.Data.Updated`, `Role.Scopes.Updated`, `Scope.Created`, `Scope.Deleted`, `Scope.Data.Updated`, `Organization.Created`, `Organization.Deleted`, `Organization.Data.Updated`, `Organization.Membership.Updated`, `OrganizationRole.Created`, `OrganizationRole.Deleted`, `OrganizationRole.Data.Updated`, `OrganizationRole.Scopes.Updated`, `OrganizationScope.Created`, `OrganizationScope.Deleted`, `OrganizationScope.Data.Updated`, `Identifier.Lockout`, `Message.RateLimited`, `Grant.LimitExceeded`.
