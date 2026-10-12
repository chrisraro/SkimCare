/**
 * Slot fillers for templates.ts. Every name, company, address and item is invented;
 * eval-set names (tests/fixtures/contracts.ts) are excluded by surname and by the
 * leakage check. Train and dev draw names, companies, items and services from
 * disjoint pools so dev wording differs from train.
 */
export type Split = 'train' | 'dev';
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

const POOLS = {
  train: {
    first: ['Maricel', 'Rodel', 'Jhunrey', 'Analyn', 'Rowena', 'Arnel', 'Gemma', 'Danilo', 'Liezl', 'Ronaldo', 'Shiela', 'Jomar', 'Kristine', 'Wilfredo', 'Marites', 'Bernard', 'Cherry', 'Edwin', 'Lorna', 'Reynaldo', 'Jocelyn', 'Alvin', 'Precious', 'Noel', 'Rhea', 'Ariel', 'Divina', 'Rommel', 'Charmaine', 'Elmer'],
    last: ['Dumalagan', 'Magbanua', 'Lacsamana', 'Tumulak', 'Sarmiento', 'Evangelista', 'Dimaculangan', 'Macaraeg', 'Panganiban', 'Tolentino', 'Bacani', 'Ilagan', 'Labrador', 'Mangubat', 'Nepomuceno', 'Oliveros', 'Pascual', 'Quiambao', 'Sumulong', 'Tabora', 'Umali', 'Velasco', 'Zamora', 'Abellana', 'Buenaventura', 'Cabrera', 'Dacanay', 'Estrella'],
    coHead: ['Tanglaw', 'Hiyas', 'Kislap', 'Banaag', 'Dagitab', 'Salinlahi', 'Habagat', 'Bulalakaw', 'Kamagong', 'Molave', 'Talisay', 'Kawayan', 'Masigla', 'Liyab', 'Payapa', 'Matatag'],
    coTail: ['Print Shop', 'Builders', 'Trading', 'Appliance Mart', 'Realty', 'Motor Sales', 'Catering Services', 'Digital Studio', 'Events Management', 'Furniture Depot', 'Tutorial Center', 'Enterprises', 'Food Products', 'Freight Services', 'Home Center'],
    item: [
      'one (1) logo in four (4) file formats', 'a 12-page company profile', 'twenty (20) product photos on a white background', 'a three-minute explainer video',
      'four (4) blog articles of 1,000 words each', 'a landing page with a contact form', 'a mascot illustration in two poses', 'the wedding invitation suite',
      'a 30-second radio jingle', 'product labels for three (3) flavors', 'an inventory spreadsheet template', 'a pitch deck of up to 15 slides',
      'transcripts of six (6) recorded interviews', 'a set of eight (8) carousel posts', 'two (2) tarpaulin layouts', 'a company newsletter every month',
      'a payroll computation sheet', 'a printed photo book of 40 pages', 'the packaging design for one (1) product', 'a 10-minute documentary edit',
      'a quarterly sales report', 'an employee handbook draft', 'signage for the store front', 'a product catalog of 24 pages',
    ],
    itemF: [
      'isang logo at tatlong (3) disenyo ng poster', 'mga larawan ng 30 produkto', 'isang video na tatlong (3) minuto ang haba', 'tarpaulin at flyers para sa pagbubukas ng tindahan',
      'mga label ng bote para sa apat (4) na produkto', 'mga sulatin para sa buwanang newsletter', 'imbitasyon para sa binyag', 'katalogo ng mga produkto',
      'mga disenyo ng t-shirt para sa liga', 'listahan ng imbentaryo bawat linggo',
    ],
    service: [
      'bookkeeping and payroll processing', 'daily cleaning of the office', 'IT network maintenance', 'catering for 80 guests', 'home tutoring in Math and Science',
      'event coordination on the wedding day', 'aircon cleaning and maintenance', 'pest control treatment every quarter', 'security guard services', 'delivery of water containers',
    ],
    goods: ['two-door refrigerator', 'front-load washing machine', '55-inch smart TV', 'electric tricycle', 'sofa set', 'split-type air conditioner', 'delivery van', 'chest freezer', 'generator set', 'gaming laptop'],
    goodsF: ['washing machine', 'motorsiklo', 'telebisyon', 'aircon', 'sofa', 'tricycle', 'chest freezer', 'kalan at oven'],
    duty: ['receiving deliveries, counting inventory and cashiering', 'preparing daily sales reports', 'opening and cleaning the store before 8:00 AM', 'cooking lunch for the staff of twelve (12)', 'driving the delivery truck within the city'],
    install: ['CCTV cameras in four (4) areas', 'a water filtration system', 'split-type aircon units in two (2) rooms', 'the office Wi-Fi network', 'a point-of-sale system'],
  },
  dev: {
    first: ['Hermogenes', 'Luzviminda', 'Teodoro', 'Rosalinda', 'Crisanto', 'Marilou', 'Benjie', 'Aurora', 'Dionisio', 'Felicidad', 'Gregorio', 'Honeylyn', 'Isagani', 'Jasmine', 'Kenneth', 'Leonora'],
    last: ['Agbayani', 'Basilio', 'Catacutan', 'Esguerra', 'Fajardo', 'Gonzaga', 'Hilario', 'Katigbak', 'Legaspi', 'Malabanan', 'Nolasco', 'Obando', 'Rosales', 'Soriano'],
    coHead: ['Kalinaw', 'Himig', 'Tikling', 'Dalisay', 'Lakambini', 'Busilak', 'Marilag', 'Sinukuan'],
    coTail: ['Bakery Supply', 'Car Rental', 'Dental Supplies', 'Water Systems', 'Learning Hub', 'Garments', 'Agri Ventures', 'Media Works'],
    item: [
      'a brochure in English and Filipino', 'fifteen (15) recipe videos for short-form platforms', 'a training module on customer service', 'a mobile-friendly order form',
      'a portrait session with ten (10) retouched images', 'a 20-slide investor update', 'event backdrop and photo wall designs', 'a podcast intro and outro',
    ],
    itemF: ['mga larawan para sa kasal', 'isang brochure sa Filipino', 'mga resipe para sa buklet', 'disenyo ng karatula ng tindahan'],
    service: ['lawn and garden upkeep', 'school bus service for two (2) children', 'laundry pick-up and delivery', 'monthly fire extinguisher checks', 'virtual assistant support'],
    goods: ['upright piano', 'electric bicycle', 'commercial oven', 'dining set for six', 'tablet computer', 'kitchen exhaust hood'],
    goodsF: ['electric fan', 'bisikleta', 'kama at kutson', 'cellphone na pang-negosyo'],
    duty: ['answering customer calls and encoding orders', 'cleaning the dental clinic between patients', 'tending the garden and the fishpond'],
    install: ['a rainwater collection tank', 'a kitchen exhaust system', 'motion-sensor lights on two floors'],
  },
} as const;

const CITIES = ['Marikina City', 'Pasig City', 'Cebu City', 'Davao City', 'Iloilo City', 'Bacolod City', 'Cagayan de Oro City', 'Baguio City', 'Antipolo City', 'Lipa City', 'Dumaguete City', 'Tacloban City', 'Naga City', 'Malolos City', 'Calamba City', 'Taguig City', 'Mandaluyong City', 'Las Piñas City'];
const STREETS = ['Mabini St.', 'Rizal Ave.', 'Kalayaan Road', 'Sampaguita St.', 'Narra Lane', 'Ilang-Ilang St.', 'Bonifacio Drive', 'Molave Road'];
const BRGYS = ['San Roque', 'San Isidro', 'Malanday', 'Poblacion', 'Sto. Niño', 'Bagong Silang', 'Mabuhay', 'Maligaya'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const MONTHS_F = ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ROLE_PAIRS = [['Client', 'Contractor'], ['Lessor', 'Lessee'], ['Seller', 'Buyer'], ['Owner', 'Contractor'], ['Employer', 'Employee'], ['Client', 'Consultant'], ['Landlord', 'Tenant'], ['Company', 'Freelancer']] as const;
const ROLE_PAIRS_F = [['May-ari', 'Umuupa'], ['Nagbebenta', 'Mamimili'], ['Kliyente', 'Kontratista'], ['Nagpapaupa', 'Nangungupahan'], ['Amo', 'Empleyado'], ['Kliyente', 'Manggagawa']] as const;

const ROLES: Record<string, readonly string[]> = {
  SP: ['Contractor', 'Freelancer', 'Designer', 'Developer', 'Consultant', 'Writer', 'Photographer', 'Editor', 'Service Provider', 'Videographer', 'Illustrator', 'Agency'],
  CL: ['Client', 'Customer', 'Company'],
  SELLER: ['Seller', 'Vendor', 'Dealer'],
  BUYER: ['Buyer', 'Purchaser'],
  LESSOR: ['Lessor', 'Landlord', 'Owner'],
  LESSEE: ['Lessee', 'Tenant'],
  EMPR: ['Employer', 'Company'],
  EMPE: ['Employee', 'Worker'],
  SP_F: ['Kontratista', 'Freelancer', 'Designer', 'Photographer', 'Manggagawa'],
};

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function words(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${words(n % 100)}` : ''}`;
  if (n < 1_000_000) return `${words(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${words(n % 1000)}` : ''}`;
  return `${words(Math.floor(n / 1_000_000))} million${n % 1_000_000 ? ` ${words(n % 1_000_000)}` : ''}`;
}
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

const FIL_NUM: Record<number, string> = {
  1: 'isang', 2: 'dalawang', 3: 'tatlong', 4: 'apat na', 5: 'limang', 6: 'anim na', 7: 'pitong', 10: 'sampung', 12: 'labindalawang', 14: 'labing-apat na',
  15: 'labinlimang', 18: 'labingwalong', 20: 'dalawampung', 24: 'dalawampu\'t apat na', 30: 'tatlumpung', 36: 'tatlumpu\'t anim na', 45: 'apatnapu\'t limang', 60: 'animnapung', 90: 'siyamnapung',
};

const fmt = (n: number, decimals: boolean) => n.toLocaleString('en-US', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 });

function money(rng: Rng, n: number, fil: boolean): string {
  const r = rng();
  if (fil) {
    if (r < 0.4) return `₱${fmt(n, false)}`;
    if (r < 0.75) return `PHP ${fmt(n, false)}`;
    if (r < 0.9) return `P${fmt(n, rng() < 0.5)}`;
    return `${fmt(n, false)} piso`;
  }
  if (r < 0.32) return `PHP ${fmt(n, rng() < 0.3)}`;
  if (r < 0.52) return `₱${fmt(n, rng() < 0.3)}`;
  if (r < 0.64) return `P${fmt(n, rng() < 0.5)}`;
  if (r < 0.72) return `Php ${fmt(n, false)}`;
  if (r < 0.78) return `PHP${fmt(n, true)}`;
  if (r < 0.86) return `${fmt(n, false)} pesos`;
  return `${titleCase(words(n))} Pesos (PHP ${fmt(n, true)})`;
}

const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);
const AMOUNT: Record<string, (rng: Rng) => number> = {
  AMT_S: (rng) => roundTo(int(rng, 50, 3000), pick(rng, [50, 100, 250])),
  AMT_D: (rng) => roundTo(int(rng, 300, 9000), pick(rng, [50, 100, 500])),
  AMT_H: (rng) => roundTo(int(rng, 150, 2500), pick(rng, [25, 50, 100])),
  AMT_M: (rng) => roundTo(int(rng, 1500, 65000), pick(rng, [100, 250, 500, 1000])),
  /** Prices of goods bought on installment (appliances to vehicles). */
  AMT_G: (rng) => roundTo(Math.round(Math.exp(Math.log(6000) + rng() * (Math.log(1500000) - Math.log(6000)))), pick(rng, [100, 500, 1000])),
  AMT_L: (rng) => roundTo(Math.round(Math.exp(Math.log(20000) + rng() * (Math.log(4500000) - Math.log(20000)))), pick(rng, [500, 1000, 5000])),
};

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

function dateEn(rng: Rng): string {
  const y = int(rng, 2025, 2027);
  const m = int(rng, 0, 11);
  const d = int(rng, 1, 28);
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return pick(rng, [
    `${MONTHS[m]} ${d}, ${y}`,
    `${d} ${MONTHS[m]} ${y}`,
    `${mm}/${dd}/${y}`,
    `${y}-${mm}-${dd}`,
    `${MONTHS_SHORT[m]} ${d}, ${y}`,
    `the ${ordinal(d)} of ${MONTHS[m]} ${y}`,
    `${MONTHS[m]} ${d}, ${y}`,
  ]);
}

function dateFil(rng: Rng): string {
  const y = int(rng, 2025, 2027);
  const m = int(rng, 0, 11);
  const d = int(rng, 1, 28);
  return pick(rng, [`ika-${d} ng ${MONTHS_F[m]} ${y}`, `${MONTHS_F[m]} ${d}, ${y}`, `${d} ${MONTHS_F[m]} ${y}`, `${String(m + 1).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`]);
}

function durEn(rng: Rng): string {
  const unit = pick(rng, ['days', 'days', 'days', 'calendar days', 'working days', 'business days', 'weeks', 'months']);
  const n = unit === 'weeks' ? pick(rng, [1, 2, 3, 4]) : unit === 'months' ? pick(rng, [1, 2, 3]) : pick(rng, [3, 5, 7, 10, 14, 15, 20, 21, 30, 45, 60, 90]);
  const u = n === 1 ? unit.replace(/s$/, '') : unit;
  return pick(rng, [`${words(n)} (${n}) ${u}`, `${n} ${u}`, `${words(n)} ${u}`, `${words(n)} (${n}) ${u}`]);
}

function durFil(rng: Rng): string {
  const unit = pick(rng, ['araw', 'araw', 'araw', 'linggo', 'buwan']);
  const n = unit === 'linggo' ? pick(rng, [1, 2]) : unit === 'buwan' ? pick(rng, [1, 2, 3]) : pick(rng, [3, 5, 7, 10, 14, 15, 30, 45, 60]);
  const w = FIL_NUM[n] ?? `${n}`;
  return pick(rng, [`${w} (${n}) ${unit}`, `${n} ${unit}`, `${w} ${unit}`]);
}

function months(rng: Rng): string {
  const n = pick(rng, [6, 10, 12, 18, 24, 36, 12]);
  if (n === 12 && rng() < 0.4) return pick(rng, ['one (1) year', 'one year']);
  if (n === 24 && rng() < 0.4) return 'two (2) years';
  return pick(rng, [`${words(n)} (${n}) months`, `${n} months`]);
}

function countEn(rng: Rng): string {
  const n = pick(rng, [2, 2, 3, 3, 4, 5]);
  return pick(rng, [`${words(n)} (${n})`, `${words(n)}`, `${n}`]);
}

export interface FillState {
  rng: Rng;
  split: Split;
  /** Filipino templates get Filipino-style money ("₱", "piso"); Taglish gets either. */
  lang: 'en' | 'fil' | 'taglish';
  memo: Map<string, string>;
}

export function fillSlot(name: string, s: FillState): string {
  const memoized = s.memo.get(name);
  if (memoized !== undefined) return memoized;
  const value = produce(name, s);
  s.memo.set(name, value);
  return value;
}

function distinct(base: string, s: FillState, gen: () => string): string {
  const used = new Set([...s.memo].filter(([k]) => k.replace(/\d+$/, '') === base).map(([, v]) => v));
  for (let i = 0; i < 20; i++) {
    const v = gen();
    if (!used.has(v)) return v;
  }
  return gen();
}

function person(s: FillState): string {
  const p = POOLS[s.split];
  const mi = s.rng() < 0.4 ? ` ${String.fromCharCode(65 + Math.floor(s.rng() * 26))}.` : '';
  const name = `${pick(s.rng, p.first)}${mi} ${pick(s.rng, p.last)}`;
  return s.rng() < 0.12 ? name.toUpperCase() : name;
}

function company(s: FillState): string {
  const p = POOLS[s.split];
  return `${pick(s.rng, p.coHead)} ${pick(s.rng, p.coTail)}${pick(s.rng, ['', '', ' Inc.', ' Corp.', ' Co.', ' OPC'])}`;
}

function address(s: FillState): string {
  const r = s.rng;
  return pick(r, [
    `${int(r, 3, 980)} ${pick(r, STREETS)}, Brgy. ${pick(r, BRGYS)}, ${pick(r, CITIES)}`,
    `Blk ${int(r, 1, 40)} Lot ${int(r, 1, 60)}, Purok ${int(r, 1, 9)}, Brgy. ${pick(r, BRGYS)}, ${pick(r, CITIES)}`,
    `Unit ${int(r, 1, 12)}${pick(r, ['A', 'B', 'C', 'D'])}, ${pick(r, STREETS)}, ${pick(r, CITIES)}`,
  ]);
}

function produce(name: string, s: FillState): string {
  const { rng } = s;
  const base = name.replace(/\d+$/, '');
  const pools = POOLS[s.split];
  if (base in AMOUNT) {
    const fil = s.lang === 'fil' || (s.lang === 'taglish' && rng() < 0.5);
    return distinct(base, s, () => money(rng, AMOUNT[base]!(rng), fil));
  }
  switch (base) {
    case 'PCT': {
      const n = pick(rng, [1, 1.5, 2, 2.5, 3, 4, 5, 6, 10]);
      return pick(rng, [`${n}%`, `${n} percent`, Number.isInteger(n) ? `${words(n)} percent (${n}%)` : `${n}%`]);
    }
    case 'PCT_W': {
      const n = pick(rng, [10, 20, 25, 30, 40, 50]);
      return pick(rng, [`${n}%`, `${words(n)} percent (${n}%)`]);
    }
    case 'DUR':
      return durEn(rng);
    case 'DUR_F':
      return durFil(rng);
    case 'HRS':
      return pick(rng, ['twenty-four (24) hours', '24 hours', 'forty-eight (48) hours', '48 hours', 'seventy-two (72) hours', 'one (1) day']);
    case 'MONTHS':
      return months(rng);
    case 'MONTHS_N': {
      const n = pick(rng, [6, 10, 12, 18, 24, 36, 48]);
      return pick(rng, [`${words(n)} (${n})`, `${n}`]);
    }
    case 'MONTHS_F': {
      const n = pick(rng, [6, 12, 18, 24, 36]);
      return pick(rng, [`${FIL_NUM[n] ?? n} (${n}) buwan`, `${n} buwan`, n === 12 ? 'isang taon' : `${n} buwan`]);
    }
    case 'NUM':
      return countEn(rng);
    case 'NUM_F': {
      const n = pick(rng, [2, 3, 4, 5]);
      return pick(rng, [`${FIL_NUM[n]} (${n})`, FIL_NUM[n]!]);
    }
    case 'QTY':
      return `${int(rng, 2, 60)}`;
    case 'ORD':
      return pick(rng, [ordinal(int(rng, 1, 28)), ordinal(pick(rng, [1, 5, 10, 15, 20, 25, 30]))]);
    case 'ORD_F':
      return `ika-${pick(rng, [int(rng, 1, 28), pick(rng, [5, 10, 15, 30])])}`;
    case 'DATE':
      return distinct(base, s, () => dateEn(rng));
    case 'DATE_F':
      return distinct(base, s, () => dateFil(rng));
    case 'DATE_NUM':
      return `${String(int(rng, 1, 12)).padStart(2, '0')}/${String(int(rng, 1, 28)).padStart(2, '0')}/${int(rng, 2025, 2027)}`;
    case 'MONTH':
      return pick(rng, MONTHS);
    case 'MONTH_F':
      return pick(rng, MONTHS_F);
    case 'YEAR':
      return `${int(rng, 2018, 2027)}`;
    case 'DAYNUM':
      return `${int(rng, 1, 28)}`;
    case 'WEEKDAY':
      return pick(rng, WEEKDAYS);
    case 'P':
      return distinct(base, s, () => person(s));
    case 'CO':
      return distinct(base, s, () => company(s));
    case 'ADDR':
      return distinct(base, s, () => address(s));
    case 'CITY':
      return pick(rng, CITIES);
    case 'RA':
    case 'RB': {
      if (!s.memo.has('__pair')) s.memo.set('__pair', String(Math.floor(rng() * ROLE_PAIRS.length)));
      return ROLE_PAIRS[Number(s.memo.get('__pair'))]![base === 'RA' ? 0 : 1];
    }
    case 'RA_F':
    case 'RB_F': {
      if (!s.memo.has('__pairF')) s.memo.set('__pairF', String(Math.floor(rng() * ROLE_PAIRS_F.length)));
      return ROLE_PAIRS_F[Number(s.memo.get('__pairF'))]![base === 'RA_F' ? 0 : 1];
    }
    case 'ITEM': {
      // Taglish drops the English article: "gagawa ng employee handbook draft".
      const item = distinct(base, s, () => pick(rng, pools.item));
      return s.lang === 'taglish' ? item.replace(/^(?:a|an|the) /, '') : item;
    }
    case 'ITEM_F':
      return distinct(base, s, () => pick(rng, pools.itemF));
    case 'SERVICE':
      return pick(rng, pools.service);
    case 'GOODS':
      return pick(rng, pools.goods);
    case 'GOODS_F':
      return pick(rng, pools.goodsF);
    case 'DUTY':
      return pick(rng, pools.duty);
    case 'INSTALL':
      return s.lang === 'taglish' ? pick(rng, pools.install).replace(/^(?:a|an|the) /, '') : pick(rng, pools.install);
    case 'SEC':
      return `${int(rng, 1, 14)}`;
    case 'SUB':
      return `${int(rng, 1, 6)}`;
    case 'PG':
      return `${int(rng, 1, 3)}`;
    case 'PGS':
      return `${int(rng, 4, 9)}`;
    case 'REF':
      return `${int(rng, 10, 9999)}`.padStart(4, '0');
    case 'UNIT':
      return `${int(rng, 1, 15)}${pick(rng, ['A', 'B', 'C', '-D', '-E'])}`;
    case 'PHONE':
      return `${int(rng, 1000, 9999)}`;
    case 'EMAIL': {
      const p = POOLS[s.split];
      return `${pick(rng, p.first).toLowerCase()}.${pick(rng, p.last).toLowerCase()}@example.com`;
    }
    default:
      if (base in ROLES) return pick(rng, ROLES[base]!);
      throw new Error(`Unknown slot [${name}]`);
  }
}
