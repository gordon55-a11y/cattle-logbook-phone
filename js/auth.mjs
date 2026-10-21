import {
  MICROSOFT_AUTHORITY,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_SCOPES,
  clientIdIsPlaceholder,
} from "./config.mjs";

export function redirectUri() {
  return new URL("./", window.location.href).href;
}

function loadMsal() {
  if (window.msal?.PublicClientApplication) return Promise.resolve(window.msal);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("../vendor/msal-browser.min.js", import.meta.url).href;
    script.onload = () => {
      if (window.msal?.PublicClientApplication) resolve(window.msal);
      else reject(new Error("Microsoft sign-in did not start."));
    };
    script.onerror = () => reject(new Error("Could not load Microsoft sign-in."));
    document.head.appendChild(script);
  });
}

/**
 * Real Microsoft sign-in. Not used while the client ID is still the placeholder.
 */
export async function createAuth(clientId = MICROSOFT_CLIENT_ID) {
  if (clientIdIsPlaceholder(clientId)) {
    return {
      mode: "practice",
      async getToken() {
        return null;
      },
      async signIn() {
        throw new Error("Microsoft sign-in is not set up yet.");
      },
    };
  }
  const msal = await loadMsal();
  const app = new msal.PublicClientApplication({
    auth: {
      clientId: String(clientId).trim(),
      authority: MICROSOFT_AUTHORITY,
      redirectUri: redirectUri(),
      navigateToLoginRequestUrl: true,
    },
    cache: { cacheLocation: "localStorage" },
  });
  await app.initialize();
  const redirect = await app.handleRedirectPromise();
  const account = redirect?.account || app.getAllAccounts()[0] || null;

  async function getToken() {
    const current = account || app.getAllAccounts()[0];
    if (!current) return null;
    try {
      const result = await app.acquireTokenSilent({ account: current, scopes: MICROSOFT_SCOPES });
      return result.accessToken;
    } catch (error) {
      if (error?.name === "InteractionRequiredAuthError" || error?.errorCode === "interaction_required") {
        await app.acquireTokenRedirect({ account: current, scopes: MICROSOFT_SCOPES });
        return null;
      }
      throw error;
    }
  }

  return {
    mode: "microsoft",
    account,
    async getToken() {
      return getToken();
    },
    async signIn() {
      await app.loginRedirect({ scopes: MICROSOFT_SCOPES });
    },
  };
}
