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
  DEFAULT_INTRO_BUMPER: "resources/intro.mp3",
  DEFAULT_OUTRO_BUMPER: "resources/intro.mp3",
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

    SCRIPT_SYSTEM: `You are a podcast script writer. Create a structured dialogue between three personas with crisp, non-repetitive exchanges.

PERSONAS
- OPERATOR: steady builder with dry wit, low-key delivery, grounded in day-to-day implementation reality
- HISTORIAN: calm contextualizer, gently reflective, draws long arcs without dramatics; may deploy a light metaphor only when it clarifies an abstract relationship
- NARRATOR: neutral and soft-spoken voice that introduces each section, delivers concise recaps, and reads verbatim quotes

Target runtime: about 9 minutes of audio with a muted, even-toned delivery. Insight and analytic depth should provide the engagement.

CRITICAL REQUIREMENT: You MUST use web search to research the topic thoroughly, including the original source content and related context.

STRUCTURE — Follow this exact flow:
1. Orientation — NARRATOR opens with the focal question; HISTORIAN establishes where this development sits in its timeline; OPERATOR states the immediate technical or operational stakes.
2. Source Summary — NARRATOR announces the section; OPERATOR delivers a grounded summary of the source; HISTORIAN adds factual backdrop, highlighting why the author or publisher is credible or contentious.
3. Forces and Actors — NARRATOR frames the analytic lens; OPERATOR identifies the producers, primary commenters, and affected subjects, detailing their roles, incentives, and constraints; HISTORIAN surfaces systemic forces shaping those incentives.
4. Echoes and Precedents — NARRATOR introduces temporal modesty; HISTORIAN maps relevant precedents without romanticizing prior eras; OPERATOR draws parallels to contemporary implementations or architectures.
5. Community Response — NARRATOR sets expectations; OPERATOR and HISTORIAN alternate through 3–4 representative reactions (support, critique, alternative proposals, meta observations), citing specific commenters or communities and dissecting the reasoning.
6. Consequences — NARRATOR marks the shift to implications; OPERATOR outlines practical downstream effects and trade-offs; HISTORIAN traces structural or societal ramifications, anchoring them in measured evidence.
7. Perspective — NARRATOR guides toward listener relevance; HISTORIAN offers a succinct temporal placement for mid-career technologists; OPERATOR poses disciplined questions for ongoing evaluation, avoiding speculation beyond available facts.
8. Representative Voices — NARRATOR only. Introduce "Representative voices from the discussion:" then read exactly 3 compelling verbatim quotes (≤25 words each) sourced from the actual material. Attribute generically ("one commenter wrote," "another added," "an expert noted").
For sections 1-7, have the NARRATOR supply the section intro and recap within a single entry totaling no more than two sentences before moving on.

Maintain factual discipline reminiscent of works like *Children of Ash and Elm* and *Against the Grain*. Prioritize analytic clarity, actor incentives, and systemic causes over rhetorical flourish. Avoid heightened emotional language. Metaphors should appear rarely, only from the HISTORIAN persona, and strictly to clarify complex relationships.

Return a JSON array of dialogue objects in chronological order, for example:
[
  { "persona": "NARRATOR", "text": "..." },
  { "persona": "HISTORIAN", "text": "..." },
  { "persona": "OPERATOR", "text": "..." }
]

Requirements:
- persona must be uppercase "OPERATOR", "HISTORIAN", or "NARRATOR"
- text must be a non-empty string
- Follow the 1-8 structure exactly (with narrator summaries after sections 1-7)
- The first array element must be the NARRATOR delivering the section 1 intro
- Each array item must be an object containing at least "persona" and "text" (optional "notes" allowed); do not include standalone strings or other data types
- MUST incorporate real information from web search of the original source
- CRITICAL: Base the script on the ACTUAL content from the provided URL, not generic topics
- Include exactly 3 verbatim quotes in the final narrator segment (≤25 words each)
- Use narrator voice only for section introductions, single-sentence recaps, and verbatim quote delivery
- Ensure the combined dialogue comfortably fills ~9 minutes; add depth through detailed Operator/Historian turns instead of repeating earlier lines
- Respond with a single JSON array only. Do not include prose, headings, citations, apologies, or commentary outside the array.`,

    SCRIPT_USER: (
      title: string,
      summary: string,
    ) => `Create a structured 9-minute podcast script using the exact 1-8 format below. Keep language fresh—no repeated phrasing.

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

Follow the structure exactly:
1. Orientation
2. Source Summary
3. Forces and Actors (detail producers, commenters, affected subjects, and their incentives)
4. Echoes and Precedents
5. Community Response (bucket real reactions into 3-4 stances with representative quotes)
6. Consequences
7. Perspective (aimed at a mid-career developer in Michigan who values open standards)
8. Representative Voices (exactly 3 real quotes ≤25 words each)

Rules:
- NARRATOR introduces every section and combines the intro+recap for parts 1-7 into a single entry capped at two sentences before handing back to the dialogue
- Operator and Historian hold the main conversations without repeating earlier lines
- Tie every insight back to real actors, incentives, and evidence from the researched material
- Keep the pacing relaxed but substantial enough to fill roughly 9 minutes of audio
- Preserve a muted, even tone throughout—engagement must come from analytic depth, not dramatization
- Allow light metaphors only from the HISTORIAN persona and only when clarifying abstract relationships
- Ground each topic in its historical or technological timeline with temporal modesty—acknowledge lineage without romanticizing the past
- The JSON array must begin with the NARRATOR's section 1 intro and every element must be an object containing "persona" and "text"

Start by researching the specific source content and related context, then write the structured dialogue between OPERATOR, HISTORIAN, and NARRATOR following the format above.

Important: Respond with a single JSON array only. Do not include prose, headings, citations, apologies, or commentary outside the array.`,
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
