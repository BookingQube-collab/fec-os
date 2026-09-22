/**
 * ponytail: assert rememberSignedInEmail drops prior passkey ids when email changes.
 * Usage: node scripts/check-passkey-hint-email-switch.mjs
 */
import assert from "node:assert/strict";

// Mirror of src/lib/webauthn/hint.ts rememberSignedInEmail same-user logic (no DOM).
function nextHint(prev, email, userId) {
  const nextEmail = email.trim().toLowerCase();
  const sameUser =
    Boolean(prev) &&
    prev.email.trim().toLowerCase() === nextEmail &&
    (userId == null || prev.userId == null || prev.userId === userId);
  return {
    email: nextEmail,
    userId: userId ?? (sameUser ? prev?.userId : undefined),
    credentialIds: sameUser ? prev?.credentialIds : undefined,
  };
}

const hr = {
  email: "hr.manager@fec.test",
  userId: "hr-uid",
  credentialIds: ["cred-hr"],
};

const switched = nextHint(hr, "admin@fec.com", "admin-uid");
assert.equal(switched.email, "admin@fec.com");
assert.equal(switched.userId, "admin-uid");
assert.equal(switched.credentialIds, undefined);

const same = nextHint(hr, "hr.manager@fec.test");
assert.equal(same.userId, "hr-uid");
assert.deepEqual(same.credentialIds, ["cred-hr"]);

console.log("check-passkey-hint-email-switch: ok");
