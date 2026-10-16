"""Build the curated Katra admin surface from the seed tool spec.

Selection is by explicit exclusion (paths the staff MCP should not expose) plus a small
override table for the tool names the rules cannot name well. The HTTP plumbing (method,
path, arg_mapping, parameters) is preserved from the seed spec so the emitter keeps
producing correct calls.
"""
import json
import re
import sys
from collections import OrderedDict

import yaml

BASE = r"C:\Users\jics\.local\share\katra-mcp"

# --- paths the staff MCP does not expose -----------------------------------
EXCLUDE_PATTERNS = [
    # end-user runtime / product surfaces (already absent from the trimmed spec)
    r"^/api/experience",
    r"^/api/my-account",
    # corners that need the product console or an end user in the loop
    r"/user-consent-scopes",
    r"/consent-organizations",
    r"/consent-scopes",
    r"/access-control",
    r"/custom-data",
    r"/protected-app-metadata",
    r"/jit/",
    r"/mfa-verifications",
    r"/trusted-devices",
    r"/grants",
    r"/identities",
    r"/logto-configs",
    r"/password/verify",
    r"/password/expiration",
    r"/check-password",
    r"/custom-ui-assets",
    r"/username-policy",
    r"/one-time-tokens",
    r"/sentinel-activities",
    r"/cimd",
    r"/subject-tokens",
    r"/systems",
    r"/saml/",
    r"/saml-applications",
    r"/connector-factories/\{id\}$",  # keep the list; the factory detail adds nothing
    r"/connectors/\{connectorId\}/authorization-uri",
    r"/connectors/\{factoryId\}/test",
    r"/applications/\{id\}/legacy-secret",
    r"/applications/\{applicationId\}/roles",   # covered by /roles/{id} + assign
    r"/applications/\{applicationId\}/sign-in-experience",  # app-level SIE is product config
    r"/configs/jwt-customizer",                 # Custom JWT: not used by this deployment
    r"/configs/actions",                        # ditto
    r"/configs/oidc/\{keyType\}",               # signing-key management stays manual
    r"/captcha-provider",
    r"/email-templates",                        # template set is replaced as a whole
    r"/custom-profile-fields/batch",
    r"/custom-profile-fields/properties",
    r"/dashboard/users/active",
    r"/dashboard/users/new",
    r"/domains/cleanup",
    r"/domains/\{id\}/verification-files",
    r"/organization-invitations/\{id\}/message",
    r"/organization-invitations/\{id\}/status",
    r"/organization-scopes",                    # organization role templates stay in the Console
    r"/organization-roles/\{id\}/resource-scopes",
    r"/organization-roles/\{id\}/scopes",
    r"/organizations/\{id\}/applications",      # org <-> application links are product-level
    r"/organizations/\{id\}/jit",
    r"/organizations/\{id\}/users/roles",       # bulk: the per-member op covers it
    r"/organizations/\{id\}/users/\{userId\}/scopes",
    r"/users/\{userId\}/sessions",              # revoke is enough; the reads add nothing
    r"/resources/\{resourceId\}/scopes/\{scopeId\}",  # scope lifecycle is create + list
    r"/users/\{userId\}/all-identities",
    r"/users/\{userId\}/has-password",
    r"/users/\{userId\}/sso-identities",
    r"/users/\{userId\}/organizations",
    r"/users/\{userId\}/personal-access-tokens",
    r"/users/\{userId\}/profile",
    r"/sso-connectors/\{id\}/signing-keys",
    r"/hooks/\{id\}/signing-key",
    r"/hooks/\{id\}/recent-logs",
    r"/hooks/\{id\}/test",
    r"/logs/\{id\}$",
]

# --- (method, path) pairs the staff MCP does not expose --------------------
EXCLUDE_EXACT = {
    ("GET", "/api/custom-profile-fields/{name}"),     # the list covers inspection
    ("GET", "/api/organization-invitations/{id}"),    # detail adds nothing
    ("PUT", "/api/organizations/{id}/users"),         # bulk replace
    ("PUT", "/api/organizations/{id}/users/{userId}/roles"),
    ("GET", "/api/roles/{id}/users"),                 # covered by katra_list_user_roles
    ("GET", "/api/roles/{id}/applications"),
    ("PUT", "/api/users/{userId}/roles"),             # assign + remove cover it
    ("GET", "/api/applications/{id}/organizations"),  # org linkage stays in the Console
}


# --- group per OpenAPI tag -------------------------------------------------
GROUP_OF_TAG = OrderedDict([
    ("(none)", "tenants"),
    ("Tenant features", "tenants"),
    ("Applications", "applications"),
    ("Users", "users"),
    ("Organizations", "organizations"),
    ("Organization roles", "organization-roles"),
    ("Organization scopes", "organization-roles"),
    ("Organization invitations", "organization-roles"),
    ("Roles", "roles"),
    ("Resources", "resources"),
    ("Connectors", "connectors"),
    ("Connector factories", "connectors"),
    ("Sign-in experience", "sign-in-experience"),
    ("Custom phrases", "sign-in-experience"),
    ("Custom profile fields", "sign-in-experience"),
    ("Email templates", "sign-in-experience"),
    ("Configs", "configs"),
    ("Captcha provider", "configs"),
    ("Account center", "account-center"),
    ("Domains", "domains"),
    ("Hooks", "hooks"),
    ("SSO connectors", "enterprise-sso"),
    ("SSO connector providers", "enterprise-sso"),
    ("SAML applications", "enterprise-sso"),
    ("Audit logs", "operations"),
    ("Dashboard", "operations"),
    ("Secrets", "operations"),
])

# --- explicit names for the ones the rules read badly ----------------------
NAME_OVERRIDES = {
    "/api/tenants|GET": "katra_list_tenants",
    "/api/tenants|POST": "katra_create_tenant",
    "/api/tenants/{id}|GET": "katra_get_tenant",
    "/api/tenants/{id}|PATCH": "katra_update_tenant",
    "/api/tenants/{id}|DELETE": "katra_delete_tenant",
    "/api/tenants/{id}/features|PATCH": "katra_set_tenant_features",
    "/api/tenants/{id}/suspend|POST": "katra_set_tenant_suspended",
    "/api/tenant-features|GET": "katra_get_tenant_features",
    "/api/applications|GET": "katra_list_applications",
    "/api/applications|POST": "katra_create_application",
    "/api/applications/{id}|GET": "katra_get_application",
    "/api/applications/{id}|PATCH": "katra_update_application",
    "/api/applications/{id}|DELETE": "katra_delete_application",
    "/api/applications/{id}/secrets|GET": "katra_list_application_secrets",
    "/api/applications/{id}/secrets|POST": "katra_create_application_secret",
    "/api/applications/{id}/secrets/{name}|PATCH": "katra_update_application_secret",
    "/api/applications/{id}/secrets/{name}|DELETE": "katra_delete_application_secret",
    "/api/applications/{id}/organizations|GET": "katra_list_application_organizations",
    "/api/users|GET": "katra_list_users",
    "/api/users|POST": "katra_create_user",
    "/api/users/{userId}|GET": "katra_get_user",
    "/api/users/{userId}|PATCH": "katra_update_user",
    "/api/users/{userId}|DELETE": "katra_delete_user",
    "/api/users/{userId}/password|PATCH": "katra_set_user_password",
    "/api/users/{userId}/is-suspended|PATCH": "katra_set_user_suspended",
    "/api/users/{userId}/roles|GET": "katra_list_user_roles",
    "/api/users/{userId}/roles|POST": "katra_assign_user_roles",
    "/api/users/{userId}/sessions/{sessionId}|DELETE": "katra_revoke_user_session",
    "/api/organizations|GET": "katra_list_organizations",
    "/api/organizations|POST": "katra_create_organization",
    "/api/organizations/{id}|GET": "katra_get_organization",
    "/api/organizations/{id}|PATCH": "katra_update_organization",
    "/api/organizations/{id}|DELETE": "katra_delete_organization",
    "/api/organizations/{id}/users|GET": "katra_list_organization_members",
    "/api/organizations/{id}/users|POST": "katra_add_organization_members",
    "/api/organizations/{id}/users/{userId}|DELETE": "katra_remove_organization_member",
    "/api/organizations/{id}/users/{userId}/roles|GET": "katra_list_organization_member_roles",
    "/api/organizations/{id}/users/{userId}/roles|POST": "katra_assign_organization_member_roles",
    "/api/organization-roles|GET": "katra_list_organization_roles",
    "/api/organization-roles|POST": "katra_create_organization_role",
    "/api/organization-roles/{id}|GET": "katra_get_organization_role",
    "/api/organization-roles/{id}|PATCH": "katra_update_organization_role",
    "/api/organization-roles/{id}|DELETE": "katra_delete_organization_role",
    "/api/organization-scopes|GET": "katra_list_organization_scopes",
    "/api/organization-scopes|POST": "katra_create_organization_scope",
    "/api/organization-roles/{id}/resource-scopes|POST": "katra_assign_organization_role_scopes",
    "/api/organizations/{id}/users/roles|POST": "katra_assign_organization_roles_to_members",
    "/api/organization-invitations|GET": "katra_list_organization_invitations",
    "/api/organization-invitations|POST": "katra_create_organization_invitation",
    "/api/organization-invitations/{id}|DELETE": "katra_delete_organization_invitation",
    "/api/roles|GET": "katra_list_roles",
    "/api/roles|POST": "katra_create_role",
    "/api/roles/{id}|GET": "katra_get_role",
    "/api/roles/{id}|PATCH": "katra_update_role",
    "/api/roles/{id}|DELETE": "katra_delete_role",
    "/api/roles/{id}/users|POST": "katra_assign_role_to_users",
    "/api/roles/{id}/applications|POST": "katra_assign_role_to_applications",
    "/api/resources|GET": "katra_list_resources",
    "/api/resources|POST": "katra_create_resource",
    "/api/resources/{id}|GET": "katra_get_resource",
    "/api/resources/{id}|PATCH": "katra_update_resource",
    "/api/resources/{id}|DELETE": "katra_delete_resource",
    "/api/resources/{resourceId}/scopes|GET": "katra_list_resource_scopes",
    "/api/resources/{resourceId}/scopes|POST": "katra_create_resource_scope",
    "/api/connectors|GET": "katra_list_connectors",
    "/api/connectors|POST": "katra_create_connector",
    "/api/connectors/{id}|GET": "katra_get_connector",
    "/api/connectors/{id}|PATCH": "katra_update_connector",
    "/api/connectors/{id}|DELETE": "katra_delete_connector",
    "/api/connector-factories|GET": "katra_list_connector_factories",
    "/api/sign-in-exp|GET": "katra_get_sign_in_experience",
    "/api/sign-in-exp|PATCH": "katra_update_sign_in_experience",
    "/api/custom-phrases|GET": "katra_list_custom_phrases",
    "/api/custom-phrases/{languageTag}|GET": "katra_get_custom_phrases",
    "/api/custom-phrases/{languageTag}|PUT": "katra_upsert_custom_phrases",
    "/api/custom-phrases/{languageTag}|DELETE": "katra_delete_custom_phrases",
    "/api/custom-profile-fields|GET": "katra_list_custom_profile_fields",
    "/api/custom-profile-fields|POST": "katra_create_custom_profile_field",
    "/api/custom-profile-fields/{name}|PATCH": "katra_update_custom_profile_field",
    "/api/custom-profile-fields/{name}|DELETE": "katra_delete_custom_profile_field",
    "/api/email-templates|GET": "katra_list_email_templates",
    "/api/email-templates|PUT": "katra_replace_email_templates",
    "/api/configs/admin-console|GET": "katra_get_admin_console_config",
    "/api/configs/admin-console|PATCH": "katra_update_admin_console_config",
    "/api/configs/id-token|GET": "katra_get_id_token_config",
    "/api/configs/id-token|PUT": "katra_upsert_id_token_config",
    "/api/configs/oidc/session|GET": "katra_get_oidc_session_config",
    "/api/configs/oidc/session|PATCH": "katra_update_oidc_session_config",
    "/api/configs/actions|GET": "katra_list_actions",
    "/api/configs/actions/{actionType}|PUT": "katra_upsert_action",
    "/api/captcha-provider|GET": "katra_get_captcha_provider",
    "/api/captcha-provider|PUT": "katra_update_captcha_provider",
    "/api/account-center|GET": "katra_get_account_center",
    "/api/account-center|PATCH": "katra_update_account_center",
    "/api/domains|GET": "katra_list_domains",
    "/api/domains|POST": "katra_add_domain",
    "/api/domains/{id}|DELETE": "katra_delete_domain",
    "/api/domains/{id}/verify|POST": "katra_verify_domain",
    "/api/hooks|GET": "katra_list_hooks",
    "/api/hooks|POST": "katra_create_hook",
    "/api/hooks/{id}|GET": "katra_get_hook",
    "/api/hooks/{id}|PATCH": "katra_update_hook",
    "/api/hooks/{id}|DELETE": "katra_delete_hook",
    "/api/hooks/{id}/test|POST": "katra_test_hook",
    "/api/sso-connectors|GET": "katra_list_sso_connectors",
    "/api/sso-connectors|POST": "katra_create_sso_connector",
    "/api/sso-connectors/{id}|GET": "katra_get_sso_connector",
    "/api/sso-connectors/{id}|PATCH": "katra_update_sso_connector",
    "/api/sso-connectors/{id}|DELETE": "katra_delete_sso_connector",
    "/api/sso-connector-providers|GET": "katra_list_sso_connector_providers",
    "/api/saml-applications|POST": "katra_create_saml_application",
    "/api/saml-applications/{id}|GET": "katra_get_saml_application",
    "/api/saml-applications/{id}|PATCH": "katra_update_saml_application",
    "/api/saml-applications/{id}|DELETE": "katra_delete_saml_application",
    "/api/saml-applications/{id}/metadata|GET": "katra_get_saml_application_metadata",
    "/api/logs|GET": "katra_list_audit_logs",
    "/api/dashboard/users/total|GET": "katra_get_user_count",
    "/api/secrets/{id}|DELETE": "katra_delete_secret",
    # names the rules read badly, fixed by hand
    "/api/users/{userId}/roles/{roleId}|DELETE": "katra_remove_user_role",
    "/api/organizations/{id}/users/{userId}/roles/{organizationRoleId}|DELETE":
        "katra_remove_organization_member_role",
    "/api/roles/{id}/scopes|GET": "katra_list_role_scopes",
    "/api/roles/{id}/scopes|POST": "katra_link_role_scope",
    "/api/resources/{id}/is-default|PATCH": "katra_set_resource_default",
    "/api/custom-profile-fields/{name}|PUT": "katra_update_custom_profile_field",
    "/api/domains|POST": "katra_create_domain",
    "/api/domains/{id}/verify|POST": "katra_verify_domain",
    "/api/organizations/{id}/users/{userId}/roles|POST": "katra_assign_organization_member_roles",
    "/api/organization-invitations|GET": "katra_list_organization_invitations",
    "/api/organization-invitations|POST": "katra_create_organization_invitation",
    "/api/roles/{id}/users/{userId}|DELETE": "katra_remove_role_from_user",
    "/api/roles/{id}/applications/{applicationId}|DELETE": "katra_remove_role_from_application",
    "/api/roles/{id}/scopes/{scopeId}|DELETE": "katra_unlink_role_scope",
    "/api/custom-phrases/{languageTag}|DELETE": "katra_delete_custom_phrase",
    "/api/custom-phrases/{languageTag}|GET": "katra_get_custom_phrase",
    "/api/custom-phrases/{languageTag}|PUT": "katra_upsert_custom_phrase",
    "/api/domains/{id}|GET": "katra_get_domain",
}

SINGULAR = {
    "applications": "application", "users": "user", "organizations": "organization",
    "roles": "role", "resources": "resource", "connectors": "connector",
    "domains": "domain", "hooks": "hook", "secrets": "secret", "tenants": "tenant",
    "scopes": "scope", "phrases": "phrase", "templates": "template", "fields": "field",
    "providers": "provider", "factories": "factory", "invitations": "invitation",
    "sessions": "session", "keys": "key", "actions": "action", "accounts": "account",
    "logs": "log", "saml-applications": "saml_application", "sso-connectors": "sso_connector",
    "organization-roles": "organization_role", "organization-scopes": "organization_scope",
    "custom-profile-fields": "custom_profile_field", "email-templates": "email_template",
    "custom-phrases": "custom_phrase", "connector-factories": "connector_factory",
    "tenant-features": "tenant_feature", "account-center": "account_center",
    "sign-in-exp": "sign_in_experience", "captcha-provider": "captcha_provider",
    "sso-connector-providers": "sso_connector_provider",
}
VERB = {"GET": "get", "POST": "create", "PATCH": "update", "PUT": "replace", "DELETE": "delete"}

# --- must-have operations (these override the exclusions above) --------------
# Judged by "can an agent provision/wire/verify without a human in the Console?".
MUST_ALLOW = {
    ("GET", "/api/users/{userId}/custom-data"): "katra_get_user_custom_data",
    ("PATCH", "/api/users/{userId}/custom-data"): "katra_update_user_custom_data",
    ("GET", "/api/organization-scopes"): "katra_list_organization_scopes",
    ("POST", "/api/organization-scopes"): "katra_create_organization_scope",
    ("PATCH", "/api/organization-scopes/{id}"): "katra_update_organization_scope",
    ("DELETE", "/api/organization-scopes/{id}"): "katra_delete_organization_scope",
    ("GET", "/api/organizations/{id}/applications"): "katra_list_organization_applications",
    ("POST", "/api/organizations/{id}/applications"): "katra_add_organization_application",
    ("DELETE", "/api/organizations/{id}/applications/{applicationId}"):
        "katra_remove_organization_application",
    ("GET", "/api/organizations/{id}/applications/{applicationId}/roles"):
        "katra_list_organization_application_roles",
    ("POST", "/api/organizations/{id}/applications/{applicationId}/roles"):
        "katra_assign_organization_roles_to_application",
    ("GET", "/api/applications/{applicationId}/sign-in-experience"):
        "katra_get_application_sign_in_experience",
    ("PUT", "/api/applications/{applicationId}/sign-in-experience"):
        "katra_update_application_sign_in_experience",
    ("POST", "/api/connectors/{factoryId}/test"): "katra_test_connector",
    ("POST", "/api/connectors/{connectorId}/authorization-uri"):
        "katra_get_connector_authorization_uri",
    ("GET", "/api/email-templates"): "katra_list_email_templates",
    ("PUT", "/api/email-templates"): "katra_replace_email_templates",
    ("PATCH", "/api/email-templates/{id}/details"): "katra_update_email_template_details",
    ("GET", "/api/configs/jwt-customizer"): "katra_list_jwt_customizers",
    ("PUT", "/api/configs/jwt-customizer/{tokenTypePath}"): "katra_upsert_jwt_customizer",
}


def is_excluded(method: str, path: str) -> bool:
    if (method, path) in EXCLUDE_EXACT:
        return True
    return any(re.search(pattern, path) for pattern in EXCLUDE_PATTERNS)


def rule_name(method: str, path: str) -> str:
    segments = [s for s in path.replace("/api/", "", 1).split("/") if s and not s.startswith("{")]
    words = [SINGULAR.get(seg, seg.replace("-", "_")) for seg in segments]
    verb = VERB[method]
    if method == "GET" and not path.rstrip("/").endswith("}"):
        verb = "list"
    return "katra_" + verb + ("_" + "_".join(words) if words else "")


def main() -> None:
    spec = json.load(open(BASE + r"\spec\katra-admin-api.json", encoding="utf-8"))
    seed = yaml.safe_load(open(BASE + r"\out\tool_spec.yaml", encoding="utf-8"))

    curated = []
    seen = set()
    for tool in seed["tools"]:
        impl = tool["impl"]
        method, path = impl.get("http_method"), impl.get("http_path")
        if not method or not path:
            continue
        must_name = MUST_ALLOW.get((method, path))
        if must_name is None and is_excluded(method, path):
            continue
        tag = (spec["paths"].get(path, {}).get(method.lower(), {}).get("tags") or ["(none)"])[0]
        group = GROUP_OF_TAG.get(tag)
        if group is None:
            print("UNMAPPED TAG", tag, method, path, file=sys.stderr)
            continue
        name = must_name or NAME_OVERRIDES.get(f"{path}|{method}", rule_name(method, path))
        if name in seen:
            print("DUPLICATE NAME", name, method, path, file=sys.stderr)
            continue
        seen.add(name)
        curated.append({
            "name": name,
            "group": group,
            "tag": tag,
            "tier": "must" if must_name else "core",
            "method": method,
            "path": path,
            "seed_tool": tool["name"],
            "params": [p["name"] for p in tool.get("parameters", [])],
        })

    curated.sort(key=lambda t: (t["group"], t["name"]))
    with open(BASE + r"\work\curated-surface.json", "w", encoding="utf-8") as fh:
        json.dump(curated, fh, indent=1, ensure_ascii=False)
    groups = {}
    for item in curated:
        groups.setdefault(item["group"], []).append(item["name"])
    print(f"curated tools: {len(curated)}")
    for group, names in groups.items():
        print(f"  {group:24s} {len(names):3d}")


if __name__ == "__main__":
    main()
