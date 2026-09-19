---
"@logto/schemas": minor
---

support multi-tenant deployments with per-tenant feature flags

- expose `TenantFeature`, `TenantFeatures` and `tenantFeaturesGuard` so a single self-hosted instance can manage multiple isolated tenants
- each tenant keeps its own users, applications, connectors and sign-in experience, and can be reached through its own domain
