/**
 * Public Application (client) ID for Cattle Logbook Phone.
 * This is not a password. Do not put a client secret, certificate, or password here.
 */
export const MICROSOFT_CLIENT_ID = "f19bbd77-5a5c-4c7b-b101-325509b786f6";

/**
 * This app was registered for work accounts and personal Microsoft accounts,
 * inside an Azure directory. That registration is found at "common".
 * "consumers" only finds apps registered as personal accounts only.
 * A personal Microsoft account still signs in through "common".
 */
export const MICROSOFT_AUTHORITY = "https://login.microsoftonline.com/common";

export const MICROSOFT_SCOPES = ["User.Read", "Files.ReadWrite"];

export function clientIdIsPlaceholder(id = MICROSOFT_CLIENT_ID) {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(id || "").trim()
  );
}
