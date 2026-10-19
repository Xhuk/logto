/**
 * Tool: katra_update_sign_in_experience
 * Patch the default sign-in experience settings; only the fields supplied are changed, so send just the sections you intend to modify. Changing branding, methods or policies here affects every application in the tenant immediately.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_sign_in_experience",
  description: "Patch the default sign-in experience settings; only the fields supplied are changed, so send just the sections you intend to modify. Changing branding, methods or policies here affects every application in the tenant immediately.",
  inputSchema: z.object({
    "removeUnusedDemoSocialConnector": z.string().optional().describe("Pass \"true\" to also delete demo social connectors that are no longer referenced by socialSignInConnectorTargets."),
    "tenantId": z.string().optional().describe("Tenant whose sign-in experience is updated; omit to use the tenant bound to the current session."),
    "color": z.record(z.string(), z.unknown()).optional().describe("Color settings, e.g. {\"primaryColor\":\"#5D34F2\",\"isDarkModeEnabled\":true,\"darkPrimaryColor\":\"#7A5AF8\"}."),
    "branding": z.record(z.string(), z.unknown()).optional().describe("Branding assets, e.g. {\"logoUrl\":\"https://.../logo.svg\",\"darkLogoUrl\":\"...\",\"favicon\":\"...\",\"slogan\":\"Welcome\"}."),
    "hideLogtoBranding": z.boolean().optional().describe("Set true to hide Logto branding on the sign-in page (requires a paid plan)."),
    "languageInfo": z.record(z.string(), z.unknown()).optional().describe("Language settings, e.g. {\"autoDetect\":true,\"fallbackLanguage\":\"en\",\"enabledLanguages\":[\"en\",\"fr\"]}."),
    "agreeToTermsPolicy": z.string().optional().describe("Terms agreement behavior: \"Automatic\" (implicit consent) or \"Manual\" (explicit checkbox)."),
    "signIn": z.record(z.string(), z.unknown()).optional().describe("Sign-in method config with a methods array, e.g. {\"methods\":[{\"identifier\":\"username\",\"password\":true,\"verificationCode\":false,\"isPasswordPrimary\":true}]}. Passkey is not part of methods in this build; enable it through passkeySignIn."),
    "signUp": z.record(z.string(), z.unknown()).optional().describe("Sign-up config, e.g. {\"identifiers\":[\"username\",\"email\"],\"password\":{\"enabled\":true},\"verify\":true}."),
    "socialSignIn": z.record(z.string(), z.unknown()).optional().describe("Per-target social sign-in display options, keyed by connector target, e.g. {\"google\":{\"name\":\"Google\"}}."),
    "socialSignInConnectorTargets": z.array(z.unknown()).optional().describe("Ordered array of social connector target identifiers to display on the sign-in page."),
    "signInMode": z.string().optional().describe("Which flows are available: \"SignIn\", \"Register\", or \"SignInAndRegister\"."),
    "customCss": z.string().optional().describe("Raw CSS injected into the sign-in page for advanced styling."),
    "customContent": z.record(z.string(), z.unknown()).optional().describe("Custom copy for policy links and page text, e.g. {\"termsOfUse\":{\"en\":\"Terms\"},\"privacyPolicy\":{...}}."),
    "customUiAssets": z.record(z.string(), z.unknown()).optional().describe("Custom UI asset references (logo, favicon, etc.) with their asset id and upload details."),
    "customUiCsp": z.record(z.string(), z.unknown()).optional().describe("Content Security Policy for the custom UI, e.g. {\"scriptSrc\":[\"https://cdn.example.com\"],\"imgSrc\":[]}."),
    "passwordPolicy": z.record(z.string(), z.unknown()).optional().describe("Password rules, e.g. {\"minLength\":8,\"maxLength\":64,\"policy\":[\"lowercase\",\"uppercase\",\"number\",\"symbol\"],\"rejects\":[...]}."),
    "mfa": z.record(z.string(), z.unknown()).optional().describe("MFA settings, e.g. {\"factors\":[\"Totp\",\"WebAuthn\",\"BackupCode\"],\"policy\":\"UserControlled\"} or \"Mandatory\"."),
    "adaptiveMfa": z.record(z.string(), z.unknown()).optional().describe("Adaptive MFA settings, e.g. {\"enabled\":true,\"riskThreshold\":0.5}."),
    "trustedDevice": z.record(z.string(), z.unknown()).optional().describe("Trusted device settings, e.g. {\"enabled\":true,\"maxTrustedDevices\":3,\"durationInDays\":30}."),
    "singleSignOnEnabled": z.boolean().optional().describe("Set true to allow sign-in through enterprise SSO connectors."),
    "captchaPolicy": z.record(z.string(), z.unknown()).optional().describe("Captcha settings, e.g. {\"enabled\":true,\"provider\":\"recaptcha\",\"siteKey\":\"...\"}."),
    "sentinelPolicy": z.record(z.string(), z.unknown()).optional().describe("Sentinel bot-protection settings, e.g. {\"enabled\":true,\"riskThreshold\":0.6}."),
    "emailBlocklistPolicy": z.record(z.string(), z.unknown()).optional().describe("Email blocklist settings, e.g. {\"enableBlocklist\":true,\"blockSubaddressing\":false}."),
    "forgotPasswordMethods": z.array(z.unknown()).optional().describe("Array of allowed password-reset methods, e.g. [\"email\",\"phone\"]."),
    "passkeySignIn": z.record(z.string(), z.unknown()).optional().describe("Passkey sign-in options, e.g. {\"enabled\":true,\"allowAutofill\":true}."),
    "signUpProfileFields": z.array(z.unknown()).optional().describe("Array of extra profile field names to collect during sign-up, e.g. [\"birthdate\"]."),
    "usernamePolicy": z.record(z.string(), z.unknown()).optional().describe("Username rules, e.g. {\"caseSensitive\":false,\"minLength\":3,\"maxLength\":32,\"format\":\"^[a-zA-Z0-9_]+$\"}."),
    "termsOfUseUrl": z.record(z.string(), z.unknown()).optional().describe("Localized terms-of-use URL keyed by language tag, e.g. {\"en\":\"https://example.com/terms\"}."),
    "privacyPolicyUrl": z.record(z.string(), z.unknown()).optional().describe("Localized privacy-policy URL keyed by language tag, e.g. {\"en\":\"https://example.com/privacy\"}."),
    "supportEmail": z.record(z.string(), z.unknown()).optional().describe("Localized support email address keyed by language tag."),
    "supportWebsiteUrl": z.record(z.string(), z.unknown()).optional().describe("Localized support site URL keyed by language tag."),
    "unknownSessionRedirectUrl": z.record(z.string(), z.unknown()).optional().describe("URL to redirect users to when an unknown session is detected."),
    "passwordExpiration": z.record(z.string(), z.unknown()).optional().describe("Password expiry rules, e.g. {\"enabled\":true,\"validPeriodInDays\":90}."),
    "verificationCodePolicy": z.record(z.string(), z.unknown()).optional().describe("Verification code settings, e.g. {\"length\":6}."),
    "verbose": z.boolean().optional().describe("Set true to return the complete updated settings object (default false)."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/sign-in-exp");
    let path = "/api/sign-in-exp";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"removeUnusedDemoSocialConnector": {"style": "query", "apiName": "removeUnusedDemoSocialConnector"}, "tenantId": {"style": "body", "apiName": "tenantId"}, "color": {"style": "body", "apiName": "color"}, "branding": {"style": "body", "apiName": "branding"}, "hideLogtoBranding": {"style": "body", "apiName": "hideLogtoBranding"}, "languageInfo": {"style": "body", "apiName": "languageInfo"}, "agreeToTermsPolicy": {"style": "body", "apiName": "agreeToTermsPolicy"}, "signIn": {"style": "body", "apiName": "signIn"}, "signUp": {"style": "body", "apiName": "signUp"}, "socialSignIn": {"style": "body", "apiName": "socialSignIn"}, "socialSignInConnectorTargets": {"style": "body", "apiName": "socialSignInConnectorTargets"}, "signInMode": {"style": "body", "apiName": "signInMode"}, "customCss": {"style": "body", "apiName": "customCss"}, "customContent": {"style": "body", "apiName": "customContent"}, "customUiAssets": {"style": "body", "apiName": "customUiAssets"}, "customUiCsp": {"style": "body", "apiName": "customUiCsp"}, "passwordPolicy": {"style": "body", "apiName": "passwordPolicy"}, "mfa": {"style": "body", "apiName": "mfa"}, "adaptiveMfa": {"style": "body", "apiName": "adaptiveMfa"}, "trustedDevice": {"style": "body", "apiName": "trustedDevice"}, "singleSignOnEnabled": {"style": "body", "apiName": "singleSignOnEnabled"}, "captchaPolicy": {"style": "body", "apiName": "captchaPolicy"}, "sentinelPolicy": {"style": "body", "apiName": "sentinelPolicy"}, "emailBlocklistPolicy": {"style": "body", "apiName": "emailBlocklistPolicy"}, "forgotPasswordMethods": {"style": "body", "apiName": "forgotPasswordMethods"}, "passkeySignIn": {"style": "body", "apiName": "passkeySignIn"}, "signUpProfileFields": {"style": "body", "apiName": "signUpProfileFields"}, "usernamePolicy": {"style": "body", "apiName": "usernamePolicy"}, "termsOfUseUrl": {"style": "body", "apiName": "termsOfUseUrl"}, "privacyPolicyUrl": {"style": "body", "apiName": "privacyPolicyUrl"}, "supportEmail": {"style": "body", "apiName": "supportEmail"}, "supportWebsiteUrl": {"style": "body", "apiName": "supportWebsiteUrl"}, "unknownSessionRedirectUrl": {"style": "body", "apiName": "unknownSessionRedirectUrl"}, "passwordExpiration": {"style": "body", "apiName": "passwordExpiration"}, "verificationCodePolicy": {"style": "body", "apiName": "verificationCodePolicy"}};
    for (const [k, v] of Object.entries(params)) {
      if (v == null || k === "verbose" || k === "tenantId") continue;
      const meta = paramMeta[k] ?? { style: "query", apiName: k };
      if (meta.style === "path") {
        // Substitute into the path string before constructing URL — the URL
        // constructor percent-encodes "{" and "}" immediately, so a literal
        // "{param}" placeholder no longer exists in .pathname afterward.
        path = path.replace(`{${meta.apiName}}`, encodeURIComponent(String(v)));
      } else if (meta.style === "body") {
        bodyFields[meta.apiName] = v;
      } else {
        queryParams[meta.apiName] = String(v);
      }
    }
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(queryParams)) {
      url.searchParams.set(k, v);
    }
    for (const [k, v] of Object.entries({})) {
      url.searchParams.set(k, String(v));
    }
    const hasBody = Object.keys(bodyFields).length > 0;
    const resp = await apiFetch(url, {
      method: "PATCH",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(bodyFields) : undefined,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const result = await resp.json();
    const payload = params.verbose ? { data: result, _meta: { status: resp.status } } : compact(result);
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], structuredContent: payload };
  } finally {
    recordCall("katra_update_sign_in_experience", Date.now() - start, "ok");
  }
};
