/**
 * Discovery endpoint data (CONTRACT C-01..C-03)
 */

const TOOLS: { name: string; description: string }[] = [
  {
    "name": "katra_get_account_center",
    "description": "Read the tenant's account center settings, which control the self-service profil"
  },
  {
    "name": "katra_update_account_center",
    "description": "Patch the tenant's account center settings; only the parameters supplied are cha"
  },
  {
    "name": "katra_create_application",
    "description": "Create a new application (OIDC client) in the tenant and return it, including it"
  },
  {
    "name": "katra_create_application_secret",
    "description": "Add a named client secret to an application and return the secret value, which i"
  },
  {
    "name": "katra_delete_application",
    "description": "Permanently delete an application along with its secrets, roles grants and sign-"
  },
  {
    "name": "katra_delete_application_secret",
    "description": "Permanently remove one named client secret from an application. Irreversible: an"
  },
  {
    "name": "katra_get_application",
    "description": "Return a single application by id, including its type, OIDC client metadata, cus"
  },
  {
    "name": "katra_get_application_sign_in_experience",
    "description": "Return the application-level sign-in experience overrides (branding, colors, cus"
  },
  {
    "name": "katra_list_application_secrets",
    "description": "List an application's client secrets with their names, creation and expiration d"
  },
  {
    "name": "katra_list_applications",
    "description": "List applications with pagination, optionally filtered by type, third-party stat"
  },
  {
    "name": "katra_update_application",
    "description": "Update an existing application; only the fields supplied are changed and the upd"
  },
  {
    "name": "katra_update_application_secret",
    "description": "Replace the value of a named client secret on an application. The previous value"
  },
  {
    "name": "katra_update_application_sign_in_experience",
    "description": "Replace the entire application-level sign-in experience for one application with"
  },
  {
    "name": "katra_get_admin_console_config",
    "description": "Read the admin console configuration flags for the current tenant, such as wheth"
  },
  {
    "name": "katra_get_id_token_config",
    "description": "Read the ID token claims configuration for the current tenant, listing which ext"
  },
  {
    "name": "katra_get_oidc_session_config",
    "description": "Read the OIDC session configuration for the current tenant, including the sessio"
  },
  {
    "name": "katra_list_jwt_customizers",
    "description": "List every JWT customizer configured for the current tenant, one per token type,"
  },
  {
    "name": "katra_update_admin_console_config",
    "description": "Partially update the admin console configuration for the current tenant, changin"
  },
  {
    "name": "katra_update_oidc_session_config",
    "description": "Partially update the OIDC session configuration for the current tenant, changing"
  },
  {
    "name": "katra_upsert_id_token_config",
    "description": "Replace the ID token claims configuration for the current tenant, overwriting th"
  },
  {
    "name": "katra_upsert_jwt_customizer",
    "description": "Create or replace the JWT customizer for a given token type, including its scrip"
  },
  {
    "name": "katra_create_connector",
    "description": "Create a new connector instance from a connector factory so users can sign in, r"
  },
  {
    "name": "katra_delete_connector",
    "description": "Permanently delete a connector by its id. This is destructive and irreversible; "
  },
  {
    "name": "katra_get_connector",
    "description": "Fetch a single connector's configuration and metadata by its id, including its f"
  },
  {
    "name": "katra_get_connector_authorization_uri",
    "description": "Build the provider authorization URI for a social connector so a user can be red"
  },
  {
    "name": "katra_list_connector_factories",
    "description": "List every connector factory available in this deployment, with the factory type"
  },
  {
    "name": "katra_list_connectors",
    "description": "List all connectors configured in the tenant, optionally narrowed to a single ta"
  },
  {
    "name": "katra_test_connector",
    "description": "Send a live test message through a passwordless connector factory using the supp"
  },
  {
    "name": "katra_update_connector",
    "description": "Update an existing connector's config, metadata, or behavior flags; only the fie"
  },
  {
    "name": "katra_create_domain",
    "description": "Register a custom domain with the identity provider so it can be used for hosted"
  },
  {
    "name": "katra_delete_domain",
    "description": "Permanently remove a custom domain from the identity provider. This is destructi"
  },
  {
    "name": "katra_get_domain",
    "description": "Retrieve the details of a single custom domain, including its verification statu"
  },
  {
    "name": "katra_list_domains",
    "description": "List all custom domains registered with the identity provider along with their v"
  },
  {
    "name": "katra_verify_domain",
    "description": "Trigger verification of a custom domain by checking that the required DNS record"
  },
  {
    "name": "katra_create_sso_connector",
    "description": "Create a new enterprise SSO connector for the current tenant from the given prov"
  },
  {
    "name": "katra_delete_sso_connector",
    "description": "Permanently delete an SSO connector by id; this is irreversible and stops sign-i"
  },
  {
    "name": "katra_get_sso_connector",
    "description": "Fetch a single SSO connector by id, including its provider, domains, branding an"
  },
  {
    "name": "katra_list_sso_connector_providers",
    "description": "List the SSO connector providers supported by this deployment, with each provide"
  },
  {
    "name": "katra_list_sso_connectors",
    "description": "List the tenant's SSO connectors, newest first, with paging."
  },
  {
    "name": "katra_update_sso_connector",
    "description": "Update an existing SSO connector by id, changing only the fields supplied; omitt"
  },
  {
    "name": "katra_create_hook",
    "description": "Create a new hook that reacts to one or more identity events, with its delivery "
  },
  {
    "name": "katra_delete_hook",
    "description": "Permanently delete a hook by its id; the hook stops firing and its configuration"
  },
  {
    "name": "katra_get_hook",
    "description": "Fetch a single hook by its id, including its subscribed events, configuration an"
  },
  {
    "name": "katra_list_hooks",
    "description": "List the hooks registered on the tenant, paged, so the operator can audit which "
  },
  {
    "name": "katra_update_hook",
    "description": "Update an existing hook's name, subscribed events, configuration or enabled stat"
  },
  {
    "name": "katra_delete_secret",
    "description": "Permanently delete the secret identified by its id. This is irreversible; any ap"
  },
  {
    "name": "katra_get_user_count",
    "description": "Return the total number of users in the tenant, for dashboards and quick capacit"
  },
  {
    "name": "katra_list_audit_logs",
    "description": "List audit log entries, optionally narrowed by user, application, log key or tim"
  },
  {
    "name": "katra_create_organization_invitation",
    "description": "Invite a person to join an organization by sending them an invitation email; the"
  },
  {
    "name": "katra_create_organization_role",
    "description": "Create an organization role that packages organization scopes and API resource s"
  },
  {
    "name": "katra_create_organization_scope",
    "description": "Create an organization scope, the fine-grained permission that organization role"
  },
  {
    "name": "katra_delete_organization_invitation",
    "description": "Permanently delete an organization invitation, revoking the invite link so it ca"
  },
  {
    "name": "katra_delete_organization_role",
    "description": "Permanently delete an organization role, removing it from every member and invit"
  },
  {
    "name": "katra_delete_organization_scope",
    "description": "Permanently delete an organization scope, removing it from every organization ro"
  },
  {
    "name": "katra_get_organization_role",
    "description": "Fetch a single organization role by id, including the organization scopes and re"
  },
  {
    "name": "katra_list_organization_invitations",
    "description": "List organization invitations, optionally narrowed to a single organization, inv"
  },
  {
    "name": "katra_list_organization_roles",
    "description": "List the organization roles defined in the tenant, with optional name search and"
  },
  {
    "name": "katra_list_organization_scopes",
    "description": "List the organization scopes defined in the tenant, with optional name search an"
  },
  {
    "name": "katra_update_organization_role",
    "description": "Update an existing organization role's name, description or type; only the field"
  },
  {
    "name": "katra_update_organization_scope",
    "description": "Update an existing organization scope's name or description; only the fields sup"
  },
  {
    "name": "katra_add_organization_application",
    "description": "Link one or more existing applications to an organization so that organization-s"
  },
  {
    "name": "katra_add_organization_members",
    "description": "Add existing users to an organization as members. The user accounts must already"
  },
  {
    "name": "katra_assign_organization_member_roles",
    "description": "Grant one or more organization roles to a single member of an organization. Role"
  },
  {
    "name": "katra_assign_organization_roles_to_application",
    "description": "Grant organization roles to an application inside an organization, letting that "
  },
  {
    "name": "katra_create_organization",
    "description": "Create a new organization with the given name, optionally setting its descriptio"
  },
  {
    "name": "katra_delete_organization",
    "description": "Permanently delete an organization. This is irreversible and removes its members"
  },
  {
    "name": "katra_get_organization",
    "description": "Fetch a single organization by id, including its description, custom data, MFA p"
  },
  {
    "name": "katra_list_organization_application_roles",
    "description": "List the organization roles currently granted to one application within an organ"
  },
  {
    "name": "katra_list_organization_applications",
    "description": "List the applications linked to an organization. Returns a paginated list and su"
  },
  {
    "name": "katra_list_organization_member_roles",
    "description": "List the organization roles held by a specific member of an organization. Return"
  },
  {
    "name": "katra_list_organization_members",
    "description": "List the users who are members of an organization, optionally narrowed by a sear"
  },
  {
    "name": "katra_list_organizations",
    "description": "List the organizations in the tenant, newest first, with optional text search an"
  },
  {
    "name": "katra_remove_organization_application",
    "description": "Unlink an application from an organization, along with any organization roles pr"
  },
  {
    "name": "katra_remove_organization_member",
    "description": "Remove a user from an organization and drop that member's organization role assi"
  },
  {
    "name": "katra_remove_organization_member_role",
    "description": "Revoke a single organization role from a member without removing the member from"
  },
  {
    "name": "katra_update_organization",
    "description": "Update an organization by id; only the fields supplied are changed, everything e"
  },
  {
    "name": "katra_create_resource",
    "description": "Register a new API resource (an audience-protected API) in the tenant, identifie"
  },
  {
    "name": "katra_create_resource_scope",
    "description": "Add a permission scope to an existing API resource, defining one action callers "
  },
  {
    "name": "katra_delete_resource",
    "description": "Permanently delete an API resource identified by id, along with its scopes and r"
  },
  {
    "name": "katra_get_resource",
    "description": "Retrieve a single API resource by id, including its name, indicator, access toke"
  },
  {
    "name": "katra_list_resource_scopes",
    "description": "List the permission scopes defined for one API resource, with pagination and opt"
  },
  {
    "name": "katra_list_resources",
    "description": "List all API resources registered in the tenant, with pagination. Use includeSco"
  },
  {
    "name": "katra_set_resource_default",
    "description": "Mark an API resource as the default resource for the tenant, or clear that flag,"
  },
  {
    "name": "katra_update_resource",
    "description": "Change the name, indicator or access token lifetime of an existing API resource;"
  },
  {
    "name": "katra_assign_role_to_applications",
    "description": "Grant an existing role to one or more applications, giving them every scope atta"
  },
  {
    "name": "katra_assign_role_to_users",
    "description": "Grant an existing role to one or more users, so they inherit all scopes attached"
  },
  {
    "name": "katra_create_role",
    "description": "Create a new role that can be granted to users or applications and linked to sco"
  },
  {
    "name": "katra_delete_role",
    "description": "Permanently delete a role by id, revoking it from every user and application it "
  },
  {
    "name": "katra_get_role",
    "description": "Fetch a single role by id, including its name, description, type, default status"
  },
  {
    "name": "katra_link_role_scope",
    "description": "Attach one or more API permission scopes to a role, so any user or application h"
  },
  {
    "name": "katra_list_role_scopes",
    "description": "List the scopes currently linked to a role, with paging and optional filtering. "
  },
  {
    "name": "katra_list_roles",
    "description": "List roles in the tenant with paging, optional type filter and the ability to om"
  },
  {
    "name": "katra_remove_role_from_application",
    "description": "Revoke a role from a single application, removing the permissions that role gran"
  },
  {
    "name": "katra_remove_role_from_user",
    "description": "Revoke a role from a single user, removing the permissions that role granted. Ot"
  },
  {
    "name": "katra_unlink_role_scope",
    "description": "Detach a single scope from a role so the role no longer grants that permission. "
  },
  {
    "name": "katra_update_role",
    "description": "Change a role's name, description or default status; omitted fields stay as they"
  },
  {
    "name": "katra_create_custom_profile_field",
    "description": "Create a custom profile field so the sign-in and sign-up pages collect an extra "
  },
  {
    "name": "katra_delete_custom_phrase",
    "description": "Permanently delete all custom phrase overrides for one language, reverting its U"
  },
  {
    "name": "katra_delete_custom_profile_field",
    "description": "Permanently delete a custom profile field and its stored value from every user p"
  },
  {
    "name": "katra_get_custom_phrase",
    "description": "Retrieve the custom phrase overrides (customized UI copy) stored for one languag"
  },
  {
    "name": "katra_get_sign_in_experience",
    "description": "Read the tenant's default sign-in experience settings: branding, colors, sign-in"
  },
  {
    "name": "katra_list_custom_phrases",
    "description": "List the custom phrase overrides for all languages configured in the tenant. Use"
  },
  {
    "name": "katra_list_custom_profile_fields",
    "description": "List every custom profile field configured for the tenant, including its name, t"
  },
  {
    "name": "katra_list_email_templates",
    "description": "List the email templates configured for the tenant, optionally narrowed to one l"
  },
  {
    "name": "katra_replace_email_templates",
    "description": "Replace the tenant's entire set of email templates with the supplied list; any t"
  },
  {
    "name": "katra_update_custom_profile_field",
    "description": "Overwrite the definition of an existing custom profile field, addressed by its c"
  },
  {
    "name": "katra_update_email_template_details",
    "description": "Modify the subject, body, content type or sender fields of one email template id"
  },
  {
    "name": "katra_update_sign_in_experience",
    "description": "Patch the default sign-in experience settings; only the fields supplied are chan"
  },
  {
    "name": "katra_upsert_custom_phrase",
    "description": "Create or replace the custom phrase overrides for one language, merging the supp"
  },
  {
    "name": "katra_create_tenant",
    "description": "Create a new tenant in the deployment and return its record, including the gener"
  },
  {
    "name": "katra_delete_tenant",
    "description": "Permanently delete the tenant identified by the given tenant id, along with its "
  },
  {
    "name": "katra_get_tenant",
    "description": "Fetch a single tenant by tenant id and return its name, tag, group, and current "
  },
  {
    "name": "katra_get_tenant_features",
    "description": "List the tenant feature flags available in this deployment and whether each is c"
  },
  {
    "name": "katra_list_tenants",
    "description": "Return all tenants in the deployment with their ids, names, tags, and suspend st"
  },
  {
    "name": "katra_set_tenant_features",
    "description": "Replace the feature flag settings of the tenant identified by the given tenant i"
  },
  {
    "name": "katra_set_tenant_suspended",
    "description": "Suspend or re-activate the tenant identified by the given tenant id, immediately"
  },
  {
    "name": "katra_update_tenant",
    "description": "Partially update the tenant identified by the given tenant id, changing only the"
  },
  {
    "name": "katra_assign_user_roles",
    "description": "Grant one or more existing roles to a user, adding them to the user's current ro"
  },
  {
    "name": "katra_create_user",
    "description": "Create a new user account in the tenant. Requires at least one identifier (email"
  },
  {
    "name": "katra_delete_user",
    "description": "Permanently delete a user by id. This is irreversible and removes the account al"
  },
  {
    "name": "katra_get_user",
    "description": "Retrieve a single user's full profile by id, including identifiers, custom data "
  },
  {
    "name": "katra_get_user_custom_data",
    "description": "Read only the custom data JSON object attached to a user. Returns an empty objec"
  },
  {
    "name": "katra_list_user_roles",
    "description": "List the roles currently assigned to a user, with pagination and optional search"
  },
  {
    "name": "katra_list_users",
    "description": "List users in the tenant with pagination, keyword search and optional filtering "
  },
  {
    "name": "katra_remove_user_role",
    "description": "Revoke a single role from a user without affecting the user's other role assignm"
  },
  {
    "name": "katra_set_user_password",
    "description": "Replace a user's password with a new plaintext value. Overwrites the existing cr"
  },
  {
    "name": "katra_set_user_suspended",
    "description": "Suspend or reactivate a user account. Suspended users cannot sign in until the f"
  },
  {
    "name": "katra_update_user",
    "description": "Modify a user's profile fields such as username, email, phone, display name, ava"
  },
  {
    "name": "katra_update_user_custom_data",
    "description": "Overwrite the custom data JSON object on a user, replacing nested values with th"
  }
];
const GROUPS: { name: string; disclosure_level: string }[] = [
  {
    "name": "account-center",
    "disclosure_level": "default"
  },
  {
    "name": "applications",
    "disclosure_level": "default"
  },
  {
    "name": "configs",
    "disclosure_level": "default"
  },
  {
    "name": "connectors",
    "disclosure_level": "default"
  },
  {
    "name": "domains",
    "disclosure_level": "default"
  },
  {
    "name": "enterprise-sso",
    "disclosure_level": "default"
  },
  {
    "name": "hooks",
    "disclosure_level": "default"
  },
  {
    "name": "operations",
    "disclosure_level": "default"
  },
  {
    "name": "organization-roles",
    "disclosure_level": "default"
  },
  {
    "name": "organizations",
    "disclosure_level": "default"
  },
  {
    "name": "resources",
    "disclosure_level": "default"
  },
  {
    "name": "roles",
    "disclosure_level": "default"
  },
  {
    "name": "sign-in-experience",
    "disclosure_level": "default"
  },
  {
    "name": "tenants",
    "disclosure_level": "default"
  },
  {
    "name": "users",
    "disclosure_level": "default"
  }
];

export function getDiscoveryInfo() {
  return {
    server_name: "katra-logto-admin",
    version: "1.0.0",
    tool_count: TOOLS.length,
    tool_groups: GROUPS,
    tools: TOOLS,
  };
}
