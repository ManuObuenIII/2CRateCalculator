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
2. **Trip cost** (internal): fuel, maintenance (fixed + per round-trip km), yard in/out (yard km × 2 ÷ yard km/L × diesel,
   plus the yard toll × 2; all in Settings), driver (matrix), tolls, other.
3. **Target net income**: the rate card is billed in full. When it would earn less than the target
   net income %, a **rate adjustment** tops it up to the target (folded into the basic rate on the
   client proposal, itemised on the internal sheet). No discount is given when it earns more.
4. VAT on top when the proposal is VAT.

## Deploying

1. In the Apps Script project, replace each file with the copy here (file names must match).
   Keep `appsscript.json` as is (enable *Show "appsscript.json" manifest file in editor* in
   Project Settings to see it).
2. **Deploy → Manage deployments → Edit → New version → Deploy.**
3. The app runs as the person using it, so each team member needs edit access to both spreadsheets
   and the Drive folders: open the app as the owner, go to **Settings → Team**, list their Google
   accounts and press **Share with team**.

## Brokerage portal

A second deployment of the same code lets a brokerage price trips for its own clients and download the client
proposal only (no internal cost sheet, settings, saved proposals or other brokerages):

1. **Deploy → New deployment → Web app**, *Execute as:* **Me**, *Who has access:* **Anyone**. Give that URL to brokerages.
2. In Settings, paste that URL into **Brokerage portal link** (it goes into the sign-in email).
3. In the team app, open **Brokerages & clients → Edit** a brokerage and, under **Brokerage portal users**, add the
   person's email. A temporary password is created, stored as a salted SHA-256 hash in the **Portal Users** tab, and
   emailed to them with the portal link (from the admin's own account). Reset password / Remove are there too.
4. The person opens the portal link, signs in with email + temporary password, and is asked to choose their own
   password. Sessions last 6 hours; 6 wrong passwords lock the email for 15 minutes. They can add their own clients and
   delivery addresses. The proposal uses the portal admin % and target net income % from Settings. Everything else the
   script offers (`teamOnly_()`) refuses calls from the portal.

## Metro Manila truck rules

`Code.gs` → *METRO MANILA TRUCK RULES*. Every Google route is checked against the MMDA truck ban:
EDSA (Magallanes–North Ave) is never used; the ban-hour roads (España/Quezon Ave, Recto, Quirino, P. Burgos–Aurora
Blvd, E. Rodriguez, South Superhighway/Nagtahan, Taft, Bonifacio Dr/Roxas Blvd/NAIA Rd, Rizal Ave, Reina
Regente/Abad Santos; 6–10 AM and 5–10 PM Mon–Sat) are flagged on the cost sheet, which says to travel outside the
ban hours. Metro Manila trips run on C-3: R-10 → Harbor Link (exit C-3 Road) → C-3 (Sgt. Rivera St, Araneta Ave),
then roads trucks may use (`C3_VIA`). Eastern cities (San Juan, Mandaluyong, Makati, Pasig, Marikina, Taguig, Pateros)
and Rizal go through San Marcelino St, the Port Area truck route, with no toll roads (`SAN_MARCELINO_VIA`).
Trailers never use the Skyway: when Google's route takes it, the Metro Manila part is looked up toll-free (southbound:
city streets from the NLEX Connector to Osmeña Highway, then SLEX). Skyway use right above Osmeña Highway / SLEX is
kept with a note, since the at-grade road below is the same distance. Makati CBD, Ortigas and BGC deliveries are flagged. Edit the lists there when MMDA rules change.

## Notes

- Route rules for trailers: southbound via the NLEX Connector (C-3 → Magsaysay); northbound via
  R-10 → Harbor Link (Karuhatan); Metro Manila via the Harbor Link (exit C-3 Road) and C-3; eastern cities and Rizal
  via San Marcelino St; Quezon City compares C-3 with the Mindanao Ave corridor (Metro Manila never uses the NLEX
  Connector or Osmeña); Malabon /
  Valenzuela / Caloocan via the Harbor Link (exit Karuhatan); EDSA (Magallanes–North Ave) is avoided.
- Address data: PSGC via github.com/bendlikeabamboo/barangay (MIT).

## App icon

`assets/favicon-192.png` (and the 512 / 32 px versions) is the 2C logo as a square icon. `Code.gs` points
`setFaviconUrl` at the raw GitHub URL of the 192 px file, so it shows in the browser tab and when the app
is added to a phone's home screen. If the repo moves, update `FAVICON_URL` in `Code.gs`.

## GitHub Pages: brokerage portal page

`portal/index.html` is the same installable shell for brokerages. It has no fixed app address: the sign-in email
links to `https://manuobueniii.github.io/2CRateCalculator/portal/#<portal deployment URL>` (built by `portalLink_()`
in `Code.gs` from Settings → Brokerage portal link). The page keeps that address on the device, so the installed
app and later visits open the portal without the link.

## GitHub Pages

`index.html` is an installable web-app shell for GitHub Pages (https://manuobueniii.github.io/2CRateCalculator/):
it shows the calculator inside the page (an iframe of the Apps Script web app, which `doGet` allows with
`setXFrameOptionsMode(ALLOWALL)`), with the 2C logo as the app icon, a manifest and a service worker so it can be
installed on phones and desktops. The calculator itself still runs on Google. On iPhone/iPad, Safari and in-app browsers (Messenger, Facebook…)
Google's sign-in does not work inside a frame (it answers "401 malformed"), so there the shell opens the calculator as
its own page instead; the installed home-screen app on iPhone goes straight to it. If the web app is redeployed under
a new URL, update `APP_URL` and the two links in `index.html`.
