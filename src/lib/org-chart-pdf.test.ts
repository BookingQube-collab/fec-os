import { describe, expect, it } from "vitest";

import {
  ORG_PDF_FOOTER,
  ORG_PDF_HEADER,
  ORG_PDF_MARGIN,
  orgChartPdfCardFrame,
  orgChartPdfCardOnTile,
  orgChartPdfFilename,
  orgChartPdfHeading,
  orgChartPdfJobTitle,
  orgChartPdfNameLineHeight,
  prepareOrgChartPdf,
  type OrgChartPdfPerson,
} from "@/lib/org-chart-pdf";
import { orgChartNameLines, orgChartWrappedName } from "@/lib/org-hierarchy";
import { buildOrgChartPdf } from "@/lib/pdf/org-chart-pdf";

const generatedAt = new Date(2026, 9, 11);

function person(staffId: string, fullName: string, jobTitle: string | null = null): OrgChartPdfPerson {
  return { staffId, fullName, jobTitle };
}

describe("organization chart PDF", () => {
  it("names the file with the chart and the local date", () => {
    expect(orgChartPdfFilename(generatedAt)).toBe("company-hierarchy-2026-10-11.pdf");
    expect(orgChartPdfFilename(generatedAt, "team")).toBe("your-team-2026-10-11.pdf");
  });

  it("wraps full names onto extra lines and keeps a job title on one line", () => {
    expect(orgChartWrappedName("Mohamad Ali Hassan Awada")).toEqual(["Mohamad Ali", "Hassan Awada"]);
    expect(orgChartWrappedName("Mohamad Ali Hassan Awada", true)).toEqual(["Mohamad Ali Hassan", "Awada"]);
    expect(orgChartWrappedName("Adil Bashir Ahmed", true)).toEqual(["Adil Bashir Ahmed"]);
    expect(orgChartWrappedName("Indika Padmalal Manamendra")).toEqual(["Indika", "Padmalal", "Manamendra"]);
    const longWord = "A".repeat(30);
    expect(orgChartWrappedName(longWord).join("")).toBe(longWord);
    expect(orgChartWrappedName(longWord).length).toBe(orgChartNameLines(longWord));
    expect(orgChartPdfJobTitle("Managing Director")).toBe("Managing Director");
    const longTitle = orgChartPdfJobTitle("Senior Regional Operations Coordinator Extra");
    expect(longTitle.endsWith("...")).toBe(true);
    expect(longTitle.includes("\n")).toBe(false);
    expect(orgChartPdfHeading("هيكل الشركة", "Company hierarchy")).toBe("Company hierarchy");
    expect(orgChartPdfHeading("Company hierarchy", "Your team")).toBe("Company hierarchy");
  });

  it("lays out the full tree, including people below a collapsed manager, without slicing cards", () => {
    const people = new Map<string, OrgChartPdfPerson>([
      ["adil", person("adil", "Adil Bashir Ahmed", "Managing Director")],
      ["mohamad", person("mohamad", "Mohamad Ali Hassan Awada", "General Manager")],
      ["husseain", person("husseain", "Husseain Ali Abbas", "Business Development")],
      ["indika", person("indika", "Indika Padmalal Manamendra", "Finance/Admin Manager")],
      ["lucian", person("lucian", "Lucian Alin Moldovan", "Manager - Partners")],
      ["mohasin", person("mohasin", "Mohasin Mohammadaly Parayil", "3D Designer")],
      ["muhammad", person("muhammad", "Muhammad Izaan Shahid", "React Native Developer")],
    ]);
    const childIdsOf = new Map<string, string[]>([
      ["adil", ["mohamad"]],
      ["mohamad", ["husseain", "indika", "lucian", "mohasin", "muhammad"]],
    ]);
    const plan = prepareOrgChartPdf({
      rootIds: ["adil"],
      childIdsOf,
      people,
      title: "Company hierarchy",
      generatedAt,
    });

    expect(plan.cards.map((card) => card.fullName).sort()).toEqual(
      [...people.values()].map((row) => row.fullName).sort(),
    );
    expect(plan.curves).toHaveLength(6);
    expect(plan.tiles).toHaveLength(1);
    for (const card of plan.cards) {
      expect(card.nameLines.join(" ")).toBe(card.fullName);
      expect(orgChartPdfNameLineHeight(card.height, card.nameLines.length)).toBeGreaterThanOrEqual(9);
      expect(plan.tiles.some((tile) => orgChartPdfCardOnTile(card, tile))).toBe(true);
    }
    const indika = plan.cards.find((card) => card.staffId === "indika");
    expect(indika?.nameLines.length).toBeGreaterThan(1);
    expect(indika?.height).toBeGreaterThan(plan.cards.find((card) => card.staffId === "adil")?.height ?? 0);
  });

  it("splits a large tree across pages in the gaps between cards", async () => {
    const people = new Map<string, OrgChartPdfPerson>();
    const childIdsOf = new Map<string, string[]>();
    const rootIds = ["root"];
    people.set("root", person("root", "Adil Bashir Ahmed", "Managing Director"));
    const reports: string[] = [];
    for (let index = 0; index < 14; index += 1) {
      const staffId = `report-${index}`;
      reports.push(staffId);
      people.set(staffId, person(staffId, `Report Person Number ${index + 1}`, "Supervisor"));
    }
    childIdsOf.set("root", reports);
    const plan = prepareOrgChartPdf({
      rootIds,
      childIdsOf,
      people,
      title: "Company hierarchy",
      generatedAt,
      maxPage: 880,
    });

    expect(plan.tiles.length).toBeGreaterThan(1);
    for (const card of plan.cards) {
      const homes = plan.tiles.filter((tile) => orgChartPdfCardOnTile(card, tile));
      expect(homes).toHaveLength(1);
    }

    const doc = await buildOrgChartPdf({
      rootIds,
      childIdsOf,
      people,
      title: "Company hierarchy",
      generatedAt,
      maxPage: 880,
    });
    expect(doc.getNumberOfPages()).toBe(plan.tiles.length);
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(doc.output("arraybuffer")) });
    try {
      const result = await parser.getText();
      const text = (result.pages ?? [])
        .map((page: { text?: string }) => page.text ?? "")
        .join("\n")
        .replace(/\s+/g, " ");
      expect(result.pages?.length).toBeGreaterThan(1);
      expect(text).toContain("Adil Bashir Ahmed");
      expect(text).toContain("Report Person Number 14");
    } finally {
      await parser.destroy?.();
    }
  });

  it("keeps a wide tree on the page instead of clipping the right edge", async () => {
    const people = new Map<string, OrgChartPdfPerson>([
      ["adil", person("adil", "Adil Bashir Ahmed", "Managing Director")],
      ["mohamad", person("mohamad", "Mohamad Ali Hassan Awada", "General Manager")],
      ["ruben", person("ruben", "Ruben Yaralyan", "F&B Manager")],
    ]);
    const reports: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const staffId = `report-${index}`;
      reports.push(staffId);
      people.set(staffId, person(staffId, `Barista ${index + 1}`, "Barista"));
    }
    const childIdsOf = new Map<string, string[]>([
      ["adil", ["mohamad"]],
      ["mohamad", ["ruben"]],
      ["ruben", reports],
    ]);
    const input = {
      rootIds: ["adil"],
      childIdsOf,
      people,
      readOnly: true,
      title: "Your team",
      generatedAt,
    };
    const plan = prepareOrgChartPdf(input);
    expect(plan.cards).toHaveLength(people.size);
    expect(plan.chartWidth).toBeGreaterThan(plan.chartHeight);
    for (const card of plan.cards) {
      const homes = plan.tiles.filter((tile) => orgChartPdfCardOnTile(card, tile));
      expect(homes).toHaveLength(1);
      const tile = homes[0];
      if (!tile) continue;
      const frame = orgChartPdfCardFrame(card, tile);
      expect(frame.left).toBeGreaterThanOrEqual(ORG_PDF_MARGIN - 0.5);
      expect(frame.top).toBeGreaterThanOrEqual(ORG_PDF_HEADER - 0.5);
      expect(frame.right).toBeLessThanOrEqual(tile.pageWidth - ORG_PDF_MARGIN + 0.5);
      expect(frame.bottom).toBeLessThanOrEqual(tile.pageHeight - ORG_PDF_FOOTER + 0.5);
    }

    const doc = await buildOrgChartPdf(input);
    const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
    const boxes = [...raw.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((match) => {
      const parts = match[1]?.trim().split(/\s+/).map(Number) ?? [];
      return { width: parts[2] ?? 0, height: parts[3] ?? 0 };
    });
    expect(boxes).toHaveLength(plan.tiles.length);
    plan.tiles.forEach((tile, index) => {
      expect(boxes[index]?.width).toBeCloseTo(tile.pageWidth, 0);
      expect(boxes[index]?.height).toBeCloseTo(tile.pageHeight, 0);
    });
    expect(raw).toContain("Ruben Yaralyan");
    expect(raw).toContain("Barista 8");
  });

  it("exports the top-down chart with every person still on a page", () => {
    const people = new Map<string, OrgChartPdfPerson>([
      ["adil", person("adil", "Adil Bashir Ahmed", "Managing Director")],
      ["mohamad", person("mohamad", "Mohamad Ali Hassan Awada", "General Manager")],
      ["ruben", person("ruben", "Ruben Yaralyan", "F&B Manager")],
    ]);
    const plan = prepareOrgChartPdf({
      rootIds: ["adil"],
      childIdsOf: new Map([
        ["adil", ["mohamad", "ruben"]],
      ]),
      people,
      title: "Company hierarchy",
      generatedAt,
      layout: "levels",
    });
    const adil = plan.cards.find((card) => card.staffId === "adil");
    const mohamad = plan.cards.find((card) => card.staffId === "mohamad");
    const ruben = plan.cards.find((card) => card.staffId === "ruben");
    expect(mohamad && ruben && adil).toBeTruthy();
    expect(mohamad?.y).toBeGreaterThan((adil?.y ?? 0) + (adil?.height ?? 0));
    const mohamadMid = (mohamad?.y ?? 0) + (mohamad?.height ?? 0) / 2;
    const rubenMid = (ruben?.y ?? 0) + (ruben?.height ?? 0) / 2;
    expect(mohamadMid).toBeCloseTo(rubenMid, 0);
    expect(plan.curves).toHaveLength(2);
    for (const card of plan.cards) {
      expect(plan.tiles.some((tile) => orgChartPdfCardOnTile(card, tile))).toBe(true);
    }
  });

  it("builds a PDF blob that contains the sample names, titles, and reporting curves", async () => {
    const people = new Map<string, OrgChartPdfPerson>([
      ["adil", person("adil", "Adil Bashir Ahmed", "Managing Director")],
      ["mohamad", person("mohamad", "Mohamad Ali Hassan Awada", "General Manager")],
      ["husseain", person("husseain", "Husseain Ali Abbas", "Business Development")],
      ["leaf", person("leaf", "Muhammad Izaan Shahid", "React Native Developer")],
    ]);
    const childIdsOf = new Map<string, string[]>([
      ["adil", ["mohamad"]],
      ["mohamad", ["husseain", "leaf"]],
    ]);
    const input = {
      rootIds: ["adil"],
      childIdsOf,
      people,
      title: "Company hierarchy",
      generatedAt,
    };
    const plan = prepareOrgChartPdf(input);
    const doc = await buildOrgChartPdf(input);
    expect(doc.getNumberOfPages()).toBe(plan.tiles.length);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(plan.tiles[0]?.pageWidth ?? 0, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(plan.tiles[0]?.pageHeight ?? 0, 0);

    const bytes = doc.output("arraybuffer");
    expect(bytes.byteLength).toBeGreaterThan(800);
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toContain("Adil Bashir");
    expect(raw).toContain("Mohamad Ali");
    expect(raw).toContain("Hassan Awada");
    expect(raw).toContain("Muhammad Izaan");
    expect(raw).toContain("Managing Director");
    expect(raw).toContain("11 Oct 2026");
    expect(raw).toMatch(/\s+c[\s\n]/);

    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(bytes) });
    try {
      const result = await parser.getText();
      const text = (result.pages ?? [])
        .map((page: { text?: string }) => page.text ?? "")
        .join("\n")
        .replace(/\s+/g, " ");
      expect(text).toContain("Adil Bashir Ahmed");
      expect(text).toContain("Mohamad Ali Hassan Awada");
      expect(text).toContain("Husseain Ali Abbas");
      expect(text).toContain("Muhammad Izaan Shahid");
      expect(text).toContain("Managing Director");
      expect(text).toContain("General Manager");
      expect(result.pages?.length).toBe(plan.tiles.length);
    } finally {
      await parser.destroy?.();
    }
  });
});
