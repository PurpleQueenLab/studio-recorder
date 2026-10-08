import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/bug-report/route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function request(body: Record<string, unknown>) {
  return new Request("https://studio.example/api/bug-report", { method: "POST", headers: { "content-type": "application/json", origin: "https://studio.example" }, body: JSON.stringify({ description: "The export button stopped after rendering.", email: "", technical: { page: "editor" }, startedAt: Date.now() - 2000, website: "", ...body }) });
}

describe("bug report route", () => {
  it("rejects invalid descriptions without contacting a provider", async () => {
    const response = await POST(request({ description: "too short" }));
    expect(response.status).toBe(400);
  });

  it("uses fixed server-owned recipients and accepts a valid report", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("BUG_REPORT_TO_EMAIL", "owner@example.com"); vi.stubEnv("BUG_REPORT_FROM_EMAIL", "Studio <bugs@example.com>");
    const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", provider);
    const response = await POST(request({ to: "attacker@example.com" }));
    expect(response.status).toBe(200);
    const body = JSON.parse(String(provider.mock.calls[0][1]?.body));
    expect(body.to).toEqual(["owner@example.com"]);
  });
});
