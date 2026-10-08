import { describe, expect, it } from "vitest";

import {
  clusterItemsBySection,
  getDepartmentFlyoutLinks,
  getDepartmentFlyoutTree,
  employeePinnedRailItems,
  getAllVisibleNavItems,
  getEmployeeFlatRail,
  getEmployeeSectionNav,
  getPrimaryRailNav,
  showsMyDayNav,
  getVisibleDepartments,
  isNavItemActive,
  isSidebarNavGroupActive,
  isSidebarNavGroupItemActive,
  mergeReportingManagerDepartments,
  navHrefPath,
  reportingManagerRailItems,
  usesEmployeeFlatRail,
} from "@/lib/nav-config";

const ADMIN_HREFS = [
  "/admin",
  "/admin/locations",
  "/admin/roles",
  "/admin/ai-integrations",
  "/admin/livekit",
  "/admin/sidebar",
  "/admin/diagnostics",
  "/admin/api-explorer",
] as const;

describe("admin sidebar visibility", () => {
  it("pins Administration on the executive rail with the full admin group", () => {
    const roles = ["ceo"] as const;
    const rail = getPrimaryRailNav([...roles]);
    expect(rail.some((item) => item.departmentId === "admin")).toBe(true);

    const admin = getVisibleDepartments([...roles]).find((dept) => dept.id === "admin");
    expect(admin).toBeDefined();
    const hrefs = new Set([
      ...(admin?.items.map((item) => item.href) ?? []),
      ...(admin?.groups.flatMap((group) => group.items.map((item) => item.href)) ?? []),
    ]);
    for (const href of ADMIN_HREFS) expect(hrefs.has(href)).toBe(true);

    const flyout = getDepartmentFlyoutLinks(admin!);
    for (const href of ADMIN_HREFS) {
      expect(flyout.some((link) => link.href === href)).toBe(true);
    }
    const loose = flyout.filter((link) => !link.sectionKey && !link.fromGroup);
    expect(loose).toEqual([]);
  });

  it("keeps Administration for COO and regional ops, hides it from technicians", () => {
    expect(getPrimaryRailNav(["coo"]).some((item) => item.departmentId === "admin")).toBe(true);
    expect(getPrimaryRailNav(["regional_ops"]).some((item) => item.departmentId === "admin")).toBe(true);
    expect(getPrimaryRailNav(["technician"]).some((item) => item.departmentId === "admin")).toBe(false);
    expect(getVisibleDepartments(["technician"]).some((dept) => dept.id === "admin")).toBe(false);
  });

  it("lists HR payroll and field for executives", () => {
    const people = getVisibleDepartments(["ceo"]).find((dept) => dept.id === "people");
    expect(people).toBeDefined();
    const hrefs = new Set([
      ...(people?.items.map((item) => item.href) ?? []),
      ...(people?.groups.flatMap((group) => group.items.map((item) => item.href)) ?? []),
    ]);
    expect(hrefs.has("/people")).toBe(true);
    expect(hrefs.has("/people/attendance")).toBe(true);
    expect(hrefs.has("/people/attendance/reports")).toBe(false);
    expect(hrefs.has("/people/payroll")).toBe(true);
    expect(hrefs.has("/people/field")).toBe(true);
    expect(hrefs.has("/people/employee-app")).toBe(true);
    expect(hrefs.has("/people/leave")).toBe(true);
    expect([...hrefs].some((href) => href === "/people/attendance/field")).toBe(false);
  });

  it("lists People as single rows with no nested HR groups", () => {
    const people = getVisibleDepartments(["ceo"]).find((dept) => dept.id === "people");
    expect(people?.groups ?? []).toEqual([]);
    const hrefs = people?.items.map((item) => item.href) ?? [];
    const labels = people?.items.map((item) => item.labelKey) ?? [];
    expect(people?.items[0]).toMatchObject({ href: "/people/hr", labelKey: "nav.dashboard" });
    expect(hrefs.filter((href) => href === "/people/hr")).toEqual(["/people/hr"]);
    expect(labels).not.toContain("nav.hrDashboard");
    expect(hrefs).not.toContain("/#people-dashboard");
    for (const removed of [
      "nav.hrDirectory",
      "nav.hrAttendance",
      "nav.attendanceListing",
      "nav.attendanceDeviceLogs",
      "nav.attendanceCorrections",
      "nav.hrOt",
      "nav.hrAirTickets",
      "nav.hrDocuments",
      "nav.hrWarnings",
      "nav.sop",
      "nav.training",
    ]) {
      expect(labels).not.toContain(removed);
    }
    const roster = labels.indexOf("nav.monthlyRoster");
    expect(roster).toBeGreaterThan(0);
    expect(hrefs.slice(roster, roster + 3)).toEqual([
      "/people/roster",
      "/people/import",
      "/people/recruitment/jobs",
    ]);
    expect(labels.slice(roster, roster + 3)).toEqual([
      "nav.monthlyRoster",
      "nav.importRoster",
      "nav.hrJobRequests",
    ]);
    expect(labels).not.toContain("nav.hrAts");
    expect(labels).not.toContain("nav.hrOnboarding");
    expect(labels.filter((label) => label === "nav.recruitment")).toEqual(["nav.recruitment"]);
    expect(labels.filter((label) => label === "nav.onboardingOffboarding")).toEqual(["nav.onboardingOffboarding"]);
    expect(people?.items.filter((item) => item.labelKey === "nav.hrLeave").map((item) => item.sectionKey)).toEqual([
      "nav.peopleSectionWorkTime",
    ]);
    expect(people?.items.filter((item) => item.labelKey === "nav.hrPayroll").map((item) => item.sectionKey)).toEqual([
      "nav.peopleSectionPay",
    ]);
    expect(people?.items.filter((item) => item.labelKey === "nav.performance").map((item) => item.sectionKey)).toEqual([
      "nav.peopleSectionDevelopment",
    ]);
    expect(hrefs).not.toContain("/people/hr/modules");
    const rowKeys = people?.items.map((item) => `${item.labelKey}:${item.href}`) ?? [];
    expect(new Set(rowKeys).size).toBe(rowKeys.length);
    for (const href of [
      "/people/training",
      "/people/hr",
      "/people/hr/engagement",
      "/people/performance",
      "/people/kra",
      "/leaderboard",
      "/sop#handbook",
      "/people/employee-app",
      "/hr/me",
    ]) {
      expect(hrefs).toContain(href);
    }
    for (const href of [
      "/sop",
      "/people/attendance/reports",
      "/people/attendance/device-logs",
      "/people/attendance/corrections",
    ]) {
      expect(hrefs).not.toContain(href);
    }
  });

  it("places operations hierarchy in HR admin and keeps it off the Administration rail", () => {
    const people = getVisibleDepartments(["ceo"]).find((dept) => dept.id === "people");
    const peopleHrefs = people?.items.map((item) => item.href) ?? [];
    expect(peopleHrefs).toContain("/people/hr/hierarchy");

    const admin = getVisibleDepartments(["ceo"]).find((dept) => dept.id === "admin");
    const adminHrefs = [
      ...(admin?.items.map((item) => item.href) ?? []),
      ...(admin?.groups.flatMap((group) => group.items.map((item) => item.href)) ?? []),
    ];
    expect(adminHrefs).not.toContain("/admin/hierarchy");
    expect(adminHrefs).not.toContain("/people/hr/hierarchy");

    const hr = getVisibleDepartments(["hr"]).find((dept) => dept.id === "people");
    const hrHrefs = hr?.items.map((item) => item.href) ?? [];
    expect(hrHrefs).not.toContain("/people/hr/hierarchy");
  });

  it("keeps the People flyout as a flat list", () => {
    const people = getVisibleDepartments(["ceo"]).find((dept) => dept.id === "people");
    expect(people).toBeDefined();
    const tree = getDepartmentFlyoutTree(people!);
    expect(tree.groups).toEqual([]);
    const treeLabels = tree.items.map((item) => item.labelKey);
    const roster = treeLabels.indexOf("nav.monthlyRoster");
    expect(tree.items.slice(roster, roster + 3).map((item) => item.href)).toEqual([
      "/people/roster",
      "/people/import",
      "/people/recruitment/jobs",
    ]);
    const flyout = getDepartmentFlyoutLinks(people!);
    expect(flyout.every((link) => link.fromGroup === false)).toBe(true);
    expect(flyout[0]?.labelKey).toBe("nav.dashboard");
    expect(flyout[0]?.href).toBe("/people/hr");
    expect(clusterItemsBySection(flyout).map((block) => block.sectionKey)).toEqual([
      "nav.peopleSectionWorkspace",
      "nav.peopleSectionPeople",
      "nav.peopleSectionWorkTime",
      "nav.peopleSectionPay",
      "nav.peopleSectionServices",
      "nav.peopleSectionDevelopment",
      "nav.peopleSectionInsights",
      "nav.peopleSectionAdmin",
    ]);
    expect(flyout.every((link) => Boolean(link.sectionKey))).toBe(true);
    expect(
      clusterItemsBySection(flyout).find((block) => block.sectionKey === "nav.peopleSectionWorkspace")?.items.map((item) => item.labelKey),
    ).toEqual([
      "nav.dashboard",
      "nav.myAccount",
      "nav.communicationHub",
      "nav.hrHelpdesk",
      "nav.privacyRequests",
      "nav.hrMyDay",
    ]);
    const flyoutHrefs = flyout.map((link) => link.href);
    for (const href of [
      "/hr/me#me-attendance",
      "/hr/me#me-roster",
      "/hr/me#me-leave",
      "/hr/me#me-issues",
      "/hr/me#me-documents",
      "/hr/me#me-payslips",
      "/hr/me#me-kra",
    ]) {
      expect(flyoutHrefs).not.toContain(href);
    }
    expect(flyout.some((link) => link.href === "/profile#account" && link.labelKey === "nav.myAccount")).toBe(true);
    expect(navHrefPath("/profile#account")).toBe("/profile");
    expect(navHrefPath("/#people-dashboard")).toBeNull();
    expect(isNavItemActive("/profile", "/profile")).toBe(true);
    expect(isNavItemActive("/#people-dashboard", "/")).toBe(false);
    expect(flyout.map((link) => link.labelKey)).toEqual(
      expect.arrayContaining([
        "nav.communicationHub",
        "nav.hrHelpdesk",
        "nav.privacyRequests",
        "nav.employeeDatabase",
        "nav.organizationCharts",
        "nav.recruitment",
        "nav.onboardingOffboarding",
        "nav.endOfService",
        "nav.employmentHistory",
        "nav.hrProbationExit",
        "nav.teamOverview",
        "nav.hrWorkforce",
        "nav.eventStaff",
        "nav.attendance",
        "nav.biometricDevices",
        "nav.timesheets",
        "nav.benefitsEntitlements",
        "nav.hrExpenses",
        "nav.hrServiceDocuments",
        "nav.hrLetters",
        "nav.incidentReports",
        "nav.hrContracts",
        "nav.equipmentReturns",
        "nav.employeeHandbook",
        "nav.learningTraining",
        "nav.assignmentReviews",
        "nav.reportsAnalytics",
        "nav.recordRetention",
        "nav.bulkImport",
        "nav.hardwareTools",
        "nav.hrRulesSettings",
        "nav.hrLeave",
        "nav.hrPayroll",
        "nav.performance",
      ]),
    );
    expect(flyout.map((link) => link.href)).toEqual(
      expect.arrayContaining([
        "/people/hr",
        "/people",
        "/people/attendance",
        "/people/roster",
        "/people/import",
        "/people/leave",
        "/people/payroll",
        "/people/recruitment",
        "/people/performance",
        "/people/training",
        "/people/hr/engagement",
        "/people/hr/documents",
        "/people/hr/warnings",
        "/people/hr/quota",
        "/people/hr/onboarding",
        "/people/hr/reports",
        "/people/attendance/import",
        "/people/attendance/mapping",
        "/people/attendance/settings",
        "/people/field",
        "/people/hr/shift-policy",
        "/people/hr/helpdesk",
        "/people/hr/privacy",
        "/people/hr/service-history",
        "/people/hr/end-of-service",
        "/people/hr/probation-exit",
        "/people/hr/team",
        "/people/hr/workforce",
        "/people/hr/letters",
        "/people/hr/contracts",
        "/people/hr/equipment",
        "/people/hr/expenses",
        "/people/hr/retention",
      ]),
    );
    const ops = getVisibleDepartments(["ceo"]).find((dept) => dept.id === "operations");
    expect(ops?.items.some((item) => item.href === "/profile" && item.labelKey === "nav.myAccount")).toBe(true);
    const hrefs = flyout.map((link) => link.href);
    expect(hrefs).not.toContain("/people/hr/probation");
    expect(hrefs).not.toContain("/people/hr/resignations");
    expect(hrefs).not.toContain("/people/hr/terminations");
    expect(flyout.map((link) => link.labelKey)).not.toContain("nav.hrProbation");
    expect(flyout.map((link) => link.labelKey)).not.toContain("nav.hrResignations");
    expect(flyout.map((link) => link.labelKey)).not.toContain("nav.hrTerminations");
    const peopleSection =
      clusterItemsBySection(flyout).find((block) => block.sectionKey === "nav.peopleSectionPeople")?.items ?? [];
    const jobRequests = peopleSection.findIndex((item) => item.href === "/people/recruitment/jobs");
    const probationExit = peopleSection.findIndex((item) => item.href === "/people/hr/probation-exit");
    expect(jobRequests).toBeGreaterThanOrEqual(0);
    expect(probationExit).toBe(jobRequests + 1);
    expect(peopleSection.some((item) => item.labelKey === "nav.endOfService" && item.href === "/people/hr/end-of-service")).toBe(true);
    expect(peopleSection.filter((item) => item.labelKey === "nav.hrProbationExit")).toHaveLength(1);
    const adminLabels =
      clusterItemsBySection(flyout)
        .find((block) => block.sectionKey === "nav.peopleSectionAdmin")
        ?.items.map((item) => item.labelKey) ?? [];
    expect(adminLabels).toEqual([
      "nav.recordRetention",
      "nav.bulkImport",
      "nav.hardwareTools",
      "nav.hrRulesSettings",
      "nav.importRoster",
      "nav.hrJobAdmin",
      "nav.attendanceImport",
      "nav.attendanceMapping",
      "nav.attendanceDevices",
      "nav.hrShiftPolicy",
      "nav.hrAnnouncements",
      "nav.hrSettings",
      "nav.hrEmployeeApp",
      "nav.peopleExtras",
    ]);
    expect(adminLabels).not.toContain("nav.hrDirectory");
    expect(adminLabels).not.toContain("nav.hrAttendance");
    expect(hrefs.indexOf("/people/hr")).toBe(0);
    expect(hrefs.filter((href) => href === "/people/hr")).toEqual(["/people/hr"]);
    expect(ops?.items.some((item) => item.href === "/chat" && item.labelKey === "nav.communicationHub")).toBe(true);
    expect(hrefs.indexOf("/people/attendance/import")).toBeGreaterThan(hrefs.indexOf("/people/hr/reports"));
    expect(hrefs.indexOf("/people/hr/shift-policy")).toBeGreaterThan(hrefs.indexOf("/people/attendance/import"));
  });

  it("highlights attendance parent when a child tab route is active", () => {
    expect(
      isSidebarNavGroupActive("/people/attendance", "/people/attendance/import", [
        "/people/attendance",
        "/people/attendance/import",
      ]),
    ).toBe(true);
    expect(isSidebarNavGroupItemActive("/people/attendance", "/people/attendance/import")).toBe(false);
    expect(isSidebarNavGroupItemActive("/people/attendance/import", "/people/attendance/import")).toBe(true);
    expect(isSidebarNavGroupItemActive("/people/hr", "/people/hr/documents")).toBe(false);
    expect(isSidebarNavGroupActive("/people/hr", "/people/hr/documents")).toBe(true);
  });

  it("keeps payroll visible for CFO as its own row", () => {
    const people = getVisibleDepartments(["cfo"]).find((dept) => dept.id === "people");
    const hrefs = new Set(people?.items.map((i) => i.href) ?? []);
    expect(hrefs.has("/people/payroll")).toBe(true);
    expect(people?.groups ?? []).toEqual([]);
  });

  it("lists My day for cashiers and hides other people's attendance", () => {
    const sections = getEmployeeSectionNav(["cashier_host"]).map((item) => item.href);
    expect(sections).toEqual(["/hr/me"]);
    const people = getVisibleDepartments(["cashier_host"]).find((dept) => dept.id === "people");
    const hrefs = new Set(people?.items.map((item) => item.href) ?? []);
    expect(hrefs.has("/hr/me")).toBe(true);
    for (const href of [
      "/hr/me#me-attendance",
      "/hr/me#me-roster",
      "/hr/me#me-leave",
      "/hr/me#me-issues",
      "/hr/me#me-documents",
      "/hr/me#me-payslips",
      "/hr/me#me-kra",
    ]) {
      expect(hrefs.has(href)).toBe(false);
    }
    expect(hrefs.has("/people/payroll")).toBe(false);
    expect(hrefs.has("/people/attendance")).toBe(false);
    expect(hrefs.has("/people/hr")).toBe(false);
    expect(hrefs.has("/people/hr/modules")).toBe(false);
    expect(getEmployeeSectionNav(["customer_service"]).map((item) => item.href)).toEqual(["/hr/me"]);
  });

  it("uses one employee rail for cashiers, collapsed and expanded", () => {
    expect(usesEmployeeFlatRail(["cashier_host"])).toBe(true);
    expect(usesEmployeeFlatRail(["customer_service"])).toBe(true);
    expect(usesEmployeeFlatRail(["cashier_host"], true)).toBe(false);
    expect(usesEmployeeFlatRail(["technician"])).toBe(false);
    expect(usesEmployeeFlatRail(["tech_supervisor"])).toBe(false);
    expect(usesEmployeeFlatRail(["duty_manager"])).toBe(false);
    expect(usesEmployeeFlatRail(["hr"])).toBe(false);
    expect(getEmployeeFlatRail(["cashier_host"]).map((item) => item.href)).toEqual([
      "/hr/me",
      "/chat#hub",
      "/training/learning",
      "/people/hr/helpdesk",
      "/daily-ops",
      "/tasks",
      "/customer",
      "/issues",
      "/maintenance/requests",
      "/procurement/my-requests",
    ]);
    expect(getEmployeeFlatRail(["duty_manager"])).toEqual([]);
    expect(employeePinnedRailItems(["technician"], false, new Set()).map((item) => item.href)).toEqual([
      "/training/learning",
      "/people/hr/helpdesk",
    ]);
    expect(employeePinnedRailItems(["cashier_host"], false, new Set())).toEqual([]);
    expect(employeePinnedRailItems(["duty_manager"], false, new Set())).toEqual([]);
  });

  it("shows Bookings to administration, the general manager, and temporarily to supervisors and managers", () => {
    const visible = (roles: Parameters<typeof getAllVisibleNavItems>[0]) =>
      getAllVisibleNavItems(roles).map((item) => item.href);

    for (const role of ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"] as const) {
      expect(visible([role])).toContain("/bookings");
      expect(getVisibleDepartments([role]).some((dept) => dept.items.some((item) => item.href === "/bookings"))).toBe(
        true,
      );
    }

    for (const role of [
      "cashier_host",
      "customer_service",
      "technician",
      "hr",
      "auditor",
      "cfo",
    ] as const) {
      expect(visible([role])).not.toContain("/bookings");
      expect(getEmployeeFlatRail([role]).map((item) => item.href)).not.toContain("/bookings");
    }

    const cashierGuest = getVisibleDepartments(["cashier_host"]).find((dept) => dept.id === "guest");
    expect(cashierGuest?.items.map((item) => item.href) ?? []).not.toContain("/bookings");
    expect(cashierGuest?.items.map((item) => item.href) ?? []).toContain("/pos");

    const dutyGuest = getVisibleDepartments(["duty_manager"]).find((dept) => dept.id === "guest");
    expect(dutyGuest?.items.map((item) => item.href) ?? []).toEqual(
      expect.arrayContaining(["/bookings", "/customer", "/pos"]),
    );

    const techGuest = getVisibleDepartments(["tech_supervisor"]).find((dept) => dept.id === "guest");
    expect(techGuest?.items.map((item) => item.href) ?? []).toContain("/bookings");
    expect(techGuest?.items.map((item) => item.href) ?? []).not.toContain("/pos");
    expect(visible(["technician"])).not.toContain("/pos");
  });

  it("keeps My Day on the rail for supervisors and people with direct reports", () => {
    expect(showsMyDayNav(["cashier_host"])).toBe(true);
    expect(showsMyDayNav(["cashier_host"], true)).toBe(true);
    expect(showsMyDayNav(["duty_manager"])).toBe(true);
    expect(showsMyDayNav(["branch_gm"])).toBe(true);
    expect(showsMyDayNav(["tech_supervisor"])).toBe(true);
    expect(showsMyDayNav(["hr"], true)).toBe(true);
    expect(getEmployeeSectionNav(["duty_manager"]).map((item) => item.href)).toEqual(["/hr/me"]);
    expect(getEmployeeSectionNav(["branch_gm"]).map((item) => item.href)).toEqual(["/hr/me"]);
    expect(showsMyDayNav(["ceo"])).toBe(false);
    expect(showsMyDayNav(["hr"])).toBe(false);
  });

  it("hides payroll from technicians", () => {
    const people = getVisibleDepartments(["technician"]).find((dept) => dept.id === "people");
    const hrefs = new Set([
      ...(people?.items.map((item) => item.href) ?? []),
      ...(people?.groups.flatMap((group) => group.items.map((item) => item.href)) ?? []),
    ]);
    expect(hrefs.has("/people/payroll")).toBe(false);
  });

  it("shows Arcade Technical to technicians and keeps reports off their nav", () => {
    const arcade = getVisibleDepartments(["technician"]).find((dept) => dept.id === "arcade");
    const hrefs = arcade?.groups.flatMap((group) => group.items.map((item) => item.href)) ?? [];
    expect(hrefs).toContain("/arcade");
    expect(hrefs).toContain("/arcade/faults");
    expect(hrefs).toContain("/arcade/week");
    expect(hrefs).not.toContain("/arcade/reports");
    expect(getPrimaryRailNav(["technician"]).some((item) => item.departmentId === "arcade")).toBe(true);
  });

  it("keeps a group visible when some children fail capability checks", () => {
    const maintenance = getVisibleDepartments(["technician"]).find((dept) => dept.id === "maintenance");
    const group = maintenance?.groups.find((g) => g.id === "maintenance");
    expect(group).toBeDefined();
    expect(group?.items.some((item) => item.href === "/maintenance")).toBe(true);
    expect(group?.items.some((item) => item.href === "/maintenance/weekly-report/executive")).toBe(false);
  });

  it("shows the training catalog only to roles with training.view", () => {
    const hr = getVisibleDepartments(["hr"]).find((dept) => dept.id === "training");
    expect(hr?.items.some((item) => item.href === "/training")).toBe(true);
    expect(hr?.items.some((item) => item.href === "/training/assignments")).toBe(true);
    expect(hr?.items.some((item) => item.href === "/training/learning")).toBe(true);
    expect(hr?.items.some((item) => item.href === "/training/questions")).toBe(true);
    expect(hr?.items.some((item) => item.href === "/training/practicals")).toBe(true);
    const duty = getVisibleDepartments(["duty_manager"]).find((dept) => dept.id === "training");
    expect(duty?.items.some((item) => item.href === "/training/questions")).toBe(false);
    expect(duty?.items.some((item) => item.href === "/training/practicals")).toBe(true);
    expect(getVisibleDepartments(["duty_manager"]).some((dept) => dept.id === "training")).toBe(true);
    const cashier = getVisibleDepartments(["cashier_host"]).find((dept) => dept.id === "training");
    expect(cashier?.items.map((item) => item.href)).toEqual(["/training/learning", "/training/calendar"]);
    const technician = getVisibleDepartments(["technician"]).find((dept) => dept.id === "training");
    expect(technician?.items.map((item) => item.href)).toEqual(["/training/learning", "/training/calendar"]);
  });

  it("shows team manager modules for a login with direct reports", () => {
    const cashier = getVisibleDepartments(["cashier_host"]);
    const without = mergeReportingManagerDepartments(cashier, false);
    expect(without).toBe(cashier);
    const cashierHrefs = new Set(cashier.find((dept) => dept.id === "people")?.items.map((item) => item.href) ?? []);
    for (const href of [
      "/people/hr/team",
      "/people/leave",
      "/people/attendance",
      "/people/attendance/corrections",
      "/people/attendance/mapping",
      "/people/roster",
      "/people/hr/hierarchy",
    ]) {
      expect(cashierHrefs.has(href)).toBe(false);
    }

    const withReports = mergeReportingManagerDepartments(cashier, true);
    const people = withReports.find((dept) => dept.id === "people");
    const hrefs = people?.items.map((item) => item.href) ?? [];
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/people/hr/team",
        "/people/leave",
        "/people/attendance",
        "/people/attendance/corrections",
        "/people/attendance/mapping",
        "/people/roster",
        "/people/hr/hierarchy",
      ]),
    );
    expect(hrefs).not.toContain("/people/attendance/import");
    expect(hrefs).not.toContain("/people/payroll");
    const attendanceAt = hrefs.indexOf("/people/attendance");
    expect(hrefs[attendanceAt + 1]).toBe("/people/attendance/corrections");
    expect(people?.items.find((item) => item.href === "/people/leave")?.labelKey).toBe("nav.hrLeave");
    expect(people?.items.find((item) => item.href === "/people/attendance")?.labelKey).toBe("nav.attendance");
    expect(people?.items.find((item) => item.href === "/people/roster")?.labelKey).toBe("nav.monthlyRoster");
    expect(people?.items.find((item) => item.href === "/people/hr/team")?.labelKey).toBe("nav.teamOverview");

    const primaryDepartments = new Set(getPrimaryRailNav(["cashier_host"]).map((item) => item.departmentId));
    expect(primaryDepartments.has("people")).toBe(false);
    expect(reportingManagerRailItems(true, primaryDepartments).map((item) => item.href)).toEqual([
      "/people/hr/team",
      "/people/leave",
      "/people/attendance",
      "/people/attendance/corrections",
      "/people/attendance/mapping",
      "/people/roster",
      "/people/hr/hierarchy",
    ]);
    expect(reportingManagerRailItems(false, primaryDepartments)).toEqual([]);
  });

  it("does not add manager modules a duty manager already opens from People", () => {
    const duty = getVisibleDepartments(["duty_manager"]);
    const people = duty.find((dept) => dept.id === "people");
    expect(people?.items.some((item) => item.href === "/people/hr/team")).toBe(true);
    expect(people?.items.some((item) => item.href === "/people/attendance")).toBe(true);
    const dutyHrefs = people?.items.map((item) => item.href) ?? [];
    expect(dutyHrefs[dutyHrefs.indexOf("/people/attendance") + 1]).toBe("/people/attendance/corrections");
    expect(people?.items.some((item) => item.href === "/people/roster")).toBe(true);
    expect(people?.items.some((item) => item.href === "/people/leave")).toBe(false);

    const merged = mergeReportingManagerDepartments(duty, true);
    const leave = merged.find((dept) => dept.id === "people")?.items.filter((item) => item.href === "/people/leave") ?? [];
    expect(leave).toHaveLength(1);
    expect(leave[0]?.labelKey).toBe("nav.hrLeave");

    const primaryDepartments = new Set(getPrimaryRailNav(["duty_manager"]).map((item) => item.departmentId));
    expect(primaryDepartments.has("people")).toBe(true);
    expect(reportingManagerRailItems(true, primaryDepartments)).toEqual([]);
    expect(mergeReportingManagerDepartments(duty, false)).toBe(duty);
  });

  it("lists Weekly Management Review under Operations for Head of Ops and HR", () => {
    const ops = getVisibleDepartments(["regional_ops"]).find((dept) => dept.id === "operations");
    expect(ops?.items.some((item) => item.href === "/operations/weekly-review")).toBe(true);
    expect(ops?.items.some((item) => item.href === "/operations/corporate-deals")).toBe(true);
    const hr = getVisibleDepartments(["hr"]).find((dept) => dept.id === "operations");
    expect(hr?.items.some((item) => item.href === "/operations/weekly-review")).toBe(true);
    expect(hr?.items.some((item) => item.href === "/operations/corporate-deals")).toBe(true);
    const tech = getVisibleDepartments(["technician"]).find((dept) => dept.id === "operations");
    expect(tech?.items.some((item) => item.href === "/operations/weekly-review")).toBe(false);
    expect(tech?.items.some((item) => item.href === "/operations/corporate-deals")).toBe(false);
  });
});
