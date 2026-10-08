import { describe, expect, it } from "vitest";

import {
  chatHubListsFullReportingTree,
  chatDirectoryUsesManagerCrew,
  companyDirectoryRows,
  directChatPeerIds,
  hubRosterRows,
  managerCrewDirectoryRows,
  visibleChatList,
  type ChatListConversation,
  type ChatListPerson,
  type HubRosterRow,
} from "./list-rules";

function conversation(partial: Partial<ChatListConversation> & Pick<ChatListConversation, "id" | "kind">): ChatListConversation {
  return {
    unreadCount: 0,
    mentioned: false,
    peerName: null,
    peerUserId: null,
    ...partial,
  };
}

function roster(partial: Partial<HubRosterRow> & Pick<HubRosterRow, "staffId">): HubRosterRow {
  return {
    status: "active",
    userId: null,
    reportingManagerStaffId: null,
    employmentType: null,
    ...partial,
  };
}

function person(partial: Partial<ChatListPerson> & Pick<ChatListPerson, "userId" | "fullName">): ChatListPerson {
  return {
    employeeCode: null,
    jobTitle: null,
    email: null,
    departmentName: null,
    ...partial,
  };
}

const rajan = conversation({
  id: "dm-rajan",
  kind: "DIRECT",
  peerName: "Rajan Pathak",
  peerUserId: "user-rajan",
  unreadCount: 1,
});
const phase = conversation({ id: "group-phase", kind: "PROJECT", peerName: "Phase 4 check" });
const noor = person({ userId: "user-noor", fullName: "Noor Ali", jobTitle: "Cashier", employeeCode: "42" });
const rajanPerson = person({ userId: "user-rajan", fullName: "Rajan Pathak", jobTitle: "Technician" });

describe("company chat directory", () => {
  it("keeps still-employed staff and leaves former staff out", () => {
    const rows = companyDirectoryRows([
      { id: "active", status: "active" },
      { id: "secondment", status: "secondment" },
      { id: "probation", status: "probation" },
      { id: "remote", status: "remote" },
      { id: "blank", status: "" },
      { id: "resigned", status: "resigned" },
      { id: "terminated", status: "terminated" },
      { id: "joker", status: "joker" },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["active", "secondment", "probation", "remote", "blank"]);
  });
});

describe("reporting-line hub roster", () => {
  const tree = [
    roster({ staffId: "ceo", userId: "user-ceo" }),
    roster({ staffId: "manager", reportingManagerStaffId: "ceo" }),
    roster({ staffId: "floor", reportingManagerStaffId: "manager" }),
    roster({ staffId: "left", reportingManagerStaffId: "manager", status: "resigned" }),
    roster({ staffId: "joker", reportingManagerStaffId: "ceo", employmentType: "joker" }),
    roster({ staffId: "outside", userId: "user-outside" }),
  ];

  it("includes direct and indirect reports even when they have no login", () => {
    expect(chatHubListsFullReportingTree(100, true)).toBe(true);
    const rows = hubRosterRows({ rows: tree, rootStaffId: "ceo", listFullTree: true });
    expect(rows.map((row) => row.staffId)).toEqual(["manager", "floor"]);
  });

  it("hides people without a login from someone who does not list the full tree", () => {
    expect(chatHubListsFullReportingTree(95, true)).toBe(false);
    expect(chatHubListsFullReportingTree(100, false)).toBe(false);
    expect(chatHubListsFullReportingTree(70, true)).toBe(false);
    const rows = hubRosterRows({ rows: tree, rootStaffId: "ceo", listFullTree: false });
    expect(rows.map((row) => row.staffId)).toEqual(["outside"]);
  });
});

describe("manager crew directory", () => {
  const rows = [
    roster({ staffId: "agnes", userId: "user-agnes", reportingManagerStaffId: "mary" }),
    roster({ staffId: "jorene", userId: "user-jorene", reportingManagerStaffId: "mary" }),
    roster({ staffId: "mary", userId: "user-mary", reportingManagerStaffId: "ruben" }),
    roster({ staffId: "other-branch", userId: "user-other", reportingManagerStaffId: "ruben" }),
    roster({ staffId: "no-login", reportingManagerStaffId: "mary" }),
    roster({ staffId: "left", userId: "user-left", reportingManagerStaffId: "mary", status: "resigned" }),
  ];

  it("lists teammates who share the employee's reporting manager", () => {
    expect(
      chatDirectoryUsesManagerCrew({
        listsFullTree: false,
        seesEveryone: false,
        hasDirectReports: false,
        managerStaffId: "mary",
      }),
    ).toBe(true);
    expect(
      chatDirectoryUsesManagerCrew({
        listsFullTree: false,
        seesEveryone: false,
        hasDirectReports: true,
        managerStaffId: "mary",
      }),
    ).toBe(false);
    expect(
      managerCrewDirectoryRows({ rows, viewerStaffId: "agnes", managerStaffId: "mary" }).map((row) => row.staffId),
    ).toEqual(["jorene", "mary"]);
  });

  it("leaves the reporting manager out when they have no login", () => {
    const withoutLogin = rows.map((row) => (row.staffId === "mary" ? { ...row, userId: null } : row));
    expect(
      managerCrewDirectoryRows({ rows: withoutLogin, viewerStaffId: "agnes", managerStaffId: "mary" }).map(
        (row) => row.staffId,
      ),
    ).toEqual(["jorene"]);
  });
});

describe("visible chat list", () => {
  const base = {
    conversations: [rajan, phase],
    people: [noor, rajanPerson],
    favoriteIds: new Set<string>(),
    query: "",
    conversationName: (row: ChatListConversation) => row.peerName ?? row.kind,
    conversationPreview: () => "",
  };

  it("lists the manager's team in the chat panel when there are no conversations yet", () => {
    const visible = visibleChatList({ ...base, conversations: [], filter: "all" });
    expect(visible.conversations).toEqual([]);
    expect(visible.people.map((row) => row.fullName)).toEqual(["Noor Ali", "Rajan Pathak"]);
  });

  it("lists messageable people on All and keeps an existing direct chat once", () => {
    const visible = visibleChatList({ ...base, filter: "all" });
    expect(visible.conversations.map((row) => row.id)).toEqual(["dm-rajan", "group-phase"]);
    expect(visible.people.map((row) => row.userId)).toEqual(["user-noor"]);
    expect(directChatPeerIds(base.conversations)).toEqual(new Set(["user-rajan"]));
  });

  it("keeps unread, favorites, and mentions on conversations only", () => {
    expect(visibleChatList({ ...base, filter: "unread" }).people).toEqual([]);
    expect(visibleChatList({ ...base, filter: "unread" }).conversations.map((row) => row.id)).toEqual(["dm-rajan"]);
    expect(visibleChatList({ ...base, filter: "favorites" }).people).toEqual([]);
    expect(
      visibleChatList({ ...base, filter: "favorites", favoriteIds: new Set(["group-phase"]) }).conversations.map(
        (row) => row.id,
      ),
    ).toEqual(["group-phase"]);
    expect(visibleChatList({ ...base, filter: "mentions" }).people).toEqual([]);
    expect(
      visibleChatList({
        ...base,
        filter: "mentions",
        conversations: [conversation({ ...rajan, mentioned: true }), phase],
      }).conversations.map((row) => row.id),
    ).toEqual(["dm-rajan"]);
  });

  it("lists a reporting-line name with no login on All and finds it by search", () => {
    const floor = person({ userId: null, fullName: "Floor Staff", jobTitle: "Attendant" });
    const visible = visibleChatList({ ...base, people: [...base.people, floor], filter: "all", query: "floor" });
    expect(visible.people.map((row) => row.fullName)).toEqual(["Floor Staff"]);
    expect(visible.conversations).toEqual([]);
    expect(visibleChatList({ ...base, people: [floor], filter: "unread" }).people).toEqual([]);
    expect(visibleChatList({ ...base, people: [floor], filter: "favorites" }).people).toEqual([]);
    expect(visibleChatList({ ...base, people: [floor], filter: "mentions" }).people).toEqual([]);
  });

  it("matches a staff name that has no conversation yet", () => {
    const visible = visibleChatList({ ...base, filter: "all", query: "noor" });
    expect(visible.people.map((row) => row.fullName)).toEqual(["Noor Ali"]);
    expect(visible.conversations).toEqual([]);
  });

  it("matches an existing direct chat by peer name without adding a second row", () => {
    const visible = visibleChatList({ ...base, filter: "all", query: "rajan" });
    expect(visible.conversations.map((row) => row.id)).toEqual(["dm-rajan"]);
    expect(visible.people).toEqual([]);
  });

  it("still finds a titled direct chat from the other person's name", () => {
    const titled = conversation({
      id: "dm-titled",
      kind: "DIRECT",
      peerName: "Noor Ali",
      peerUserId: "user-noor",
    });
    const visible = visibleChatList({
      ...base,
      conversations: [titled],
      people: [noor],
      filter: "all",
      query: "noor",
      conversationName: () => "Shift cover",
    });
    expect(visible.conversations.map((row) => row.id)).toEqual(["dm-titled"]);
    expect(visible.people).toEqual([]);
  });
});
