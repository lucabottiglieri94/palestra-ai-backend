export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'YOUTUBE_API_KEY non configurata su Vercel' });
  }

  const exercise = String(req.query?.exercise || '').trim();
  if (!exercise) {
    return res.status(400).json({ error: 'Parametro exercise obbligatorio' });
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      part: 'snippet',
      q: `${exercise} esecuzione corretta palestra`,
      type: 'video',
      maxResults: '5',
      order: 'relevance',
      safeSearch: 'strict',
      relevanceLanguage: 'it'
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
    );
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Errore YouTube API'
      });
    }

    const videos = (data.items || [])
      .filter(item => item.id?.videoId)
      .map(item => ({
        videoId: item.id.videoId,
        title: item.snippet?.title || '',
        channelTitle: item.snippet?.channelTitle || '',
        description: item.snippet?.description || '',
        thumbnail: item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          '',
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}`
      }));

    return res.status(200).json({ exercise, videos });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Errore interno del backend YouTube'
    });
  }
}
