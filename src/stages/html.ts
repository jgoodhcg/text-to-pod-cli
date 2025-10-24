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

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(feed.title)}</title>
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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f8f9fa;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
        }
        
        header {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: white;
            padding: 60px 0;
            text-align: center;
        }
        
        .header-content {
            max-width: 800px;
            margin: 0 auto;
            padding: 0 20px;
        }
        
        h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            font-weight: 700;
        }
        
        .subtitle {
            font-size: 1.2rem;
            opacity: 0.9;
            margin-bottom: 30px;
        }
        
        .meta-info {
            display: flex;
            justify-content: center;
            gap: 30px;
            flex-wrap: wrap;
            font-size: 0.9rem;
            opacity: 0.8;
        }
        
        .meta-info span {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .podcast-image {
            width: 200px;
            height: 200px;
            border-radius: 20px;
            margin: 0 auto 30px;
            display: block;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            object-fit: cover;
        }
        
        main {
            padding: 60px 0;
        }
        
        .search-section {
            background: white;
            padding: 30px;
            border-radius: 15px;
            margin-bottom: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .search-input {
            width: 100%;
            padding: 15px 20px;
            border: 2px solid #e9ecef;
            border-radius: 10px;
            font-size: 1rem;
            transition: border-color 0.3s;
        }
        
        .search-input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .episodes-grid {
            display: grid;
            gap: 30px;
            grid-template-columns: 1fr;
        }
        
        .episode-card {
            background: white;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .episode-content {
            padding: 30px;
        }
        
        .episode-title {
            font-size: 1.3rem;
            font-weight: 600;
            margin-bottom: 10px;
            color: #2c3e50;
        }
        
        .episode-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            font-size: 0.9rem;
            color: #6c757d;
        }
        
        .episode-date {
            font-weight: 500;
        }
        
        .episode-duration {
            background: #e9ecef;
            padding: 4px 8px;
            border-radius: 5px;
            font-size: 0.8rem;
        }
        
        .episode-description {
            color: #495057;
            margin-bottom: 15px;
            line-height: 1.6;
        }
        
        .description-toggle {
            background: none;
            border: none;
            color: #1a1a2e;
            cursor: pointer;
            font-size: 0.9rem;
            margin-bottom: 15px;
            transition: color 0.3s;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-weight: 500;
        }
        
        .description-toggle:hover {
            color: #0f3460;
        }
        
        .description-toggle::after {
            content: '▼';
            font-size: 0.7em;
            transition: transform 0.3s;
        }
        
        .description-toggle.expanded::after {
            transform: rotate(180deg);
        }
        
        .full-description {
            background: #f8f9fa;
            border-left: 4px solid #1a1a2e;
            padding: 20px;
            margin: 15px 0;
            border-radius: 0 8px 8px 0;
            display: none;
            line-height: 1.7;
        }
        
        .full-description.show {
            display: block;
        }
        
        .full-description h3 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 1.1rem;
        }
        
        .full-description p {
            margin-bottom: 12px;
            color: #495057;
        }
        
        .full-description p:last-child {
            margin-bottom: 0;
        }
        
        /* Style for extracted RSS content */
        .full-description .episode-description {
            margin-bottom: 20px;
        }
        
        .full-description .episode-source {
            background: #e9ecef;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
        }
        
        .full-description .episode-source h3 {
            color: #1a1a2e;
            margin-bottom: 10px;
            font-size: 1rem;
        }
        
        .full-description .episode-source a {
            color: #0f3460;
            text-decoration: none;
            word-break: break-all;
        }
        
        .full-description .episode-source a:hover {
            text-decoration: underline;
        }
        
        .full-description .episode-stack {
            background: #f1f3f4;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
        }
        
        .full-description .episode-stack h3 {
            color: #1a1a2e;
            margin-bottom: 10px;
            font-size: 1rem;
        }
        
        .full-description .episode-stack ul {
            margin: 0;
            padding-left: 20px;
        }
        
        .full-description .episode-stack li {
            margin-bottom: 5px;
            color: #495057;
        }
        
        .full-description .episode-related {
            background: #e8f4f8;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
        }
        
        .full-description .episode-related h3 {
            color: #1a1a2e;
            margin-bottom: 10px;
            font-size: 1rem;
        }
        
        .full-description .episode-related a {
            color: #0f3460;
            text-decoration: none;
            display: block;
            margin-bottom: 5px;
            word-break: break-all;
        }
        
        .full-description .episode-related a:hover {
            text-decoration: underline;
        }
        
        .audio-player {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
        }
        
        .audio-player audio {
            width: 100%;
            height: 40px;
            border-radius: 8px;
        }
        
        .no-results {
            text-align: center;
            padding: 60px 20px;
            color: #6c757d;
        }
        
        footer {
            background: #2c3e50;
            color: white;
            text-align: center;
            padding: 40px 0;
        }
        
        .footer-content {
            max-width: 600px;
            margin: 0 auto;
            padding: 0 20px;
        }
        
        .rss-link {
            display: inline-block;
            background: #1a1a2e;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            text-decoration: none;
            margin-top: 20px;
            transition: background-color 0.3s;
        }
        
        .rss-link:hover {
            background: #0f3460;
        }
        
        @media (max-width: 768px) {
            h1 {
                font-size: 2rem;
            }
            
            .subtitle {
                font-size: 1rem;
            }
            
            .meta-info {
                gap: 15px;
            }
            
            .episode-content {
                padding: 20px;
            }
            

        }
    </style>
</head>
<body>
    <header>
        <div class="header-content">
            ${feed.image ? `<img src="${escapeHtml(feed.image.url)}" alt="${escapeHtml(feed.image.title)}" class="podcast-image">` : ''}
            <h1>${escapeHtml(feed.title)}</h1>
            <p class="subtitle">${escapeHtml(feed.description)}</p>
            <div class="meta-info">
                <span>📊 ${episodes.length} episodes</span>
                <span>👤 ${escapeHtml(feed.author)}</span>
                <span>🌐 ${escapeHtml(feed.language)}</span>
            </div>
        </div>
    </header>

    <main>
        <div class="container">
            <div class="search-section">
                <input 
                    type="text" 
                    class="search-input" 
                    placeholder="Search episodes by title or description..."
                    id="searchInput"
                >
            </div>

            <div class="episodes-grid" id="episodesGrid">
                ${episodes.map((episode, index) => `
                    <div class="episode-card" data-title="${escapeHtml(episode.title.toLowerCase())}" data-description="${escapeHtml(episode.description.toLowerCase())}">
                        <div class="episode-content">
                            <h2 class="episode-title">${escapeHtml(episode.title)}</h2>
                            <div class="episode-meta">
                                <span class="episode-date">${formatDate(episode.pubDate)}</span>
                                <span class="episode-duration">${formatDuration(episode.duration || episode['itunes:duration'])}</span>
                            </div>
                            <div class="episode-description">
                                ${truncateText(episode['itunes:summary'] || episode.description, 200)}
                            </div>
                            <button class="description-toggle" onclick="toggleDescription(${index})">
                                Show Full Description
                            </button>
                            <div class="full-description" id="description-${index}">
                                <h3>${escapeHtml(episode.title)}</h3>
                                <div>${extractHtmlFromDescription(episode.description) || escapeHtml(episode['itunes:summary'] || '')}</div>
                            </div>
                            <div class="audio-player">
                                <audio 
                                    controls 
                                    preload="none"
                                    style="width: 100%;"
                                >
                                    <source src="${escapeHtml(episode.enclosure['@_url'] || '')}" type="${escapeHtml(episode.enclosure['@_type'] || 'audio/mpeg')}">
                                    Your browser does not support the audio element.
                                </audio>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="no-results" id="noResults" style="display: none;">
                <h3>No episodes found</h3>
                <p>Try adjusting your search terms</p>
            </div>
        </div>
    </main>

    <footer>
        <div class="footer-content">
            <p>Generated by Text-to-Pod CLI</p>
            <p>Subscribe to the RSS feed to get new episodes automatically</p>
            <a href="${escapeHtml(feed.link)}" class="rss-link">📡 Subscribe to RSS Feed</a>
        </div>
    </footer>

    <script>
        // Toggle description visibility
        function toggleDescription(index) {
            const description = document.getElementById(\`description-\${index}\`);
            const button = document.querySelector(\`.episode-card:nth-child(\${index + 1}) .description-toggle\`);
            
            if (description.classList.contains('show')) {
                description.classList.remove('show');
                button.classList.remove('expanded');
                button.textContent = 'Show Full Description';
            } else {
                description.classList.add('show');
                button.classList.add('expanded');
                button.textContent = 'Hide Full Description';
            }
        }

        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const episodes = document.querySelectorAll('.episode-card');
            const noResults = document.getElementById('noResults');
            let visibleCount = 0;
            
            episodes.forEach(episode => {
                const title = episode.dataset.title;
                const description = episode.dataset.description;
                
                if (title.includes(searchTerm) || description.includes(searchTerm)) {
                    episode.style.display = 'block';
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
