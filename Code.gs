// ===================== SETTINGS =====================
// 2C Trucking: Trailer Rate Calculator (trailers only)
var SHEET_ID = '1Ib0Kwa0t60TlAoAfGn2OBUKo_qh5q1lBCWcn6HphBqs';
var SHEET_NAME = 'Proposals';   // falls back to the first tab if this name doesn't exist
var TRUCK_TYPE = 'Trailer';

// Every trip starts here. Used for the Google Maps distance and shown on the proposal.
// If Maps picks the wrong spot, replace it with a fuller address; the proposal shows ORIGIN_LABEL.
var ORIGIN = 'Manila Port, Manila, Philippines';
var ORIGIN_LABEL = 'Manila Port';

// Browser-tab / home-screen icon for the web app: the 2C logo as a square PNG, served from the GitHub repo.
// Apps Script needs a public PNG/ICO URL for this (data: URLs are not accepted).
var FAVICON_URL = 'https://raw.githubusercontent.com/ManuObuenIII/2CRateCalculator/main/assets/favicon-192.png';

// Trailers don't take the car route. Southbound trips always run through the NLEX Connector
// (C-3 Road/5th Ave. to Magsaysay), then city streets to SLEX. Google Maps is made to pass these
// two points so the distance follows the trailer route. Northbound trips use Harbor Link to NLEX.
var SOUTHBOUND_VIA = ['C-3 Road corner 5th Avenue, Caloocan, Metro Manila',
                      'Ramon Magsaysay Boulevard, Santa Mesa, Manila, Metro Manila'];
var SOUTHBOUND_VIA_LABEL = 'NLEX Connector (C-3 Road/5th Ave. to Magsaysay)';
// Northbound trips take R-10 to Karuhatan (Harbor Link), then NLEX. Never through Osmeña.
var NORTHBOUND_VIA = ['Radial Road 10, Navotas, Metro Manila', 'Karuhatan, Valenzuela City, Metro Manila'];
var NORTHBOUND_VIA_LABEL = 'R-10 and Harbor Link to NLEX (Karuhatan)';

// Pasig area (Pasig and the cities around it: Marikina, Quezon City, San Juan, Mandaluyong, Makati, Taguig,
// Pateros, plus all of Rizal province): trailers go through one of two corridors.
// The app sends the one picked in the toll suggestions; 'auto' tries both and takes the shorter.
var PASIG_CORRIDORS = {
  osmena: {
    via: SOUTHBOUND_VIA.concat(['Osmeña Highway corner Quirino Avenue, Manila, Metro Manila', 'C-5 Road, Ususan, Taguig City, Metro Manila']),
    label: 'NLEX Connector, Osmeña Highway and C-5'
  },
  mindanao: {
    via: NORTHBOUND_VIA.concat(['Mindanao Avenue corner Congressional Avenue, Quezon City, Metro Manila',
          'C-5 Road, Libis, Quezon City, Metro Manila']),
    label: 'R-10, Harbor Link, NLEX, Mindanao Avenue and C-5'
  },
  // Malabon, Valenzuela and Caloocan: R-10 to the Harbor Link, exit at Karuhatan, then city streets
  harbor: {
    via: NORTHBOUND_VIA,
    label: 'R-10 and Harbor Link (exit Karuhatan)'
  }
};
var PASIG_AUTO_CORRIDORS = ['osmena', 'mindanao'];   // what 'auto' compares for the Pasig area

// Trucks are banned from EDSA between Magallanes (Makati) and North Avenue (Quezon City).
// Each Google route is checked for EDSA inside this stretch. If it uses it, the shortest alternative
// off EDSA is taken; failing that, the route is sent through a truck road for that direction.
var EDSA_BAN_BOX = { south: 14.530, north: 14.662, west: 121.010, east: 121.065 };
// Route review on the internal cost sheet: trailer travel time is estimated at this average speed
// (Google's drive time is for cars). Change it to match your trucks.
var TRAILER_AVG_KPH = 40;
// Road names that count as expressway / toll road when Google describes a step
var EXPRESSWAY_RE = /\b(NLEX|SLEX|SCTEX|TPLEX|STAR|CALAX|CAVITEX|MCX|Skyway|Expressway|Expwy|Expy|Tollway|Connector|Harbor Link)\b/i;

var TRUCK_DETOUR = {
  south: { via: ['Osmeña Highway corner Quirino Avenue, Manila, Metro Manila'], label: 'Osmeña Highway (South Superhighway)' },
  metro: { via: ['C-5 Road, Bagong Ilog, Pasig City, Metro Manila'], label: 'C-5' }
};

// BILLED RATE: trailer rate card.
//   Excess km      = POD one way − covered km (none if within covered km)
//   Variable       = Excess km × bracket variable rate
//   Liters         = Excess km × distance multiplier ÷ bracket km/L
//   Fuel surcharge = Liters × (current diesel − benchmark), none if diesel ≤ benchmark
// The per-bracket values (variable rate, fuel efficiency, maintenance per km) live in the
// Masterlist tab of the driver matrix spreadsheet, edited from the app's Masterlist tab.
// The base rate, covered km, diesel benchmark, multiplier and VAT live in the Settings tab (see below).
// Bracket is picked from the POD one-way distance.

// Google Drive folder where saved proposal PDFs go. Created on the first save if it doesn't exist.
var PROPOSAL_FOLDER_NAME = '2C Trailer Proposals';

// Spreadsheet that holds the Driver Rate Matrix, Masterlist and Weekly Diesel Price tabs.
var DRIVER_MATRIX_ID = '1Bea7TxkFQyscGI8eLfBPttqzj5eEU4rK0tOW354odSA';
// ====================================================

// ---------- Settings (tab "Settings" in the driver matrix spreadsheet, edited from the app's Settings tab) ----------
// A = Key, B = Value, C = Setting, D = Notes. Missing rows are added with these defaults, so new settings
// appear on their own. Keys never change; values are what the app reads.
var SETTINGS_TAB = 'Settings';
var DEFAULT_TERMS = [
  'Rates are per trip, one way from MICT, and exclude VAT unless stated.',
  'The fuel surcharge follows the diesel price in effect on the booking date.',
  'Free waiting time of 4 hours at loading and 4 hours at unloading; waiting beyond that is charged per hour.',
  'This proposal is valid until the date stated above.'
].join('\n');
// [key, label, default, type, notes]
var SETTING_DEFS = [
  ['company_name', 'Company name', '2C Trucking', 'text', 'Used in sign-offs and emails'],
  ['signatory_name', 'Signatory name', 'Alvin Liu', 'text', 'Signs the client proposal and the email'],
  ['signatory_title', 'Signatory title', 'Chief Executive Officer', 'text', ''],
  ['standard_base_rate', 'Standard base rate (PHP)', 18000, 'number', 'Used when a brokerage has no base rate of its own'],
  ['covered_km', 'Km covered by the base rate', 15, 'number', 'One way'],
  ['fuel_benchmark', 'Diesel benchmark (PHP per liter)', 60, 'number', 'The fuel surcharge applies above this price'],
  ['distance_multiplier', 'Surcharge distance multiplier', 2, 'number', '2 = the excess km counted both ways'],
  ['vat_rate', 'VAT (%)', 12, 'number', ''],
  ['maint_fixed', 'Maintenance, fixed per trip (PHP)', 750, 'number', 'Added once to every trip\'s internal cost'],
  ['maint_per_km', 'Maintenance per km (PHP)', 10, 'number', 'Times the full round-trip distance, including the km covered by the base rate'],
  ['validity_days', 'Proposal validity (days)', 15, 'number', 'Valid until = proposal date + this many days'],
  ['terms', 'Terms and conditions', DEFAULT_TERMS, 'textarea', 'Printed on the client proposal, one term per line'],
  ['proposal_folder_id', 'Shared Drive folder ID for proposal PDFs', '', 'text', 'Blank = each person\'s own Drive'],
  ['agreements_folder_id', 'Shared Drive folder ID for MOAs and Truck Agreements', '', 'text', 'Blank = each person\'s own Drive'],
  ['team_emails', 'Team (Google accounts that use the app)', '', 'textarea', 'One email per line. Press "Share with team" to give them access to the spreadsheets and Drive folders']
];
var SETTINGS_MEMO_ = null;

function getSettingsSheet_() {
  var ss = dmSs_();
  var sh = ss.getSheetByName(SETTINGS_TAB);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS_TAB);
    sh.getRange(1, 1, 1, 4).setValues([['Key', 'Value', 'Setting', 'Notes']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 2, sh.getMaxRows(), 1).setNumberFormat('@');   // values stay as typed
    sh.setColumnWidth(2, 420);
    sh.getRange(2, 2, 200, 1).setWrap(true);
  }
  return sh;
}

// All settings as { key: value }, with defaults filled in and missing rows added to the sheet
function settings_() {
  if (SETTINGS_MEMO_) return SETTINGS_MEMO_;
  var cache = CacheService.getScriptCache();
  var hit = cache.get('settings_v2');
  if (hit) { SETTINGS_MEMO_ = JSON.parse(hit); return SETTINGS_MEMO_; }
  var sh = getSettingsSheet_();
  var values = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues() : [];
  var found = {};
  values.forEach(function (r) { if (r[0]) found[String(r[0]).trim()] = r[1]; });
  dropOldTerms_(sh, values, found);
  var out = {}, missing = [];
  SETTING_DEFS.forEach(function (d) {
    if (Object.prototype.hasOwnProperty.call(found, d[0])) out[d[0]] = found[d[0]];
    else { out[d[0]] = String(d[2]); missing.push([d[0], String(d[2]), d[1], d[4]]); }
  });
  if (missing.length) sh.getRange(sh.getLastRow() + 1, 1, missing.length, 4).setValues(missing);
  SETTINGS_MEMO_ = out;
  try { cache.put('settings_v2', JSON.stringify(out), 300); } catch (e) { /* fine without the cache */ }
  return out;
}

// One-time change: the payment (30 days) and same-day cancellation (50%) terms are taken off the
// client proposal. Only those two exact lines are removed; any other edits to the terms stay.
var DROPPED_TERMS = ['Payment is due within 30 days from receipt of the billing statement.',
                     'Cancellation on the day of dispatch is charged 50% of the trip rate.'];
function dropOldTerms_(sh, values, found) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('TERMS_DROP_3_5_V1')) return;
  props.setProperty('TERMS_DROP_3_5_V1', '1');
  if (!Object.prototype.hasOwnProperty.call(found, 'terms')) return;
  var lines = String(found.terms).split('\n');
  var kept = lines.filter(function (t) { return DROPPED_TERMS.indexOf(t.trim()) < 0; });
  if (kept.length === lines.length) return;
  found.terms = kept.join('\n');
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === 'terms') { sh.getRange(i + 2, 2).setValue(found.terms); break; }
  }
}

function settingNum_(key, fallback) {
  var n = Number(String(settings_()[key] || '').replace(/[^0-9.\-]/g, ''));
  return isFinite(n) && String(settings_()[key]).trim() !== '' ? n : fallback;
}
function vatRate_() { return settingNum_('vat_rate', 12) / 100; }
function rateCard_() {
  return {
    baseRate: settingNum_('standard_base_rate', 18000),
    coveredKm: settingNum_('covered_km', 15),
    fuelBenchmark: settingNum_('fuel_benchmark', 60),
    distanceMultiplier: settingNum_('distance_multiplier', 2)
  };
}
function signatory_() {
  var s = settings_();
  return { name: String(s.signatory_name || ''), title: String(s.signatory_title || ''), company: String(s.company_name || '') };
}
function termsList_() {
  return String(settings_().terms || '').split('\n').map(function (t) { return t.trim(); }).filter(Boolean);
}

// Called by the app's Settings tab: every setting with its label, type and notes.
function getSettings() {
  var s = settings_();
  return {
    items: SETTING_DEFS.map(function (d) { return { key: d[0], label: d[1], type: d[3], notes: d[4], value: s[d[0]] }; }),
    url: 'https://docs.google.com/spreadsheets/d/' + DRIVER_MATRIX_ID + '/edit#gid=' + getSettingsSheet_().getSheetId(),
    user: Session.getActiveUser().getEmail()
  };
}

// values: { key: value }. Numbers are checked; everything else is saved as typed.
function saveSettings(values) {
  values = values || {};
  var sh = getSettingsSheet_();
  settings_();   // makes sure every row exists
  var rows = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getDisplayValues();
  SETTING_DEFS.forEach(function (d) {
    if (!Object.prototype.hasOwnProperty.call(values, d[0])) return;
    var v = String(values[d[0]] === null || values[d[0]] === undefined ? '' : values[d[0]]);
    if (d[3] === 'number') {
      var n = Number(v.replace(/[^0-9.\-]/g, ''));
      if (v.trim() === '' || !isFinite(n)) throw new Error(d[1] + ' must be a number.');
      if (n < 0) throw new Error(d[1] + ' cannot be negative.');
      v = String(n);
    } else if (d[3] === 'textarea') {
      v = v.replace(/\r/g, '').trim().slice(0, 4000);
    } else {
      v = v.replace(/\s+/g, ' ').trim().slice(0, 200);
    }
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === d[0]) { sh.getRange(i + 2, 2).setValue(v); break; }
    }
  });
  SETTINGS_MEMO_ = null;
  try { CacheService.getScriptCache().remove('settings_v2'); } catch (e) { /* fine */ }
  return getSettings();
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('2C Calculator · 2C Trucking')
    .setFaviconUrl(FAVICON_URL)
    // Lets the GitHub Pages app (manuobueniii.github.io/2CRateCalculator) show the calculator inside its own window
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Pulls another HTML file (e.g. Logo.html) into Index.html
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function calculateRateFromWeb(data) {
  var source = ORIGIN;
  var dest = data.destination;
  var taxType = data.taxType;

  // Diesel price: the weekly price in effect on the proposal date (Diesel price tab)
  var fuel = getFuelPriceFor_(data.proposalDate);
  var fuelPrice = fuel.price;
  var tollFee = Number(data.tollFee) || 0;
  var tollRoute = cleanTollRoute_(data.tollRoute);
  var tollDirection = ['metro', 'north', 'south'].indexOf(data.tollDirection) >= 0 ? data.tollDirection : '';
  var additionalExpenses = Number(data.additionalExpenses) || 0;
  var adminPct = Number(data.adminPct) / 100 || 0;
  var netIncomePct = Number(data.incomePct) / 100 || 0;
  var distanceOverride = Number(data.distanceOverride) || 0;

  if (!dest) throw new Error("Destination is required.");

  // Distance (one way): manual override wins, otherwise Google Maps
  var distanceSource = distanceOverride > 0 ? 'Manual' : 'Google Maps';
  var corridor = PASIG_CORRIDORS[data.metroCorridor] || data.metroCorridor === 'auto' ? data.metroCorridor : '';
  var via = corridor && corridor !== 'auto' ? PASIG_CORRIDORS[corridor].via
          : (tollDirection === 'south' ? SOUTHBOUND_VIA : (tollDirection === 'north' ? NORTHBOUND_VIA : []));
  var findRoute = function (target) {
    if (corridor !== 'auto') {
      var one = getTruckRoute_(source, target, via, tollDirection);
      if (one) one.target = target;
      if (one && corridor) one.corridor = corridor;
      return one;
    }
    // Pasig area, no corridor picked: try both, prefer a route off EDSA, then the shorter one
    var best = null;
    PASIG_AUTO_CORRIDORS.forEach(function (k) {
      var r = getTruckRoute_(source, target, PASIG_CORRIDORS[k].via, 'metro');
      if (!r) return;
      r.corridor = k;
      r.target = target;
      var rBad = r.truckCheck === 'edsa', bestBad = best && best.truckCheck === 'edsa';
      if (!best || (bestBad && !rBad) || (rBad === bestBad && r.km < best.km)) best = r;
    });
    return best;
  };
  var route = null;   // the Google Maps route (checked for EDSA), also drawn on the internal cost sheet
  if (!(distanceOverride > 0)) {
    route = findRoute(dest);
    if (!route && data.destinationArea && data.destinationArea !== dest) {
      route = findRoute(data.destinationArea);   // lot/landmark not found: use the city
    }
  }
  var distanceKm = distanceOverride > 0 ? distanceOverride : (route ? route.km : 0);
  var routeVia = !route ? '' : (route.corridor ? PASIG_CORRIDORS[route.corridor].label
          : (tollDirection === 'south' ? SOUTHBOUND_VIA_LABEL : (tollDirection === 'north' ? NORTHBOUND_VIA_LABEL : '')));
  var routeMap = route ? { polyline: route.polyline, detail: route.detail, start: route.start, end: route.end } : null;
  if (distanceKm === 0) throw new Error("Route not found on Google Maps. Try a more specific address or enter the distance manually.");
  var podKm = Math.round(distanceKm); // whole km for the rate card, masterlist and driver matrix

  // Masterlist bracket: variable rate, fuel efficiency
  var ml = getMasterlistBracket_(podKm);
  var bracket = ml.bracket;

  // Driver rate: always from the Driver Rate Matrix sheet, by one-way distance
  var driverMatch = getDriverRateFromMatrix_(Math.max(1, podKm));
  var driverSalary = driverMatch.rate;

  // ---- Internal trip cost (round trip, bracket fuel efficiency, maintenance from Settings) ----
  var roundTripKm = distanceKm * 2;
  var fuelConsumption = roundTripKm / bracket.kmPerLiter;
  var totalFuelCost = fuelConsumption * fuelPrice;
  // Maintenance: fixed amount per trip + a rate per round-trip km (both in Settings)
  var maintFixed = settingNum_('maint_fixed', 750);
  var maintPerKm = settingNum_('maint_per_km', 10);
  var maintCost = maintFixed + roundTripKm * maintPerKm;
  var totalExpenses = totalFuelCost + maintCost + driverSalary + tollFee + additionalExpenses;

  // ---- Billed rate: rate card ----
  var brokerRate = brokerBaseRate_(data.brokerId);
  var rateCard = computeTrailerRateCard_(podKm, fuelPrice, ml, brokerRate);
  var cardRate = rateCard.total;   // rate card total before any discount

  // Rate that would hit the Admin + Net Income targets exactly
  var expensePct = 1.0 - (adminPct + netIncomePct);
  var targetRate = expensePct > 0 ? totalExpenses / expensePct : 0;

  // Target net income: the billed rate always lands on the target net income %.
  // Rate card above the target → the difference is a discount to the client.
  // Rate card below the target → the shortfall is added to the rate (an adjustment).
  var discount = 0, adjustment = 0;
  if (targetRate > 0 && cardRate > targetRate) discount = Math.round((cardRate - targetRate) * 100) / 100;
  if (targetRate > 0 && cardRate < targetRate) adjustment = Math.round((targetRate - cardRate) * 100) / 100;
  var grossRate = cardRate - discount + adjustment;
  var adminCost = grossRate * adminPct;
  var grossProfit = grossRate - totalExpenses;
  var netIncome = grossProfit - adminCost;

  // VAT (rate from Settings) on top of the gross rate
  var taxAmount = 0;
  var finalRate = grossRate;
  if (taxType === "VAT") {
    taxAmount = grossRate * vatRate_();
    finalRate = grossRate + taxAmount;
  }

  // Snapshot of the Settings that print on this proposal, so a saved proposal keeps them as they were
  var validityDays = settingNum_('validity_days', 15);
  var pd = parseDateKey_(data.proposalDate) || new Date();
  var validUntil = new Date(pd.getFullYear(), pd.getMonth(), pd.getDate() + validityDays);
  var revisionOf = /^2C-\d{6}-\d{6}(-R\d+)?$/.test(String(data.revisionOf || '')) ? String(data.revisionOf) : '';

  return {
    truckType: TRUCK_TYPE,
    pricingModel: 'Rate Card',
    preparedBy: Session.getActiveUser().getEmail(),
    validityDays: validityDays,
    validUntil: dateKey_(validUntil),
    terms: termsList_(),
    signatory: signatory_(),
    vatRate: vatRate_(),
    revisionOf: revisionOf,
    status: 'Draft',
    source: ORIGIN_LABEL,
    distance: distanceKm,
    podKm: podKm,
    roundTripKm: roundTripKm,
    distanceSource: distanceSource,
    routeVia: routeVia,
    metroCorridor: route && route.corridor ? route.corridor : '',
    routeMap: routeMap,                      // saved with the proposal, small
    truckCheck: route ? route.truckCheck : '', // clear | alternative | detour | edsa
    truckDetour: route ? (route.detour || '') : '',
    routeStats: route ? { driveMin: route.driveMin, expresswayKm: route.expresswayKm } : null,   // Google's figures
    trailerAvgKph: TRAILER_AVG_KPH,
    routeAnalysis: route ? analyzeRoute_(route, source, data.proposalDate) : null,   // terrain, traffic, advisories
    mapImage: routeMapImage_(routeMap),      // the picture itself; not saved in the sheet
    mapImageWide: routeMapImage_(routeMap, 640, 170),   // shorter strip for the client proposal (keeps it on one A4 page)
    kmPerLiter: bracket.kmPerLiter,
    fuelConsumption: fuelConsumption,
    fuelPrice: fuelPrice,
    fuelPriceDate: fuel.date,
    fuelCost: totalFuelCost,
    maintFixed: maintFixed,
    maintPerKm: maintPerKm,
    maintCost: maintCost,
    driverSalary: driverSalary,
    driverBracket: driverMatch.bracket,
    tollFee: tollFee,
    tollRoute: tollRoute,
    tollDirection: tollDirection,
    additionalExpenses: additionalExpenses,
    totalExpenses: totalExpenses,
    adminPct: adminPct,
    targetNetIncomePct: netIncomePct,
    adminCost: adminCost,
    netIncome: netIncome,
    netIncomePctActual: grossRate > 0 ? netIncome / grossRate : 0,
    grossProfit: grossProfit,
    grossProfitPct: grossRate > 0 ? grossProfit / grossRate : 0,
    targetRate: targetRate,
    rateCard: rateCard,
    cardRate: cardRate,
    discount: discount,
    discountPct: cardRate > 0 ? discount / cardRate : 0,
    adjustment: adjustment,
    adjustmentPct: cardRate > 0 ? adjustment / cardRate : 0,
    grossRate: grossRate,
    taxType: taxType,
    taxAmount: taxAmount,
    finalRate: finalRate
  };
}

// ---------- Masterlist (shown in the app's "Masterlist" tab) ----------
// Tab "Masterlist" in the driver matrix spreadsheet:
// A = Min Km, B = Max Km (blank = and above), C = Variable per excess km (PHP),
// D = Fuel efficiency (km/L), E = Maintenance per km (PHP).
// Brackets (A–D) are edited from the app and saved to the sheet. Column E is no longer used.
var MASTERLIST_TAB = 'Masterlist';
// Starting values only, written once when the tab is created. Maintenance per km starts blank.
var MASTERLIST_DEFAULTS = [
  [16, 69, 300, 1.5, ''],
  [70, 199, 250, 2, ''],
  [200, 299, 200, 3, ''],
  [300, 399, 200, 3, ''],
  [400, '', 200, 3, '']
];

// One-time change: "200 km & above" becomes 200–299, 300–399 and 400 & above.
// The two new brackets start with the 200 km bracket's values; edit them in the Masterlist tab.
function splitMasterlist400_(sh) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('ML_SPLIT_400_V1')) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (props.getProperty('ML_SPLIT_400_V1')) return;
    var values = sh.getDataRange().getValues();
    var open200 = -1, beyond = false;
    for (var i = 1; i < values.length; i++) {
      var min = cellNum_(values[i][0]);
      if (min === null) continue;
      if (min === 200 && cellNum_(values[i][1]) === null) open200 = i;
      else if (min > 200) beyond = true;
    }
    if (open200 > 0 && !beyond) {
      var v = values[open200];
      sh.getRange(open200 + 1, 2).setValue(299);
      sh.getRange(sh.getLastRow() + 1, 1, 2, 4).setValues([[300, 399, v[2], v[3]], [400, '', v[2], v[3]]]);
      formatMasterlist_(sh);
    }
    props.setProperty('ML_SPLIT_400_V1', '1');
  } finally { lock.releaseLock(); }
}

function getMasterlistSheet_() {
  var ss = dmSs_();
  var sh = ss.getSheetByName(MASTERLIST_TAB);
  if (!sh) sh = ss.insertSheet(MASTERLIST_TAB);
  if (sh.getLastRow() < 2) {
    var rows = [['Min Km (one way)', 'Max Km (blank = and above)', 'Variable per Excess Km (PHP)',
                 'Fuel Efficiency (km/L)', 'Maintenance per Km (PHP)']].concat(MASTERLIST_DEFAULTS);
    sh.getRange(1, 1, rows.length, 5).setValues(rows);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold');
    sh.setFrozenRows(1);
    formatMasterlist_(sh);
  }
  splitMasterlist400_(sh);
  return sh;
}

function formatMasterlist_(sh) {
  var n = Math.max(1, sh.getLastRow() - 1);
  sh.getRange(2, 3, n, 1).setNumberFormat('#,##0.00');
  sh.getRange(2, 4, n, 1).setNumberFormat('0.00');
  sh.getRange(2, 5, n, 1).setNumberFormat('#,##0.00');
}

function cellNum_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

// All brackets, lowest Min Km first
function readMasterlist_() {
  var values = getMasterlistSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var min = cellNum_(values[i][0]);
    if (min === null) continue;
    var max = cellNum_(values[i][1]);
    out.push({
      row: i + 1,
      minKm: min,
      maxKm: max,
      label: max ? min + ' – ' + max + ' km' : min + ' km & above',
      variablePerKm: cellNum_(values[i][2]),
      kmPerLiter: cellNum_(values[i][3]),
      maintPerKm: cellNum_(values[i][4])
    });
  }
  out.sort(function (a, b) { return a.minKm - b.minKm; });
  return out;
}

// Highest bracket whose Min Km the trip reaches. Trips below the first bracket
// (within the covered km) use the first bracket's fuel efficiency.
function getMasterlistBracket_(km) {
  var rows = readMasterlist_();
  if (!rows.length) throw new Error('The Masterlist has no km brackets. Add them in the Masterlist sheet, then try again.');
  var b = rows[0];
  for (var i = 0; i < rows.length; i++) {
    if (km >= rows[i].minKm) b = rows[i];
  }
  var missing = [];
  if (b.variablePerKm === null) missing.push('variable rate');
  if (!(b.kmPerLiter > 0)) missing.push('fuel efficiency');
  if (missing.length) {
    throw new Error('The ' + b.label + ' bracket in the Masterlist has no ' + missing.join(' or ')
      + ' set. Fill it in the Masterlist tab, then try again.');
  }
  return { bracket: b, rows: rows };
}

// Called by the app's Masterlist tab.
function getMasterlist() {
  return {
    rows: readMasterlist_(),
    coveredKm: rateCard_().coveredKm,
    url: 'https://docs.google.com/spreadsheets/d/' + DRIVER_MATRIX_ID + '/edit#gid=' + getMasterlistSheet_().getSheetId()
  };
}

function masterCell_(v, name) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(v);
  if (isNaN(n) || n < 0) throw new Error(name + ' must be a number of 0 or more.');
  return n;
}

// rows: [{ minKm: 16, maxKm: 69, variablePerKm: 300, kmPerLiter: 1.5 }, ...] — the whole list, any order.
// Max Km blank = "and above" (last bracket only). Brackets must follow on with no gaps or overlaps.
// Everything is checked before anything is written; then the sheet's bracket rows are replaced.
function saveMasterlist(rows) {
  var list = (rows || []).map(function (r) {
    var min = Number(r.minKm);
    var max = r.maxKm === '' || r.maxKm === null || r.maxKm === undefined ? null : Number(r.maxKm);
    if (!(min >= 1) || Math.floor(min) !== min) throw new Error('Each bracket needs a whole-number Min km of 1 or more.');
    if (max !== null && (!(max >= min) || Math.floor(max) !== max)) throw new Error('Max km must be a whole number, at least the Min km (bracket from ' + min + ' km).');
    var b = { minKm: min, maxKm: max,
              variablePerKm: masterCell_(r.variablePerKm, 'Variable rate'),
              kmPerLiter: masterCell_(r.kmPerLiter, 'Fuel efficiency') };
    if (b.kmPerLiter === 0) throw new Error('Fuel efficiency must be greater than 0.');
    return b;
  });
  if (!list.length) throw new Error('Keep at least one bracket.');
  list.sort(function (a, b) { return a.minKm - b.minKm; });
  for (var i = 0; i < list.length; i++) {
    var b = list[i], next = list[i + 1];
    if (!next) break;
    if (b.maxKm === null) throw new Error('Only the last bracket can be "and above". Set a Max km for the ' + b.minKm + ' km bracket.');
    if (next.minKm !== b.maxKm + 1) {
      throw new Error('Brackets must follow on: after ' + b.minKm + '–' + b.maxKm + ' km the next should start at ' + (b.maxKm + 1) + ' km, not ' + next.minKm + ' km.');
    }
  }
  var sh = getMasterlistSheet_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var last = sh.getLastRow();
    if (last >= 2) sh.getRange(2, 1, last - 1, 5).clearContent();
    sh.getRange(2, 1, list.length, 5).setValues(list.map(function (b) {
      return [b.minKm, b.maxKm === null ? '' : b.maxKm, b.variablePerKm, b.kmPerLiter, ''];
    }));
    formatMasterlist_(sh);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return getMasterlist();
}

// ---------- Driver Rate Matrix (shown in the app's "Driver rate matrix" tab) ----------
var DRIVER_MATRIX_TAB = 'Driver Rate Matrix';
// [min km, max km, default driver rate per trip]
// 1–15 km = ₱1,300; 16–50 km = ₱2,000; then +₱1,250 per bracket, up to 600 km.
// These are starting values only: edit them in the app's Driver rate matrix tab or in the sheet.
var DRIVER_MATRIX_BRACKETS = [
  [1, 15, 1300], [16, 50, 2000], [51, 100, 3250], [101, 150, 4500], [151, 200, 5750],
  [201, 250, 7000], [251, 300, 8250], [301, 350, 9500], [351, 400, 10750],
  [401, 450, 12000], [451, 500, 13250], [501, 550, 14500], [551, 600, 15750]
];

// Finds the matrix tab (renaming the first tab if needed).
// Seeds the brackets if the tab is empty, and fills the default rates only while
// the whole rate column is blank, so rates saved later are never overwritten.
// Brackets beyond the sheet's farthest distance (e.g. 501–600 km) are added at the end.
function getMatrixSheet_() {
  var ss = dmSs_();
  var sh = ss.getSheetByName(DRIVER_MATRIX_TAB);
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName(DRIVER_MATRIX_TAB);
  }
  if (sh.getLastRow() < 2) {
    var rows = [['Min Km', 'Max Km', 'Bracket (One Way)', 'Driver Rate (PHP)']];
    DRIVER_MATRIX_BRACKETS.forEach(function (b) { rows.push([b[0], b[1], b[0] + ' - ' + b[1] + ' km', b[2]]); });
    sh.getRange(1, 1, rows.length, 4).setValues(rows);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
    sh.getRange(2, 4, rows.length - 1, 1).setNumberFormat('#,##0.00');
    sh.setFrozenRows(1);
    return sh;
  }

  var values = sh.getDataRange().getValues();

  // Add default brackets that start past the farthest bracket already in the sheet
  // (only until the brackets have been edited from the app; after that the app's list is the whole list)
  var farthest = 0;
  if (PropertiesService.getScriptProperties().getProperty('DM_BRACKETS_EDITED')) farthest = Infinity;
  for (var m = 1; m < values.length; m++) farthest = Math.max(farthest, Number(values[m][1]) || 0);
  var extra = DRIVER_MATRIX_BRACKETS.filter(function (b) { return b[0] > farthest; });
  if (farthest > 0 && extra.length) {
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, extra.length, 4).setValues(extra.map(function (b) {
      return [b[0], b[1], b[0] + ' - ' + b[1] + ' km', b[2]];
    }));
    sh.getRange(start, 4, extra.length, 1).setNumberFormat('#,##0.00');
    values = sh.getDataRange().getValues();
  }

  var allBlank = true;
  for (var i = 1; i < values.length; i++) {
    if (values[i][3] !== '' && values[i][3] !== null) { allBlank = false; break; }
  }
  if (allBlank) {
    for (var r = 1; r < values.length; r++) {
      var min = Number(values[r][0]), max = Number(values[r][1]);
      for (var k = 0; k < DRIVER_MATRIX_BRACKETS.length; k++) {
        if (DRIVER_MATRIX_BRACKETS[k][0] === min && DRIVER_MATRIX_BRACKETS[k][1] === max) {
          sh.getRange(r + 1, 4).setValue(DRIVER_MATRIX_BRACKETS[k][2]);
        }
      }
    }
    sh.getRange(2, 4, values.length - 1, 1).setNumberFormat('#,##0.00');
  }
  return sh;
}

// Called by the app's Driver rate matrix tab.
function getDriverMatrix() {
  var values = getMatrixSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var min = cellNum_(values[i][0]);
    var max = cellNum_(values[i][1]);
    if (min === null) continue;
    var rate = values[i][3];
    out.push({
      row: i + 1,
      min: min,
      max: max,
      label: matrixLabel_(min, max),
      rate: (rate === '' || rate === null) ? null : Number(rate)
    });
  }
  out.sort(function (a, b) { return a.min - b.min; });
  return { rows: out, url: 'https://docs.google.com/spreadsheets/d/' + DRIVER_MATRIX_ID + '/edit' };
}
function matrixLabel_(min, max) { return max === null ? min + ' km & above' : min + ' – ' + max + ' km'; }

// rows: [{ minKm, maxKm, rate }, ...] — the whole list, any order. Max km blank = "and above" (last bracket only).
// Brackets must follow on with no gaps or overlaps. Blank rate clears the cell.
// Everything is checked before anything is written; then the sheet's bracket rows are replaced.
function saveDriverMatrix(rows) {
  var list = (rows || []).map(function (r) {
    var min = Number(r.minKm);
    var max = r.maxKm === '' || r.maxKm === null || r.maxKm === undefined ? null : Number(r.maxKm);
    if (!(min >= 1) || Math.floor(min) !== min) throw new Error('Each bracket needs a whole-number Min km of 1 or more.');
    if (max !== null && (!(max >= min) || Math.floor(max) !== max)) throw new Error('Max km must be a whole number, at least the Min km (bracket from ' + min + ' km).');
    var rate = (r.rate === '' || r.rate === null || r.rate === undefined) ? '' : Number(r.rate);
    if (rate !== '' && (isNaN(rate) || rate < 0)) throw new Error('Driver rates must be numbers of 0 or more.');
    return { min: min, max: max, rate: rate };
  });
  if (!list.length) throw new Error('Keep at least one bracket.');
  list.sort(function (a, b) { return a.min - b.min; });
  for (var i = 0; i < list.length - 1; i++) {
    var b = list[i], next = list[i + 1];
    if (b.max === null) throw new Error('Only the last bracket can be "and above". Set a Max km for the ' + b.min + ' km bracket.');
    if (next.min !== b.max + 1) {
      throw new Error('Brackets must follow on: after ' + b.min + '–' + b.max + ' km the next should start at ' + (b.max + 1) + ' km, not ' + next.min + ' km.');
    }
  }
  var sh = getMatrixSheet_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var last = sh.getLastRow();
    if (last >= 2) sh.getRange(2, 1, last - 1, 4).clearContent();
    sh.getRange(2, 1, list.length, 4).setValues(list.map(function (b) {
      return [b.min, b.max === null ? '' : b.max, matrixLabel_(b.min, b.max), b.rate];
    }));
    sh.getRange(2, 4, list.length, 1).setNumberFormat('#,##0.00');
    PropertiesService.getScriptProperties().setProperty('DM_BRACKETS_EDITED', '1');
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return getDriverMatrix();
}

// ---------- Tolls, Class 3 (shown in the Trip costs section of the calculator) ----------
// Stored in the driver matrix spreadsheet, tab "Toll Rates (Class 3)":
// A = Expressway, B = Direction (Northbound / Southbound from Manila), C = Entry, D = Exit, E = Toll (PHP).
// One row covers both directions unless the reverse trip has its own row.
// Seeded from the TRB Class 3 matrices (via expressway.ph, February 2026, VAT included). Edit rates in the sheet.
var TOLL_TAB = 'Toll Rates (Class 3)';

// n = expressway, d = direction from Manila, o = plazas in order going away from Manila,
// p = [entry index, exit index, Class 3 toll]
var TOLL_SEED = [
  {"n":"NLEX Harbor Link","d":"north","o":["R-10/Port of Manila","Harbor Link Interchange","Malabon/Dagat-Dagatan","C-3 Road/5th Ave.","Karuhatan/Valenzuela"],"p":[[4,3,238],[4,0,238],[4,2,238],[3,1,238],[0,1,238]]},
  {"n":"NLEX/SCTEX","d":"north","o":["Balintawak","Mindanao Ave.","Karuhatan","Valenzuela","Meycauayan","Marilao","Ciudad de Victoria","Bocaue","Tambubong","Balagtas","Tabang","Sta. Rita","Pulilan","San Simon","San Fernando","Mexico","Angeles","Dau","Sta. Ines","Mabalacat (Mabiga)","Clark South","Porac","Floridablanca","Dinalupihan","Tipo/Subic","Clark North","Dolores","Bamban/New Clark City","Concepcion","Hacienda Luisita","Tarlac"],"p":[[0,1,254],[2,1,254],[3,1,254],[4,1,254],[5,1,254],[6,1,288],[7,1,315],[8,1,330],[9,1,408],[11,1,493],[12,1,605],[13,1,797],[14,1,943],[15,1,1059],[16,1,1198],[17,1,1232],[24,1,2569],[23,1,2193],[22,1,1824],[21,1,1555],[20,1,1352],[19,1,1319],[25,1,1400],[26,1,1430],[27,1,1561],[28,1,1635],[29,1,1912],[10,1,471],[18,1,1319],[0,2,254],[3,2,254],[4,2,254],[5,2,254],[6,2,288],[7,2,315],[8,2,330],[9,2,408],[11,2,493],[12,2,605],[13,2,797],[14,2,943],[15,2,1059],[16,2,1198],[17,2,1232],[24,2,2569],[23,2,2193],[22,2,1824],[21,2,1555],[20,2,1352],[19,2,1319],[25,2,1400],[26,2,1430],[27,2,1561],[28,2,1635],[29,2,1912],[10,2,471],[18,2,1319],[0,3,254],[4,3,254],[5,3,254],[6,3,288],[7,3,315],[8,3,330],[9,3,408],[11,3,493],[12,3,605],[13,3,797],[14,3,943],[15,3,1059],[16,3,1198],[17,3,1232],[24,3,2569],[23,3,2193],[22,3,1824],[21,3,1555],[20,3,1352],[19,3,1319],[25,3,1400],[26,3,1430],[27,3,1561],[28,3,1635],[29,3,1912],[10,3,471],[18,3,1319],[0,4,254],[5,4,254],[6,4,288],[7,4,315],[8,4,330],[9,4,408],[11,4,493],[12,4,605],[13,4,797],[14,4,943],[15,4,1059],[16,4,1198],[17,4,1232],[24,4,2569],[23,4,2193],[22,4,1824],[21,4,1555],[20,4,1352],[19,4,1319],[25,4,1400],[26,4,1430],[27,4,1561],[28,4,1635],[29,4,1912],[10,4,471],[18,4,1319],[0,5,254],[6,5,288],[7,5,315],[8,5,330],[9,5,408],[11,5,493],[12,5,605],[13,5,797],[14,5,943],[15,5,1059],[16,5,1198],[17,5,1232],[24,5,2569],[23,5,2193],[22,5,1824],[21,5,1555],[20,5,1352],[19,5,1319],[25,5,1400],[26,5,1430],[27,5,1561],[28,5,1635],[29,5,1912],[10,5,471],[18,5,1319],[0,6,288],[7,6,28],[8,6,43],[9,6,120],[11,6,205],[12,6,317],[13,6,509],[14,6,655],[15,6,771],[16,6,910],[17,6,944],[24,6,2281],[23,6,1905],[22,6,1536],[21,6,1267],[20,6,1064],[19,6,1031],[25,6,1112],[26,6,1142],[27,6,1273],[28,6,1347],[29,6,1624],[10,6,183],[18,6,1031],[0,7,315],[8,7,15],[9,7,93],[11,7,177],[12,7,290],[13,7,481],[14,7,627],[15,7,744],[16,7,882],[17,7,916],[24,7,2253],[23,7,1877],[22,7,1508],[21,7,1239],[20,7,1036],[19,7,1003],[25,7,1084],[26,7,1114],[27,7,1245],[28,7,1319],[29,7,1596],[10,7,155],[18,7,1003],[0,8,330],[9,8,78],[11,8,162],[12,8,275],[13,8,466],[14,8,613],[15,8,729],[16,8,868],[17,8,901],[24,8,2238],[23,8,1862],[22,8,1493],[21,8,1224],[20,8,1021],[19,8,988],[25,8,1069],[26,8,1099],[27,8,1230],[28,8,1304],[29,8,1581],[10,8,140],[18,8,988],[0,9,408],[11,9,85],[12,9,197],[13,9,389],[14,9,535],[15,9,651],[16,9,790],[17,9,824],[24,9,2161],[23,9,1785],[22,9,1416],[21,9,1147],[20,9,944],[19,9,911],[25,9,992],[26,9,1022],[27,9,1153],[28,9,1227],[29,9,1504],[10,9,63],[18,9,911],[0,10,471],[0,11,493],[12,11,112],[13,11,304],[14,11,450],[15,11,566],[16,11,705],[17,11,739],[24,11,2076],[23,11,1700],[22,11,1331],[21,11,1062],[20,11,859],[19,11,826],[25,11,907],[26,11,937],[27,11,1068],[28,11,1142],[29,11,1419],[18,11,826],[0,12,605],[13,12,192],[14,12,338],[15,12,454],[16,12,593],[17,12,626],[24,12,1963],[23,12,1587],[22,12,1218],[21,12,949],[20,12,746],[19,12,713],[25,12,794],[26,12,824],[27,12,955],[28,12,1029],[29,12,1306],[18,12,713],[0,13,797],[14,13,146],[15,13,262],[16,13,401],[17,13,435],[24,13,1772],[23,13,1396],[22,13,1027],[21,13,758],[20,13,555],[19,13,522],[25,13,603],[26,13,633],[27,13,764],[28,13,838],[29,13,1115],[18,13,522],[0,14,943],[15,14,116],[16,14,255],[17,14,289],[24,14,1626],[23,14,1250],[22,14,881],[21,14,612],[20,14,409],[19,14,376],[25,14,457],[26,14,487],[27,14,618],[28,14,692],[29,14,969],[18,14,376],[0,15,1059],[16,15,139],[17,15,172],[24,15,1509],[23,15,1133],[22,15,764],[21,15,495],[20,15,292],[19,15,259],[25,15,340],[26,15,370],[27,15,501],[28,15,575],[29,15,852],[18,15,259],[0,16,1198],[17,16,34],[24,16,1371],[23,16,995],[22,16,626],[21,16,357],[20,16,154],[19,16,121],[25,16,202],[26,16,232],[27,16,363],[28,16,437],[29,16,714],[18,16,121],[0,17,1232],[24,17,1337],[23,17,961],[22,17,592],[21,17,323],[20,17,120],[19,17,87],[25,17,168],[26,17,198],[27,17,329],[28,17,403],[29,17,680],[18,17,87],[0,18,1319],[0,24,2569],[23,24,377],[22,24,745],[21,24,1015],[20,24,1217],[19,24,1250],[25,24,1332],[26,24,1362],[27,24,1493],[28,24,1567],[29,24,1843],[0,23,2193],[22,23,369],[21,23,638],[20,23,841],[19,23,874],[25,23,955],[26,23,985],[27,23,1116],[28,23,1190],[29,23,1467],[0,22,1824],[21,22,269],[20,22,472],[19,22,505],[25,22,587],[26,22,617],[27,22,748],[28,22,821],[29,22,1098],[0,21,1555],[20,21,203],[19,21,236],[25,21,317],[26,21,347],[27,21,478],[28,21,552],[29,21,829],[0,20,1352],[19,20,33],[25,20,114],[26,20,144],[27,20,275],[28,20,349],[29,20,626],[0,19,1319],[25,19,81],[26,19,111],[27,19,242],[28,19,316],[29,19,593],[0,25,1400],[26,25,30],[27,25,161],[28,25,235],[29,25,512],[0,26,1430],[27,26,131],[28,26,205],[29,26,481],[0,27,1561],[28,27,74],[29,27,350],[0,28,1635],[29,28,277],[0,29,1912],[0,30,2008],[1,30,2008],[2,30,2008],[3,30,2008],[4,30,2008],[5,30,2008],[6,30,1720],[7,30,1692],[8,30,1677],[9,30,1600],[11,30,1515],[12,30,1402],[13,30,1211],[14,30,1065],[15,30,948],[16,30,810],[17,30,776],[24,30,1940],[23,30,1563],[22,30,1195],[21,30,925],[20,30,722],[19,30,689],[25,30,608],[26,30,578],[27,30,447],[28,30,373],[29,30,96]]},
  {"n":"NLEX Connector","d":"both","o":["Magsaysay","España","C-3 Road/5th Ave."],"p":[[1,0,418],[1,2,418],[0,2,418]]},
  {"n":"Skyway Stage 3","d":"north","o":["Buendia","Quirino","Plaza Dilao","Nagtahan","E. Rodriguez","Quezon Ave.","Balintawak (Skyway 3)","NLEX-Skyway Exit Ramp"],"p":[[0,1,315],[5,1,792],[6,1,792],[0,3,315],[5,3,792],[6,3,792],[5,4,387],[6,4,387],[0,5,792],[6,5,387],[0,6,792],[0,7,792],[1,7,792],[3,7,792],[4,7,387],[5,7,387]]},
  {"n":"TPLEX","d":"north","o":["La Paz","Victoria","Gerona","Paniqui","Moncada","Carmen","Urdaneta","Binalonan","Pozorrubio","Sison","Rosario/Baguio"],"p":[[0,1,91],[2,1,84],[3,1,146],[4,1,206],[5,1,401],[6,1,557],[7,1,614],[8,1,719],[9,1,781],[0,2,175],[3,2,62],[4,2,122],[5,2,317],[6,2,473],[7,2,530],[8,2,635],[9,2,697],[0,3,237],[4,3,60],[5,3,255],[6,3,411],[7,3,468],[8,3,573],[9,3,635],[0,4,396],[5,4,195],[6,4,351],[7,4,408],[8,4,514],[9,4,575],[0,5,492],[6,5,156],[7,5,213],[8,5,318],[9,5,380],[0,6,648],[7,6,57],[8,6,162],[9,6,224],[0,7,704],[8,7,106],[9,7,167],[0,8,810],[9,8,62],[0,9,871],[0,10,933],[1,10,843],[2,10,759],[3,10,697],[4,10,637],[5,10,442],[6,10,286],[7,10,229],[8,10,124],[9,10,62]]},
  {"n":"SLEX/Skyway/MCX","d":"south","o":["Buendia","Magallanes","Magallanes (Skyway)","Amorsolo","C-5","Merville","Skyway-NAIAX Interchange","Bicutan","Don Bosco","Sucat","Alabang","Filinvest","MCX","Susana Heights","San Pedro","Southwoods","Carmona","Mamplasan","Sta. Rosa","ABI/Greenfield","Cabuyao","Silangan","Calamba"],"p":[[7,0,218],[6,0,0],[9,0,356],[10,0,493],[12,0,626],[13,0,556],[14,0,577],[15,0,630],[16,0,650],[17,0,685],[18,0,717],[19,0,761],[20,0,790],[21,0,809],[22,0,872],[7,3,218],[6,3,0],[9,3,356],[10,3,493],[12,3,626],[13,3,556],[14,3,577],[15,3,630],[16,3,650],[17,3,685],[18,3,717],[19,3,761],[20,3,790],[21,3,809],[22,3,872],[1,5,147],[7,8,218],[6,8,0],[9,8,356],[10,8,493],[12,8,626],[13,8,556],[14,8,577],[15,8,630],[16,8,650],[17,8,685],[18,8,717],[19,8,761],[20,8,790],[21,8,809],[22,8,872],[1,7,147],[4,7,147],[2,7,218],[6,7,218],[9,7,104],[10,7,208],[11,7,225],[12,7,341],[13,7,271],[14,7,292],[15,7,345],[16,7,365],[17,7,400],[18,7,432],[19,7,476],[20,7,505],[21,7,524],[22,7,587],[6,2,0],[9,2,356],[10,2,493],[12,2,626],[13,2,556],[14,2,577],[15,2,630],[16,2,650],[17,2,685],[18,2,717],[19,2,761],[20,2,790],[21,2,809],[22,2,872],[1,9,252],[4,9,252],[6,9,356],[10,9,104],[11,9,121],[12,9,237],[13,9,167],[14,9,188],[15,9,241],[16,9,261],[17,9,296],[18,9,328],[19,9,372],[20,9,401],[21,9,420],[22,9,483],[1,10,356],[4,10,356],[6,10,493],[11,10,17],[12,10,133],[13,10,63],[14,10,84],[15,10,137],[16,10,157],[17,10,192],[18,10,224],[19,10,268],[20,10,297],[21,10,316],[22,10,379],[1,11,373],[4,11,373],[12,11,116],[13,11,46],[14,11,68],[15,11,120],[16,11,141],[17,11,176],[18,11,207],[19,11,252],[20,11,280],[21,11,300],[22,11,362],[1,12,489],[4,12,489],[6,12,626],[13,12,70],[14,12,91],[15,12,144],[16,12,164],[17,12,199],[18,12,231],[19,12,275],[20,12,304],[21,12,323],[22,12,386],[1,13,419],[4,13,419],[6,13,556],[14,13,21],[15,13,74],[16,13,94],[17,13,129],[18,13,161],[19,13,205],[20,13,234],[21,13,253],[22,13,316],[1,14,440],[4,14,440],[6,14,577],[15,14,52],[16,14,73],[17,14,108],[18,14,139],[19,14,184],[20,14,212],[21,14,232],[22,14,295],[1,15,493],[4,15,493],[6,15,630],[16,15,21],[17,15,56],[18,15,87],[19,15,132],[20,15,160],[21,15,180],[22,15,242],[1,16,513],[4,16,513],[6,16,650],[17,16,35],[18,16,66],[19,16,111],[20,16,139],[21,16,159],[22,16,222],[1,17,548],[4,17,548],[6,17,685],[18,17,31],[19,17,76],[20,17,104],[21,17,124],[22,17,187],[1,18,580],[4,18,580],[6,18,717],[19,18,45],[20,18,73],[21,18,93],[22,18,155],[1,19,624],[4,19,624],[6,19,761],[20,19,28],[21,19,48],[22,19,111],[1,20,653],[4,20,653],[6,20,790],[21,20,20],[22,20,82],[1,21,672],[4,21,672],[6,21,809],[22,21,63],[1,22,735],[4,22,735],[6,22,872]]},
  {"n":"STAR Tollway","d":"south","o":["Calamba","Sto. Tomas","Tanauan","Malvar","Sto. Toribio","Lipa","Ibaan","Batangas"],"p":[[0,1,102],[2,1,40],[3,1,87],[4,1,145],[5,1,179],[6,1,270],[0,2,131],[3,2,47],[4,2,105],[5,2,139],[6,2,230],[0,3,174],[4,3,59],[5,3,92],[6,3,183],[0,4,228],[5,4,34],[6,4,125],[0,5,259],[6,5,92],[0,6,343],[0,7,405],[1,7,337],[2,7,297],[3,7,251],[4,7,193],[5,7,159],[6,7,67]]},
  {"n":"CALAX","d":"south","o":["Greenfield/Mamplasan","Technopark","Laguna Blvd.","Sta. Rosa/Tagaytay","Silang East","Silang Interchange"],"p":[[2,1,45],[3,1,89],[4,1,146],[0,2,91],[3,2,43],[4,2,100],[0,3,134],[4,3,83],[0,4,192],[0,5,244],[1,5,199],[2,5,153],[3,5,136],[4,5,52]]},
  {"n":"CAVITEX","d":"south","o":["Parañaque (Roxas Blvd.)","C5 Rd. Ext./C.P. Garcia","Sucat Rd./Dr. A. Santos Ave.","Bacoor/Zapote","Kawit"],"p":[[0,3,117],[4,3,264],[2,3,114],[0,4,381],[2,4,378],[0,1,114],[3,1,114],[4,1,378]]},
  {"n":"NAIAX","d":"south","o":["Skyway-NAIAX Interchange","Andrews Ave./Terminal 3","Aurora Blvd. (Tramo)","NAIA Terminal 3","NAIA Terminal 1","NAIA Terminal 2","Entertainment City","Macapagal Blvd.","CAVITEX"],"p":[[0,1,0],[4,1,134],[5,1,134],[6,1,134],[7,1,134],[8,1,134],[0,4,134],[2,4,134],[6,4,104],[7,4,104],[8,4,104],[0,5,134],[2,5,134],[6,5,104],[7,5,104],[8,5,104],[0,6,134],[2,6,134],[0,7,134],[2,7,134],[0,8,134],[2,8,134],[4,3,134],[5,3,134],[6,3,134],[7,3,134],[8,3,134]]}
];

// Exits used to suggest toll routes from the destination: [expressway, exit, lat, lng, note].
// A few extra points stand for routes that leave the expressway for a long highway run.
var TOLL_EXITS = [
  ['NLEX/SCTEX', 'Valenzuela', 14.705, 120.976], ['NLEX/SCTEX', 'Meycauayan', 14.736, 120.965],
  ['NLEX/SCTEX', 'Marilao', 14.758, 120.951], ['NLEX/SCTEX', 'Ciudad de Victoria', 14.789, 120.940],
  ['NLEX/SCTEX', 'Bocaue', 14.798, 120.933], ['NLEX/SCTEX', 'Tambubong', 14.812, 120.926],
  ['NLEX/SCTEX', 'Balagtas', 14.822, 120.905], ['NLEX/SCTEX', 'Tabang', 14.840, 120.870],
  ['NLEX/SCTEX', 'Sta. Rita', 14.860, 120.853], ['NLEX/SCTEX', 'Pulilan', 14.905, 120.840],
  ['NLEX/SCTEX', 'San Simon', 14.995, 120.777], ['NLEX/SCTEX', 'San Fernando', 15.035, 120.690],
  ['NLEX/SCTEX', 'Mexico', 15.070, 120.700], ['NLEX/SCTEX', 'Angeles', 15.143, 120.593],
  ['NLEX/SCTEX', 'Dau', 15.178, 120.592], ['NLEX/SCTEX', 'Sta. Ines', 15.210, 120.598],
  ['NLEX/SCTEX', 'Mabalacat (Mabiga)', 15.205, 120.570], ['NLEX/SCTEX', 'Clark South', 15.160, 120.540],
  ['NLEX/SCTEX', 'Porac', 15.073, 120.530], ['NLEX/SCTEX', 'Floridablanca', 14.975, 120.490],
  ['NLEX/SCTEX', 'Dinalupihan', 14.876, 120.460], ['NLEX/SCTEX', 'Tipo/Subic', 14.835, 120.320],
  ['NLEX/SCTEX', 'Clark North', 15.235, 120.560], ['NLEX/SCTEX', 'Dolores', 15.268, 120.565],
  ['NLEX/SCTEX', 'Bamban/New Clark City', 15.300, 120.560], ['NLEX/SCTEX', 'Concepcion', 15.330, 120.600],
  ['NLEX/SCTEX', 'Hacienda Luisita', 15.440, 120.615], ['NLEX/SCTEX', 'Tarlac', 15.480, 120.600],
  ['NLEX/SCTEX', 'Tarlac', 15.490, 120.970, 'then CLLEX (toll-free) to Cabanatuan'],
  ['NLEX/SCTEX', 'Tarlac', 15.790, 120.990, 'then CLLEX (toll-free) and Maharlika Hwy north'],
  ['TPLEX', 'Victoria', 15.578, 120.680], ['TPLEX', 'Gerona', 15.607, 120.600],
  ['TPLEX', 'Paniqui', 15.668, 120.580], ['TPLEX', 'Moncada', 15.733, 120.573],
  ['TPLEX', 'Carmen', 15.880, 120.605], ['TPLEX', 'Urdaneta', 15.976, 120.571],
  ['TPLEX', 'Binalonan', 16.050, 120.594], ['TPLEX', 'Pozorrubio', 16.111, 120.545],
  ['TPLEX', 'Sison', 16.170, 120.515], ['TPLEX', 'Rosario/Baguio', 16.230, 120.487],
  ['SLEX/Skyway/MCX', 'Bicutan', 14.488, 121.045], ['SLEX/Skyway/MCX', 'Sucat', 14.463, 121.046],
  ['SLEX/Skyway/MCX', 'Alabang', 14.420, 121.045], ['SLEX/Skyway/MCX', 'Filinvest', 14.412, 121.042],
  ['SLEX/Skyway/MCX', 'MCX', 14.395, 121.045], ['SLEX/Skyway/MCX', 'Susana Heights', 14.375, 121.050],
  ['SLEX/Skyway/MCX', 'San Pedro', 14.358, 121.058], ['SLEX/Skyway/MCX', 'Southwoods', 14.330, 121.066],
  ['SLEX/Skyway/MCX', 'Carmona', 14.310, 121.070], ['SLEX/Skyway/MCX', 'Mamplasan', 14.290, 121.077],
  ['SLEX/Skyway/MCX', 'Sta. Rosa', 14.268, 121.093], ['SLEX/Skyway/MCX', 'ABI/Greenfield', 14.252, 121.112],
  ['SLEX/Skyway/MCX', 'Cabuyao', 14.240, 121.130], ['SLEX/Skyway/MCX', 'Silangan', 14.225, 121.150],
  ['SLEX/Skyway/MCX', 'Calamba', 14.205, 121.160],
  ['STAR Tollway', 'Sto. Tomas', 14.110, 121.145], ['STAR Tollway', 'Tanauan', 14.085, 121.130],
  ['STAR Tollway', 'Malvar', 14.045, 121.160], ['STAR Tollway', 'Sto. Toribio', 13.990, 121.145],
  ['STAR Tollway', 'Lipa', 13.945, 121.150], ['STAR Tollway', 'Ibaan', 13.830, 121.135],
  ['STAR Tollway', 'Batangas', 13.770, 121.065],
  ['STAR Tollway', 'Sto. Tomas', 13.940, 121.620, 'then Maharlika Hwy to Quezon and Bicol'],
  ['STAR Tollway', 'Sto. Tomas', 13.620, 123.190, 'then Maharlika Hwy to Quezon and Bicol'],
  ['CALAX', 'Laguna Blvd.', 14.250, 121.035],
  ['CALAX', 'Sta. Rosa/Tagaytay', 14.228, 121.012], ['CALAX', 'Silang East', 14.210, 120.990],
  ['CALAX', 'Silang Interchange', 14.218, 120.960],
  ['CAVITEX', 'Bacoor/Zapote', 14.462, 120.962],
  ['CAVITEX', 'Kawit', 14.442, 120.900]
];

// How a trailer gets from Manila Port to an exit on each expressway. '*' is the exit itself.
var TOLL_CHAINS = {
  'NLEX/SCTEX':      [['NLEX Harbor Link', 'R-10/Port of Manila', 'Karuhatan/Valenzuela'], ['NLEX/SCTEX', 'Karuhatan', '*']],
  'TPLEX':           [['NLEX Harbor Link', 'R-10/Port of Manila', 'Karuhatan/Valenzuela'], ['NLEX/SCTEX', 'Karuhatan', 'Tarlac'],
                      ['TPLEX', 'La Paz', '*']],
  // Southbound: NLEX Connector first (trailer route), then city streets to the expressway
  'SLEX/Skyway/MCX': [['NLEX Connector', 'C-3 Road/5th Ave.', 'Magsaysay'], ['SLEX/Skyway/MCX', 'Magallanes', '*']],
  'STAR Tollway':    [['NLEX Connector', 'C-3 Road/5th Ave.', 'Magsaysay'], ['SLEX/Skyway/MCX', 'Magallanes', 'Calamba'],
                      ['STAR Tollway', 'Calamba', '*']],
  'CALAX':           [['NLEX Connector', 'C-3 Road/5th Ave.', 'Magsaysay'], ['SLEX/Skyway/MCX', 'Magallanes', 'Mamplasan'],
                      ['CALAX', 'Greenfield/Mamplasan', '*']],
  'CAVITEX':         [['NLEX Connector', 'C-3 Road/5th Ave.', 'Magsaysay'], ['CAVITEX', 'Parañaque (Roxas Blvd.)', '*']]
};

function getTollSheet_() {
  var ss = dmSs_();
  var sh = ss.getSheetByName(TOLL_TAB);
  if (!sh) sh = ss.insertSheet(TOLL_TAB);
  if (sh.getLastRow() < 2) {
    var rows = [['Expressway', 'Direction from Manila', 'Entry', 'Exit', 'Toll Class 3 (PHP)']];
    TOLL_SEED.forEach(function (x) {
      x.p.forEach(function (p) {
        rows.push([x.n, dirLabel_(x.d), x.o[p[0]], x.o[p[1]], p[2]]);
      });
    });
    sh.getRange(1, 1, rows.length, 5).setValues(rows);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold');
    sh.getRange(2, 5, rows.length - 1, 1).setNumberFormat('#,##0.00');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, 4);
  }
  return sh;
}

// Called by the app when it opens: all Class 3 toll rates, plus the data for route suggestions.
// Sent as JSON text, which google.script.run passes through reliably whatever the content.
function getTollRates() {
  return JSON.stringify(readTollRates_());
}

// RUN THIS from the Apps Script editor to check the toll database (select testTolls, then Run).
// It creates the "Toll Rates (Class 3)" tab if needed and logs what it found.
function testTolls() {
  var d = readTollRates_();
  var count = 0;
  d.expressways.forEach(function (x) { count += Object.keys(x.rates).length; });
  Logger.log('Toll rates OK: ' + d.expressways.length + ' expressways, ' + count + ' rates. Sheet: ' + d.url);
}

function dirLabel_(d) { return d === 'south' ? 'Southbound' : (d === 'both' ? 'Both directions' : 'Northbound'); }

function readTollRates_() {
  var sh = getTollSheet_();
  var values = sh.getDataRange().getValues();
  // Sheets seeded before the trailer route change list the NLEX Connector as northbound only: fix once
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === 'NLEX Connector' && !/both/i.test(String(values[r][1]))) {
      sh.getRange(r + 1, 2).setValue('Both directions');
      values[r][1] = 'Both directions';
    }
  }
  var byName = {}, list = [];
  for (var i = 1; i < values.length; i++) {
    var name = String(values[i][0] || '').trim();
    var a = String(values[i][2] || '').trim();
    var b = String(values[i][3] || '').trim();
    var t = values[i][4];
    if (!name || !a || !b || a === b || t === '' || t === null || isNaN(Number(t))) continue;
    var x = byName[name];
    if (!x) {
      var dirText = String(values[i][1]);
      x = byName[name] = { name: name, dir: /both/i.test(dirText) ? 'both' : (/south/i.test(dirText) ? 'south' : 'north'),
                           points: [], rates: {} };
      list.push(x);
    }
    x.rates[a + '|' + b] = Number(t);
    if (x.points.indexOf(a) < 0) x.points.push(a);
    if (x.points.indexOf(b) < 0) x.points.push(b);
  }
  // Plazas in order going away from Manila; plazas added in the sheet go at the end
  list.forEach(function (x) {
    var seed = null;
    for (var k = 0; k < TOLL_SEED.length; k++) if (TOLL_SEED[k].n === x.name) seed = TOLL_SEED[k];
    if (!seed) return;
    var ordered = seed.o.filter(function (p) { return x.points.indexOf(p) >= 0; });
    x.points = ordered.concat(x.points.filter(function (p) { return seed.o.indexOf(p) < 0; }));
  });
  return {
    expressways: list,
    suggest: { exits: TOLL_EXITS, chains: TOLL_CHAINS },
    url: 'https://docs.google.com/spreadsheets/d/' + DRIVER_MATRIX_ID + '/edit#gid=' + sh.getSheetId()
  };
}

// Called by the app when the destination changes: where it is, for the toll suggestions.
function locateDestination(dest) {
  dest = String(dest || '').trim();
  if (!dest) return null;
  var res;
  try {
    res = Maps.newGeocoder().setRegion('ph').geocode(dest);
  } catch (e) {
    throw new Error('Google Maps lookup failed: ' + e.message);
  }
  if (!res || res.status !== 'OK' || !res.results || !res.results.length) return null;
  var r = res.results[0];
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, address: r.formatted_address };
}

// Keeps only well-formed toll segments sent by the app.
function cleanTollRoute_(route) {
  if (!Array.isArray(route)) return [];
  return route.slice(0, 12).map(function (s) {
    return {
      expressway: String(s.expressway || '').slice(0, 60),
      entry: String(s.entry || '').slice(0, 60),
      exit: String(s.exit || '').slice(0, 60),
      oneWay: Number(s.oneWay) || 0,
      back: Number(s.back) || 0
    };
  }).filter(function (s) { return s.expressway && s.entry && s.exit; });
}

function tollRouteText_(route) {
  return (route || []).map(function (s) {
    return s.expressway + ': ' + s.entry + ' to ' + s.exit + ' (' + s.oneWay + (s.back !== s.oneWay ? ' / back ' + s.back : '') + ')';
  }).join('; ');
}

// ---------- Brokers, clients and delivery addresses (Brokers & clients tab) ----------
// Tabs in the driver matrix spreadsheet:
//   Brokers:          A = Broker ID, B = Brokerage, C = Contact Person, D = Contact Number, E = Base Rate (PHP),
//                     F = Position, G = Email, H–I = MOA file ID and name, J–K = Truck Agreement file ID and name
//   Clients:          A = Client ID, B = Broker ID, C = Client, D = Contact Number, E = Type, F = Condition, G = Movement,
//                     H = Route (always CLIENT_ROUTE; E–G are no longer used)
//   Client Addresses: A = Address ID, B = Client ID, C = Province, D = City/Municipality, E = Barangay,
//                     F = Lot # / Street / Landmark, G = Full Address, H = City PSGC code
// A client belongs to one brokerage and can have any number of delivery addresses.
// Columns added later (F onwards on Brokers, E onwards on Clients) are filled in on older sheets automatically.
var BROKERS_TAB = 'Brokers';
var CLIENTS_TAB = 'Clients';
var ADDRESSES_TAB = 'Client Addresses';
var BROKER_HEAD = ['Broker ID', 'Brokerage', 'Contact Person', 'Contact Number', 'Base Rate (PHP)',
                   'Position', 'Email', 'MOA File ID', 'MOA File Name', 'Truck Agreement File ID', 'Truck Agreement File Name'];
// Brokerage documents: the column that holds the Drive file ID (the file name is in the next column)
var BROKER_DOCS = { moa: { col: 8, label: 'MOA' }, truck: { col: 10, label: 'Truck Agreement' } };
var MAX_DOC_BYTES = 10 * 1024 * 1024;   // 10 MB per uploaded document
// Google Drive folder for uploaded MOAs and Truck Agreements. Created on the first upload.
var AGREEMENT_FOLDER_NAME = '2C Brokerage Agreements';
var CLIENT_HEAD = ['Client ID', 'Broker ID', 'Client', 'Contact Number', 'Type', 'Condition', 'Movement', 'Route', 'Client Code'];
// Every client's trips are Port to Warehouse, so the client form has no type, condition or movement.
// Columns E–G (Type, Condition, Movement) are left blank; column H holds the route.
var CLIENT_ROUTE = 'Port to Warehouse';
var ADDRESS_HEAD = ['Address ID', 'Client ID', 'Province', 'City/Municipality', 'Barangay',
                    'Lot # / Street / Landmark', 'Full Address', 'City PSGC Code'];

// The driver matrix spreadsheet, opened once per server call (opening it is the slowest step)
var DM_SS_ = null;
function dmSs_() {
  if (!DM_SS_) DM_SS_ = openShared_(DRIVER_MATRIX_ID, 'rates and brokerages');
  return DM_SS_;
}

// ---------- Team access ----------
// The app runs as the person using it, so their emails go out from their own Gmail.
// That also means each person needs edit access to the two spreadsheets and the shared Drive folders.
function openShared_(id, label) {
  try { return SpreadsheetApp.openById(id); }
  catch (e) {
    if (/permission|access/i.test(e.message)) {
      throw new Error('Your Google account (' + (Session.getActiveUser().getEmail() || 'this account')
        + ') does not have access to the 2C ' + label + ' spreadsheet yet. Ask the app owner to add you in Settings → Team, then press Share with team.');
    }
    throw e;
  }
}

// Called by the app's Settings tab (run by the owner): saves the team list, then gives every
// listed account edit access to both spreadsheets and the shared proposal and agreement folders.
// If the folder IDs are blank, the owner's own folders become the shared ones.
function shareWithTeam(teamText) {
  var emails = cleanEmails_(teamText);
  var lower = {};
  emails = emails.filter(function (e) { var k = e.toLowerCase(); if (lower[k]) return false; lower[k] = 1; return true; });
  var updates = { team_emails: emails.join('\n') };
  var s = settings_();
  if (!String(s.proposal_folder_id || '').trim()) updates.proposal_folder_id = namedFolder_('PROPOSAL_FOLDER_ID', PROPOSAL_FOLDER_NAME).getId();
  if (!String(s.agreements_folder_id || '').trim()) updates.agreements_folder_id = namedFolder_('AGREEMENT_FOLDER_ID', AGREEMENT_FOLDER_NAME).getId();
  saveSettings(updates);
  if (!emails.length) return { shared: [], failed: [], settings: getSettings() };

  var targets = [
    ['Proposals spreadsheet', function () { return SpreadsheetApp.openById(SHEET_ID); }],
    ['Rates and brokerages spreadsheet', function () { return SpreadsheetApp.openById(DRIVER_MATRIX_ID); }],
    ['Proposal PDFs folder', function () { return getProposalFolder_(); }],
    ['Agreements folder', function () { return getAgreementFolder_(); }]
  ];
  var failed = [];
  targets.forEach(function (t) {
    var item;
    try { item = t[1](); } catch (e) { failed.push(t[0] + ': ' + e.message); return; }
    var already = {};
    try { item.getEditors().forEach(function (u) { already[String(u.getEmail()).toLowerCase()] = 1; }); } catch (e) { /* fine */ }
    var add = emails.filter(function (e) { return !already[e.toLowerCase()]; });
    if (!add.length) return;
    try { item.addEditors(add); }
    catch (e) {   // one bad address should not stop the rest
      add.forEach(function (one) {
        try { item.addEditor(one); } catch (e2) { failed.push(t[0] + ' → ' + one + ': ' + e2.message); }
      });
    }
  });
  return { shared: emails, failed: failed, settings: getSettings() };
}

function getListSheet_(name, head) {
  var ss = dmSs_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@');   // keep IDs and codes as plain text
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readList_(sh, width) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, width).getDisplayValues().map(function (r, i) {
    return { row: i + 2, v: r };
  }).filter(function (x) { return String(x.v[0]).trim() !== ''; });
}

var ID_SEQ_ = 0;
function newId_(prefix) {
  ID_SEQ_++;
  return prefix + Utilities.formatDate(new Date(), 'Asia/Manila', 'yyMMddHHmmss') + (ID_SEQ_ < 10 ? '0' : '') + ID_SEQ_
    + Math.floor(Math.random() * 90 + 10);
}

function clean_(v, max) {
  return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 120);
}

function composeAddress_(c) {
  return [c.line, c.barangay, c.city, c.province === 'Metro Manila (NCR)' ? 'Metro Manila' : c.province]
    .filter(function (x) { return x; }).join(', ');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function findRow_(sh, width, id) {
  if (!id) return null;
  var rows = readList_(sh, width);
  for (var i = 0; i < rows.length; i++) if (rows[i].v[0] === id) return rows[i];
  return null;
}

function clientsSheet_() {
  var sh = getListSheet_(CLIENTS_TAB, CLIENT_HEAD);
  if (String(sh.getRange(1, 4).getDisplayValue()) === 'Province') migrateClients_(sh);
  fillHeaders_(sh, CLIENT_HEAD);   // older sheets: adds the Type, Condition and Movement headers
  return sh;
}

// Adds any header the tab is missing (columns added since the tab was created)
function fillHeaders_(sh, head) {
  if (sh.getMaxColumns() < head.length) sh.insertColumnsAfter(sh.getMaxColumns(), head.length - sh.getMaxColumns());
  var cur = sh.getRange(1, 1, 1, head.length).getDisplayValues()[0];
  for (var i = 1; i < head.length; i++) {
    if (!cur[i]) sh.getRange(1, i + 1).setValue(head[i]).setFontWeight('bold');
  }
}

function splitList_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

// Keeps only values from the allowed list, in the list's order
function pickList_(values, allowed) {
  var v = Array.isArray(values) ? values.map(String) : splitList_(values);
  return allowed.filter(function (a) { return v.indexOf(a) >= 0; });
}

// { id, name, url } for a document stored in Drive, or null when none is uploaded
function fileRef_(id, name) {
  id = String(id || '').trim();
  return id ? { id: id, name: String(name || '').trim() || 'Document.pdf', url: 'https://drive.google.com/file/d/' + id + '/view' } : null;
}
function addressesSheet_() {
  var sh = getListSheet_(ADDRESSES_TAB, ADDRESS_HEAD);
  // Keep the PSGC code column as text, or Sheets drops the leading 0 (0105532000 → 105532000)
  // and a Luzon address reads as Mindanao, which made northbound trips come out southbound.
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADDR_CODE_TEXT_V1')) {
    var col = sh.getRange(1, 8, sh.getMaxRows(), 1);
    var vals = col.getValues();
    col.setNumberFormat('@');
    for (var i = 1; i < vals.length; i++) if (vals[i][0] !== '') vals[i][0] = psgc_(vals[i][0]);
    col.setValues(vals);
    props.setProperty('ADDR_CODE_TEXT_V1', '1');
  }
  return sh;
}

// A PSGC city code as its full 10 digits ("105532000" → "0105532000")
function psgc_(v) {
  var s = String(v === null || v === undefined ? '' : v).replace(/\D/g, '');
  return s ? ('0000000000' + s).slice(-10) : '';
}

// One-time change from the old layout (one address stored on the client row) to the new one:
// each client keeps its ID, name and broker, and its address moves to the Client Addresses tab.
function migrateClients_(sh) {
  withLock_(function () {
    if (String(sh.getRange(1, 4).getDisplayValue()) !== 'Province') return;   // already done by another run
    var last = sh.getLastRow();
    var old = last >= 2 ? sh.getRange(2, 1, last - 1, 9).getDisplayValues() : [];
    var addr = addressesSheet_();
    var moved = old.filter(function (r) { return r[0] && r[4] && r[5]; }).map(function (r) {
      return [newId_('AD-'), r[0], r[3], r[4], r[5], r[6],
              r[7] || composeAddress_({ line: r[6], barangay: r[5], city: r[4], province: r[3] }), r[8]];
    });
    if (moved.length) addr.getRange(addr.getLastRow() + 1, 1, moved.length, ADDRESS_HEAD.length).setValues(moved);
    sh.getRange(1, 1, Math.max(1, last), 9).clearContent();
    sh.getRange(1, 1, 1, CLIENT_HEAD.length).setValues([CLIENT_HEAD]).setFontWeight('bold');
    if (old.length) sh.getRange(2, 1, old.length, 4).setValues(old.map(function (r) { return [r[0], r[1], r[2], '']; }));
  });
}

function brokersSheet_() {
  var sh = getListSheet_(BROKERS_TAB, BROKER_HEAD);
  fillHeaders_(sh, BROKER_HEAD);   // older sheets: adds base rate, position, email and the document columns
  if (sh.getRange(1, 2).getDisplayValue() === 'Broker') sh.getRange(1, 2).setValue(BROKER_HEAD[1]);
  return sh;
}

function rateNum_(v) { var n = Number(String(v || '').replace(/[^0-9.]/g, '')); return n > 0 ? n : null; }

// Called by the app: every brokerage, client and delivery address.
function getBrokersClients() {
  var brokers = readList_(brokersSheet_(), BROKER_HEAD.length).map(function (x) {
    return { id: x.v[0], name: x.v[1], contactPerson: x.v[2], contactNumber: x.v[3], baseRate: rateNum_(x.v[4]),
             position: x.v[5], email: x.v[6], moa: fileRef_(x.v[7], x.v[8]), truck: fileRef_(x.v[9], x.v[10]) };
  });
  var clients = readList_(clientsSheet_(), CLIENT_HEAD.length).map(function (x) {
    return { id: x.v[0], brokerId: x.v[1], name: x.v[2], contactNumber: x.v[3], route: CLIENT_ROUTE, code: x.v[8] };
  });
  var addresses = readList_(addressesSheet_(), ADDRESS_HEAD.length).map(function (x) {
    // An address is the city/municipality and province, plus an optional barangay and Lot # / Street / Landmark.
    var a = { id: x.v[0], clientId: x.v[1], province: x.v[2], city: x.v[3], barangay: x.v[4], line: x.v[5],
              cityCode: psgc_(x.v[7]) };
    a.area = composeAddress_({ barangay: a.barangay, city: a.city, province: a.province });
    a.address = composeAddress_(a) || x.v[6];
    return a;
  });
  var byName = function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; };
  brokers.sort(byName);
  clients.sort(byName);
  addresses.sort(function (a, b) { return (a.city + a.address).toLowerCase() < (b.city + b.address).toLowerCase() ? -1 : 1; });
  return { brokers: brokers, clients: clients, addresses: addresses, clientRoute: CLIENT_ROUTE,
           standardBaseRate: rateCard_().baseRate, coveredKm: rateCard_().coveredKm };
}

// b: { id?, name, baseRate, contactPerson, position, contactNumber, email }. No id = new brokerage.
// The MOA and Truck Agreement columns are left as they are; uploadBrokerFile handles those.
function saveBroker(b) {
  return withLock_(function () {
    b = b || {};
    var sh = brokersSheet_();
    var name = clean_(b.name);
    var base = b.baseRate === '' || b.baseRate === null || b.baseRate === undefined ? '' : Number(b.baseRate);
    if (base !== '' && !(base > 0)) throw new Error('Enter a base rate greater than 0, or leave it blank to use the standard rate.');
    if (!name) throw new Error('Enter the brokerage name.');
    var email = clean_(b.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address, e.g. name@company.com.');
    var dupe = readList_(sh, BROKER_HEAD.length).filter(function (x) {
      return x.v[1].toLowerCase() === name.toLowerCase() && x.v[0] !== b.id;
    });
    if (dupe.length) throw new Error('There is already a brokerage named ' + name + '.');
    var found = findRow_(sh, BROKER_HEAD.length, b.id);
    if (b.id && !found) throw new Error('That brokerage was not found. It may have been removed.');
    var row = [b.id || newId_('BR-'), name, clean_(b.contactPerson), clean_(b.contactNumber, 40), base,
               clean_(b.position), email];
    if (found) sh.getRange(found.row, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row.concat(['', '', '', '']));
    return getBrokersClients();
  });
}

function deleteBroker(id) {
  clientsSheet_();
  return withLock_(function () {
    var clients = readList_(clientsSheet_(), CLIENT_HEAD.length).filter(function (x) { return x.v[1] === id; });
    if (clients.length) throw new Error('This brokerage still has ' + clients.length + ' client(s). Remove them first.');
    var sh = brokersSheet_();
    var found = findRow_(sh, BROKER_HEAD.length, id);
    if (found) {
      // Its uploaded documents go to the Drive trash with it
      [found.v[7], found.v[9]].forEach(function (fid) {
        if (fid) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) { /* already gone */ } }
      });
      sh.deleteRow(found.row);
    }
    return getBrokersClients();
  });
}

// ----- brokerage documents: MOA and Truck Agreement (PDF, stored in Drive) -----
function getAgreementFolder_() { return sharedOrOwnFolder_('agreements_folder_id', 'AGREEMENT_FOLDER_ID', AGREEMENT_FOLDER_NAME); }

// Called by the app's brokerage form. kind: 'moa' | 'truck'. file: { name, mimeType, data (base64) }.
// Replaces the brokerage's current document of that kind (the old file goes to the Drive trash).
function uploadBrokerFile(brokerId, kind, file) {
  var doc = BROKER_DOCS[kind];
  if (!doc) throw new Error('Unknown document type.');
  if (!file || !file.data) throw new Error('No file was received. Try again.');
  var bytes;
  try { bytes = Utilities.base64Decode(file.data); } catch (e) { throw new Error('The file could not be read. Try again.'); }
  if (bytes.length > MAX_DOC_BYTES) throw new Error('The file is larger than 10 MB. Compress the PDF, then upload it again.');
  var name = clean_(file.name, 120);
  if (!/pdf/i.test(String(file.mimeType || '')) && !/\.pdf$/i.test(name)) {
    throw new Error('Upload the ' + doc.label + ' as a PDF file, so it can be added to the proposal PDF.');
  }
  return withLock_(function () {
    var sh = brokersSheet_();
    var found = findRow_(sh, BROKER_HEAD.length, brokerId);
    if (!found) throw new Error('That brokerage was not found. It may have been removed.');
    var safe = String(found.v[1]).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    var saved = getAgreementFolder_().createFile(Utilities.newBlob(bytes, MimeType.PDF, safe + ' - ' + doc.label + '.pdf'));
    shareForApp_(saved);
    var oldId = found.v[doc.col - 1];
    if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) { /* already gone */ } }
    sh.getRange(found.row, doc.col, 1, 2).setValues([[saved.getId(), saved.getName()]]);
    return getBrokersClients();
  });
}

// Called by the app's brokerage form: removes the document and clears its cells.
function removeBrokerFile(brokerId, kind) {
  var doc = BROKER_DOCS[kind];
  if (!doc) throw new Error('Unknown document type.');
  return withLock_(function () {
    var sh = brokersSheet_();
    var found = findRow_(sh, BROKER_HEAD.length, brokerId);
    if (!found) throw new Error('That brokerage was not found. It may have been removed.');
    var fid = found.v[doc.col - 1];
    if (fid) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) { /* already gone */ } }
    sh.getRange(found.row, doc.col, 1, 2).clearContent();
    return getBrokersClients();
  });
}

// c: { id?, brokerId, name, contactNumber }. The route is always CLIENT_ROUTE.
function saveClient(c) {
  clientsSheet_();
  return withLock_(function () {
    c = c || {};
    var name = clean_(c.name);
    if (!name) throw new Error('Enter the client name.');
    var broker = findRow_(brokersSheet_(), BROKER_HEAD.length, c.brokerId);
    if (!broker) throw new Error('Choose a brokerage first.');
    var sh = clientsSheet_();
    var dupe = readList_(sh, CLIENT_HEAD.length).filter(function (x) {
      return x.v[1] === c.brokerId && x.v[2].toLowerCase() === name.toLowerCase() && x.v[0] !== c.id;
    });
    if (dupe.length) throw new Error(broker.v[1] + ' already has a client named ' + name + '.');
    var found = findRow_(sh, CLIENT_HEAD.length, c.id);
    if (c.id && !found) throw new Error('That client was not found. It may have been removed.');
    var row = [c.id || newId_('CL-'), c.brokerId, name, clean_(c.contactNumber, 40), '', '', '', CLIENT_ROUTE,
               clean_(c.code, 20).toUpperCase()];
    if (found) sh.getRange(found.row, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return getBrokersClients();
  });
}

// Removes the client and all of its delivery addresses
function deleteClient(id) {
  clientsSheet_();
  return withLock_(function () {
    var addr = addressesSheet_();
    readList_(addr, ADDRESS_HEAD.length).filter(function (x) { return x.v[1] === id; })
      .sort(function (a, b) { return b.row - a.row; })
      .forEach(function (x) { addr.deleteRow(x.row); });
    var sh = clientsSheet_();
    var found = findRow_(sh, CLIENT_HEAD.length, id);
    if (found) sh.deleteRow(found.row);
    return getBrokersClients();
  });
}

// a: { id?, clientId, cityCode, barangay?, line? } (barangay and Lot # / Street / Landmark are optional). Province and city names come from the PSGC list.
function saveAddress(a) {
  clientsSheet_();
  return withLock_(function () {
    a = a || {};
    var client = findRow_(clientsSheet_(), CLIENT_HEAD.length, a.clientId);
    if (!client) throw new Error('Choose a client first.');
    // Uses the same cached lists as the dropdowns, so the full address file is not unpacked on every save
    var places = JSON.parse(getPlaces());
    var city = null;
    for (var i = 0; i < places.cities.length; i++) if (places.cities[i][0] === a.cityCode) city = places.cities[i];
    if (!city) throw new Error('Choose the city or municipality.');
    var province = '';
    places.provinces.forEach(function (p) { if (p[0] === city[2]) province = p[1]; });
    var barangay = clean_(a.barangay);
    if (barangay && getBarangays(city[0]).indexOf(barangay) < 0) throw new Error('That barangay is not in ' + city[1] + '. Choose it from the list, or leave it blank.');
    var rec = { line: clean_(a.line, 200), barangay: barangay, city: city[1], province: province };
    var full = composeAddress_(rec);
    var sh = addressesSheet_();
    var dupe = readList_(sh, ADDRESS_HEAD.length).filter(function (x) {
      return x.v[1] === a.clientId && psgc_(x.v[7]) === city[0]
        && String(x.v[4] || '').toLowerCase() === barangay.toLowerCase()
        && String(x.v[5] || '').replace(/\s+/g, ' ').trim().toLowerCase() === rec.line.toLowerCase() && x.v[0] !== a.id;
    });
    if (dupe.length) throw new Error(client.v[2] + ' already has the address ' + full + '.');
    var found = findRow_(sh, ADDRESS_HEAD.length, a.id);
    if (a.id && !found) throw new Error('That address was not found. It may have been removed.');
    var row = [a.id || newId_('AD-'), a.clientId, province, city[1], barangay, rec.line, full, city[0]];
    if (found) sh.getRange(found.row, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return getBrokersClients();
  });
}

function deleteAddress(id) {
  return withLock_(function () {
    var sh = addressesSheet_();
    var found = findRow_(sh, ADDRESS_HEAD.length, id);
    if (found) sh.deleteRow(found.row);
    return getBrokersClients();
  });
}

// ---------- Philippine addresses (PSGC masterlist, October 2026) ----------
// PlacesData.html holds the provinces, cities/municipalities and barangays, gzipped and base64-encoded.
// Source: Philippine Statistics Authority PSGC, via github.com/bendlikeabamboo/barangay (MIT licence).
var PLACES_CACHE_ = null;
function getPlacesData_() {
  if (PLACES_CACHE_) return PLACES_CACHE_;
  var b64 = HtmlService.createHtmlOutputFromFile('PlacesData').getContent().replace(/[^A-Za-z0-9+\/=]/g, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip');
  PLACES_CACHE_ = JSON.parse(Utilities.ungzip(blob).getDataAsString('UTF-8'));
  return PLACES_CACHE_;
}

// Called by the app: provinces and cities/municipalities for the address dropdowns (JSON text).
function getPlaces() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('places_v1');
  if (hit) return hit;
  var d = getPlacesData_();
  var json = JSON.stringify({ version: d.v, provinces: d.p, cities: d.c });
  try { cache.put('places_v1', json, 21600); } catch (e) { /* too big for the cache: fine, just slower */ }
  return json;
}

// Called by the app: barangays of one city/municipality.
function getBarangays(cityCode) {
  var cache = CacheService.getScriptCache();
  var key = 'brgy_' + cityCode;
  var hit = cache.get(key);
  if (hit) return hit.split('|');
  var list = String(getPlacesData_().b[cityCode] || '');
  if (!list) return [];
  try { cache.put(key, list, 21600); } catch (e) { /* fine without the cache */ }
  return list.split('|');
}

// RUN THIS from the Apps Script editor to check the address list (select testPlaces, then Run).
function testPlaces() {
  var d = getPlacesData_();
  var count = 0;
  for (var k in d.b) count += d.b[k].split('|').length;
  Logger.log('Address list OK (PSGC ' + d.v + '): ' + d.p.length + ' provinces, ' + d.c.length
    + ' cities/municipalities, ' + count + ' barangays.');
}

// ---------- Weekly diesel price (shown in the app's "Diesel price" tab) ----------
// Stored in the same spreadsheet as the driver matrix, tab "Weekly Diesel Price":
// A = Effective Date, B = Diesel Price (PHP/L). Each save adds a row, so past weeks are kept.
// A proposal uses the latest price whose effective date is on or before the proposal date.
var FUEL_TAB = 'Weekly Diesel Price';

function getFuelSheet_() {
  var ss = dmSs_();
  var sh = ss.getSheetByName(FUEL_TAB);
  if (!sh) {
    sh = ss.insertSheet(FUEL_TAB);
    sh.getRange(1, 1, 1, 2).setValues([['Effective Date', 'Diesel Price (PHP/L)']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function dateKey_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function parseDateKey_(str) {
  var p = String(str || '').split('-');
  if (p.length !== 3) return null;
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

// All saved prices, oldest first. For the same date, the later row wins.
function readFuelEntries_() {
  var sh = getFuelSheet_();
  var values = sh.getDataRange().getValues();
  var entries = [];
  for (var i = 1; i < values.length; i++) {
    var d = values[i][0];
    var price = Number(values[i][1]);
    if (!(d instanceof Date) || isNaN(d.getTime()) || !(price > 0)) continue;
    entries.push({ date: dateKey_(d), price: price, order: i });
  }
  entries.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order; });
  return entries;
}

function pickFuelEntry_(entries, key) {
  var pick = null;
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].date <= key) pick = entries[i];
  }
  return pick || entries[0] || null;
}

function getFuelPriceFor_(proposalDate) {
  var entries = readFuelEntries_();
  if (!entries.length) {
    throw new Error('No diesel price has been set yet. Enter this week\'s price in the Diesel price tab, then try again.');
  }
  var key = proposalDate || dateKey_(new Date());
  var e = pickFuelEntry_(entries, key);
  return { price: e.price, date: e.date };
}

// Called by the app: current price plus recent history.
function getFuelPrice() {
  var entries = readFuelEntries_();
  var current = entries.length ? pickFuelEntry_(entries, dateKey_(new Date())) : null;
  return {
    current: current ? { price: current.price, date: current.date } : null,
    history: entries.slice(-10).reverse().map(function (e) { return { price: e.price, date: e.date }; }),
    benchmark: rateCard_().fuelBenchmark,
    today: dateKey_(new Date())
  };
}

// Called by the app's Diesel price tab.
function saveFuelPrice(price, effectiveDate) {
  var p = Number(price);
  if (!(p > 0)) throw new Error('Enter a diesel price greater than 0.');
  var d = parseDateKey_(effectiveDate) || new Date();
  var sh = getFuelSheet_();
  sh.appendRow([d, p]);
  var r = sh.getLastRow();
  sh.getRange(r, 1).setNumberFormat('mmm d, yyyy');
  sh.getRange(r, 2).setNumberFormat('#,##0.00');
  return getFuelPrice();
}

function getDriverRateFromMatrix_(km) {
  var sh = getMatrixSheet_();
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var min = cellNum_(values[i][0]);
    var max = cellNum_(values[i][1]);
    if (min === null) continue;
    if (km >= min && (max === null || km <= max)) {
      var rate = values[i][3];
      var bracket = matrixLabel_(min, max);
      if (rate === '' || rate === null) {
        throw new Error('No driver rate set for the ' + bracket + ' bracket in the Driver Rate Matrix sheet. Fill it in, then try again.');
      }
      return { rate: Number(rate) || 0, bracket: bracket };
    }
  }
  throw new Error(km + ' km is outside the Driver Rate Matrix brackets. Add a bracket for it, then try again.');
}

// ml = { bracket, rows } from getMasterlistBracket_
// The brokerage's base rate, or null to use the standard base rate from Settings
function brokerBaseRate_(brokerId) {
  if (!brokerId) return null;
  try {
    var found = findRow_(brokersSheet_(), BROKER_HEAD.length, brokerId);
    return found ? rateNum_(found.v[4]) : null;
  } catch (e) { return null; }
}

// baseRate: the broker's base rate (null = standard rate)
function computeTrailerRateCard_(podKm, dieselPrice, ml, baseRate) {
  var card = rateCard_();
  var bracket = ml.bracket;

  var excessKm = Math.max(0, podKm - card.coveredKm);
  var variable = excessKm * bracket.variablePerKm;
  var liters = excessKm * card.distanceMultiplier / bracket.kmPerLiter;
  var surchargePerLiter = Math.max(0, dieselPrice - card.fuelBenchmark);
  var fuelSurcharge = liters * surchargePerLiter;

  return {
    bracketLabel: bracket.label,
    baseRate: baseRate || card.baseRate,
    baseRateSource: baseRate ? 'broker' : 'standard',
    coveredKm: card.coveredKm,
    excessKm: excessKm,
    variablePerKm: bracket.variablePerKm,
    variable: variable,
    bracketKmPerLiter: bracket.kmPerLiter,
    liters: liters,
    fuelBenchmark: card.fuelBenchmark,
    surchargePerLiter: surchargePerLiter,
    fuelSurcharge: fuelSurcharge,
    distanceMultiplier: card.distanceMultiplier,
    // Full rate card from the Masterlist, for the table on the client proposal
    brackets: ml.rows.map(function (b) {
      return { label: b.label, variablePerKm: b.variablePerKm, kmPerLiter: b.kmPerLiter, applied: b.row === bracket.row };
    }),
    total: (baseRate || card.baseRate) + variable + fuelSurcharge
  };
}

// Distance in km (0 if Google Maps finds no route).
function getDistance_(source, destination, via) {
  var r = getRoute_(source, destination, via);
  return r ? r.km : 0;
}

// Raw Google Maps driving routes. via: places the route must pass, in order.
// alternatives: ask for other routes too (Google only gives them when there are no via points).
function directions_(source, destination, via, alternatives) {
  var directions;
  try {
    var finder = Maps.newDirectionFinder()
      .setOrigin(source)
      .setDestination(destination)
      .setRegion('ph')
      .setMode(Maps.DirectionFinder.Mode.DRIVING);
    (via || []).forEach(function (w) { finder.addWaypoint(w); });
    if (alternatives) finder.setAlternatives(true);
    directions = finder.getDirections();
  } catch (e) {
    // Surface quota / service errors instead of hiding them as "route not found"
    console.error(e);
    throw new Error("Google Maps lookup failed: " + e.message);
  }
  return directions && directions.routes ? directions.routes : [];
}

function inEdsaBan_(loc) {
  var b = EDSA_BAN_BOX;
  return loc && loc.lat >= b.south && loc.lat <= b.north && loc.lng >= b.west && loc.lng <= b.east;
}

// True if any step drives on EDSA inside the banned stretch
function usesBannedEdsa_(route) {
  return (route.legs || []).some(function (leg) {
    return (leg.steps || []).some(function (st) {
      var text = String(st.html_instructions || '');
      return /\bEDSA\b|Epifanio de los Santos/i.test(text) && (inEdsaBan_(st.start_location) || inEdsaBan_(st.end_location));
    });
  });
}

function routeInfo_(r) {
  var meters = 0, seconds = 0, expressway = 0;
  (r.legs || []).forEach(function (leg) {
    meters += leg.distance.value;
    seconds += leg.duration ? leg.duration.value : 0;
    (leg.steps || []).forEach(function (st) {
      if (EXPRESSWAY_RE.test(String(st.html_instructions || '')) && st.distance) expressway += st.distance.value;
    });
  });
  if (!meters) return null;
  var last = r.legs[r.legs.length - 1];
  var detail = [];
  (r.legs || []).forEach(function (leg) {
    (leg.steps || []).forEach(function (st) { if (st.polyline && st.polyline.points) detail.push(st.polyline.points); });
  });
  return {
    km: meters / 1000,
    polyline: r.overview_polyline ? r.overview_polyline.points : '',
    detail: detail,
    start: r.legs[0].start_location,
    end: last.end_location,
    edsa: usesBannedEdsa_(r),
    warnings: (r.warnings || []).filter(function (w) { return !/has tolls/i.test(w); }).slice(0, 5),
    driveMin: Math.round(seconds / 60),
    expresswayKm: Math.min(expressway, meters) / 1000
  };
}

// The Google Maps driving route. Returns { km, polyline, start, end } or null.
function getRoute_(source, destination, via) {
  var routes = directions_(source, destination, via, false).map(routeInfo_).filter(Boolean);
  return routes.length ? routes[0] : null;
}

// The trailer route: like getRoute_, but kept off EDSA (Magallanes to North Ave.).
// truckCheck: 'clear' (Google's route was fine), 'alternative' (shortest route off EDSA),
// 'detour' (sent through a truck road), 'edsa' (no route off EDSA was found: check by hand).
function getTruckRoute_(source, destination, via, dir) {
  via = via || [];
  var routes = directions_(source, destination, via, via.length === 0).map(routeInfo_).filter(Boolean);
  if (!routes.length) return null;
  var clean = routes.filter(function (r) { return !r.edsa; }).sort(function (a, b) { return a.km - b.km; });
  if (clean.length) {
    clean[0].truckCheck = routes[0].edsa ? 'alternative' : 'clear';
    clean[0].viaUsed = via;
    return clean[0];
  }
  var detour = TRUCK_DETOUR[dir];
  if (detour) {
    var d = directions_(source, destination, via.concat(detour.via), false).map(routeInfo_).filter(Boolean)[0];
    if (d && !d.edsa) {
      d.truckCheck = 'detour';
      d.viaUsed = via.concat(detour.via);
      d.detour = detour.label;
      return d;
    }
  }
  routes[0].truckCheck = 'edsa';
  routes[0].viaUsed = via;
  return routes[0];
}

// ---------- Route review: terrain, traffic, road closures and constructions ----------
// Shown on the internal cost sheet. Each part is optional: if a lookup fails, the proposal is still made.

// Departure times (24-hour, Manila time) checked on the next weekday for the traffic review.
var TRAFFIC_HOURS = [5, 9, 13, 18, 22];
// Road advisories within this distance of the route are listed.
var ADVISORY_RADIUS_KM = 1;
var ADVISORY_TAB = 'Road Advisories';
var ADVISORY_HEAD = ['Type (Construction / Closure / Reblocking / Other)', 'Road / Location', 'Details',
                     'Start Date', 'End Date', 'Latitude', 'Longitude'];

function analyzeRoute_(route, source, proposalDate) {
  var out = { warnings: route.warnings || [], mapsLink: mapsLink_(source, route.target, route.viaUsed) };
  try { out.terrain = terrain_(route.polyline); } catch (e) { console.error('Terrain failed: ' + e.message); }
  try { out.traffic = traffic_(source, route.target, route.viaUsed); } catch (e) { console.error('Traffic failed: ' + e.message); }
  try {
    var pts = [];
    (route.detail && route.detail.length ? route.detail : [route.polyline]).forEach(function (p) { pts = pts.concat(decodePolyline_(p)); });
    out.advisories = matchAdvisories_(pts, proposalDate);
  } catch (e) { console.error('Advisories failed: ' + e.message); }
  out.advisoryUrl = advisoryUrl_();
  return out;
}

// Opens this route in Google Maps, where live traffic and closures are shown
function mapsLink_(source, target, via) {
  var u = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(source)
    + '&destination=' + encodeURIComponent(target || '');
  if (via && via.length) u += '&waypoints=' + encodeURIComponent(via.join('|'));
  return u;
}

// ----- terrain -----
function terrain_(polyline) {
  if (!polyline) return null;
  var res = Maps.newElevationSampler().samplePath(polyline, 64);
  if (!res || res.status !== 'OK' || !res.results || res.results.length < 2) return null;
  var r = res.results;
  var ascent = 0, descent = 0, maxGrade = 0, steepAt = null;
  for (var i = 1; i < r.length; i++) {
    var dh = r[i].elevation - r[i - 1].elevation;
    if (dh > 0) ascent += dh; else descent -= dh;
    var run = kmBetween_(r[i - 1].location, r[i].location) * 1000;
    if (run > 150) {
      var g = Math.abs(dh) / run * 100;
      if (g > maxGrade) { maxGrade = g; steepAt = { lat: r[i].location.lat, lng: r[i].location.lng, up: dh > 0 }; }
    }
  }
  var elev = r.map(function (x) { return Math.round(x.elevation); });
  var minM = Math.min.apply(null, elev), maxM = Math.max.apply(null, elev);
  var cls = maxGrade >= 6 || ascent >= 800 ? 'Mountainous' : maxGrade >= 4 || ascent >= 400 ? 'Hilly'
          : maxGrade >= 2 || maxM - minM >= 100 ? 'Rolling' : 'Flat';
  return { profile: elev, minM: minM, maxM: maxM, ascentM: Math.round(ascent), descentM: Math.round(descent),
           maxGradePct: Math.round(maxGrade * 10) / 10, steepUp: steepAt ? steepAt.up : null, cls: cls };
}

function kmBetween_(a, b) {
  var R = 6371, t = Math.PI / 180;
  var dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ----- traffic: Google's drive time in traffic for a few departure times on the next weekday -----
function traffic_(source, target, via) {
  var tz = 'Asia/Manila';
  var day = new Date(new Date().getTime() + 24 * 3600 * 1000);
  while (['Sat', 'Sun'].indexOf(Utilities.formatDate(day, tz, 'EEE')) >= 0) day = new Date(day.getTime() + 24 * 3600 * 1000);
  var dayKey = Utilities.formatDate(day, tz, 'yyyy-MM-dd');
  var hasTraffic = false;
  var slots = TRAFFIC_HOURS.map(function (h) {
    var depart = Utilities.parseDate(dayKey + ' ' + (h < 10 ? '0' : '') + h + ':00', tz, 'yyyy-MM-dd HH:mm');
    var finder = Maps.newDirectionFinder().setOrigin(source).setDestination(target).setRegion('ph')
      .setMode(Maps.DirectionFinder.Mode.DRIVING).setDepart(depart);
    (via || []).forEach(function (w) { finder.addWaypoint(w); });
    var d = finder.getDirections();
    var route = d && d.routes && d.routes[0];
    if (!route) return null;
    var sec = 0;
    route.legs.forEach(function (leg) {
      if (leg.duration_in_traffic) { hasTraffic = true; sec += leg.duration_in_traffic.value; }
      else sec += leg.duration.value;
    });
    return { hour: h, label: Utilities.formatDate(depart, tz, 'h:mm a'), min: Math.round(sec / 60) };
  }).filter(Boolean);
  if (!slots.length) return null;
  return { day: Utilities.formatDate(day, tz, 'EEE, MMM d'), slots: slots, hasTraffic: hasTraffic };
}

// ----- road advisories: constructions, closures, reblocking (kept by the team in a sheet) -----
function getAdvisorySheet_() {
  var ss = dmSs_();
  var sh = ss.getSheetByName(ADVISORY_TAB);
  if (!sh) {
    sh = ss.insertSheet(ADVISORY_TAB);
    sh.getRange(1, 1, 1, ADVISORY_HEAD.length).setValues([ADVISORY_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 4, sh.getMaxRows() - 1, 2).setNumberFormat('mmm d, yyyy');
    sh.getRange(1, 9).setValue('Add one row per road work or closure. Latitude/Longitude fill in automatically from Road / Location. '
      + 'Blank dates mean open-ended. Rows within ' + ADVISORY_RADIUS_KM + ' km of a route show in its route review.');
  }
  return sh;
}

function advisoryUrl_() {
  try {
    return 'https://docs.google.com/spreadsheets/d/' + DRIVER_MATRIX_ID + '/edit#gid=' + getAdvisorySheet_().getSheetId();
  } catch (e) { return ''; }
}

// Advisories in effect on the proposal date within ADVISORY_RADIUS_KM of the route points
function matchAdvisories_(pts, proposalDate) {
  if (!pts.length) return [];
  var sh = getAdvisorySheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, ADVISORY_HEAD.length).getValues();
  var tz = 'Asia/Manila';
  var onKey = proposalDate || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var geocoded = 0, out = [];
  values.forEach(function (v, i) {
    var place = String(v[1] || '').trim();
    if (!place) return;
    var startKey = v[3] instanceof Date ? Utilities.formatDate(v[3], tz, 'yyyy-MM-dd') : '';
    var endKey = v[4] instanceof Date ? Utilities.formatDate(v[4], tz, 'yyyy-MM-dd') : '';
    if ((startKey && onKey < startKey) || (endKey && onKey > endKey)) return;
    var lat = Number(v[5]), lng = Number(v[6]);
    if (!(lat && lng) && geocoded < 10) {      // fill in the location once, then it is kept in the sheet
      geocoded++;
      var g = Maps.newGeocoder().setRegion('ph').geocode(place + ', Philippines');
      if (g && g.status === 'OK' && g.results.length) {
        lat = g.results[0].geometry.location.lat;
        lng = g.results[0].geometry.location.lng;
        sh.getRange(i + 2, 6, 1, 2).setValues([[lat, lng]]);
      }
    }
    if (!(lat && lng)) return;
    var km = distanceToPath_({ lat: lat, lng: lng }, pts);
    if (km <= ADVISORY_RADIUS_KM) {
      out.push({ type: String(v[0] || 'Advisory'), place: place, details: String(v[2] || ''),
                 start: startKey, end: endKey, km: Math.round(km * 100) / 100 });
    }
  });
  return out.sort(function (a, b) { return a.km - b.km; }).slice(0, 12);
}

// Shortest distance (km) from a point to a path of [lat, lng] points
function distanceToPath_(p, pts) {
  var best = Infinity;
  var kx = 111.32 * Math.cos(p.lat * Math.PI / 180), ky = 110.57;   // km per degree near the point
  for (var i = 0; i < pts.length; i++) {
    var ax = (pts[i][1] - p.lng) * kx, ay = (pts[i][0] - p.lat) * ky;
    if (i + 1 < pts.length) {
      var bx = (pts[i + 1][1] - p.lng) * kx, by = (pts[i + 1][0] - p.lat) * ky;
      var dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      var t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      best = Math.min(best, Math.sqrt(Math.pow(ax + t * dx, 2) + Math.pow(ay + t * dy, 2)));
    } else {
      best = Math.min(best, Math.sqrt(ax * ax + ay * ay));
    }
  }
  return best;
}

// Google's encoded polyline format → [[lat, lng], ...]
function decodePolyline_(str) {
  var i = 0, lat = 0, lng = 0, out = [];
  str = String(str || '');
  while (i < str.length) {
    var b, shift = 0, res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (res & 1) ? ~(res >> 1) : (res >> 1);
    shift = 0; res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (res & 1) ? ~(res >> 1) : (res >> 1);
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

// Route map for the internal cost sheet: Manila Port (A) to the client (B), route in 2C red.
// Returns a data: URL, or '' if the map can't be drawn (the proposal still works without it).
// width/height: 640×360 for the internal cost sheet, a wide 640×200 strip for the one-page client proposal.
function routeMapImage_(routeMap, width, height) {
  if (!routeMap || !routeMap.polyline) return '';
  try {
    var map = Maps.newStaticMap()
      .setSize(width || 640, height || 360)
      .setMapType(Maps.StaticMap.Type.ROADMAP)
      .setLanguage('en');
    try { map.setPathStyle(5, '0xD93126', null); } catch (e) { /* default path style */ }
    map.addPath(routeMap.polyline);
    if (routeMap.start) {
      map.setMarkerStyle(Maps.StaticMap.MarkerSize.MID, '0x17191D', 'A');
      map.addMarker(routeMap.start.lat, routeMap.start.lng);
    }
    if (routeMap.end) {
      map.setMarkerStyle(Maps.StaticMap.MarkerSize.MID, '0xD93126', 'B');
      map.addMarker(routeMap.end.lat, routeMap.end.lng);
    }
    var blob = map.getBlob();
    return 'data:' + (blob.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    console.error('Route map failed: ' + e.message);
    return '';
  }
}

// Turns proposal HTML into a PDF blob. Used for downloads and for the copies saved to Drive.
function pdfBlob_(htmlContent, fileName) {
  // Print version: white paper, 2C black and red. Sized to keep the client proposal on one A4 page.
  // Floats instead of flexbox: the Apps Script PDF renderer handles floats more reliably.
  var style = "<style>" +
    "@page { size: A4; margin: 12mm 14mm; }" +
    "body { font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #17191D; background: #ffffff; font-size: 11px; }" +
    ".creative-receipt { border-top: 4px solid #D93126; padding-top: 12px; }" +
    ".doc-head { width: 100%; border-collapse: collapse; margin-bottom: 10px; }" +
    ".doc-head td { padding: 0; vertical-align: middle; }" +
    ".dh-logo { width: 120px; }" +
    ".dh-text { text-align: right; }" +
    ".brand-logo { width: 112px; height: auto; display: block; }" +
    ".badge { display: inline-block; background: #FFF7EA; color: #B45309; border: 1px solid #F2C46B; font-size: 9px; font-weight: bold; padding: 2px 8px; border-radius: 8px; margin-bottom: 4px; }" +
    ".receipt-title { font-family: Georgia, 'Times New Roman', serif; font-size: 22px; color: #17191D; }" +
    ".receipt-company { font-size: 12px; font-weight: bold; color: #17191D; margin-top: 2px; }" +
    ".receipt-contact { font-size: 10px; color: #454A52; }" +
    ".receipt-date { font-size: 10px; color: #6B7079; }" +
    ".encl-lead { font-size: 10px; color: #454A52; margin-top: 2px; }" +
    ".encl-list { margin: 3px 0 0; padding-left: 16px; font-size: 10.5px; color: #17191D; line-height: 1.5; }" +
    ".terms-list { margin: 3px 0 0; padding-left: 16px; font-size: 9.5px; color: #454A52; line-height: 1.45; }" +
    ".terms-list li { margin-bottom: 2px; }" +
    ".receipt-route { font-weight: bold; font-size: 12px; color: #17191D; background: #FDECEA; border-left: 3px solid #D93126; padding: 7px 10px; margin-bottom: 4px; }" +
    ".route-meta { font-size: 10px; font-weight: normal; color: #454A52; margin-top: 1px; }" +
    ".receipt-meta { font-size: 10px; color: #6B7079; margin-bottom: 6px; }" +
    ".section-label { font-family: Georgia, 'Times New Roman', serif; font-size: 14px; color: #D93126; margin-top: 12px; margin-bottom: 1px; }" +
    ".receipt-row { padding: 5px 0; border-bottom: 1px dashed #D6D3D1; clear: both; overflow: hidden; font-size: 11px; }" +
    ".receipt-row > span:nth-child(1) { float: left; color: #454A52; }" +
    ".receipt-row > span:nth-child(2) { float: right; font-weight: bold; color: #17191D; }" +
    ".line-item > span:nth-child(1) { width: 76%; }" +
    ".li-label { display: block; font-weight: bold; color: #17191D; }" +
    ".li-formula { display: block; font-size: 9.5px; color: #454A52; margin-top: 1px; line-height: 1.4; }" +
    ".li-formula b { color: #17191D; }" +
    ".bold { border-bottom: 1px solid #8A8F96; padding-top: 7px; margin-top: 2px; }" +
    ".bold > span:nth-child(1) { color: #17191D; font-weight: bold; }" +
    ".income > span:nth-child(2) { color: #0F7B55; }" +
    ".warn > span:nth-child(2) { color: #B45309; }" +
    ".total { border-bottom: 0; border-top: 2px solid #17191D; padding-top: 8px; margin-top: 8px; }" +
    ".total > span:nth-child(1) { color: #17191D; font-weight: bold; font-size: 11.5px; padding-top: 5px; }" +
    ".total > span:nth-child(2) { font-family: Georgia, 'Times New Roman', serif; color: #D93126; font-weight: normal; font-size: 20px; }" +
    ".total.warn > span:nth-child(2) { color: #B45309; }" +
    ".note { margin-top: 10px; font-size: 10px; color: #454A52; background: #F7F7F8; border-left: 2px solid #D93126; padding: 7px 10px; line-height: 1.45; }" +
    ".note.warn-note { border-left-color: #B45309; background: #FFF7EA; color: #7C3A06; }" +
    ".route-map { margin: 8px 0 2px; page-break-inside: avoid; }" +
    ".route-map img { display: block; width: 100%; height: auto; border: 1px solid #D6D3D1; }" +
    ".client-map { margin: 6px 0 0; page-break-inside: avoid; }" +
    ".client-map img { display: block; width: 100%; height: auto; border: 1px solid #D6D3D1; }" +
    ".client-map .route-map-cap { margin-top: 2px; }" +
    ".route-map-cap { margin-top: 3px; font-size: 9px; color: #6B7079; }" +
    ".review-grid { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10px; }" +
    ".review-grid td { padding: 4px 6px 4px 0; vertical-align: top; color: #454A52; border-bottom: 1px dashed #D6D3D1; }" +
    ".review-grid td.k { width: 34%; color: #6B7079; }" +
    ".review-grid td.v b { color: #17191D; }" +
    ".mix-row { clear: both; overflow: hidden; margin-top: 4px; font-size: 10px; color: #454A52; }" +
    ".mix-label { float: left; width: 30%; }" +
    ".mix-bar { float: left; width: 48%; height: 7px; margin-top: 4px; background: #EEECEB; }" +
    ".mix-bar span { display: block; height: 7px; background: #D93126; }" +
    ".mix-bar span.alt { background: #17191D; }" +
    ".mix-val { float: right; width: 20%; text-align: right; font-weight: bold; color: #17191D; }" +
    ".flag-list { margin: 6px 0 0; padding-left: 16px; font-size: 10px; color: #454A52; }" +
    ".review-sub { margin: 9px 0 2px; font-size: 10px; font-weight: bold; color: #17191D; }" +
    ".elev-profile { height: 46px; overflow: hidden; margin-top: 4px; border-bottom: 1px solid #8A8F96; }" +
    ".elev-col { float: left; height: 46px; }" +
    ".elev-col span { display: block; }" +
    ".elev-col span.bar { background: #D93126; margin-right: 1px; }" +
    ".elev-axis { clear: both; overflow: hidden; font-size: 8.5px; color: #6B7079; margin-top: 2px; }" +
    ".elev-axis span { float: left; } .elev-axis span.r { float: right; }" +
    ".traffic-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10px; }" +
    ".traffic-table td { padding: 3px 6px 3px 0; border-bottom: 1px dashed #D6D3D1; color: #454A52; }" +
    ".traffic-table tr.best td { color: #0F7B55; font-weight: bold; }" +
    ".traffic-table tr.worst td { color: #B45309; font-weight: bold; }" +
    ".adv { margin-top: 4px; padding: 4px 6px; font-size: 10px; color: #454A52; border-left: 2px solid #B45309; background: #FFF7EA; }" +
    ".adv b { color: #17191D; }" +
    ".review-link { font-size: 10px; color: #D93126; }" +
    ".rate-table { width: 100%; margin-top: 12px; border-collapse: collapse; font-size: 10px; }" +
    ".rate-table th { padding: 4px 6px; text-align: left; font-size: 9px; color: #6B7079; border-bottom: 1px solid #8A8F96; }" +
    ".rate-table td { padding: 4px 6px; color: #454A52; border-bottom: 1px solid #E7E5E4; }" +
    ".rate-table tr.applied td { color: #17191D; font-weight: bold; background: #FDECEA; }" +
    ".rate-table tr.applied td:first-child { border-left: 3px solid #D93126; }" +
    ".table-note { margin-top: 5px; font-size: 9px; color: #6B7079; line-height: 1.4; }" +
    ".signoff { margin-top: 14px; page-break-inside: avoid; }" +
    ".terms-sign { width: 100%; border-collapse: collapse; margin-top: 2px; page-break-inside: avoid; }" +
    ".terms-sign td { padding: 0; vertical-align: bottom; }" +
    ".terms-sign td.ts-terms { vertical-align: top; padding-right: 16px; }" +
    ".terms-sign td.ts-sign { width: 200px; }" +
    ".terms-sign .signoff { margin-top: 0; }" +
    ".rate-split { width: 100%; border-collapse: collapse; margin-top: 10px; }" +
    ".rate-split td.rs-l, .rate-split td.rs-r { width: 50%; padding: 0; vertical-align: top; }" +
    ".rate-split td.rs-l { padding-right: 6px; } .rate-split td.rs-r { padding-left: 6px; }" +
    ".rate-split .rate-table { margin-top: 0; font-size: 9.5px; }" +
    ".rate-split .rate-table th { font-size: 8.5px; }" +
    ".rate-split .rate-table td { padding: 3px 5px; }" +
    ".signoff-lead { font-size: 10.5px; color: #454A52; }" +
    ".sig-line { width: 190px; min-height: 32px; border-bottom: 1px solid #17191D; }" +
    ".sig-img { display: block; height: 56px; width: auto; margin: 0 0 -8px 22px; }" +
    ".sig-name { margin-top: 4px; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; color: #17191D; }" +
    ".sig-role { margin-top: 1px; font-size: 9.5px; color: #454A52; }" +
    "</style>";

  var fullHtml = "<html><head>" + style + "</head><body><div class='creative-receipt'>" + htmlContent + "</div></body></html>";
  return Utilities.newBlob(fullHtml, MimeType.HTML, 'proposal.html')
    .getAs(MimeType.PDF)
    .setName(fileName || '2C_Trucking_Proposal.pdf');
}

// Called by the app's Download PDF button for the internal cost sheet.
function generatePDFProposal(htmlContent) {
  var blob = pdfBlob_(htmlContent);
  return "data:application/pdf;base64," + Utilities.base64Encode(blob.getBytes());
}

// Called by the app for the client proposal: the proposal page as a PDF, plus the brokerage's MOA and/or
// Truck Agreement when they are ticked. The app joins them into one PDF in the browser.
// opts: { brokerId, includeMoa, includeTruck, newId, revisionOf }. With newId, a proposal ID is created and
// put in place of __REF__ in the HTML (the app then saves the proposal under that ID).
// Returns { id, pdf (base64), docs: { moa, truck } (base64), missing: [labels not in Drive] }.
function renderProposalPdf(htmlContent, opts) {
  opts = opts || {};
  var id = opts.newId ? newProposalId_(ID_RE.test(String(opts.revisionOf || '')) ? String(opts.revisionOf) : '') : '';
  var html = String(htmlContent || '');
  if (id) html = html.split('__REF__').join(id);
  var out = { id: id, pdf: Utilities.base64Encode(pdfBlob_(html).getBytes()), docs: {}, missing: [] };
  var want = [];
  if (opts.includeMoa) want.push('moa');
  if (opts.includeTruck) want.push('truck');
  if (want.length) {
    var found = opts.brokerId ? findRow_(brokersSheet_(), BROKER_HEAD.length, opts.brokerId) : null;
    want.forEach(function (k) {
      var doc = BROKER_DOCS[k];
      var fid = found ? found.v[doc.col - 1] : '';
      if (!fid) { out.missing.push(doc.label); return; }
      try {
        out.docs[k] = Utilities.base64Encode(DriveApp.getFileById(fid).getBlob().getBytes());
      } catch (e) {
        console.error('Could not read ' + doc.label + ' ' + fid + ': ' + e.message);
        out.missing.push(doc.label);
      }
    });
  }
  return out;
}

// ---------- Email the client proposal to the brokerage ----------
// The web app runs as the person using it ("Execute as: User accessing the web app"), so the email is sent from
// that person's own Google account; "Send me a copy" goes to that same account.
// req: { proposalId, to, cc, subject, body, copyMe, fileName, clientHtml }
// The attachment is the client proposal PDF saved in Drive (with any enclosed MOA / Truck Agreement);
// if that copy can't be read, a fresh PDF is made from clientHtml.
function emailProposal(req) {
  req = req || {};
  var to = cleanEmails_(req.to);
  if (!to.length) throw new Error('Enter the email address to send to.');
  var cc = cleanEmails_(req.cc);
  var subject = clean_(req.subject, 200);
  if (!subject) throw new Error('Enter a subject.');
  var body = String(req.body || '').replace(/\r/g, '').trim().slice(0, 6000);
  var id = String(req.proposalId || '');
  if (!ID_RE.test(id)) throw new Error('Save the proposal first, then email it.');
  var fileName = String(req.fileName || '').replace(/[^A-Za-z0-9._-]/g, '_') || 'Trailer_Rate_Proposal_' + id + '.pdf';

  var sheet = getProposalSheet_();
  var rowNum = proposalRow_(sheet, id);
  var blob = null;
  if (rowNum && sheet.getLastColumn() >= COL_PDF_CLIENT) {
    var m = String(sheet.getRange(rowNum, COL_PDF_CLIENT).getValue() || '').match(/\/d\/([-\w]+)/);
    if (m) {
      try { blob = DriveApp.getFileById(m[1]).getBlob(); }
      catch (e) { console.error('Saved PDF not readable, making a fresh one: ' + e.message); }
    }
  }
  if (!blob && req.clientHtml) blob = pdfBlob_(String(req.clientHtml), fileName);
  if (!blob) throw new Error("The proposal's PDF was not found in Drive. Save the proposal again, then email it.");
  blob.setName(fileName);

  var logo = brandLogoBlob_();
  var who = signatory_();
  var mail = {
    to: to.join(','),
    subject: subject,
    body: body + '\n\nSincerely,\n' + who.name + '\n' + [who.title, who.company].filter(Boolean).join(', '),
    htmlBody: emailHtml_(body, !!logo, who),
    attachments: [blob],
    name: who.company || '2C Trucking'
  };
  if (cc.length) mail.cc = cc.join(',');
  if (req.copyMe) { var me = Session.getEffectiveUser().getEmail(); if (me) mail.bcc = me; }
  if (logo) mail.inlineImages = { logo: logo };
  MailApp.sendEmail(mail);

  var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var status = '';
  if (rowNum) {
    ensureProposalHeaders_(sheet);
    var cell = sheet.getRange(rowNum, COL_EMAILED);
    var prev = String(cell.getValue() || '');
    cell.setValue((prev ? prev + '\n' : '') + when + ' to ' + to.join(', '));
    // A Draft that has been emailed is now Sent (Accepted / Declined are left alone)
    status = String(sheet.getRange(rowNum, COL_STATUS).getValue() || 'Draft');
    if (status === 'Draft' || status === 'Expired' || STATUSES.indexOf(status) < 0) {
      status = 'Sent';
      sheet.getRange(rowNum, COL_STATUS, 1, 2).setValues([[status, stamp_()]]);
    }
  }
  return { to: to.join(', '), at: when, status: status };
}

// "a@x.com, b@y.com" → ['a@x.com', 'b@y.com']; a bad address stops the send with a clear message
function cleanEmails_(s) {
  return String(s || '').split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) throw new Error('Check this email address: ' + x);
    return x;
  });
}

// Row number of a saved proposal in the Proposals sheet, or 0
function proposalRow_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 1 || sheet.getLastColumn() < COL_PROPOSAL_ID) return 0;
  var ids = sheet.getRange(1, COL_PROPOSAL_ID, last, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(id)) return i + 1;
  return 0;
}

// The 2C logo from Logo.html (a data: image) for the email header, or null if it isn't one
function brandLogoBlob_() {
  try {
    var m = HtmlService.createHtmlOutputFromFile('Logo').getContent().match(/src="data:(image\/[a-z+.-]+);base64,([^"]+)"/i);
    return m ? Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'logo') : null;
  } catch (e) { return null; }
}

// The message as a simple branded email: white card, red top bar, the text, the sign-off from Settings
function emailHtml_(body, hasLogo, who) {
  who = who || signatory_();
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var paragraphs = body.split(/\n{2,}/).map(function (p) {
    return '<p style="margin:0 0 14px">' + esc(p).replace(/\n/g, '<br>') + '</p>';
  }).join('');
  return '<div style="background:#F7F1F0;padding:28px 12px;font-family:Helvetica,Arial,sans-serif;color:#17191D;font-size:14px;line-height:1.55">'
    + '<div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;border-top:4px solid #D93126;padding:26px 28px">'
    + (hasLogo ? '<img src="cid:logo" alt="' + esc(who.company) + '" style="display:block;height:48px;width:auto;margin-bottom:18px">'
               : '<div style="font-size:22px;font-weight:bold;color:#D93126;margin-bottom:18px">' + esc(who.company) + '</div>')
    + paragraphs
    + '<p style="margin:22px 0 0">Sincerely,</p>'
    + '<p style="margin:14px 0 0;font-family:Georgia,\'Times New Roman\',serif;font-size:19px">' + esc(who.name) + '</p>'
    + '<p style="margin:2px 0 0;color:#454A52;font-size:12.5px">' + esc([who.title, who.company].filter(Boolean).join(', ')) + '</p>'
    + '</div></div>';
}

// Which documents a saved proposal included, for the Proposals sheet
function enclosureText_(record) {
  var out = [];
  if (record.includeMoa) out.push('MOA');
  if (record.includeTruck) out.push('Truck Agreement');
  return out.join(', ');
}

// RUN THIS ONCE from the Apps Script editor (select authorizeDrive, then Run) and allow access.
// It grants the Drive and email permissions the app needs and creates both Drive folders.
// (The web app runs as the person using it, so each person is also asked to allow access the first time they open it.)
function authorizeDrive() {
  var folder = getProposalFolder_();
  var agreements = getAgreementFolder_();
  Logger.log('Drive access OK. Saved PDFs go to: ' + folder.getName() + '  ' + folder.getUrl());
  Logger.log('Uploaded MOAs and Truck Agreements go to: ' + agreements.getName() + '  ' + agreements.getUrl());
  Logger.log('Email OK. Proposals are emailed from ' + Session.getEffectiveUser().getEmail()
    + ' (' + MailApp.getRemainingDailyQuota() + ' emails left today).');
}

// The Drive folder for saved PDFs. Its ID is remembered, so renaming or moving the folder is fine.
function getProposalFolder_() { return sharedOrOwnFolder_('proposal_folder_id', 'PROPOSAL_FOLDER_ID', PROPOSAL_FOLDER_NAME); }

// A shared folder from Settings when one is set (everyone's files in one place), otherwise the person's own
function sharedOrOwnFolder_(settingKey, propKey, name) {
  var id = String(settings_()[settingKey] || '').trim();
  if (id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) { throw new Error('The shared Drive folder set in Settings could not be opened. Check the folder ID and that it is shared with you.'); }
  }
  return namedFolder_(propKey, name);
}

// The app runs as the person using it, so a PDF one person saves lives in that person's Drive. Sharing it
// "anyone with the link can view" lets another person's session attach or merge it. The links only appear
// in the app's own sheets. Remove the call to shareForApp_ if you would rather share folders by hand.
function shareForApp_(file) {
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { console.error('Could not share ' + file.getName() + ': ' + e.message); }
}

// A Drive folder found by its remembered ID, or by name, or created. The ID is kept per person
// (user properties), since each person's files are in their own Drive.
function namedFolder_(propKey, name) {
  var props = PropertiesService.getUserProperties();
  var id = props.getProperty(propKey);
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) { /* folder deleted or no access: find or create it again */ }
  }
  var found = DriveApp.getFoldersByName(name);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(name);
  props.setProperty(propKey, folder.getId());
  return folder;
}

// ---------- Saved proposals (shown in the app's "Proposals" tab) ----------
// Proposals sheet columns A–AI hold the figures; AJ = Proposal ID, AK = full proposal (JSON),
// so a saved proposal can be reopened exactly as it was generated.
var COL_PROPOSAL_ID = 36;   // AJ
var COL_RECORD_JSON = 37;   // AK
var COL_PDF_CLIENT = 38;    // AL  link to the saved client proposal PDF
var COL_PDF_INTERNAL = 39;  // AM  link to the saved internal cost sheet PDF
var COL_CLIENT = 41;        // AO  client (delivery point); column C holds the broker
var COL_EMAILED = 46;       // AT  when and to whom the proposal was emailed (one line per send)
var COL_PREPARED_BY = 47;   // AU  email of the person who generated it
var COL_VALID_UNTIL = 48;   // AV  validity date (yyyy-mm-dd)
var COL_STATUS = 49;        // AW  Draft | Sent | Accepted | Declined | Expired
var COL_STATUS_CHANGED = 50;// AX  when and who last set the status
var COL_REVISION_OF = 51;   // AY  the proposal this one revises
var COL_SUPERSEDED_BY = 52; // AZ  the newer revision that replaced this one
var COL_DISPATCH = 53;      // BA  dispatch order (JSON)
var COL_LAST = 53;
var STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'];
var ID_RE = /^2C-\d{6}-\d{6}(-R\d+)?$/;

function getProposalSheet_() {
  var ss = openShared_(SHEET_ID, 'proposals');
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

// Fills in headers for the newer columns when row 1 is a header row and they are blank.
function ensureProposalHeaders_(sheet) {
  if (sheet.getLastRow() < 1) return;
  var a1 = sheet.getRange(1, 1).getValue();
  if (a1 instanceof Date || a1 === '') return;
  var extra = { 34: 'Fuel Efficiency (km/L)', 35: 'Maintenance per Km (PHP)', 36: 'Proposal ID', 37: 'Proposal (JSON)',
                38: 'Client Proposal PDF', 39: 'Internal Cost Sheet PDF', 40: 'Toll Route (Class 3)',
                41: 'Client', 42: 'Broker ID', 43: 'Client ID', 44: 'Address ID', 45: 'Enclosed Documents', 46: 'Emailed',
                47: 'Prepared By', 48: 'Valid Until', 49: 'Status', 50: 'Status Changed', 51: 'Revision Of',
                52: 'Superseded By', 53: 'Dispatch Order' };
  if (sheet.getMaxColumns() < COL_LAST) sheet.insertColumnsAfter(sheet.getMaxColumns(), COL_LAST - sheet.getMaxColumns());
  var n = COL_LAST - 34 + 1;
  var cur = sheet.getRange(1, 34, 1, n).getValues()[0];
  for (var i = 0; i < n; i++) {
    if (cur[i] === '') sheet.getRange(1, 34 + i).setValue(extra[34 + i]).setFontWeight('bold');
  }
}

// New reference number. For a revision, the base number plus -R2, -R3, … (one more than the revisions so far).
function newProposalId_(revisionOf) {
  if (!revisionOf) return '2C-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd-HHmmss');
  var base = String(revisionOf).replace(/-R\d+$/, '');
  var sheet = getProposalSheet_();
  var last = sheet.getLastRow(), n = 1;
  if (last >= 1 && sheet.getLastColumn() >= COL_PROPOSAL_ID) {
    sheet.getRange(1, COL_PROPOSAL_ID, last, 1).getValues().forEach(function (r) {
      var m = String(r[0]).match(/-R(\d+)$/);
      if (String(r[0]).indexOf(base) === 0 && m) n = Math.max(n, Number(m[1]));
    });
  }
  return base + '-R' + (n + 1);
}

// Draft and Sent proposals past their validity date count as Expired
function effectiveStatus_(status, validUntil, supersededBy) {
  status = STATUSES.indexOf(status) >= 0 ? status : 'Draft';
  if (supersededBy) return 'Revised';
  if ((status === 'Draft' || status === 'Sent') && validUntil && validUntil < dateKey_(new Date())) return 'Expired';
  return status;
}

function stamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + ' · ' + (Session.getActiveUser().getEmail() || 'app');
}

// Called by the app's Proposals tab: sets Draft / Sent / Accepted / Declined / Expired by hand.
function setProposalStatus(id, status) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status.');
  var sheet = getProposalSheet_();
  var rowNum = proposalRow_(sheet, id);
  if (!rowNum) throw new Error('Proposal ' + id + ' was not found.');
  ensureProposalHeaders_(sheet);
  sheet.getRange(rowNum, COL_STATUS, 1, 2).setValues([[status, stamp_()]]);
  return { id: id, status: status, changed: stamp_() };
}

// Called by the app: removes a saved proposal for good. Its row goes, its two PDFs go to the Drive trash,
// its dispatch order line goes, and a proposal it had replaced is no longer marked as replaced.
function deleteProposal(id) {
  if (!ID_RE.test(String(id || ''))) throw new Error('Unknown proposal.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getProposalSheet_();
    var rowNum = proposalRow_(sheet, id);
    if (!rowNum) throw new Error('Proposal ' + id + ' was not found. It may already be deleted.');
    var width = Math.min(COL_LAST, sheet.getLastColumn());
    var row = sheet.getRange(rowNum, 1, 1, width).getValues()[0];
    var col = function (c) { return width >= c ? row[c - 1] : ''; };
    [col(COL_PDF_CLIENT), col(COL_PDF_INTERNAL)].forEach(function (url) {
      var m = String(url || '').match(/\/d\/([-\w]+)/);
      if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { /* already gone or not ours */ } }
    });
    var revisionOf = String(col(COL_REVISION_OF) || '');
    sheet.deleteRow(rowNum);
    if (revisionOf) {
      var prev = proposalRow_(sheet, revisionOf);
      if (prev && String(sheet.getRange(prev, COL_SUPERSEDED_BY).getValue()) === id) sheet.getRange(prev, COL_SUPERSEDED_BY).clearContent();
    }
    var tab = openShared_(SHEET_ID, 'proposals').getSheetByName(DISPATCH_TAB);
    if (tab && tab.getLastRow() >= 2) {
      var ids = tab.getRange(2, 2, tab.getLastRow() - 1, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) tab.deleteRow(i + 2);
    }
    return { id: id, restoredPrevious: revisionOf };
  } finally {
    lock.releaseLock();
  }
}

// Called by the app: a dispatch order for an accepted proposal (driver, plates, schedule), kept on the row
// and on a "Dispatch Orders" tab. dispatch: { driver, driverContact, truckPlate, trailerPlate, container,
// pickup, delivery, notes, status }
var DISPATCH_TAB = 'Dispatch Orders';
var DISPATCH_HEAD = ['Saved', 'Proposal ID', 'Brokerage', 'Client', 'Destination', 'Driver', 'Driver Contact', 'Truck Plate',
                     'Trailer Plate', 'Container No.', 'Pickup', 'Delivery', 'Trip Rate (PHP)', 'Status', 'Notes', 'Prepared By'];
function saveDispatch(id, dispatch) {
  dispatch = dispatch || {};
  var d = {
    driver: clean_(dispatch.driver, 120), driverContact: clean_(dispatch.driverContact, 60),
    truckPlate: clean_(dispatch.truckPlate, 30), trailerPlate: clean_(dispatch.trailerPlate, 30),
    container: clean_(dispatch.container, 60), pickup: clean_(dispatch.pickup, 40), delivery: clean_(dispatch.delivery, 40),
    notes: String(dispatch.notes || '').replace(/\r/g, '').trim().slice(0, 1000),
    status: ['Scheduled', 'En route', 'Delivered', 'Cancelled'].indexOf(dispatch.status) >= 0 ? dispatch.status : 'Scheduled',
    savedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
    savedBy: Session.getActiveUser().getEmail()
  };
  if (!d.driver) throw new Error('Enter the driver\'s name.');
  if (!d.truckPlate) throw new Error('Enter the truck plate number.');
  if (!d.pickup) throw new Error('Enter the pickup date and time.');
  var sheet = getProposalSheet_();
  var rowNum = proposalRow_(sheet, id);
  if (!rowNum) throw new Error('Proposal ' + id + ' was not found.');
  ensureProposalHeaders_(sheet);
  var row = sheet.getRange(rowNum, 1, 1, COL_LAST).getValues()[0];
  sheet.getRange(rowNum, COL_DISPATCH).setValue(JSON.stringify(d));
  // One line per dispatch on the Dispatch Orders tab (the latest version of each proposal's order)
  var ss = openShared_(SHEET_ID, 'proposals');
  var tab = ss.getSheetByName(DISPATCH_TAB);
  if (!tab) {
    tab = ss.insertSheet(DISPATCH_TAB);
    tab.getRange(1, 1, 1, DISPATCH_HEAD.length).setValues([DISPATCH_HEAD]).setFontWeight('bold');
    tab.setFrozenRows(1);
  }
  var line = [d.savedAt, id, row[2], row[COL_CLIENT - 1], row[4], d.driver, d.driverContact, d.truckPlate, d.trailerPlate,
              d.container, d.pickup, d.delivery, Number(row[18]) || 0, d.status, d.notes, d.savedBy];
  var ids = tab.getLastRow() >= 2 ? tab.getRange(2, 2, tab.getLastRow() - 1, 1).getValues() : [];
  var existing = 0;
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) existing = i + 2;
  if (existing) tab.getRange(existing, 1, 1, line.length).setValues([line]);
  else tab.appendRow(line);
  return d;
}

// pdfs: { clientHtml, internalHtml } rendered by the app. '__REF__' in them becomes the proposal ID.
// When the client proposal includes the MOA or Truck Agreement, the app sends the finished, merged
// client PDF as pdfs.clientPdf (base64) instead of clientHtml, with record.proposalId already set
// from renderProposalPdf.
function saveToDatabase(record, pdfs) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getProposalSheet_();
    ensureProposalHeaders_(sheet);
    var rc = record.rateCard || {};
    var givenId = String(record.proposalId || '');
    var revisionOf = ID_RE.test(String(record.revisionOf || '')) ? String(record.revisionOf) : '';
    record.revisionOf = revisionOf;
    record.proposalId = ID_RE.test(givenId) ? givenId : newProposalId_(revisionOf);
    record.savedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    record.status = 'Draft';
    if (!record.preparedBy) record.preparedBy = Session.getActiveUser().getEmail();

    // Save both PDFs to Drive first, so the sheet row can link to them.
    // If Drive fails, the proposal is still saved and the app says the PDFs weren't.
    var pdfError = '';
    if (pdfs && (pdfs.clientHtml || pdfs.clientPdf) && pdfs.internalHtml) {
      try {
        var folder = getProposalFolder_();
        var client = String(record.companyName || 'Client').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
        var base = record.proposalId + ' - ' + client + ' - ' + (record.destination || '');
        var clientBlob = pdfs.clientPdf
          ? Utilities.newBlob(Utilities.base64Decode(pdfs.clientPdf), MimeType.PDF, base + ' - Rate Proposal.pdf')
          : pdfBlob_(pdfs.clientHtml.split('__REF__').join(record.proposalId), base + ' - Rate Proposal.pdf');
        var clientFile = folder.createFile(clientBlob);
        var internalFile = folder.createFile(pdfBlob_(pdfs.internalHtml.split('__REF__').join(record.proposalId),
          base + ' - Internal Cost Sheet.pdf'));
        shareForApp_(clientFile);
        shareForApp_(internalFile);
        record.pdfClientUrl = clientFile.getUrl();
        record.pdfInternalUrl = internalFile.getUrl();
      } catch (e) {
        record.pdfClientUrl = '';
        record.pdfInternalUrl = '';
        pdfError = /permission/i.test(e.message)
          ? 'The app does not have Google Drive access yet. In the Apps Script editor, run authorizeDrive once and allow access.'
          : e.message;
      }
    }

    // Column positions are unchanged so older rows still line up.
    // J (helper) and Z (maintenance %) are left blank.
    sheet.appendRow([
      new Date(),                        // A  Timestamp
      record.proposalDate,               // B
      record.companyName,                // C  Broker (the proposal is prepared for the broker)
      record.source,                     // D  always Manila Port
      record.destination,                // E  Client's delivery address
      record.truckType,                  // F  always Trailer
      record.distance,                   // G  km one way (used)
      record.fuelCost,                   // H  internal fuel cost
      record.driverSalary,               // I
      '',                                // J  (helper, removed)
      record.tollFee,                    // K
      record.additionalExpenses,         // L
      record.totalExpenses,              // M  includes maintenance
      record.adminCost,                  // N
      record.maintCost,                  // O  maintenance cost (fixed + round trip km × ₱/km)
      record.netIncome,                  // P
      record.grossRate,                  // Q  billed rate before VAT
      record.taxAmount,                  // R
      record.finalRate,                  // S
      record.taxType,                    // T  VAT / Non-VAT
      record.pricingModel,               // U  Rate Card
      record.distanceSource,             // V  Google Maps / Manual
      record.fuelConsumption,            // W  internal liters, round trip
      record.fuelPrice,                  // X  diesel ₱/L used (weekly price)
      record.adminPct * 100,             // Y  Admin %
      '',                                // Z  (maintenance %, removed)
      record.netIncomePctActual * 100,   // AA Net Income % (actual)
      rc.baseRate || '',                 // AB Rate card: basic rate
      rc.excessKm || '',                 // AC Rate card: excess km
      rc.variable || '',                 // AD Rate card: variable
      rc.liters || '',                   // AE Rate card: surcharge liters
      rc.fuelSurcharge || '',            // AF Rate card: fuel surcharge (gross rate in Q is after any target-income discount)
      record.driverBracket,              // AG Driver rate matrix bracket used
      record.kmPerLiter,                 // AH Fuel efficiency used (km/L, masterlist bracket)
      record.maintPerKm,                 // AI Maintenance per km used (₱/km, from Settings)
      record.proposalId,                 // AJ Proposal ID
      JSON.stringify(recordForSheet_(record)),  // AK Full proposal, for reopening it in the app
      record.pdfClientUrl || '',         // AL Client proposal PDF (Drive link)
      record.pdfInternalUrl || '',       // AM Internal cost sheet PDF (Drive link)
      tollRouteText_(record.tollRoute),  // AN Toll route used (Class 3)
      record.clientName || '',           // AO Client (delivery point)
      record.brokerId || '',             // AP Broker ID (Masterlist)
      record.clientId || '',             // AQ Client ID (Masterlist)
      record.addressId || '',            // AR Delivery address ID (Client Addresses)
      enclosureText_(record),            // AS Documents added to the client proposal PDF
      '',                                // AT Emailed (filled in by emailProposal)
      record.preparedBy || '',           // AU Prepared by
      record.validUntil || '',           // AV Valid until
      'Draft',                           // AW Status
      stamp_(),                          // AX Status changed
      revisionOf,                        // AY Revision of
      '',                                // AZ Superseded by
      ''                                 // BA Dispatch order
    ]);
    // The proposal being revised now points to this newer version
    if (revisionOf) {
      var prevRow = proposalRow_(sheet, revisionOf);
      if (prevRow) sheet.getRange(prevRow, COL_SUPERSEDED_BY).setValue(record.proposalId);
    }
    return { id: record.proposalId, savedAt: record.savedAt, status: 'Draft', preparedBy: record.preparedBy,
             pdfClientUrl: record.pdfClientUrl || '', pdfInternalUrl: record.pdfInternalUrl || '',
             pdfError: pdfError };
  } catch (error) {
    throw new Error("Failed to save: " + error.message);
  } finally {
    lock.releaseLock();
  }
}

// Sheet cells can come back as Date objects, which google.script.run can't send. Always return text.
function cellDate_(v, pattern) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, Session.getScriptTimeZone(), pattern);
  return v === null || v === undefined ? '' : String(v);
}

// Called by the app's Proposals tab: one line per saved proposal, newest first.
// Rows saved before proposals had an ID (older records with no details) are left out of the list.
function getSavedProposals() {
  var sheet = getProposalSheet_();
  var last = sheet.getLastRow();
  if (last < 1) return [];
  var width = Math.min(COL_LAST, sheet.getLastColumn());
  var values = sheet.getRange(1, 1, last, width).getValues();
  var col = function (r, c) { return width >= c ? r[c - 1] : ''; };
  var out = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var r = values[i];
    if (!(r[0] instanceof Date)) continue;   // skips the header row and blank rows
    var id = String(col(r, COL_PROPOSAL_ID) || '');
    if (!id) continue;
    var validUntil = cellDate_(col(r, COL_VALID_UNTIL), 'yyyy-MM-dd');
    var status = String(col(r, COL_STATUS) || 'Draft');
    var supersededBy = String(col(r, COL_SUPERSEDED_BY) || '');
    var dispatchJson = String(col(r, COL_DISPATCH) || '');
    out.push(withRateWorking_({
      id: id,
      savedAt: cellDate_(r[0], 'yyyy-MM-dd HH:mm'),
      proposalDate: cellDate_(r[1], 'yyyy-MM-dd'),
      companyName: String(r[2] || ''),
      source: String(r[3] || ''),
      destination: String(r[4] || ''),
      distance: Number(r[6]) || 0,
      netIncome: Number(r[15]) || 0,
      grossRate: Number(r[16]) || 0,
      finalRate: Number(r[18]) || 0,
      taxType: String(r[19] || ''),
      netPct: Number(r[26]) || 0,
      pdfClientUrl: String(col(r, COL_PDF_CLIENT) || ''),
      pdfInternalUrl: String(col(r, COL_PDF_INTERNAL) || ''),
      clientName: String(col(r, COL_CLIENT) || ''),
      brokerId: String(col(r, 42) || ''),
      clientId: String(col(r, 43) || ''),
      addressId: String(col(r, 44) || ''),
      // for the client CSV download: the rate card figures shown on the client proposal
      taxAmount: Number(r[17]) || 0,
      baseRate: Number(r[27]) || 0,
      excessKm: Number(r[28]) || 0,
      variable: Number(r[29]) || 0,
      fuelSurcharge: Number(r[31]) || 0,
      liters: Number(r[30]) || 0,
      // internal costs, for the internal CSV
      fuelCost: Number(r[7]) || 0,
      driverSalary: Number(r[8]) || 0,
      tollFee: Number(r[10]) || 0,
      additionalExpenses: Number(r[11]) || 0,
      totalExpenses: Number(r[12]) || 0,
      adminCost: Number(r[13]) || 0,
      maintCost: Number(r[14]) || 0,
      fuelPrice: Number(r[23]) || 0,
      json: String(col(r, COL_RECORD_JSON) || ''),
      emailed: String(col(r, COL_EMAILED) || ''),
      preparedBy: String(col(r, COL_PREPARED_BY) || ''),
      validUntil: validUntil,
      status: STATUSES.indexOf(status) >= 0 ? status : 'Draft',
      effectiveStatus: effectiveStatus_(status, validUntil, supersededBy),
      statusChanged: String(col(r, COL_STATUS_CHANGED) || ''),
      revisionOf: String(col(r, COL_REVISION_OF) || ''),
      supersededBy: supersededBy,
      dispatched: !!dispatchJson,
      dispatchStatus: dispatchJson ? (function () { try { return JSON.parse(dispatchJson).status || 'Scheduled'; } catch (e) { return ''; } })() : ''
    }));
  }
  return out;
}

// Adds the rate working shown on the client proposal (bracket, ₱/km, km/L, benchmark, …) from the saved
// proposal, for the CSV download. Older rows without it keep just the amounts.
function withRateWorking_(p) {
  var json = p.json;
  delete p.json;
  if (!json) return p;
  try {
    var rec = JSON.parse(json), rc = rec.rateCard || {};
    p.rate = {
      podKm: rec.podKm, coveredKm: rc.coveredKm, excessKm: rc.excessKm, variablePerKm: rc.variablePerKm,
      bracketLabel: rc.bracketLabel, distanceMultiplier: rc.distanceMultiplier, kmPerLiter: rc.bracketKmPerLiter,
      liters: rc.liters, fuelPrice: rec.fuelPrice, fuelPriceDate: rec.fuelPriceDate, fuelBenchmark: rc.fuelBenchmark,
      surchargePerLiter: rc.surchargePerLiter, discount: rec.discount || 0, adjustment: rec.adjustment || 0
    };
  } catch (e) { /* unreadable JSON: amounts only */ }
  return p;
}

// Called by the app's Proposals tab when a saved proposal is opened.
// What goes in the sheet's JSON column (cells hold up to 50,000 characters): no map picture, and
// the detailed route line only if it fits (the zoomable map then uses the shorter overview line).
function recordForSheet_(record) {
  var copy = {};
  for (var k in record) if (k !== 'mapImage' && k !== 'mapImageWide') copy[k] = record[k];
  if (copy.routeMap && copy.routeMap.detail && JSON.stringify(copy).length > 45000) {
    copy.routeMap = { polyline: copy.routeMap.polyline, start: copy.routeMap.start, end: copy.routeMap.end };
  }
  return copy;
}

function getSavedProposal(id) {
  if (!id) throw new Error('This proposal was saved before proposals could be reopened.');
  var sheet = getProposalSheet_();
  var last = sheet.getLastRow();
  if (last < 1 || sheet.getLastColumn() < COL_RECORD_JSON) throw new Error('Proposal ' + id + ' was not found.');
  var ids = sheet.getRange(1, COL_PROPOSAL_ID, last, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) {
      var json = sheet.getRange(i + 1, COL_RECORD_JSON).getValue();
      var rec;
      try { rec = JSON.parse(json); }
      catch (e) { throw new Error('Proposal ' + id + ' could not be read from the sheet.'); }
      rec.mapImage = routeMapImage_(rec.routeMap);   // redraw the route maps
      rec.mapImageWide = routeMapImage_(rec.routeMap, 640, 200);
      // Live columns: status, validity, revisions, dispatch and email log as they are now
      if (sheet.getLastColumn() >= COL_LAST) {
        var live = sheet.getRange(i + 1, COL_EMAILED, 1, COL_LAST - COL_EMAILED + 1).getValues()[0];
        rec.emailed = String(live[0] || '');
        rec.preparedBy = String(live[1] || rec.preparedBy || '');
        rec.validUntil = cellDate_(live[2], 'yyyy-MM-dd') || rec.validUntil || '';
        rec.status = STATUSES.indexOf(String(live[3])) >= 0 ? String(live[3]) : 'Draft';
        rec.statusChanged = String(live[4] || '');
        rec.revisionOf = String(live[5] || rec.revisionOf || '');
        rec.supersededBy = String(live[6] || '');
        try { rec.dispatch = live[7] ? JSON.parse(live[7]) : null; } catch (e) { rec.dispatch = null; }
        rec.effectiveStatus = effectiveStatus_(rec.status, rec.validUntil, rec.supersededBy);
      }
      return rec;
    }
  }
  throw new Error('Proposal ' + id + ' was not found. It may have been deleted from the sheet.');
}