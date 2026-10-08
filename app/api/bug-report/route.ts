import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2_800_000;
const IMAGE_PATTERN = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/;

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: "Report is too large." }, { status: 413 });
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ error: "Cross-origin reports are not accepted." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid report payload." }, { status: 400 }); }
  if (body.website) return NextResponse.json({ ok: true });
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const startedAt = Number(body.startedAt);
  if (description.length < 20 || description.length > 5000) return NextResponse.json({ error: "Description must be between 20 and 5,000 characters." }, { status: 400 });
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!Number.isFinite(startedAt) || startedAt > Date.now() + 60_000 || Date.now() - startedAt > 86_400_000) return NextResponse.json({ error: "Please reopen the form and try again." }, { status: 400 });
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BUG_REPORT_TO_EMAIL;
  const from = process.env.BUG_REPORT_FROM_EMAIL;
  if (!apiKey || !to || !from) return NextResponse.json({ error: "Bug reporting is not configured on this deployment. Copy the report and send it to the project owner." }, { status: 503 });
  const technical = typeof body.technical === "object" && body.technical ? body.technical : {};
  const screenshot = typeof body.screenshot === "string" ? body.screenshot : "";
  const match = screenshot ? screenshot.match(IMAGE_PATTERN) : null;
  if (screenshot && (!match || match[2].length > 2_700_000)) return NextResponse.json({ error: "Screenshot must be a PNG, JPEG, or WebP no larger than 2 MB." }, { status: 400 });
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from, to: [to], reply_to: email || undefined, subject: "Studio Recorder bug report",
        text: `${description}\n\nReporter: ${email || "not provided"}\n\nTechnical details:\n${JSON.stringify(technical, null, 2)}`,
        attachments: match ? [{ filename: String(body.screenshotName || "screenshot.png").replace(/[^a-zA-Z0-9._-]/g, "-"), content: match[2], content_type: `image/${match[1]}` }] : undefined,
      }),
    });
  } catch (error) {
    console.error("Bug report provider request failed", error instanceof Error ? error.message : "Unknown provider error");
    return NextResponse.json({ error: "The email service could not be reached. Your report is still in the form; try again." }, { status: 503 });
  }
  if (!response.ok) {
    const providerBody = await response.text();
    console.error("Bug report provider failed", response.status, providerBody);
    const senderRejected = response.status === 403 || response.status === 422 || /domain|sender|from/i.test(providerBody);
    return NextResponse.json({ error: senderRejected
      ? "Bug report sender was rejected. BUG_REPORT_FROM_EMAIL must use a domain verified in Resend."
      : "Email delivery failed. Your report is still in the form; retry or copy it." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
