export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY non configurata su Vercel' });

  try {
    const body = req.body || {};
    const payload = body.payload || {
      ...(body.systemInstruction
        ? { system_instruction: { parts: [{ text: body.systemInstruction }] } }
        : {}),
      contents: [
        {
          role: 'user',
          parts: [{ text: body.prompt || '' }]
        }
      ],
      generationConfig: {
        temperature: body.temperature ?? 0.7,
        maxOutputTokens: body.maxOutputTokens ?? 2048
      }
    };

    if (!payload.contents || !Array.isArray(payload.contents)) {
      return res.status(400).json({ error: 'Payload Gemini non valido' });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Errore nella risposta Gemini' });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    return res.status(200).json({ text, raw: data });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Errore interno del backend' });
  }
}
