# Salud Bistro demo access and first-use guide

The demo opens with a password form, then a required disclaimer, then a 2.4-second welcome using the existing official Salud Bistro wordmark. Reduced-motion preferences shorten the welcome and suppress movement. The existing espresso, cream, DM Sans and Fraunces identity is retained.

The disclaimer states that this is solely a demonstration, is still in development, is not a final product, uses simulated payments and must not be used for live sales, official records or sensitive personal information. Acceptance is required for each new login session. It is not stored as a permanent user account or legal acceptance record.

## Local access setup

The requested shared password has been configured on this workspace. It is not embedded in the client bundle, source files or this guide. Only a salted scrypt hash and a random session-signing secret are saved in `data/demo-access.json`, or the root selected by `SORA_DATA_DIR`. That directory is ignored by Git.

To configure a fresh installation or change the password, run in PowerShell:

```powershell
$demoCredential = Read-Host 'Demo password' -AsSecureString
$demoPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($demoCredential)
try {
  $env:SORA_DEMO_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($demoPointer)
  npm run demo:access
} finally {
  Remove-Item Env:SORA_DEMO_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($demoPointer)
}
```

Setup reads `.env` for the data root, replaces only the access configuration, and rotates the signing secret. Existing sessions must then sign in again. Keep this file private and include it in private backups if access should survive moving the app. Missing or malformed configuration fails closed; the login form explains how the demo host can configure access.

## Session behaviour

- Password verification runs on the server. Ten incorrect attempts temporarily throttle the shared login endpoint for up to five minutes. This is an in-process local-demo throttle and resets when the server restarts.
- A signed, HttpOnly, SameSite=Strict cookie first grants access only to the disclaimer. Acceptance issues an accepted session valid for 12 hours. HTTPS uses Secure cookies; local HTTP development remains supported.
- Next.js Proxy checks page requests and all application APIs, including product image data. Only framework assets, public branding and the access endpoint are excluded. Unauthenticated APIs return JSON 401; sessions awaiting acceptance return JSON 403. Responses use `no-store`.
- Protected API failures send the client to the appropriate access screen. Returning to a tab also checks the session. Log out (top-right of the header) clears the cookie and reloads the login screen, clearing the in-memory register state. Unsaved work retains its existing leave-page warning.
- Internal return paths are checked; external URLs, backslashes, encoded protocol-relative paths, access pages and API paths are rejected.
- This is a shared demonstration gate. It does not implement individual users, permission roles, multi-tenant isolation, production identity management or real payment processing.

## First-use tips

One-time tips cover Register, Tables, checkout, split mode, custom amounts, item assignment, recorded payments, served-order additions, Kitchen and Menu. Selections trigger small, dismissible notifications without interrupting form focus. Each tip shows once per login session: every successful login clears the seen list and re-enables tips, so they appear again for the next user. “Hide tips” disables them; the header Help button contains the full guide, an enable toggle and a reset button. Browser-storage restrictions fall back to memory for the current visit.

## Receipts and split spacing

Both table and guest receipts display **SALUD BISTRO** as a letter-spaced heading at the top and mark the document as a demo receipt. The default “Demo Café” name and footer text are replaced on display, and fresh seeds now use Salud Bistro directly. Saved financial history and business settings are not rewritten.

Receipt spacing was reworked: the header, order details, items, totals, payments, balance and footer are separate sections with dashed dividers; item lines have consistent gaps; modifier notes are indented; amounts use tabular figures; Total and Balance are emphasised with solid rules. The heading stays as text (not the masked logo) so it always prints.

Custom split labels now sit above their inputs with consistent gaps and a fixed amount column. The preview is limited to a readable width and stacks on phones. Locked paid shares are readable money values instead of faded disabled inputs. Fully settled checks show a saved, read-only split summary without a redundant confirmation button. The allocation and payment rules are unchanged.

## Verification

Automated coverage checks password hashing, invalid passwords, explicit acceptance, signed-session tampering and expiry, secret rotation, API and page protection, image protection, logout, request origins, HTTPS cookie flags, safe return destinations and the login throttle. The existing order, kitchen, allocation and payment tests run against the isolated test database.

Browser inspection is intentionally left to the user, as requested. In Cursor, start or restart the local server and check: password → unchecked disclaimer → accept → welcome/skip; receipt heading/footer; equal and custom splits before and after payment; tips once, disable and replay; Lock and sign-in again; narrow layout and reduced motion. No browser is opened by this change.
