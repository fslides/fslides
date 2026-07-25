'use strict';

// fslides.dev — static site (assets) + hosted decks at /@owner/repo/* (R2).

const TYPES = {
  html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', webm: 'video/webm', mp4: 'video/mp4',
  m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf',
  woff2: 'font/woff2', md: 'text/markdown; charset=utf-8',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // hosted decks live on their own origin — user JS must never share
    // the app origin (dashboard tokens live in fslides.dev localStorage)
    if (url.hostname === 'decks.fslides.dev') {
      const parts = url.pathname.slice(1).split('/').filter(Boolean);
      if (parts.length < 2) return new Response('Deck not found', { status: 404 });
      const owner = parts.shift(), repo = parts.shift();
      let key = parts.join('/');

      // deck root without trailing slash → redirect so relative URLs resolve
      if (!key && !url.pathname.endsWith('/')) {
        return Response.redirect(url.origin + url.pathname + '/', 301);
      }
      if (!key || key.endsWith('/')) key += 'index.html';

      const obj = await env.DECKS.get(`${owner}/${repo}/${key}`.toLowerCase());
      if (!obj) return new Response('Not found — deploy with: fslides deploy', { status: 404 });

      const ext = key.split('.').pop().toLowerCase();
      const headers = new Headers();
      headers.set('Content-Type', obj.httpMetadata?.contentType || TYPES[ext] || 'application/octet-stream');
      headers.set('Cache-Control', ext === 'html' ? 'public, max-age=30' : 'public, max-age=300');
      headers.set('ETag', obj.httpEtag);
      return new Response(obj.body, { headers });
    }

    // legacy /@owner/repo on the app origin → redirect to the deck origin
    if (url.pathname.startsWith('/@')) {
      return Response.redirect('https://decks.fslides.dev/' + url.pathname.slice(2) + url.search, 301);
    }

    return env.ASSETS.fetch(request);
  },
};
