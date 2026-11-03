/**
 * Matndan ovoz (MP3). ELEVENLABS_API_KEY va ELEVENLABS_VOICE_ID berilmagan bo'lsa null qaytaradi,
 * shunda bildirishnoma faqat matn ko'rinishida yuboriladi.
 */
export async function synthesizeSpeech(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) return null;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    }),
  });
  if (!res.ok) throw new Error(`TTS xatolik: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
