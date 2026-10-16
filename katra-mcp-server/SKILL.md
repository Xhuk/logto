# katra-logto-admin — SKILL.md

## Overview
Machine-to-machine administration of a self-hosted, path-based multi-tenant Logto (Katra) deployment: bootstrap a tenant from scratch, link the product applications that consume it, issue and store credentials, provision the identity model, and operate sign-in, domains, connectors and configs. Credentials stay in the environment; secrets are never echoed.

## Tools
### `katra_get_account_center`
Read the tenant's account center settings, which control the self-service profile page users see and which fields and actions it exposes. Returns the current configuration such as enabled state, profile fields, custom CSS and delete-account URL.

**Parameters:** 
### `katra_update_account_center`
Patch the tenant's account center settings; only the parameters supplied are changed, everything else stays as is. Use this to enable or disable the account center page, pick which profile fields render, brand it with custom CSS, or point the delete-account flow at an external URL. Returns the updated settings.

**Parameters:** `enabled` (boolean), `fields` (object), `webauthnRelatedOrigins` (array), `deleteAccountUrl` (object), `customCss` (string), `profileFields` (array)
### `katra_create_application`
Create a new application (OIDC client) in the tenant and return it, including its generated id and client credentials. Side effect: a new client id and, for confidential types, a first client secret are issued.

**Parameters:** `name` (string), `description` (string), `type` (string), `oidcClientMetadata` (object), `customClientMetadata` (object), `customData` (object), `isThirdParty` (boolean), `protectedAppMetadata` (object)
### `katra_create_application_secret`
Add a named client secret to an application and return the secret value, which is shown only in this response and cannot be retrieved again. Use list_application_secrets later only to see names and expiry dates.

**Parameters:** `id` (string), `name` (string), `expiresAt` (number)
### `katra_delete_application`
Permanently delete an application along with its secrets, roles grants and sign-in experience overrides. Irreversible; existing sessions and integrations stop working.

**Parameters:** `id` (string)
### `katra_delete_application_secret`
Permanently remove one named client secret from an application. Irreversible: any client still authenticating with that secret fails immediately.

**Parameters:** `id` (string), `name` (string)
### `katra_get_application`
Return a single application by id, including its type, OIDC client metadata, custom metadata and custom data.

**Parameters:** `id` (string)
### `katra_get_application_sign_in_experience`
Return the application-level sign-in experience overrides (branding, colors, custom CSS, display name, terms and privacy links) that apply only to this application.

**Parameters:** `applicationId` (string)
### `katra_list_application_secrets`
List an application's client secrets with their names, creation and expiration dates. Secret values are never included; only the creation response can reveal a value.

**Parameters:** `id` (string)
### `katra_list_applications`
List applications with pagination, optionally filtered by type, third-party status, or by excluding apps already tied to a role or organization. Returns the matching applications plus the total count.

**Parameters:** `types` (object), `excludeRoleId` (string), `excludeOrganizationId` (string), `isThirdParty` (object), `page` (integer), `page_size` (integer), `search_params` (object)
### `katra_update_application`
Update an existing application; only the fields supplied are changed and the updated application is returned. Metadata and custom-data objects are replaced wholesale, so include every key that should remain.

**Parameters:** `id` (string), `name` (string), `description` (string), `oidcClientMetadata` (object), `customClientMetadata` (object), `customData` (object), `appLevelAccessControlEnabled` (boolean), `protectedAppMetadata` (object), `isAdmin` (boolean)
### `katra_update_application_secret`
Replace the value of a named client secret on an application. The previous value stops working, so any client using it must be reconfigured with the new value.

**Parameters:** `id` (string), `name` (string)
### `katra_update_application_sign_in_experience`
Replace the entire application-level sign-in experience for one application with the supplied values. This is a full overwrite: fields left out are cleared rather than kept, and the saved configuration is returned.

**Parameters:** `applicationId` (string), `color` (object), `branding` (object), `customCss` (string), `displayName` (string), `termsOfUseUrl` (object), `privacyPolicyUrl` (object)
### `katra_get_admin_console_config`
Read the admin console configuration flags for the current tenant, such as whether sign-in experience has been customized or an organization has been created. Returns the stored admin console settings object.

**Parameters:** 
### `katra_get_id_token_config`
Read the ID token claims configuration for the current tenant, listing which extended claims are enabled. Returns the current ID token config object.

**Parameters:** 
### `katra_get_oidc_session_config`
Read the OIDC session configuration for the current tenant, including the session TTL. Returns the current session config object.

**Parameters:** 
### `katra_list_jwt_customizers`
List every JWT customizer configured for the current tenant, one per token type, showing their scripts and environment variables. Returns an array of customizer objects.

**Parameters:** 
### `katra_update_admin_console_config`
Partially update the admin console configuration for the current tenant, changing only the fields supplied. Returns the updated admin console config.

**Parameters:** `signInExperienceCustomized` (boolean), `organizationCreated` (boolean), `developmentTenantMigrationNotification` (object), `checkedChargeNotification` (object)
### `katra_update_oidc_session_config`
Partially update the OIDC session configuration for the current tenant, changing the session time-to-live. Returns the updated session config.

**Parameters:** `ttl` (number)
### `katra_upsert_id_token_config`
Replace the ID token claims configuration for the current tenant, overwriting the whole set of enabled extended claims. Returns the saved ID token config.

**Parameters:** `enabledExtendedClaims` (array)
### `katra_upsert_jwt_customizer`
Create or replace the JWT customizer for a given token type, including its script and environment variables. The supplied values overwrite the existing customizer for that token type.

**Parameters:** `tokenTypePath` (string), `script` (string), `environmentVariables` (string), `contextSample` (string), `tokenSample` (string), `blockIssuanceOnError` (string)
### `katra_create_connector`
Create a new connector instance from a connector factory so users can sign in, receive codes, or send messages through it. The connector is configured immediately with the supplied factory config and appears in the connector list right away.

**Parameters:** `config` (object), `connectorId` (string), `metadata` (object), `syncProfile` (boolean), `enableTokenStorage` (boolean), `id` (string)
### `katra_delete_connector`
Permanently delete a connector by its id. This is destructive and irreversible; any sign-in experience, passwordless flow, or application reference that depends on the connector stops working.

**Parameters:** `id` (string)
### `katra_get_connector`
Fetch a single connector's configuration and metadata by its id, including its factory type, enabled state, and stored config.

**Parameters:** `id` (string)
### `katra_get_connector_authorization_uri`
Build the provider authorization URI for a social connector so a user can be redirected to the identity provider. Returns the URI that must be visited to start the OAuth/OIDC authorization flow.

**Parameters:** `connectorId` (string), `state` (string), `redirectUri` (string)
### `katra_list_connector_factories`
List every connector factory available in this deployment, with the factory type, display name, and the config keys each one accepts. Use this to discover valid connectorId values before creating a connector.

**Parameters:** 
### `katra_list_connectors`
List all connectors configured in the tenant, optionally narrowed to a single target. Useful for auditing which sign-in, email, or SMS providers are enabled.

**Parameters:** `target` (string)
### `katra_test_connector`
Send a live test message through a passwordless connector factory using the supplied config, without saving the connector. Provide either a phone number or an email address as the destination and check that delivery succeeds.

**Parameters:** `factoryId` (string), `phone` (string), `email` (string), `config` (object), `locale` (string)
### `katra_update_connector`
Update an existing connector's config, metadata, or behavior flags; only the fields supplied are changed. Use this to rotate provider credentials or toggle profile sync and token storage.

**Parameters:** `id` (string), `config` (object), `metadata` (object), `syncProfile` (boolean), `enableTokenStorage` (boolean)
### `katra_create_domain`
Register a custom domain with the identity provider so it can be used for hosted sign-in pages and endpoints. The domain starts unverified; run verification after adding the DNS records it returns.

**Parameters:** `domain` (string)
### `katra_delete_domain`
Permanently remove a custom domain from the identity provider. This is destructive and irreversible; the domain can no longer serve sign-in traffic until it is registered and verified again.

**Parameters:** `id` (string)
### `katra_get_domain`
Retrieve the details of a single custom domain, including its verification status and any DNS records required for verification.

**Parameters:** `id` (string)
### `katra_list_domains`
List all custom domains registered with the identity provider along with their verification status.

**Parameters:** 
### `katra_verify_domain`
Trigger verification of a custom domain by checking that the required DNS records are in place. Run this after the DNS records have propagated; a failed check leaves the domain unverified.

**Parameters:** `id` (string)
### `katra_create_sso_connector`
Create a new enterprise SSO connector for the current tenant from the given provider, returning the created connector record. Supply the provider and connector names plus optional config, domains, branding and profile-sync settings.

**Parameters:** `config` (object), `domains` (array), `branding` (object), `syncProfile` (boolean), `enableTokenStorage` (boolean), `providerName` (string), `connectorName` (string)
### `katra_delete_sso_connector`
Permanently delete an SSO connector by id; this is irreversible and stops sign-in for its associated domains.

**Parameters:** `id` (string)
### `katra_get_sso_connector`
Fetch a single SSO connector by id, including its provider, domains, branding and config.

**Parameters:** `id` (string)
### `katra_list_sso_connector_providers`
List the SSO connector providers supported by this deployment, with each provider's name, type and required config fields. Use it to pick a valid providerName before creating a connector.

**Parameters:** 
### `katra_list_sso_connectors`
List the tenant's SSO connectors, newest first, with paging.

**Parameters:** `page` (integer), `page_size` (integer)
### `katra_update_sso_connector`
Update an existing SSO connector by id, changing only the fields supplied; omitted fields keep their current values.

**Parameters:** `id` (string), `config` (object), `domains` (array), `branding` (object), `syncProfile` (boolean), `connectorName` (string), `enableTokenStorage` (boolean)
### `katra_create_hook`
Create a new hook that reacts to one or more identity events, with its delivery configuration and enabled state. Supply the event name or list of events to subscribe to and the required config object for the hook target; returns the created hook record.

**Parameters:** `tenantId` (string), `name` (string), `event` (string), `events` (array), `config` (object), `enabled` (boolean), `createdAt` (number)
### `katra_delete_hook`
Permanently delete a hook by its id; the hook stops firing and its configuration is removed. This action cannot be undone.

**Parameters:** `id` (string)
### `katra_get_hook`
Fetch a single hook by its id, including its subscribed events, configuration and enabled state. Returns the hook record, or nothing if no hook matches the id.

**Parameters:** `id` (string), `includeExecutionStats` (string)
### `katra_list_hooks`
List the hooks registered on the tenant, paged, so the operator can audit which events are wired up. Returns an array of hook records for the requested page.

**Parameters:** `includeExecutionStats` (string), `page` (integer), `page_size` (integer)
### `katra_update_hook`
Update an existing hook's name, subscribed events, configuration or enabled state; only the fields supplied are changed. Returns the updated hook record.

**Parameters:** `id` (string), `tenantId` (string), `name` (string), `event` (string), `events` (array), `config` (object), `enabled` (boolean), `createdAt` (number)
### `katra_delete_secret`
Permanently delete the secret identified by its id. This is irreversible; any application or connector referencing the secret will no longer be able to read it.

**Parameters:** `id` (string)
### `katra_get_user_count`
Return the total number of users in the tenant, for dashboards and quick capacity checks. Counts every user regardless of status, without pagination.

**Parameters:** 
### `katra_list_audit_logs`
List audit log entries, optionally narrowed by user, application, log key or time range. Results are paginated, and each entry records what happened, when, and who or what triggered it.

**Parameters:** `userId` (string), `applicationId` (string), `logKey` (string), `enableCap` (string), `start_time` (string), `end_time` (string), `page` (integer), `page_size` (integer)
### `katra_create_organization_invitation`
Invite a person to join an organization by sending them an invitation email; the invitation optionally grants organization roles on acceptance. Returns the created invitation record, including its id and invite link.

**Parameters:** `inviterId` (string), `invitee` (string), `organizationId` (string), `expiresAt` (number), `organizationRoleIds` (array), `messagePayload` (object)
### `katra_create_organization_role`
Create an organization role that packages organization scopes and API resource scopes, so it can be assigned to organization members. Returns the new role with its id.

**Parameters:** `tenantId` (string), `name` (string), `description` (string), `type` (string), `organizationScopeIds` (array), `resourceScopeIds` (array)
### `katra_create_organization_scope`
Create an organization scope, the fine-grained permission that organization roles can grant to members. Returns the new scope with its id.

**Parameters:** `tenantId` (string), `name` (string), `description` (string)
### `katra_delete_organization_invitation`
Permanently delete an organization invitation, revoking the invite link so it can no longer be accepted. This cannot be undone.

**Parameters:** `id` (string)
### `katra_delete_organization_role`
Permanently delete an organization role, removing it from every member and invitation that held it. This cannot be undone.

**Parameters:** `id` (string)
### `katra_delete_organization_scope`
Permanently delete an organization scope, removing it from every organization role that granted it. This cannot be undone.

**Parameters:** `id` (string)
### `katra_get_organization_role`
Fetch a single organization role by id, including the organization scopes and resource scopes it grants.

**Parameters:** `id` (string)
### `katra_list_organization_invitations`
List organization invitations, optionally narrowed to a single organization, inviter or invitee. Use it to audit pending invitations before revoking them.

**Parameters:** `organizationId` (string), `inviterId` (string), `invitee` (string)
### `katra_list_organization_roles`
List the organization roles defined in the tenant, with optional name search and pagination. Returns each role's id, name, description and type.

**Parameters:** `q` (string), `page` (integer), `page_size` (integer)
### `katra_list_organization_scopes`
List the organization scopes defined in the tenant, with optional name search and pagination. Returns each scope's id, name and description.

**Parameters:** `q` (string), `page` (integer), `page_size` (integer)
### `katra_update_organization_role`
Update an existing organization role's name, description or type; only the fields supplied are changed and everything else is left as is. Returns the updated role.

**Parameters:** `id` (string), `tenantId` (string), `name` (string), `description` (string), `type` (string)
### `katra_update_organization_scope`
Update an existing organization scope's name or description; only the fields supplied are changed. Returns the updated scope.

**Parameters:** `id` (string), `tenantId` (string), `name` (string), `description` (string)
### `katra_add_organization_application`
Link one or more existing applications to an organization so that organization-scoped roles and permissions can be granted to them. The applications themselves are not modified or created.

**Parameters:** `id` (string), `applicationIds` (array)
### `katra_add_organization_members`
Add existing users to an organization as members. The user accounts must already exist and are not created by this call; users already in the organization are ignored.

**Parameters:** `id` (string), `userIds` (array)
### `katra_assign_organization_member_roles`
Grant one or more organization roles to a single member of an organization. Roles are additive: existing role assignments for that user are kept, and duplicate assignments are ignored.

**Parameters:** `id` (string), `userId` (string), `organizationRoleIds` (array), `organizationRoleNames` (array)
### `katra_assign_organization_roles_to_application`
Grant organization roles to an application inside an organization, letting that application act with the permissions the roles carry. Existing role grants on the application are left in place.

**Parameters:** `id` (string), `applicationId` (string), `organizationRoleIds` (array)
### `katra_create_organization`
Create a new organization with the given name, optionally setting its description, custom data, MFA policy, branding and custom CSS. Returns the created organization.

**Parameters:** `tenantId` (string), `name` (string), `description` (string), `customData` (object), `isMfaRequired` (boolean), `isTrustedDeviceAllowed` (boolean), `color` (object), `branding` (object), `customCss` (string), `createdAt` (number)
### `katra_delete_organization`
Permanently delete an organization. This is irreversible and removes its memberships and role assignments; the underlying user and application records are unaffected.

**Parameters:** `id` (string)
### `katra_get_organization`
Fetch a single organization by id, including its description, custom data, MFA policy, branding and custom CSS.

**Parameters:** `id` (string)
### `katra_list_organization_application_roles`
List the organization roles currently granted to one application within an organization. Returns a paginated role list.

**Parameters:** `id` (string), `applicationId` (string), `page` (integer), `page_size` (integer)
### `katra_list_organization_applications`
List the applications linked to an organization. Returns a paginated list and supports a text search over application names.

**Parameters:** `id` (string), `q` (string), `page` (integer), `page_size` (integer)
### `katra_list_organization_member_roles`
List the organization roles held by a specific member of an organization. Returns a paginated role list.

**Parameters:** `id` (string), `userId` (string), `page` (integer), `page_size` (integer)
### `katra_list_organization_members`
List the users who are members of an organization, optionally narrowed by a search term or by a role they hold. Returns a paginated member list.

**Parameters:** `id` (string), `q` (string), `organizationRoleId` (string), `page` (integer), `page_size` (integer)
### `katra_list_organizations`
List the organizations in the tenant, newest first, with optional text search and filtering to featured organizations. Returns a paginated list.

**Parameters:** `q` (string), `showFeatured` (string), `page` (integer), `page_size` (integer)
### `katra_remove_organization_application`
Unlink an application from an organization, along with any organization roles previously granted to it. The application itself is not deleted.

**Parameters:** `id` (string), `applicationId` (string)
### `katra_remove_organization_member`
Remove a user from an organization and drop that member's organization role assignments. The user account itself is not deleted.

**Parameters:** `id` (string), `userId` (string)
### `katra_remove_organization_member_role`
Revoke a single organization role from a member without removing the member from the organization. Other roles the member holds are untouched.

**Parameters:** `id` (string), `userId` (string), `organizationRoleId` (string)
### `katra_update_organization`
Update an organization by id; only the fields supplied are changed, everything else is preserved. Returns the updated organization.

**Parameters:** `id` (string), `tenantId` (string), `name` (string), `description` (string), `customData` (object), `isMfaRequired` (boolean), `isTrustedDeviceAllowed` (boolean), `color` (object), `branding` (object), `customCss` (string), `createdAt` (number)
### `katra_create_resource`
Register a new API resource (an audience-protected API) in the tenant, identified by a unique indicator URI. Returns the created resource record including its id.

**Parameters:** `tenantId` (string), `name` (string), `indicator` (string), `accessTokenTtl` (number)
### `katra_create_resource_scope`
Add a permission scope to an existing API resource, defining one action callers can be granted. Returns the created scope.

**Parameters:** `resourceId` (string), `name` (string), `description` (string)
### `katra_delete_resource`
Permanently delete an API resource identified by id, along with its scopes and related grants. This action is irreversible.

**Parameters:** `id` (string)
### `katra_get_resource`
Retrieve a single API resource by id, including its name, indicator, access token TTL and default status.

**Parameters:** `id` (string)
### `katra_list_resource_scopes`
List the permission scopes defined for one API resource, with pagination and optional search filtering.

**Parameters:** `resourceId` (string), `page` (integer), `page_size` (integer), `search_params` (object)
### `katra_list_resources`
List all API resources registered in the tenant, with pagination. Use includeScopes to pull each resource's scopes in the same response.

**Parameters:** `includeScopes` (string), `page` (integer), `page_size` (integer)
### `katra_set_resource_default`
Mark an API resource as the default resource for the tenant, or clear that flag, controlling which audience tokens are issued for by default.

**Parameters:** `id` (string), `isDefault` (boolean)
### `katra_update_resource`
Change the name, indicator or access token lifetime of an existing API resource; omitted fields keep their current values. Returns the updated resource.

**Parameters:** `id` (string), `tenantId` (string), `name` (string), `accessTokenTtl` (number)
### `katra_assign_role_to_applications`
Grant an existing role to one or more applications, giving them every scope attached to that role. Pass the role id and the list of application ids to receive it; already-assigned applications are left unchanged.

**Parameters:** `id` (string), `applicationIds` (array)
### `katra_assign_role_to_users`
Grant an existing role to one or more users, so they inherit all scopes attached to that role. Pass the role id and the user ids; users already holding the role are unaffected.

**Parameters:** `id` (string), `userIds` (array)
### `katra_create_role`
Create a new role that can be granted to users or applications and linked to scopes. The role name must be unique within the tenant; returns the created role including its generated id.

**Parameters:** `tenantId` (string), `name` (string), `description` (string), `type` (string), `isDefault` (boolean), `scopeIds` (array)
### `katra_delete_role`
Permanently delete a role by id, revoking it from every user and application it was granted to. This cannot be undone.

**Parameters:** `id` (string)
### `katra_get_role`
Fetch a single role by id, including its name, description, type, default status and attached scopes.

**Parameters:** `id` (string)
### `katra_link_role_scope`
Attach one or more API permission scopes to a role, so any user or application holding the role gains those permissions. Scopes already linked are ignored; pass the role id and the scope ids to add.

**Parameters:** `id` (string), `scopeIds` (array)
### `katra_list_role_scopes`
List the scopes currently linked to a role, with paging and optional filtering. Use this to audit what permissions a role actually grants.

**Parameters:** `id` (string), `page` (integer), `page_size` (integer), `search_params` (object)
### `katra_list_roles`
List roles in the tenant with paging, optional type filter and the ability to omit roles already held by a given user or application. Returns the matching roles and the total count.

**Parameters:** `excludeUserId` (string), `excludeApplicationId` (string), `type` (string), `page` (integer), `page_size` (integer), `search_params` (object)
### `katra_remove_role_from_application`
Revoke a role from a single application, removing the permissions that role granted. Other applications holding the role are unaffected.

**Parameters:** `id` (string), `applicationId` (string)
### `katra_remove_role_from_user`
Revoke a role from a single user, removing the permissions that role granted. Other users holding the role are unaffected.

**Parameters:** `id` (string), `userId` (string)
### `katra_unlink_role_scope`
Detach a single scope from a role so the role no longer grants that permission. Users and applications keep the role but lose the scope's access at next token issuance.

**Parameters:** `id` (string), `scopeId` (string)
### `katra_update_role`
Change a role's name, description or default status; omitted fields stay as they are. To change a role's scopes, use the link and unlink tools instead.

**Parameters:** `id` (string), `name` (string), `description` (string), `isDefault` (boolean)
### `katra_create_custom_profile_field`
Create a custom profile field so the sign-in and sign-up pages collect an extra attribute (text, number, date, select, checkbox, etc.) beyond the built-in ones. Returns the created field definition; an error occurs if the field name already exists.

**Parameters:** `body` (object)
### `katra_delete_custom_phrase`
Permanently delete all custom phrase overrides for one language, reverting its UI copy to the built-in translations. Irreversible; other languages are unaffected.

**Parameters:** `languageTag` (string)
### `katra_delete_custom_profile_field`
Permanently delete a custom profile field and its stored value from every user profile. This is irreversible, so confirm the field name before calling.

**Parameters:** `name` (string)
### `katra_get_custom_phrase`
Retrieve the custom phrase overrides (customized UI copy) stored for one language, keyed by translation key. Returns an empty object when the language has no overrides.

**Parameters:** `languageTag` (string)
### `katra_get_sign_in_experience`
Read the tenant's default sign-in experience settings: branding, colors, sign-in/sign-up methods, password policy, MFA, captcha, custom CSS and content, and more. This is the baseline configuration used by every application unless overridden.

**Parameters:** 
### `katra_list_custom_phrases`
List the custom phrase overrides for all languages configured in the tenant. Use it to see which languages have been customized before editing copy.

**Parameters:** 
### `katra_list_custom_profile_fields`
List every custom profile field configured for the tenant, including its name, type and required flag. Use this before creating or updating a field to see what is already taken.

**Parameters:** 
### `katra_list_email_templates`
List the email templates configured for the tenant, optionally narrowed to one language or one template type. Use it to find the template id needed when editing a single template.

**Parameters:** `languageTag` (string), `templateType` (string)
### `katra_replace_email_templates`
Replace the tenant's entire set of email templates with the supplied list; any template type or language not present in the list is deleted. Send the complete desired set, not a partial patch.

**Parameters:** `templates` (array)
### `katra_update_custom_profile_field`
Overwrite the definition of an existing custom profile field, addressed by its current name. Send the full new definition; properties omitted from the payload are reset to their defaults.

**Parameters:** `name` (string), `body` (object)
### `katra_update_email_template_details`
Modify the subject, body, content type or sender fields of one email template identified by its id. Only the fields supplied are changed.

**Parameters:** `id` (string), `subject` (string), `content` (string), `contentType` (object), `replyTo` (string), `sendFrom` (string)
### `katra_update_sign_in_experience`
Patch the default sign-in experience settings; only the fields supplied are changed, so send just the sections you intend to modify. Changing branding, methods or policies here affects every application in the tenant immediately.

**Parameters:** `removeUnusedDemoSocialConnector` (string), `tenantId` (string), `color` (object), `branding` (object), `hideLogtoBranding` (boolean), `languageInfo` (object), `agreeToTermsPolicy` (string), `signIn` (object), `signUp` (object), `socialSignIn` (object), `socialSignInConnectorTargets` (array), `signInMode` (string), `customCss` (string), `customContent` (object), `customUiAssets` (object), `customUiCsp` (object), `passwordPolicy` (object), `mfa` (object), `adaptiveMfa` (object), `trustedDevice` (object), `singleSignOnEnabled` (boolean), `captchaPolicy` (object), `sentinelPolicy` (object), `emailBlocklistPolicy` (object), `forgotPasswordMethods` (array), `passkeySignIn` (object), `signUpProfileFields` (array), `usernamePolicy` (object), `termsOfUseUrl` (object), `privacyPolicyUrl` (object), `supportEmail` (object), `supportWebsiteUrl` (object), `unknownSessionRedirectUrl` (object), `passwordExpiration` (object), `verificationCodePolicy` (object)
### `katra_upsert_custom_phrase`
Create or replace the custom phrase overrides for one language, merging the supplied translation keys with any existing ones for that language. Existing keys not included in the payload stay unchanged.

**Parameters:** `languageTag` (string), `translationKey` (object)
### `katra_create_tenant`
Create a new tenant in the deployment and return its record, including the generated tenant id used by every other tenant-scoped tool. Name it distinctly so it can be recognized in tenant lists and logs later.

**Parameters:** `name` (string), `tag` (string), `groupName` (string)
### `katra_delete_tenant`
Permanently delete the tenant identified by the given tenant id, along with its tenant-scoped configuration. This is destructive and cannot be undone, so confirm the id before calling.

**Parameters:** 
### `katra_get_tenant`
Fetch a single tenant by tenant id and return its name, tag, group, and current suspend state.

**Parameters:** 
### `katra_get_tenant_features`
List the tenant feature flags available in this deployment and whether each is currently enabled. Use this before changing flags to see valid feature keys.

**Parameters:** 
### `katra_list_tenants`
Return all tenants in the deployment with their ids, names, tags, and suspend states. Use it to resolve a tenant name to its id before calling other tenant tools.

**Parameters:** 
### `katra_set_tenant_features`
Replace the feature flag settings of the tenant identified by the given tenant id with the supplied values. Flags omitted from the payload are turned off rather than left untouched.

**Parameters:** `features` (string)
### `katra_set_tenant_suspended`
Suspend or re-activate the tenant identified by the given tenant id, immediately blocking or restoring sign-in for its users. Supply the desired state; the call is reversible by passing the opposite value.

**Parameters:** `isSuspended` (string)
### `katra_update_tenant`
Partially update the tenant identified by the given tenant id, changing only the fields supplied and leaving the rest as they are. Returns the updated tenant record.

**Parameters:** `name` (string), `tag` (string), `groupName` (string)
### `katra_assign_user_roles`
Grant one or more existing roles to a user, adding them to the user's current role set. Supply the user id and the list of role ids to grant; the roles must already exist.

**Parameters:** `userId` (string), `roleIds` (array)
### `katra_create_user`
Create a new user account in the tenant. Requires at least one identifier (email, phone or username) plus either a plaintext password or a pre-computed password digest; the user id is generated and returned.

**Parameters:** `primaryPhone` (string), `primaryEmail` (string), `username` (string), `password` (string), `passwordDigest` (string), `passwordAlgorithm` (string), `name` (string), `avatar` (string), `customData` (object), `profile` (object)
### `katra_delete_user`
Permanently delete a user by id. This is irreversible and removes the account along with its role assignments and identities.

**Parameters:** `userId` (string)
### `katra_get_user`
Retrieve a single user's full profile by id, including identifiers, custom data and optionally SSO identities and the password hash.

**Parameters:** `userId` (string), `includeSsoIdentities` (string), `includePasswordHash` (string)
### `katra_get_user_custom_data`
Read only the custom data JSON object attached to a user. Returns an empty object when the user has no custom data set.

**Parameters:** `userId` (string)
### `katra_list_user_roles`
List the roles currently assigned to a user, with pagination and optional search filtering.

**Parameters:** `userId` (string), `page` (integer), `page_size` (integer), `search_params` (object)
### `katra_list_users`
List users in the tenant with pagination, keyword search and optional filtering by identity provider, identity type or identity id.

**Parameters:** `page` (integer), `page_size` (integer), `search_params` (object), `identityType` (string), `identityProvider` (string), `identityId` (string)
### `katra_remove_user_role`
Revoke a single role from a user without affecting the user's other role assignments or the role itself.

**Parameters:** `userId` (string), `roleId` (string)
### `katra_set_user_password`
Replace a user's password with a new plaintext value. Overwrites the existing credential and invalidates any previous password.

**Parameters:** `userId` (string), `password` (string)
### `katra_set_user_suspended`
Suspend or reactivate a user account. Suspended users cannot sign in until the flag is set back to false.

**Parameters:** `userId` (string), `isSuspended` (boolean)
### `katra_update_user`
Modify a user's profile fields such as username, email, phone, display name, avatar, custom data or extended profile. Only the fields supplied are changed.

**Parameters:** `userId` (string), `username` (string), `primaryEmail` (string), `primaryPhone` (string), `name` (string), `avatar` (string), `customData` (object), `profile` (object)
### `katra_update_user_custom_data`
Overwrite the custom data JSON object on a user, replacing nested values with the supplied object. Supply the complete object to keep, not just the changed keys.

**Parameters:** `userId` (string), `customData` (object)

## Usage Patterns
This server exposes the following access patterns:
- Resolve the target tenant (admin tenant vs path-based /{tenantId}/api) and Management API audience before any call
- List and filter resources within a tenant before creating or updating them (search-before-create)
- Create a parent resource then create or attach its children (application -> secrets/roles/consent scopes; resource -> scopes; user -> roles; organization -> roles/scopes/members)
- Replace an entire child collection versus assign/delete a single child (PUT replace vs POST assign vs DELETE remove)
- Fetch a resource, patch only changed fields, and re-read to confirm (PATCH-centric configuration updates)
- Send only feature flags that must change because a missing flag means enabled
- Create a once-only credential, store it in the vault, and return only its storage name plus non-secret identifiers
- Cache and reuse access tokens keyed by resource indicator instead of re-issuing per call
- Rotate long-lived keys and secrets (OIDC keys, application secrets) as a scheduled or on-demand mutation
- Traverse from application to its user-consent scopes and consented organizations and from user to application consents
- Read audit logs and dashboard metrics as observational queries that never mutate state
- Suspend/resume and delete as state transitions applied to tenants, users and applications
- Register a custom domain, then verify it and inspect its status
- Upsert or test configuration objects (JWT customizers, actions, ID token config, CIMD config) as manage-and-validate pairs

## Gotchas
- Always check the response for error fields before proceeding.
- Pass `verbose=true` to get full response metadata including HTTP status codes.
- Composed tools are preferred over manual chaining for multi-step workflows.

## Recipe Workflows
### uc-01: Bootstrap a Logto deployment from zero: create the tenant, create its applications, configure the sign-in experience and branding, create the first administrator user and password, create the API resource and role that the product needs, and return the exact endpoints the product must point at.
1. Call `katra_get_account_center` if available.
### uc-02: Link a product app that already exists: create or update the application with the redirect URIs, post-logout redirect URIs and CORS origins that product already uses, then return the application id, type and the caller URLs (issuer, authorize, token, userinfo, Management API base).
1. Call `katra_get_account_center` if available.
### uc-03: Issue and rotate credentials: create an application secret or a machine-to-machine client, attach the role with the Management API scope, and return the client id, resource, scope and token URL per caller. The secret value is returned exactly once, so it must be stored in the vault, never echoed.
1. Call `katra_get_account_center` if available.

## Composed-Call Examples
(No composed tools defined)

## Anti-patterns
- Do not call individual CRUD tools in sequence when a grouped `manage_*` tool exists.
- Do not ignore the `verbose` parameter when you need metadata for debugging.
- Do not assume tools are idempotent unless their description says so.
