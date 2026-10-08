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

  it("accepts a valid report immediately instead of rate-limiting the form", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("BUG_REPORT_TO_EMAIL", "owner@example.com"); vi.stubEnv("BUG_REPORT_FROM_EMAIL", "Studio <bugs@example.com>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const response = await POST(request({ startedAt: Date.now() }));
    expect(response.status).toBe(200);
  });

  it("passes an allowed screenshot to Resend without accepting project media", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("BUG_REPORT_TO_EMAIL", "owner@example.com"); vi.stubEnv("BUG_REPORT_FROM_EMAIL", "Studio <bugs@example.com>");
    const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", provider);
    expect((await POST(request({ screenshot: "data:image/png;base64,aGVsbG8=", screenshotName: "screen.png" }))).status).toBe(200);
    const body = JSON.parse(String(provider.mock.calls[0][1]?.body));
    expect(body.attachments).toEqual([{ filename: "screen.png", content: "aGVsbG8=", content_type: "image/png" }]);
    expect((await POST(request({ screenshot: "data:video/mp4;base64,aGVsbG8=" }))).status).toBe(400);
  });

  it("returns a clear sender configuration error when Resend rejects the sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("BUG_REPORT_TO_EMAIL", "owner@example.com"); vi.stubEnv("BUG_REPORT_FROM_EMAIL", "Studio <unverified@example.com>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"domain is not verified"}', { status: 403 })));
    const response = await POST(request({}));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Bug report sender was rejected. BUG_REPORT_FROM_EMAIL must use a domain verified in Resend." });
  });

  it("keeps provider network failures visible and retryable", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("BUG_REPORT_TO_EMAIL", "owner@example.com"); vi.stubEnv("BUG_REPORT_FROM_EMAIL", "Studio <bugs@example.com>");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const response = await POST(request({}));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("could not be reached");
  });
});
