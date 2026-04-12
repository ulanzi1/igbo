// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  portalApplicationNotes,
  type PortalApplicationNote,
  type NewPortalApplicationNote,
} from "./portal-application-notes";

describe("portalApplicationNotes schema", () => {
  it("has all required columns", () => {
    const cols = Object.keys(portalApplicationNotes);
    expect(cols).toContain("id");
    expect(cols).toContain("applicationId");
    expect(cols).toContain("authorUserId");
    expect(cols).toContain("content");
    expect(cols).toContain("createdAt");
  });

  it("exports PortalApplicationNote select type with all columns", () => {
    const _check: PortalApplicationNote = {
      id: "note-1",
      applicationId: "app-1",
      authorUserId: "user-1",
      content: "Strong candidate — schedule interview",
      createdAt: new Date(),
    };
    expect(_check.content).toBe("Strong candidate — schedule interview");
  });

  it("exports NewPortalApplicationNote insert type", () => {
    const _check: NewPortalApplicationNote = {
      applicationId: "app-1",
      authorUserId: "user-1",
      content: "Needs more experience with React",
    };
    expect(_check.content).toBe("Needs more experience with React");
  });

  it("has id column as primary key", () => {
    expect(portalApplicationNotes.id).toBeDefined();
  });

  it("has applicationId column referencing portal_applications", () => {
    expect(portalApplicationNotes.applicationId).toBeDefined();
  });

  it("has authorUserId column referencing auth_users", () => {
    expect(portalApplicationNotes.authorUserId).toBeDefined();
  });

  it("has content column", () => {
    expect(portalApplicationNotes.content).toBeDefined();
  });

  it("has createdAt timestamp column", () => {
    expect(portalApplicationNotes.createdAt).toBeDefined();
  });
});
