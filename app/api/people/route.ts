import { parseShowOrgDepartmentsParam } from "@/lib/exclude-org-departments";
import { loadLinkedStaffJobTitle } from "@/lib/linked-staff-job-title.server";
import {
  hasCompanyPeopleDirectory,
  peopleDirectoryScope,
  peopleDirectoryShowsSalary,
} from "@/lib/people-directory-access";
import { loadPeopleDirectoryTeamStaffIds } from "@/lib/reporting-manager-access.server";
import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { ForbiddenError } from "@/lib/server/authorize";
import { fetchStaff, fetchStaffDirectory, fetchStaffJobTitles } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(async (context, req) => {
    const params = searchParams(req);
    const view = params.get("view");
    const pageParam = params.get("page");
    const roles = context.roles ?? [];

    if (view === "job-titles") {
      if (!hasCompanyPeopleDirectory(roles)) {
        throw new ForbiddenError("Missing capability: people.view_roster");
      }
      return { titles: await fetchStaffJobTitles(context) };
    }

    // Paginated directory (People Employees tab). Legacy array kept for other callers.
    if (view === "directory" || pageParam != null) {
      const jobTitle = await loadLinkedStaffJobTitle(context.userId);
      const scope = peopleDirectoryScope(roles, jobTitle);
      if (!scope) throw new ForbiddenError("Missing capability: people.view_roster");
      const teamStaffIds = scope === "team" ? await loadPeopleDirectoryTeamStaffIds(context.userId) : null;
      const pageSize = Number(params.get("pageSize") ?? "25");
      return fetchStaffDirectory(
        context,
        {
          locationId: params.get("locationId") || null,
          includeArchived: params.get("includeArchived") === "1",
          page: Number(pageParam ?? "1"),
          pageSize,
          q: params.get("q") ?? "",
          loc: params.get("loc") ?? "",
          department: params.get("department") ?? "",
          departmentName: params.get("departmentName") ?? "",
          showOrgDepartments: parseShowOrgDepartmentsParam(params.get("showOrgDepartments")),
          position: params.get("position") ?? "",
          employmentType: params.get("employmentType") ?? params.get("type") ?? "",
          status: params.get("status") ?? "",
          showJokers: params.get("jokers") === "1",
          nationality: params.get("nationality") ?? "",
          gender: params.get("gender") ?? "",
          sponsorship: params.get("sponsorship") ?? "",
          e3: params.get("e3") ?? "",
          missing: params.get("missing") === "1",
          expiry: params.get("expiry") ?? "",
          sort: (params.get("sort") as "name" | "code" | "location" | "joining" | "qid_expiry" | "passport_expiry") || "name",
        },
        {
          teamStaffIds,
          showSalary: peopleDirectoryShowsSalary(roles, jobTitle),
        },
      );
    }

    if (!hasCompanyPeopleDirectory(roles)) {
      throw new ForbiddenError("Missing capability: people.view_roster");
    }
    const jobTitle = await loadLinkedStaffJobTitle(context.userId);
    return fetchStaff(context, params.get("locationId") || null, {
      includeArchived: params.get("includeArchived") === "1",
      showSalary: peopleDirectoryShowsSalary(roles, jobTitle),
    });
  }, request);
}
