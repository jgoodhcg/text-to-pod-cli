import { createHash } from 'crypto';

export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Lowercase host
    urlObj.hostname = urlObj.hostname.toLowerCase();
    
    // Remove default ports
    if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
        (urlObj.protocol === 'https:' && urlObj.port === '443')) {
      urlObj.port = '';
    }
    
    // Remove trailing slash
    if (urlObj.pathname.endsWith('/') && urlObj.pathname !== '/') {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }
    
    // Sort query parameters
    if (urlObj.search) {
      const searchParams = new URLSearchParams(urlObj.search);
      const sortedParams = Array.from(searchParams.entries())
        .sort(([a], [b]) => a.localeCompare(b));
      urlObj.search = new URLSearchParams(sortedParams).toString();
    }
    
    // Remove fragment
    urlObj.hash = '';
    
    return urlObj.toString();
  } catch (error) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

export function generateUrlHash(url: string): string {
  const normalized = normalizeUrl(url);
  return createHash('sha1').update(normalized).digest('hex').substring(0, 8);
}

export function generateEpisodeId(urlHash: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // yyyyMMdd
  const time = now.toISOString().slice(11, 16).replace(/:/g, ''); // HHmm
  return `${date}-${time}-${urlHash}`;
}