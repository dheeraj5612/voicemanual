/**
 * Text-to-Speech integration using ElevenLabs.
 * Converts AI text responses into natural-sounding audio
 * with the manufacturer's configured voice.
 */

interface VoiceSynthesisOptions {
  text: string;
  voiceId?: string;
  modelId?: string;
}

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

export async function synthesizeSpeech(
  options: VoiceSynthesisOptions
): Promise<ArrayBuffer> {
  const {
    text,
    voiceId = process.env.ELEVENLABS_VOICE_ID!,
    modelId = "eleven_turbo_v2_5",
  } = options;

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `ElevenLabs API error: ${response.status} ${response.statusText}`
    );
  }

  return response.arrayBuffer();
}

export async function listVoices(): Promise<
  Array<{ voice_id: string; name: string }>
> {
  const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
  });

  if (!response.ok) {
    throw new Error(`Failed to list voices: ${response.status}`);
  }

  const data = await response.json();
  return data.voices;
}
