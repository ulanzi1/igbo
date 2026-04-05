// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: vi.fn((handler: (req: Request) => Promise<Response>, _opts?: unknown) => handler),
}));
vi.mock("@/lib/api-response", () => ({
  successResponse: vi.fn((data: unknown) => Response.json({ data }, { status: 200 })),
}));

import { JOB_TEMPLATES } from "@/lib/job-templates";

describe("GET /api/v1/job-templates", () => {
  it("returns all 5 job templates", async () => {
    const { GET } = await import("./route");
    const req = new Request("https://jobs.igbo.com/api/v1/job-templates");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof JOB_TEMPLATES };
    expect(body.data).toHaveLength(5);
  });

  it("each template has required fields (id, title, titleKey, descriptionHtml, requirements, employmentType)", async () => {
    const { GET } = await import("./route");
    const req = new Request("https://jobs.igbo.com/api/v1/job-templates");
    const res = await GET(req);
    const body = (await res.json()) as { data: typeof JOB_TEMPLATES };
    for (const template of body.data) {
      expect(template.id).toBeTruthy();
      expect(template.title).toBeTruthy();
      expect(template.titleKey).toBeTruthy();
      expect(template.descriptionHtml).toBeTruthy();
      expect(template.requirements).toBeTruthy();
      expect(template.employmentType).toBeTruthy();
    }
  });

  it("template IDs are unique", async () => {
    const { GET } = await import("./route");
    const req = new Request("https://jobs.igbo.com/api/v1/job-templates");
    const res = await GET(req);
    const body = (await res.json()) as { data: typeof JOB_TEMPLATES };
    const ids = body.data.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("response wraps templates in data field with 200 status", async () => {
    const { GET } = await import("./route");
    const req = new Request("https://jobs.igbo.com/api/v1/job-templates");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(Array.isArray(body.data)).toBe(true);
  });
});
