import { USER_DAT_RECORD_SIZE, type ParsedBiometricUser, type ParseIssue } from "./constants";

export type UserDatParseResult = {
  users: ParsedBiometricUser[];
  errors: ParseIssue[];
  recordCount: number;
};

function readCString(buf: Buffer, start: number): string {
  const slice = buf.subarray(start);
  const zero = slice.indexOf(0);
  const end = zero === -1 ? slice.length : zero;
  return slice.subarray(0, end).toString("utf8").replace(/\u0000/g, "").trim();
}

export function buildUserDatRecord(userId: number, name: string): Buffer {
  const rec = Buffer.alloc(USER_DAT_RECORD_SIZE);
  rec.writeUInt32LE(userId >>> 0, 0);
  Buffer.from(name, "utf8").subarray(0, USER_DAT_RECORD_SIZE - 12).copy(rec, 11);
  return rec;
}

export function buildUserDat(records: Array<{ userId: number; name: string }>): Buffer {
  return Buffer.concat(records.map((r) => buildUserDatRecord(r.userId, r.name)));
}

export function parseUserDat(buffer: Buffer): UserDatParseResult {
  const errors: ParseIssue[] = [];
  if (buffer.length === 0) {
    return { users: [], errors: [{ rowNumber: 0, code: "empty", message: "user.dat is empty" }], recordCount: 0 };
  }
  if (buffer.length % USER_DAT_RECORD_SIZE !== 0) {
    return {
      users: [],
      errors: [
        {
          rowNumber: 0,
          code: "corrupt_user_dat",
          message: `Corrupt user.dat: length ${buffer.length} is not divisible by ${USER_DAT_RECORD_SIZE}.`,
        },
      ],
      recordCount: 0,
    };
  }

  const recordCount = buffer.length / USER_DAT_RECORD_SIZE;
  const users: ParsedBiometricUser[] = [];
  for (let i = 0; i < recordCount; i += 1) {
    const offset = i * USER_DAT_RECORD_SIZE;
    const rec = buffer.subarray(offset, offset + USER_DAT_RECORD_SIZE);
    const userId = rec.readUInt32LE(0);
    const name = readCString(rec, 11);
    if (!userId && !name) {
      errors.push({
        rowNumber: i + 1,
        code: "empty_record",
        message: `Record ${i + 1} has no User ID or name.`,
      });
      continue;
    }
    if (!userId) {
      errors.push({
        rowNumber: i + 1,
        code: "missing_user_id",
        message: `Record ${i + 1} is missing User ID.`,
      });
      continue;
    }
    users.push({
      biometricUserId: String(userId),
      name: name || `User ${userId}`,
      recordOffset: offset,
    });
  }
  return { users, errors, recordCount };
}
