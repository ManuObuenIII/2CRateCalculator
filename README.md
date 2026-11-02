# 2C Calculator

2C Trucking's trailer rate calculator: a Google Apps Script web app with a Google Sheets back end.
It prices a trailer trip from Manila Port (MICT), produces the client proposal and the internal cost
sheet as PDFs, saves proposals to Drive and a sheet, emails proposals, and exports CSVs.

## Files

| File | What it is |
|---|---|
| `Code.gs` | Server side: rate card, routing (Google Maps, trailer-only roads), tolls, masterlist, brokerages/clients/addresses, proposals, PDFs, email, settings, team sharing |
| `Index.html` | The web app page: calculator, proposals, dashboard, masterlist, brokerages & clients, driver rate matrix, diesel price, settings |
| `Logo.html` | The 2C Trucking logo (base64), pulled into the page |
| `Signature.html` | The CEO's signature image (base64) printed on client proposals |
| `PlacesData.html` | Philippine provinces, cities/municipalities and barangays (PSGC, gzipped + base64) for the address dropdowns |
| `appsscript.json` | Apps Script manifest: time zone, web app settings, OAuth scopes |

## Spreadsheets

Set in `Code.gs`:

- `SHEET_ID` – the **Proposals** spreadsheet (saved proposals, dispatch orders).
- `DRIVER_MATRIX_ID` – the **rates and brokerages** spreadsheet. Tabs are created on first use:
  Settings, Masterlist, Driver Rate Matrix, Weekly Diesel Price, Toll Rates (Class 3), Brokers,
  Clients, Client Addresses, Road Advisories.

## How the rate is computed

1. **Rate card** (client-facing): basic rate (covers the first N km, per brokerage or standard) +
   variable (excess km × bracket ₱/km) + fuel surcharge (excess km × round-trip multiplier ÷ bracket
   km/L × diesel price above the benchmark).
2. **Trip cost** (internal): fuel, maintenance (fixed + per round-trip km), driver (matrix), tolls, other.
3. **Target net income**: the billed rate is moved to land exactly on the target net income % —
   a **discount** (shown to the client) when the rate card is above target, a **rate adjustment**
   (folded into the basic rate on the client proposal, itemised on the internal sheet) when below.
4. VAT on top when the proposal is VAT.

## Deploying

1. In the Apps Script project, replace each file with the copy here (file names must match).
   Keep `appsscript.json` as is (enable *Show "appsscript.json" manifest file in editor* in
   Project Settings to see it).
2. **Deploy → Manage deployments → Edit → New version → Deploy.**
3. The app runs as the person using it, so each team member needs edit access to both spreadsheets
   and the Drive folders: open the app as the owner, go to **Settings → Team**, list their Google
   accounts and press **Share with team**.

## Notes

- Route rules for trailers: southbound via the NLEX Connector (C-3 → Magsaysay); northbound via
  R-10 → Harbor Link (Karuhatan); Pasig area via Osmeña or Mindanao Ave corridors; Malabon /
  Valenzuela / Caloocan via the Harbor Link; EDSA (Magallanes–North Ave) is avoided.
- Address data: PSGC via github.com/bendlikeabamboo/barangay (MIT).

## App icon

`assets/favicon-192.png` (and the 512 / 32 px versions) is the 2C logo as a square icon. `Code.gs` points
`setFaviconUrl` at the raw GitHub URL of the 192 px file, so it shows in the browser tab and when the app
is added to a phone's home screen. If the repo moves, update `FAVICON_URL` in `Code.gs`.

## GitHub Pages

`index.html` is an installable web-app shell for GitHub Pages (https://manuobueniii.github.io/2CRateCalculator/):
it shows the calculator inside the page (an iframe of the Apps Script web app, which `doGet` allows with
`setXFrameOptionsMode(ALLOWALL)`), with the 2C logo as the app icon, a manifest and a service worker so it can be
installed on phones and desktops. The calculator itself still runs on Google. On iPhone/iPad, Safari and in-app browsers (Messenger, Facebook…)
Google's sign-in does not work inside a frame (it answers "401 malformed"), so there the shell opens the calculator as
its own page instead; the installed home-screen app on iPhone goes straight to it. If the web app is redeployed under
a new URL, update `APP_URL` and the two links in `index.html`.
