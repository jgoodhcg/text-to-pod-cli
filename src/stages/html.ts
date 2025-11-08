import type { Context } from '../types.js';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { resolve, join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import https from 'https';

interface RSSEpisode {
  title: string;
  description: string;
  pubDate: string;
  guid: string;
  enclosure: {
    '@_url': string;
    '@_type': string;
    '@_length': string;
  };
  duration?: string;
  'itunes:summary'?: string;
  'itunes:author'?: string;
  'itunes:duration'?: string;
}

interface RSSFeed {
  title: string;
  description: string;
  link: string;
  language: string;
  author: string;
  image?: {
    url: string;
    title: string;
    link: string;
  };
  item: RSSEpisode[];
}

function generateHTML(feed: RSSFeed): string {
  const episodes = feed.item.sort((a, b) => 
    new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  const pageIntro = 'episode list pulled from the rss feed.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Episode List</title>
    <meta name="description" content="${escapeHtml(feed.description)}">
    <meta name="author" content="${escapeHtml(feed.author)}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(feed.link)}">
    <meta property="og:title" content="${escapeHtml(feed.title)}">
    <meta property="og:description" content="${escapeHtml(feed.description)}">
    ${feed.image ? `<meta property="og:image" content="${escapeHtml(feed.image.url)}">` : ''}
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${escapeHtml(feed.link)}">
    <meta property="twitter:title" content="${escapeHtml(feed.title)}">
    <meta property="twitter:description" content="${escapeHtml(feed.description)}">
    ${feed.image ? `<meta property="twitter:image" content="${escapeHtml(feed.image.url)}">` : ''}
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Liberation Mono", "Courier New", monospace;
            background-color: #0c0c0c;
            color: #d8d8d8;
            line-height: 1.6;
        }
        
        .page {
            max-width: 640px;
            margin: 0 auto;
            padding: 32px 16px 64px;
        }
        
        header {
            padding-bottom: 16px;
            margin-bottom: 32px;
            border-bottom: 1px solid #1e1e1e;
        }
        
        .feed-cover {
            width: 100%;
            max-height: 280px;
            object-fit: cover;
            margin-bottom: 20px;
            display: block;
        }
        
        .page-title {
            font-size: 1.35rem;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: lowercase;
            margin: 0 0 6px;
            color: #f3f3f3;
        }
        
        .page-description {
            margin-top: 10px;
            color: #868b94;
        }
        
        .page-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            list-style: none;
            padding: 0;
            margin: 14px 0 0;
            font-size: 0.85rem;
            color: #6f757d;
        }
        
        .page-meta .meta-link {
            color: #9cdcfe;
            text-decoration: none;
        }
        
        .page-meta .meta-link:hover {
            text-decoration: underline;
        }
        
        .search {
            margin-bottom: 24px;
        }
        
        .search-label {
            display: block;
            font-size: 0.8rem;
            color: #6f757d;
            margin-bottom: 6px;
        }
        
        .search-input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #1f1f1f;
            border-radius: 4px;
            background-color: #131313;
            color: #e6e6e6;
            font-size: 0.95rem;
        }
        
        .search-input:focus {
            outline: none;
            border-color: #3d7eff;
        }
        
        .episodes {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
        }
        
        .episode-item {
            padding: 16px 0 14px;
            border-top: 1px solid #1a1a1a;
        }
        
        .episode-item:first-child {
            border-top: none;
        }
        
        .episode-title {
            font-size: 1.05rem;
            font-weight: 600;
            margin: 0;
            color: #f3f3f3;
        }
        
        .episode-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 14px;
            margin-top: 8px;
            font-size: 0.8rem;
            color: #7e838c;
        }
        
        .episode-summary {
            margin-top: 10px;
            color: #c3c3c3;
        }
        
        .description-toggle {
            margin-top: 10px;
            border: none;
            background: none;
            color: #9cdcfe;
            cursor: pointer;
            font-size: 0.8rem;
            padding: 0;
            text-decoration: underline;
            text-decoration-thickness: 1px;
            text-underline-offset: 2px;
        }
        
        .description-toggle:focus-visible {
            outline: 1px solid #9cdcfe;
            outline-offset: 2px;
        }
        
        .full-description {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #1e1e1e;
            display: none;
            color: #c3c3c3;
        }
        
        .full-description.show {
            display: block;
        }
        
        .audio-player {
            margin-top: 12px;
        }
        
        .audio-player audio {
            width: 100%;
            background-color: #0c0c0c;
            border: 1px solid #202020;
        }
        
        .no-results {
            margin-top: 24px;
            font-size: 0.85rem;
            color: #6f757d;
            display: none;
        }
        
        .page-footer {
            margin-top: 40px;
            padding-top: 16px;
            border-top: 1px solid #1e1e1e;
            font-size: 0.8rem;
            color: #6f757d;
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }
        
        .page-footer span {
            display: inline-block;
        }
        
        .rss-link {
            color: #9cdcfe;
            text-decoration: none;
        }
        
        .rss-link:hover {
            text-decoration: underline;
        }
        
        @media (max-width: 600px) {
            .page {
                padding: 24px 14px 48px;
            }
        }
    </style>
</head>
<body>
    <div class="page">
        <header>
            ${feed.image ? `<img src="${escapeHtml(feed.image.url)}" alt="${escapeHtml(feed.image.title)}" class="feed-cover">` : ''}
            <h1 class="page-title">episodes</h1>
            <p class="page-description">${pageIntro}</p>
            <ul class="page-meta">
                <li>${episodes.length} episodes</li>
                ${feed.author ? `<li>${escapeHtml(feed.author)}</li>` : ''}
                ${feed.language ? `<li>${escapeHtml(feed.language)}</li>` : ''}
                ${feed.link ? `<li><a href="${escapeHtml(feed.link)}" class="meta-link">source feed</a></li>` : ''}
            </ul>
        </header>

        <main>
            <section class="search">
                <label class="search-label" for="searchInput">Filter episodes</label>
                <input 
                    type="text" 
                    class="search-input" 
                    placeholder="Filter episodes..." 
                    id="searchInput"
                >
            </section>

            <section>
                <ul class="episodes" id="episodesGrid">
                    ${episodes.map((episode, index) => `
                        <li class="episode-item" data-title="${escapeHtml((episode.title || '').toLowerCase())}" data-description="${escapeHtml((episode.description || '').toLowerCase())}">
                            <h2 class="episode-title">${escapeHtml(episode.title)}</h2>
                            <div class="episode-meta">
                                <span>${formatDate(episode.pubDate)}</span>
                                <span>${formatDuration(episode.duration || episode['itunes:duration'])}</span>
                            </div>
                            <p class="episode-summary">
                                ${truncateText(episode['itunes:summary'] || episode.description, 200)}
                            </p>
                            <button 
                                class="description-toggle" 
                                type="button" 
                                data-target="description-${index}" 
                                onclick="toggleDescription(${index})"
                            >
                                show details
                            </button>
                            <div class="full-description" id="description-${index}">
                                <div>${extractHtmlFromDescription(episode.description) || escapeHtml(episode['itunes:summary'] || '')}</div>
                            </div>
                            <div class="audio-player">
                                <audio controls preload="none">
                                    <source src="${escapeHtml(episode.enclosure['@_url'] || '')}" type="${escapeHtml(episode.enclosure['@_type'] || 'audio/mpeg')}">
                                    Your browser does not support the audio element.
                                </audio>
                            </div>
                        </li>
                    `).join('')}
                </ul>

                <div class="no-results" id="noResults">
                    <p>no entries match that filter.</p>
                </div>
            </section>
        </main>

        <footer class="page-footer">
            <span>generated with text to pod</span>
            <a href="${escapeHtml(feed.link)}" class="rss-link">subscribe to rss feed</a>
        </footer>
    </div>

    <script>
        // Toggle description visibility
        function toggleDescription(index) {
            const targetId = \`description-\${index}\`;
            const description = document.getElementById(targetId);
            const button = document.querySelector(\`[data-target="\${targetId}"]\`);

            if (!description || !button) {
                return;
            }

            const isVisible = description.classList.toggle('show');
            button.textContent = isVisible ? 'hide details' : 'show details';
        }

        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (event) => {
            const searchTerm = event.target.value.toLowerCase();
            const episodes = document.querySelectorAll('.episode-item');
            const noResults = document.getElementById('noResults');
            let visibleCount = 0;
            
            episodes.forEach(episode => {
                const title = episode.dataset.title || '';
                const description = episode.dataset.description || '';
                
                if (title.includes(searchTerm) || description.includes(searchTerm)) {
                    episode.style.display = '';
                    visibleCount++;
                } else {
                    episode.style.display = 'none';
                }
            });
            
            noResults.style.display = visibleCount === 0 ? 'block' : 'none';
        });
    </script>
</body>
</html>`;
}

function escapeHtml(text: string | undefined): string {
  if (!text) return '';
  
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m] || m);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function formatDuration(duration?: string): string {
  if (!duration) return 'Unknown';
  
  // If it's already in MM:SS or HH:MM:SS format, return as-is
  if (/^\d{1,2}:\d{2}$/.test(duration) || /^\d{1,2}:\d{2}:\d{2}$/.test(duration)) {
    return duration;
  }
  
  // If it's seconds, convert to MM:SS
  const seconds = parseInt(duration);
  if (!isNaN(seconds)) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
  
  return duration;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

function extractHtmlFromDescription(description: string | undefined): string {
  if (!description) return '';
  
  // Extract content from CDATA sections
  const cdataMatch = description.match(/<!\[CDATA\[(.*?)\]\]>/s);
  if (cdataMatch && cdataMatch[1]) {
    return cdataMatch[1];
  }
  
  // If no CDATA, return as-is
  return description;
}

function downloadFeedFromSpaces(feedUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[html] Fetching RSS feed from: ${feedUrl}`);
    
    https.get(feedUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: Failed to fetch RSS feed`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Failed to fetch RSS feed: ${error.message}`));
    });
  });
}

function resolveS3cfgPath(s3cfg?: string): string | null {
  if (s3cfg) {
    // Expand ~ to home directory
    const expandedPath = s3cfg.replace(/^~/, homedir());
    return resolve(expandedPath);
  }
  const defaultPath = resolve(homedir(), '.s3cfg');
  return existsSync(defaultPath) ? defaultPath : null;
}

function buildS3Uri(spacesOrigin: string, remoteKey: string): string {
  const normalizedKey = remoteKey.replace(/^\/+/, '');
  const host = new URL(spacesOrigin).host;
  const bucket = host.split('.')[0];
  if (!bucket) {
    throw new Error(`[html] Unable to derive bucket name from origin: ${spacesOrigin}`);
  }
  return `s3://${bucket}/${normalizedKey}`;
}

function runS3cmd(args: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('s3cmd', args, { stdio: 'inherit' });

    child.on('error', (error) => {
      rejectPromise(new Error(`[html] Failed to spawn s3cmd: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`[html] s3cmd exited with code ${code}`));
      }
    });
  });
}

async function uploadToSpaces(
  localPath: string,
  remoteKey: string,
  context: Context,
  extraArgs: string[] = []
): Promise<void> {
  const s3Uri = buildS3Uri(context.options.spacesOrigin, remoteKey);
  console.log(`[html] Uploading ${localPath} -> ${s3Uri}`);

  const args: string[] = [];
  const s3cfgPath = resolveS3cfgPath(context.options.s3cfg);
  if (s3cfgPath) {
    if (!existsSync(s3cfgPath)) {
      throw new Error(`[html] s3cmd config file not found at ${s3cfgPath}. Provide a valid path via --s3cfg.`);
    }
    args.push('--config', s3cfgPath);
  }

  args.push('put', ...extraArgs, localPath, s3Uri);
  await runS3cmd(args);
}

export async function runHtml(context: Context): Promise<void> {
  console.log('[html] Running HTML generation stage');
  console.log('[html] Dry run:', context.options.dryRun);
  console.log('[html] No publish:', context.options.noPublish);

  // Build feed URL from Spaces origin and feed key
  const feedUrl = `${context.options.spacesOrigin}/${context.options.spacesFeedKey}`;
  console.log(`[html] Feed URL: ${feedUrl}`);

  let rssContent: string;

  if (context.options.dryRun) {
    console.log('[html] Dry run: would fetch RSS feed from DigitalOcean Spaces');
    console.log('[html] Dry run: would generate HTML landing page');
    console.log('[html] Dry run: would upload to DigitalOcean Spaces');
    return;
  }

  try {
    // Fetch RSS feed from DigitalOcean Spaces
    rssContent = await downloadFeedFromSpaces(feedUrl);
    console.log(`[html] Successfully fetched RSS feed (${rssContent.length} bytes)`);
  } catch (error) {
    throw new Error(`Failed to fetch RSS feed from Spaces: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Parse RSS feed
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

  const rssData = parser.parse(rssContent);
  const feed = rssData.rss?.channel;

  if (!feed) {
    throw new Error('Invalid RSS feed format: could not find channel element');
  }

  // Ensure feed.item is an array
  if (!Array.isArray(feed.item)) {
    feed.item = feed.item ? [feed.item] : [];
  }

  console.log(`[html] Found ${feed.item?.length || 0} episodes in RSS feed`);

  // Handle image structure
  let image = undefined;
  if (feed.image && feed.image.url) {
    image = {
      url: feed.image.url,
      title: feed.image.title || feed.title,
      link: feed.image.link || feed.link
    };
  } else if (feed['itunes:image'] && feed['itunes:image']['@_href']) {
    image = {
      url: feed['itunes:image']['@_href'],
      title: feed.title,
      link: feed.link
    };
  }

  // Generate HTML
  const htmlContent = generateHTML({
    ...feed,
    image
  });

  // Create resources directory if it doesn't exist
  const resourcesDir = join(process.cwd(), 'resources');
  if (!existsSync(resourcesDir)) {
    mkdirSync(resourcesDir, { recursive: true });
  }

  // Save HTML file to resources root
  const htmlPath = join(resourcesDir, 'index.html');
  writeFileSync(htmlPath, htmlContent);
  
  console.log(`[html] HTML landing page generated: ${htmlPath}`);
  
  // Upload to DigitalOcean Spaces unless no-publish is set
  if (!context.options.noPublish) {
    try {
      await uploadToSpaces(htmlPath, 'index.html', context, ['--acl-public']);
      console.log(`[html] HTML uploaded to: ${context.options.spacesOrigin}/index.html`);
    } catch (error) {
      console.error(`[html] Failed to upload HTML: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`[html] You can manually upload ${htmlPath} to ${context.options.spacesOrigin}/index.html`);
    }
  } else {
    console.log(`[html] Skipping upload (no-publish flag enabled)`);
    console.log(`[html] HTML saved locally: ${htmlPath}`);
  }
}
