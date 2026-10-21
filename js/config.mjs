/**
 * PASTE GORDON'S APPLICATION (CLIENT) ID BETWEEN THE QUOTES.
 * Until this line is changed, the phone keeps a sample book on the phone
 * and does not contact Microsoft or OneDrive.
 *
 * The ID looks like: 12345678-1234-1234-1234-123456789abc
 * It is not a password. Do not put a client secret, certificate, or password here.
 */
export const MICROSOFT_CLIENT_ID = "PASTE-APPLICATION-CLIENT-ID-HERE";

/**
 * Personal Microsoft accounts.
 * If sign-in later says this Microsoft account is not allowed, change this to "common".
 */
export const MICROSOFT_AUTHORITY = "https://login.microsoftonline.com/consumers";

export const MICROSOFT_SCOPES = ["User.Read", "Files.ReadWrite"];

export function clientIdIsPlaceholder(id = MICROSOFT_CLIENT_ID) {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(id || "").trim()
  );
}
