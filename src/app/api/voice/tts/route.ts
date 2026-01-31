import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { synthesizeSpeech } from "@/lib/voice";

const ttsRequestSchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voiceId } = ttsRequestSchema.parse(body);

    const audioBuffer = await synthesizeSpeech({ text, voiceId });

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("TTS error:", error);
    return NextResponse.json(
      { error: "Text-to-speech failed" },
      { status: 500 }
    );
  }
}
