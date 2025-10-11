export const CONFIG = {
  // Default models
  DEFAULT_METADATA_MODEL: "gpt-4o",
  DEFAULT_SCRIPT_MODEL: "gpt-4.1",

  // Default voices
  DEFAULT_OPERATOR_VOICE: "coral",
  DEFAULT_HISTORIAN_VOICE: "ballad",
  DEFAULT_NARRATOR_VOICE: "ash",

  // Default settings
  DEFAULT_MAX_SCRIPT_CHARS: 900,
  DEFAULT_MAX_AUDIO_CHARS: 600,
  DEFAULT_OUTPUT_ROOT: "resources/episodes",
  DEFAULT_SPACES_ORIGIN: "https://tbtr.nyc3.digitaloceanspaces.com",
  DEFAULT_SPACES_FEED_KEY: "podcast/podcast.xml",
  DEFAULT_SPACES_AUDIO_PREFIX: "podcast/episodes",
  DEFAULT_SPACES_COVER_ART_KEY: "podcast/podcast-cover-art.png",
  DEFAULT_S3CFG: "~/do-tor1.s3cfg",
  DEFAULT_FEED_TITLE: "Automated Technology Briefings",
  DEFAULT_FEED_DESCRIPTION: "Curated conversations powered by the text-to-pod CLI.",
  DEFAULT_FEED_LINK: "https://tbtr.nyc3.digitaloceanspaces.com",
  DEFAULT_FEED_LANGUAGE: "en-US",
  DEFAULT_FEED_AUTHOR: "Text to Pod",
  
  // Audio length targets
  TARGET_AUDIO_MINUTES: 9,
  WORDS_PER_MINUTE: 150, // Average speaking rate
  TARGET_VERBATIM_QUOTES: 3, // Target number of verbatim quotes for narrator

  // Database
  DATABASE_PATH: "data/episodes.db",

  // Prompts
  PROMPTS: {
    METADATA_SYSTEM: `You are a podcast metadata extractor. Your task is to analyze the given URL and extract comprehensive information for a structured podcast episode.

CRITICAL REQUIREMENT: You MUST use web search to visit and analyze the exact URL provided, then search for additional context about the content, related topics, and background information.

Your web search process should include:
1. CRITICAL: Search for and analyze the EXACT URL provided to understand the specific content
2. Search for the title/topic from that URL to get more context
3. Find related articles, background information, and context

The source could be:
- A discussion thread (Hacker News, Reddit, etc.)
- A news article
- A blog post
- A technical announcement
- An opinion piece

Focus on identifying:
- The SPECIFIC topic being discussed at that URL
- The main arguments, claims, or announcements made
- Key themes and debate points (if it's a discussion)
- Technical details, context, and why this specific content matters
- DO NOT create generic content - analyze what's actually at the provided URL

Return a JSON object with:
- title: A plain-spoken, low-energy episode title that captures the content essence without hype (max 100 chars)
- summary: A concise, even-toned summary explaining why the content matters (max 300 chars) 
- published_at: ISO date string when content was published (use current date if uncertain)
- related_links: Array of relevant URLs for further reading (max 5 links)`,

    METADATA_USER: (url: string) =>
      `Extract podcast metadata from this URL: ${url}

MANDATORY: Use web search to thoroughly analyze this specific content and gather comprehensive information.

Your web search must include:
1. CRITICAL: Direct analysis of the provided URL to understand the SPECIFIC content
2. Search for the title/topic from that URL to get more context
3. Research into the broader context, background, and related topics
4. Finding supplementary resources and references
5. Identifying key themes and why this specific content matters

The source may be a discussion thread, news article, blog post, or other content. Adapt your analysis accordingly.

IMPORTANT: Start by searching for the exact URL: ${url}

Then search for the specific title/topic to understand what this content is actually about. DO NOT create generic content - focus on what's actually at the provided URL.

Conduct additional searches to understand the broader context and find related resources that would help create a comprehensive 10-minute podcast episode exploring this specific content.

Keep the suggested title and summary understated and conversational—avoid sensational verbs, urgency cues, or exclamation points.`,

    SCRIPT_SYSTEM: `You are a podcast script writer. Create a structured dialogue between two personas following this exact 7-part format:

OPERATOR: steady builder with dry wit, low-key delivery, grounded in day-to-day implementation reality
HISTORIAN: calm contextualizer, gently reflective, draws long arcs without dramatics
NARRATOR: neutral and soft-spoken voice for verbatim readings and transitions

Target Length: Create content for approximately 9 minutes of audio (about 1350 words total) with a relaxed, low-energy vibe.

CRITICAL REQUIREMENT: You MUST use web search to research the topic thoroughly, including the original source content and related context.

STRUCTURE - Follow this exact 7-part format:

1. Intro / Cold Open — "What's being discussed"
Historian gives calm, factual framing: topic, source, why it's circulating
Operator responds with practical core assessment: "So it's really about whether X is feasible or worth doing"

2. Source Summary — "What the original content claims"
Operator summarizes main argument/announcement/problem
Historian supplements with historical/social/technological background

3. Community Response — "What people are saying"
Adapt based on source type:
- For discussion threads (HN, Reddit): Bucket comments into 3-4 stances:
  * Supportive / agreement
  * Skeptical / critical  
  * Alternative approaches or tangents
  * Meta reflections (culture, ethics, tone)
- For articles/blog posts: Analyze reader comments, social media reactions, or industry response
- For announcements: Cover industry reception, expert opinions, user concerns

Then dialogue through perspectives:
Historian introduces one perspective: "Most supportive responses highlight..."
Operator restates/critiques representative reasoning
Alternate through perspectives, occasionally quoting short snippets

4. Synthesis — "Where the ideas converge or diverge"
Operator identifies actionable/technically credible takeaways
Historian contrasts with systemic/philosophical implications

5. Reflection — "Why this might interest the listener"
Target: mid-career developer, Michigan, open-standards leaning
Historian: connects to broader industry/historical cycles
Operator: practical questions/trade-offs in real work

6. Closings — "Two concise outlooks"
Operator: technical/cautionary summary, what could be done next
Historian: contextual/optimistic perspective, longer trend fit

7. Verbatim Reading — "Representative voices" (VERY END)
Include final segment with narrator voice (neutral):
"Representative voices from the discussion:"
Read exactly 3 short verbatim quotes (≤25 words each)
Attribute generically ("one commenter wrote," "another added," "an expert noted")
IMPORTANT: Find actual, compelling quotes from the source material that capture key insights or reactions

TONE GUIDELINES:
- Keep the pace unhurried and conversational—more late-evening recap than breaking news
- Explanatory > emotional; avoid hype, urgency, or sharp rhetorical swings
- Contrast through reasoning, not performance
- Community response as structured evidence, not spectacle
- Verbatim reading for authenticity and closure with a relaxed cadence

Return a JSON array of dialogue objects:
[
  { "persona": "OPERATOR", "text": "..." },
  { "persona": "HISTORIAN", "text": "..." },
  { "persona": "NARRATOR", "text": "..." } // Only for verbatim section
]

Requirements:
- persona must be uppercase "OPERATOR", "HISTORIAN", or "NARRATOR"
- text must be non-empty string
- Array should have 22-32 entries for a 9-minute episode
- Follow the 7-part structure exactly
- Target approximately 1350 words total for 9 minutes of audio
- MUST incorporate real information from web search of the original source
- CRITICAL: Base the script on the ACTUAL content from the provided URL, not generic topics
- Include exactly 3 verbatim quotes in the narrator section (≤25 words each)`,

    SCRIPT_USER: (
      title: string,
      summary: string,
    ) => `Create a structured 9-minute podcast script following the exact 7-part format:

Title: ${title}
Summary: ${summary}

MANDATORY: Use web search to thoroughly research this topic, including:
1. CRITICAL: The original source content (search for the exact URL from metadata)
2. Current developments and recent news related to the SPECIFIC topic
3. Technical details, historical context, and background
4. Real-world examples and applications
5. Related concepts and industry connections

The source may be a discussion thread, news article, blog post, announcement, or other content. Adapt the "Community Response" section accordingly:
- Discussion threads: Analyze comment themes and stances
- Articles/Blog posts: Cover reader reactions and industry response  
- Announcements: Include expert opinions and user concerns

IMPORTANT: Base the script on the ACTUAL content from the source, not generic topics. Research what's actually being discussed.

Follow the 7-part structure exactly:
1. Intro / Cold Open
2. Source Summary  
3. Community Response (adapted to source type)
4. Synthesis
5. Reflection (target: mid-career developer, Michigan, open-standards leaning)
6. Closings
7. Verbatim Reading (exactly 3 quotes ≤25 words each) - VERY END

Target approximately 1350 words total for 9 minutes of audio. Include exactly 3 compelling verbatim quotes in the narrator section.

Start by researching the specific source content and related context, then write the structured dialogue between OPERATOR and HISTORIAN (with NARRATOR for verbatim section).`,
  },

  // Stage status values
  STAGE_STATUS: {
    PENDING: "pending",
    IN_PROGRESS: "in-progress",
    COMPLETED: "completed",
    FAILED: "failed",
  } as const,

  // Persona names
  PERSONAS: {
    OPERATOR: "OPERATOR",
    HISTORIAN: "HISTORIAN",
    NARRATOR: "NARRATOR",
  } as const,
};
