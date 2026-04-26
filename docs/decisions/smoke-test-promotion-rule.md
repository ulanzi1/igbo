# Smoke Test Promotion Rule — AI-27

**Status:** active
**Date:** 2026-04-25
**Relates to:** AI-27 (Cross-Container Messaging Smoke Test)
**CI step:** "Cross-container smoke test (reporting gate — AI-27)" in `.github/workflows/ci.yml`

---

## Summary

The AI-27 cross-container smoke test starts as a **reporting gate** (`continue-on-error: true`). It shows red in the CI step summary when it fails but does **not** block merges. This prevents false CI positives while the test is new and may have environment sensitivity.

---

## Promotion Policy (reporting gate → blocking gate)

### Promote (remove `continue-on-error: true`)

**Trigger:** 3 consecutive green runs on the `main` branch.

**How to track:** Check the CI history for the "Cross-container smoke test (reporting gate — AI-27)" step on `main`. Three green ✅ rows in a row = eligible.

**Action:**

1. Remove `continue-on-error: true` from the smoke step in `.github/workflows/ci.yml`.
2. Add a comment `# promoted: <YYYY-MM-DD>` above the step.
3. Update this document: change **Status** to `promoted` and record the promotion date.
4. Announce in the team channel.

---

## Demotion Policy (blocking gate → reporting gate, if flake detected)

**Trigger:** The smoke test fails on `main` without a corresponding code change that would explain it (i.e., environment flake).

**Action:**

1. Restore `continue-on-error: true` on the step.
2. Open a GitHub issue titled: `[AI-27] smoke-test flake detected on <YYYY-MM-DD>`.
3. Investigate the flake root cause (timing sensitivity, Redis availability, Socket.IO port conflicts).
4. Once root cause is fixed and verified stable: restart the 3-green-run counter.

---

## Rationale

The smoke test exercises a live Redis pub/sub → Socket.IO delivery path that has no equivalent unit-test coverage. However, live infrastructure tests can be flaky in shared CI environments due to:

- Port contention (though the test uses `server.listen(0)` for dynamic ports)
- Redis service startup timing
- Socket.IO connection race conditions under load

Starting as a reporting gate (non-blocking) establishes a baseline before we commit to blocking CI on it.

---

## Checklist

- [ ] 1st consecutive green run on main
- [ ] 2nd consecutive green run on main
- [ ] 3rd consecutive green run on main → **promote**
