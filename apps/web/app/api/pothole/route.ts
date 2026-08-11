import { NextRequest, NextResponse } from "next/server";
import { Client, handle_file } from "@gradio/client";

export const runtime = "nodejs";

const SPACE = process.env.HF_POTHOLE_SPACE || "Uutkarssh/transpox-api";
const API_NAME = "/detect_potholes";
const HF_TOKEN = process.env.HF_TOKEN;

let cachedClient: Client | null = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  cachedClient = await Client.connect(
    SPACE,
    HF_TOKEN ? ({ hf_token: HF_TOKEN } as any) : undefined
  );
  return cachedClient;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    const confidence = Number(form.get("confidence") ?? 0.35);

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { status: "error", message: "No image received", detections: [] },
        { status: 400 }
      );
    }

    const client = await getClient();
    const result = await client.predict(API_NAME, {
      image: handle_file(file),
      confidence: Number.isFinite(confidence) ? confidence : 0.35,
    });

    const data = Array.isArray((result as any)?.data) ? (result as any).data : [];
    const rawPayload = data[1];

    let payload: any;
    if (typeof rawPayload === "string") {
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        payload = { status: "error", message: "Malformed model response", detections: [] };
      }
    } else if (rawPayload && typeof rawPayload === "object") {
      payload = rawPayload;
    } else {
      payload = { status: "error", message: "Empty model response", detections: [] };
    }

    return NextResponse.json(payload);
  } catch (error) {
    cachedClient = null;
    console.error("[pothole] detection failed:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Detection failed",
        detections: [],
      },
      { status: 502 }
    );
  }
}
