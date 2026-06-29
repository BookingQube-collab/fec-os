import type { LicenseDocNode } from "@/lib/compliance-tracker/license-documents-types";

/** Maps tree locations to e3_compliance_items.location values. */
export const LD_LOCATION = {
  inflatapark: "InflataPark City Center",
  kds: "KDS City Center",
  urbanArena: "Urban Arena Doha Mall",
  crayonsVendome: "Crayons & Bricks Vendome",
  crayonsDarAlSalam: "Crayons & Bricks Dar Al Salam",
  carousel: "Carousel Aspire Park",
} as const;

export const LD_AREA = {
  whole: "Whole Area",
  cafe: "Cafe",
  playground: "Play Ground",
  center: "Center",
} as const;

function doc(
  id: string,
  label: string,
  match: LicenseDocNode["match"],
  labelAr?: string,
): LicenseDocNode {
  return { id, label, labelAr, match };
}

function folder(id: string, label: string, children: LicenseDocNode[], labelAr?: string): LicenseDocNode {
  return { id, label, labelAr, children };
}

function sameAsFolder(id: string, label: string, refId: string, labelAr?: string): LicenseDocNode {
  return { id, label, labelAr, sameAs: refId };
}

function e3ComplianceSection(
  prefix: string,
  location: string,
  area: string,
  docs: Array<{ id: string; label: string; itemContains: string; labelAr?: string }>,
): LicenseDocNode {
  return folder(
    `${prefix}-e3`,
    "E3 Compliances",
    docs.map((d) =>
      doc(`${prefix}-e3-${d.id}`, d.label, { location, area, category: "E3 Compliance", itemContains: d.itemContains }, d.labelAr),
    ),
    "امتثال E3",
  );
}

function standardContractorDocs(
  prefix: string,
  location: string,
  area: string,
  category: string,
  vendorContains: string,
  extras: Array<{ id: string; label: string; itemContains?: string; labelAr?: string }> = [],
): LicenseDocNode[] {
  const base = [
    doc(`${prefix}-vendor`, "Company Name", { location, area, category, vendorContains }, "اسم الشركة"),
    doc(`${prefix}-profile`, "Company Profile", { location, area, category, vendorContains, itemContains: "Profile" }, "ملف الشركة"),
    doc(`${prefix}-contract`, "Contract", { location, area, category, vendorContains, itemContains: "Contract" }, "العقد"),
    doc(`${prefix}-trade`, "Trade License", { location, area, category, vendorContains, itemContains: "Trade License" }, "الرخصة التجارية"),
    doc(`${prefix}-cr`, "Commercial Registration", { location, area, category, vendorContains, itemContains: "Commercial" }, "السجل التجاري"),
    doc(`${prefix}-card`, "Computer Card", { location, area, category, vendorContains, itemContains: "Computer Card" }, "البطاقة الحاسوبية"),
  ];
  const extraNodes = extras.map((e) =>
    doc(
      `${prefix}-${e.id}`,
      e.label,
      { location, area, category, vendorContains, itemContains: e.itemContains ?? e.label },
      e.labelAr,
    ),
  );
  return [...base, ...extraNodes];
}

function contractorFolder(
  id: string,
  label: string,
  location: string,
  area: string,
  category: string,
  vendorContains: string,
  extras: Array<{ id: string; label: string; itemContains?: string; labelAr?: string }> = [],
  labelAr?: string,
): LicenseDocNode {
  return folder(id, label, standardContractorDocs(id, location, area, category, vendorContains, extras), labelAr);
}

const INF = LD_LOCATION.inflatapark;
const KDS = LD_LOCATION.kds;
const URB = LD_LOCATION.urbanArena;

/** InflataPark Fire Alarm — shared across locations ("same as above"). */
const INF_CAFE_FIRE_ALARM = contractorFolder(
  "inf-cc-cafe-fire-alarm",
  "Fire Alarm",
  INF,
  LD_AREA.cafe,
  "Fire Alarm",
  "EuroFire",
  [
    { id: "invoice", label: "Invoice for each quarter", itemContains: "Invoice" },
    { id: "civil", label: "Civil Defense Certificate", itemContains: "Civil Defense" },
    { id: "checklist", label: "Checklist", itemContains: "Checklist" },
    { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
  ],
  "إنذار الحريق",
);

const INF_CAFE_PEST = contractorFolder(
  "inf-cc-cafe-pest",
  "Pest Control",
  INF,
  LD_AREA.cafe,
  "Pest Control",
  "Al Amaal",
  [
    { id: "invoice", label: "Invoice for each month", itemContains: "Invoice" },
    { id: "report", label: "Monthly Treatment Report", itemContains: "Treatment" },
    { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
  ],
  "مكافحة الآفات",
);

const INF_CAFE_POS = contractorFolder(
  "inf-cc-cafe-pos",
  "POS",
  INF,
  LD_AREA.cafe,
  "POS",
  "Infocart",
  [{ id: "invoice", label: "Invoice for each Year — June 2027 next renewal", itemContains: "Invoice" }],
);

const INF_PG_CCTV = contractorFolder(
  "inf-cc-pg-cctv",
  "CCTV",
  INF,
  LD_AREA.playground,
  "CCTV",
  "Ibra Alofog",
  [
    { id: "invoice", label: "Invoice for each year — next April 2027", itemContains: "Invoice" },
    { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
    { id: "checklist", label: "Checklist", itemContains: "Checklist" },
  ],
);

const INF_PG_THIRD_PARTY = contractorFolder(
  "inf-cc-pg-third-party",
  "Third Party Certification",
  INF,
  LD_AREA.playground,
  "Third Party Certification",
  "Velosy",
  [
    { id: "invoice", label: "Invoice for each year", itemContains: "Invoice" },
    { id: "certificate", label: "Third Party Certificate", itemContains: "Certificate" },
    { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
  ],
);

const URB_CAFE_FIRE = contractorFolder(
  "urb-cafe-fire-alarm",
  "Fire Alarm",
  URB,
  LD_AREA.cafe,
  "Fire Alarm",
  "Al Adaraq",
  [
    { id: "invoice", label: "Invoice — included in quote", itemContains: "Invoice" },
    { id: "civil", label: "Civil Defense Certificate", itemContains: "Civil Defense" },
    { id: "checklist", label: "Checklist", itemContains: "Checklist" },
    { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
  ],
);

const URB_CAFE_AC = contractorFolder(
  "urb-cafe-ac",
  "AC Cleaning",
  URB,
  LD_AREA.cafe,
  "AC Cleaning",
  "Al Adaraq",
  [
    { id: "invoice", label: "Invoice — included in quote", itemContains: "Invoice" },
    { id: "checklist", label: "Checklist", itemContains: "Checklist" },
    { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
  ],
);

const URB_CAFE_PEST = contractorFolder(
  "urb-cafe-pest",
  "Pest Control",
  URB,
  LD_AREA.cafe,
  "Pest Control",
  "Al Amaal",
  [
    { id: "invoice", label: "Invoice for each month", itemContains: "Invoice" },
    { id: "report", label: "Monthly Treatment Report", itemContains: "Treatment" },
    { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
  ],
);

const URB_PG_CCTV = contractorFolder(
  "urb-pg-cctv",
  "CCTV",
  URB,
  LD_AREA.playground,
  "CCTV",
  "Ibra Alofog",
  [
    { id: "invoice", label: "Invoice for each year", itemContains: "Invoice" },
    { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
    { id: "checklist", label: "Checklist", itemContains: "Checklist" },
  ],
);

const URB_PG_THIRD_PARTY = contractorFolder(
  "urb-pg-third-party",
  "Third Party Certification",
  URB,
  LD_AREA.playground,
  "Third Party Certification",
  "Velosy",
  [
    { id: "invoice", label: "Invoice for each year", itemContains: "Invoice" },
    { id: "certificate", label: "Third Party Certificate", itemContains: "Certificate" },
    { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
  ],
);

/** Full hierarchical tree — 6 locations with nested areas and document types. */
export const LICENSE_DOCUMENTS_TREE: LicenseDocNode[] = [
  folder("loc-inflatapark", "1. InflataPark — City Center", [
    folder("inf-cc-site", "QCDD — Municipality — CCTV", [
      doc("inf-cc-qcdd", "Civil Defense Certificate — Whole Area", {
        location: INF,
        area: LD_AREA.whole,
        category: "QCDD",
        itemContains: "QCDD",
      }),
      doc("inf-cc-cctv-dia", "CCTV — DIA and Municipality", {
        location: INF,
        area: LD_AREA.whole,
        category: "CCTV",
        itemContains: "CCTV",
      }),
    ]),
    folder("inf-cc-cafe", "InflataCafe", [
      e3ComplianceSection("inf-cc-cafe", INF, LD_AREA.cafe, [
        { id: "trade", label: "Trade License", itemContains: "Trade License" },
        { id: "cr", label: "Company Registration", itemContains: "Registration" },
        { id: "qid", label: "QID — Sponsors", itemContains: "QID" },
        { id: "medical", label: "Medical Certificate", itemContains: "Medical" },
      ]),
      folder("inf-cc-cafe-contractors", "Contractors", [
        INF_CAFE_POS,
        INF_CAFE_FIRE_ALARM,
        INF_CAFE_PEST,
        contractorFolder(
          "inf-cc-cafe-hood",
          "Kitchen Hood",
          INF,
          LD_AREA.cafe,
          "Kitchen Hood",
          "GreenShine",
          [
            { id: "invoice", label: "Invoice for each quarter", itemContains: "Invoice" },
            { id: "report", label: "Hood Cleaning Report (every 3 months)", itemContains: "Cleaning" },
            { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
            { id: "checklist", label: "Checklist", itemContains: "Checklist" },
          ],
        ),
        contractorFolder(
          "inf-cc-cafe-waste",
          "Waste Management",
          INF,
          LD_AREA.cafe,
          "Waste Management",
          "Waste",
          [
            { id: "invoice", label: "Invoice for each quarter", itemContains: "Invoice" },
            { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
            { id: "checklist", label: "Checklist", itemContains: "Checklist" },
          ],
        ),
        folder("inf-cc-cafe-kitchen-maint", "Kitchen Maintenance", [
          doc("inf-cc-cafe-km-placeholder", "Kitchen Maintenance — pending vendor details", {
            location: INF,
            area: LD_AREA.cafe,
            category: "Kitchen Maintenance",
          }),
        ]),
      ]),
    ]),
    folder("inf-cc-pg", "InflataPark", [
      e3ComplianceSection("inf-cc-pg", INF, LD_AREA.playground, [
        { id: "trade", label: "Trade License", itemContains: "Trade License" },
        { id: "cr", label: "Company Registration", itemContains: "Registration" },
        { id: "qid", label: "QID — Sponsors", itemContains: "QID" },
        { id: "temp", label: "Temp License", itemContains: "Temp" },
      ]),
      folder("inf-cc-pg-contractors", "Contractors", [
        contractorFolder(
          "inf-cc-pg-ac",
          "AC Cleaning",
          INF,
          LD_AREA.playground,
          "AC Cleaning",
          "Al Adaraq",
          [
            { id: "invoice", label: "Invoice for each quarter", itemContains: "Invoice" },
            { id: "dashboard", label: "Dashboard — Expiry & Annual Maintenance", itemContains: "Dashboard" },
            { id: "checklist", label: "Checklist", itemContains: "Checklist" },
          ],
        ),
        INF_PG_CCTV,
        sameAsFolder("inf-cc-pg-fire", "Fire Alarm", "inf-cc-cafe-fire-alarm"),
        sameAsFolder("inf-cc-pg-pest", "Pest Control", "inf-cc-cafe-pest"),
        INF_PG_THIRD_PARTY,
      ]),
    ]),
  ]),

  folder("loc-kds", "2. KDS", [
    doc("kds-qcdd", "QCDD — Civil Defence Certificate — Whole Area", {
      location: KDS,
      area: LD_AREA.whole,
      category: "QCDD",
      itemContains: "QCDD",
    }),
    folder("kds-cafe", "KDSCafe", [
      folder("kds-cafe-e3", "E3 Compliances", [
        doc("kds-cafe-trade", "Trade License", { location: KDS, area: LD_AREA.cafe, category: "E3 Compliance", itemContains: "Trade" }),
        doc("kds-cafe-cr", "Company Registration", { location: KDS, area: LD_AREA.cafe, category: "E3 Compliance", itemContains: "Registration" }),
        doc("kds-cafe-qid", "QID — Sponsors", { location: KDS, area: LD_AREA.cafe, category: "E3 Compliance", itemContains: "QID" }),
        doc("kds-cafe-temp", "Temp License", { location: KDS, area: LD_AREA.cafe, category: "E3 Compliance", itemContains: "Temp" }),
      ]),
      folder("kds-cafe-contractors", "Contractors", [
        sameAsFolder("kds-cafe-fire", "Fire Alarm", "inf-cc-cafe-fire-alarm"),
        sameAsFolder("kds-cafe-pest", "Pest Control", "inf-cc-cafe-pest"),
        sameAsFolder("kds-cafe-pos", "POS", "inf-cc-cafe-pos"),
      ]),
    ]),
    folder("kds-pg", "KDS Playground", [
      e3ComplianceSection("kds-pg", KDS, LD_AREA.playground, [
        { id: "trade", label: "Trade License", itemContains: "Trade License" },
        { id: "cr", label: "Company Registration", itemContains: "Registration" },
        { id: "qid", label: "QID — Sponsors", itemContains: "QID" },
        { id: "temp", label: "Temp License", itemContains: "Temp" },
        { id: "cctv-dia", label: "CCTV — DIA", itemContains: "CCTV" },
      ]),
      folder("kds-pg-contractors", "Contractors", [
        sameAsFolder("kds-pg-third-party", "Third Party Certification", "inf-cc-pg-third-party"),
        sameAsFolder("kds-pg-fire", "Fire Alarm", "inf-cc-cafe-fire-alarm"),
        sameAsFolder("kds-pg-pest", "Pest Control", "inf-cc-cafe-pest"),
        sameAsFolder("kds-pg-cctv", "CCTV", "inf-cc-pg-cctv"),
      ]),
    ]),
  ]),

  folder("loc-urban", "3. Urban Arena", [
    folder("urb-site", "QCDD — Municipality — CCTV", [
      doc("urb-qcdd", "Civil Defense Certificate — Whole Area", {
        location: URB,
        area: LD_AREA.whole,
        category: "QCDD",
        itemContains: "QCDD",
      }),
      doc("urb-cctv-dia", "CCTV — DIA and Municipality", {
        location: URB,
        area: LD_AREA.whole,
        category: "CCTV",
        itemContains: "CCTV",
      }),
    ]),
    folder("urb-cafe", "Urban Arena Cafe", [
      e3ComplianceSection("urb-cafe", URB, LD_AREA.cafe, [
        { id: "trade", label: "Trade License", itemContains: "Trade License" },
        { id: "cr", label: "Company Registration", itemContains: "Registration" },
        { id: "qid", label: "QID — Sponsors", itemContains: "QID" },
        { id: "medical", label: "Medical Certificate", itemContains: "Medical" },
      ]),
      folder("urb-cafe-contractors", "Contractors", [
        URB_CAFE_FIRE,
        URB_CAFE_AC,
        URB_CAFE_PEST,
        folder("urb-cafe-hood", "Kitchen Hood", [
          doc("urb-cafe-hood-pending", "Kitchen Hood — pending vendor", {
            location: URB,
            area: LD_AREA.cafe,
            category: "Kitchen Hood",
          }),
        ]),
        folder("urb-cafe-waste", "Waste Management", [
          doc("urb-cafe-waste-pending", "Waste Management — pending vendor", {
            location: URB,
            area: LD_AREA.cafe,
            category: "Waste Management",
          }),
        ]),
      ]),
    ]),
    folder("urb-pg", "Urban Arena Playground", [
      e3ComplianceSection("urb-pg", URB, LD_AREA.playground, [
        { id: "trade", label: "Trade License", itemContains: "Trade License" },
        { id: "cr", label: "Company Registration", itemContains: "Registration" },
        { id: "qid", label: "QID — Sponsors", itemContains: "QID" },
        { id: "temp", label: "Temp License — QT", itemContains: "Temp" },
        { id: "cctv-dia", label: "CCTV — DIA", itemContains: "CCTV" },
      ]),
      folder("urb-pg-contractors", "Contractors", [
        URB_PG_CCTV,
        sameAsFolder("urb-pg-fire", "Fire Alarm", "urb-cafe-fire-alarm"),
        sameAsFolder("urb-pg-pest", "Pest Control", "urb-cafe-pest"),
        URB_PG_THIRD_PARTY,
      ]),
    ]),
  ]),

  folder("loc-vendome", "4. Crayons & Bricks — Vendome Mall", [
    e3ComplianceSection("cb-vendome", LD_LOCATION.crayonsVendome, LD_AREA.whole, [
      { id: "trade", label: "Trade License", itemContains: "Trade License" },
      { id: "cr", label: "Company Registration", itemContains: "Registration" },
      { id: "qid", label: "QID — Sponsors", itemContains: "QID" },
      { id: "temp", label: "Temp License", itemContains: "Temp" },
    ]),
  ]),

  folder("loc-dar-al-salam", "5. Crayons & Bricks — Digger — Dar Al Salam Mall", [
    e3ComplianceSection("cb-das", LD_LOCATION.crayonsDarAlSalam, LD_AREA.whole, [
      { id: "trade", label: "Trade License", itemContains: "Trade License" },
      { id: "cr", label: "Company Registration", itemContains: "Registration" },
      { id: "qid", label: "QID — Sponsors", itemContains: "QID" },
      { id: "temp", label: "Temp License", itemContains: "Temp" },
    ]),
  ]),

  folder("loc-carousel", "6. Carousel — Aspire Park", [
    e3ComplianceSection("carousel", LD_LOCATION.carousel, LD_AREA.whole, [
      { id: "trade", label: "Trade License", itemContains: "Trade License" },
      { id: "cr", label: "Company Registration", itemContains: "Registration" },
      { id: "qid", label: "QID — Sponsors", itemContains: "QID" },
      { id: "temp", label: "Temp License", itemContains: "Temp" },
    ]),
  ]),
];

/** Categories included in license-documents view (excludes pure AMC operational-only views). */
export const LICENSE_DOCUMENT_CATEGORIES = [
  "QCDD",
  "E3 Compliance",
  "Fire Alarm",
  "Pest Control",
  "AC Cleaning",
  "CCTV",
  "POS",
  "Kitchen Hood",
  "Waste Management",
  "Kitchen Maintenance",
  "Third Party Certification",
] as const;

/** Flatten tree for id lookup (sameAs resolution). */
export function indexLicenseDocNodes(
  nodes: LicenseDocNode[],
  map = new Map<string, LicenseDocNode>(),
): Map<string, LicenseDocNode> {
  for (const node of nodes) {
    map.set(node.id, node);
    if (node.children) indexLicenseDocNodes(node.children, map);
  }
  return map;
}

export const LICENSE_DOC_NODE_INDEX = indexLicenseDocNodes(LICENSE_DOCUMENTS_TREE);

/** Maps e3_compliance_items.location to top-level tree node id. */
export const LICENSE_DOC_LOCATION_TREE_MAP: Record<string, string> = {
  [LD_LOCATION.inflatapark]: "loc-inflatapark",
  [LD_LOCATION.kds]: "loc-kds",
  [LD_LOCATION.urbanArena]: "loc-urban",
  [LD_LOCATION.crayonsVendome]: "loc-vendome",
  [LD_LOCATION.crayonsDarAlSalam]: "loc-dar-al-salam",
  [LD_LOCATION.carousel]: "loc-carousel",
};
