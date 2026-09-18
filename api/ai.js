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
      contents: [{ role: 'user', parts: [{ text: body.prompt || '' }] }],
      generationConfig: {
        temperature: body.temperature ?? 0.7,
        maxOutputTokens: body.maxOutputTokens ?? 2048
      }
    };

    if (!payload.contents || !Array.isArray(payload.contents)) {
      return res.status(400).json({ error: 'Payload Gemini non valido' });
    }

    // Fallback automatico: evita il modello 3.6 hardcoded che può andare in high demand.
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
    let lastError = 'Errore nella risposta Gemini';

    for (const model of models) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();

      if (response.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
        if (text) return res.status(200).json({ text, raw: data, model });
        lastError = 'Gemini ha restituito una risposta vuota';
      } else {
        lastError = data?.error?.message || `Errore Gemini ${response.status}`;
        if (![400, 404, 429, 500, 502, 503, 504].includes(response.status)) break;
      }
    }

    return res.status(503).json({ error: `Servizio AI temporaneamente non disponibile. Riprova tra pochi secondi. Dettaglio: ${lastError}` });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Errore interno del backend' });
  }
}
