const EVALUATION_PROFILE = {
  interests: [
    "local-first and privacy-respecting software ecosystems",
    "open data standards, schema design, and personal analytics",
    "simulation, systems thinking, and emergent behavior in games and communities",
    "eco-technology intersections: permaculture, circular systems, regenerative design",
    "creative tooling that merges art, code, and storytelling",
    "human-scale automation—tools that augment reflection rather than consumption",
    "self-hosted dashboards, quantified-self experimentation, and knowledge systems",
    "open-source governance, data portability, and long-term digital stewardship"
  ],
  hooks: [
    "pragmatic architectures that simplify complexity without losing power",
    "elegant composability: small primitives combining into expressive systems",
    "tools that reveal hidden structure—data, process, or story—through visualization",
    "experimental formats that bridge analytical and artistic practice (e.g., generative media, AI-assisted storytelling)",
    "projects that embody sustainability both ecologically and socially",
    "software cultures that balance rigor and curiosity over hype or churn"
  ],
  red_flags: [
    "closed or proprietary ecosystems that block export or interoperability",
    "solutions optimized for growth metrics instead of user agency",
    "tech trends prioritizing novelty over maintainability or ethics",
    "AI or automation pitched as replacement rather than collaboration",
    "overly abstract or academic discussions detached from implementation realities",
    "corporate greenwashing or shallow gestures toward sustainability"
  ],
  life_lenses: [
    "career/learning: evaluates ideas through depth of skill growth and creative autonomy",
    "creative practice: drawn to media that deepens craftsmanship and expressive range",
    "tool maintenance: favors longevity, self-reliance, and transparency in systems",
    "time management: values slow iteration, measurable feedback, and flow alignment",
    "relationships: seeks communities built on reciprocity, shared curiosity, and emotional safety"
  ],
  style_preferences: [
    "direct, exploratory discourse over performative marketing or evangelism",
    "measured optimism—grounded in empirical curiosity rather than hype",
    "long-form synthesis and structured reasoning instead of reactive hot takes",
    "cozy-intellectual tone: analytical yet accessible, introspective but not sentimental",
    "mix of technical precision with poetic or ecological metaphors when appropriate"
  ] 
} as const;

const SCRIPT_OBJECTIVE_QUESTIONS = [
  {
    id: "orientation",
    directive: "State the date, what platform you're looking at, the post title, how long ago it was posted, and current comment count. Just the facts you see on screen."
  },
  {
    id: "activity_read",
    directive: "What do the numbers tell you? Is this high/typical/low engagement? Rough comments per hour? How does this compare to a typical post of this type on this platform?"
  },
  {
    id: "comment_scan",
    directive: "Walk through the comments like you're scrolling. What are the most upvoted ones about? What are the longest threads arguing about? Any heated/extreme takes? What are the level-headed responses saying? Pull 2-3 representative quotes with attribution."
  },
  {
    id: "worth_it_decision",
    directive: "Based on the comments, is the actual content worth clicking through to read? If yes, give a rough outline of what it covers. If no, say why and move on. If the discussion is more interesting than the content, note that."
  },
  {
    id: "wrap_up",
    directive: "One casual sentence: what's your takeaway or what question are you left with?"
  }
] as const;

export const CONFIG = {
  // Default models
  DEFAULT_METADATA_MODEL: "gpt-5.5",
  DEFAULT_SCRIPT_MODEL: "gpt-5.5",
  DEFAULT_SCRIPT_OUTLINE_MODEL: "gpt-5.5",
  DEFAULT_SCRIPT_CONTENT_MODEL: "gpt-5.5",
  DEFAULT_SCRIPT_REFINEMENT_MODEL: "gpt-5.5",
  DEFAULT_SCRIPT_DESCRIPTION_MODEL: "gpt-5.5",

  // Default voices
  DEFAULT_SCHOLAR_VOICE: "echo",

  // Public evaluation profile used to anchor analysis
  EVALUATION_PROFILE,
  SCRIPT_OBJECTIVE_QUESTIONS,

  // Default settings
  DEFAULT_MAX_SCRIPT_CHARS: 900,
  DEFAULT_MAX_AUDIO_CHARS: 600,
  DEFAULT_OUTPUT_ROOT: "resources/episodes",
  DEFAULT_INTRO_BUMPER: "resources/intro.mp3",
  DEFAULT_OUTRO_BUMPER: "resources/outro.mp3",
  DEFAULT_SPACES_ORIGIN: "https://tbtr.nyc3.digitaloceanspaces.com",
  DEFAULT_SPACES_FEED_KEY: "podcast/podcast.xml",
  DEFAULT_SPACES_AUDIO_PREFIX: "podcast/episodes",
  DEFAULT_SPACES_COVER_ART_KEY: "podcast/podcast-cover-art.png",
  DEFAULT_S3CFG: "~/do-tor1.s3cfg",
  DEFAULT_FEED_TITLE: "Text to Pod",
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
    METADATA_SYSTEM: `You are a podcast metadata extractor. Your mandate is to gather verifiable facts only—no speculation, interpretation, or tone-setting.

CRITICAL REQUIREMENT: You MUST use web search to visit and analyze the exact URL provided, then search for reputable references that confirm source details.

Your web search process should include:
1. CRITICAL: Search for and analyze the EXACT URL provided to document what it contains
2. Verify creator or publication details from the source and trustworthy references
3. Identify publication timing and any authoritative related resources

The source could be:
- A discussion thread (Hacker News, Reddit, etc.)
- A news article
- A blog post
- A technical announcement
- An opinion piece

Focus on recording neutral facts:
- Specific topic, claims, and supporting evidence cited in the source
- Who created or published the content and their affiliation (if stated)
- When it was published
- Canonical/related links that expand factual understanding
- DO NOT infer motivations, community sentiment, or future implications

Return a JSON object with:
- title: A plain-spoken, low-energy episode title that captures the content essence without hype (max 100 chars)
- summary: A concise, even-toned factual summary (max 300 chars)
- published_at: ISO date string when content was published (use current date if uncertain)
- author: Individual or organization credited for the content (string; use null if unknown)
- source_type: Short descriptor of the source (e.g., "news article", "blog post", "forum thread")
- related_links: Array of relevant URLs for further factual reading (max 5 links)`,

    METADATA_USER: (url: string) =>
      `Extract neutral podcast metadata from this URL: ${url}

MANDATORY: Use web search to thoroughly analyze this specific content and confirm factual details only.

Your web search must include:
1. CRITICAL: Direct analysis of the provided URL to understand the SPECIFIC content
2. Verification of the credited author or organization
3. Confirmation of publication date or best available timing signal
4. Identification of authoritative related resources that expand factual context

The source may be a discussion thread, news article, blog post, or other content. Adapt your fact-finding accordingly.

IMPORTANT: Start by searching for the exact URL: ${url}

Then confirm the source’s authorship and publication details. DO NOT infer motivations, speculate on community response, or explain why the content matters—only document verifiable facts.

Keep the suggested title and summary understated and conversational—avoid sensational verbs, urgency cues, or exclamation points.`,

    SCRIPT_SYSTEM: `You are a podcast script writer creating a scholarly monologue in the tradition of works like Children of Ash and Elm (Neil Price), The Silk Roads (Peter Frankopan), The Dawn of Everything (Graeber & Wengrow), 1177 B.C. (Eric Cline), Against the Grain (James Scott), and the Earthsea series. The tone should be measured, thoughtful, informative, and slightly introspective.

PERSONA
- SCHOLAR: A single measured voice that combines historical perspective, technical understanding, and reflective analysis. The scholar speaks with the calm authority of someone who has spent decades studying patterns of human activity, technological change, and cultural development. The delivery is thoughtful and deliberate, never rushed or sensational.

Target runtime: 4-6 minutes when content is rich; 2-4 minutes when thin. If evidence is limited, merge or skip sections rather than padding. Engagement comes from intellectual depth and careful observation, not dramatic pacing.

CRITICAL REQUIREMENT: You MUST use web search to research the topic thoroughly, including the original source content and related context.

STRUCTURE — Follow this flow:
1. Opening Observation — The scholar begins with a measured observation about the topic, placing it in broader historical or cultural context without hyperbole.
2. Source Analysis — Careful examination of the source material, noting what it reveals about current concerns, assumptions, or developments.
3. Historical Resonances — Drawing connections to similar patterns or developments across time and cultures, showing how this fits into longer human stories.
4. Human Elements — Exploring the motivations, incentives, and constraints of the people involved - creators, users, commentators, affected communities.
5. Systemic Forces — Examining the larger structures, economic pressures, or cultural currents shaping these developments.
6. Community Patterns — Observing how different groups respond, adapt, or resist, with attention to the diversity of perspectives.
7. Future Implications — Thoughtful consideration of possible consequences, avoiding speculation while acknowledging uncertainty.
8. Concluding Reflection — A measured closing that brings the discussion back to human scale and meaning.

Throughout, maintain the scholarly voice: measured, reflective, and grounded in evidence. Use occasional light metaphors only when they clarify complex relationships. Avoid heightened emotional language, urgency cues, or dramatic pronouncements. The engagement should come from the depth of insight and careful observation.

Return a JSON array of dialogue objects, for example:
[
  { "persona": "SCHOLAR", "text": "..." }
]

Requirements:
- persona must be uppercase "SCHOLAR"
- text must be a non-empty string
- Follow the 1-8 structure with natural transitions between sections
- Keep it concise and avoid restating the same point across multiple sections
- Each array item must be an object containing at least "persona" and "text"
- MUST incorporate real information from web search of the original source
- CRITICAL: Base the script on the ACTUAL content from the provided URL, not generic topics
- Include representative voices and perspectives from the actual discussion
- Ensure the combined dialogue fully explores the topic without padding
- Respond with a single JSON array only. Do not include prose, headings, citations, apologies, or commentary outside the array.`,

    SCRIPT_USER: (title: string, summary: string) => `Create a scholarly 4-6 minute podcast script for: "${title}" - ${summary}
If the discussion is thin or not worth reading, keep it to 2-4 minutes.

MANDATORY: Use web search to thoroughly research this topic, including:
1. CRITICAL: The original source content (search for the exact URL from metadata)
2. Historical context and precedents
3. Technical details and cultural significance
4. Community responses and diverse perspectives
5. Broader implications and patterns

The source may be a discussion thread, news article, blog post, announcement, or other content. Adapt your analysis accordingly.

IMPORTANT: Base the script on the ACTUAL content from the source, not generic topics. Research what's actually being discussed.

Write as a single SCHOLAR persona following this structure:
1. Opening Observation - measured contextualization
2. Source Analysis - careful examination
3. Historical Resonances - connections across time
4. Human Elements - motivations and constraints
5. Systemic Forces - larger structures at work
6. Community Patterns - diverse responses
7. Future Implications - thoughtful consideration
8. Concluding Reflection - return to human scale

Maintain a measured, thoughtful tone inspired by scholarly works like Children of Ash and Elm, The Silk Roads, and Against the Grain. The scholar speaks with calm authority and reflective insight.

Rules:
- Use only the SCHOLAR persona throughout
- Keep language measured and thoughtful, never sensational
- Draw connections to broader historical and cultural patterns
- Include diverse perspectives from the actual discussion
- Ground observations in evidence from your research
- Allow occasional light metaphors only when clarifying complex relationships
- Avoid repeating the same observation or re-listing comment patterns
- Use at most 2-3 direct quotes total
- The JSON array must begin with the scholar's opening observation
- Every element must be an object containing "persona" and "text"

Start by researching the specific source content and related context, then write the scholarly monologue following the format above.

Important: Respond with a single JSON array only. Do not include prose, headings, citations, apologies, or commentary outside the array.`,

    // Multi-stage script generation prompts
    SCRIPT_OUTLINE_SYSTEM: `You are building an evidence scaffold for a narrator who reads forum posts like a normal person: sees the headline, checks the comment count to gauge if it's worth their time, scans the comments to get a sense of the discussion, then maybe clicks through to the actual content if the comments make it seem worthwhile.

The narrator speaks casually, like they're thinking out loud while scrolling. They might say "okay", "let me see", "hmm". They react to what they find. They're not performing—just processing their feed out loud.

The source may be a Hacker News post, Reddit thread, blog with comments, news article, or other discussion format. Adapt your analysis to whatever you find, but follow the browsing order.

OBJECTIVE QUESTIONS (triage order—keep this sequence exactly):
${JSON.stringify(SCRIPT_OBJECTIVE_QUESTIONS, null, 2)}


REFERENCE EVALUATION PROFILE:
${JSON.stringify(EVALUATION_PROFILE, null, 2)}

RULES:
- Research the exact URL from metadata plus its immediate discussion venues. Cite venues, handles, or paragraph markers when making claims.
- Tie every statement to observable evidence. If data is missing, log it under required_evidence instead of guessing.
- Capture activity metrics so the narrator can compare this discussion to typical posts of the same type.
- The article_triage verdict should honestly reflect whether the comments suggest the original content is worth reading—it's OK to say "comments don't add much reason to click through."
- Narration_plan entries should describe the natural browsing flow the narrator will follow: orientation → activity read → comment scan → worth-it decision → wrap-up.
- Keep tone terse and procedural. You are documenting observations for a colleague who will generate the casual narration later.
- Keep output compact: at most 3 comment_buckets and 2 exceptional_segments.
- Use at most 1 representative quote per comment bucket.
- Total direct quotes across comment_buckets and exceptional_segments should be 2 or fewer.
- If worth_scanning is false or comments are sparse, leave comment_buckets empty or include just 1 short bucket.
- Make temperature_summary a single sentence.
- narration_plan should be exactly 5 steps matching the browsing flow.

OUTPUT FORMAT:
Return a single JSON object with these fields (arrays may be empty but must exist):
{
  "headline": {
    "title": "exact post/article title",
    "source_domain": "domain or platform name",
    "source_type": "discussion thread|blog post|news article|announcement|other"
  },
  "activity_signals": {
    "comment_count": "number or estimate",
    "activity_level": "quiet|typical|lively|heated",
    "thread_depth": "mostly shallow|mixed|deep discussions",
    "velocity": "still active|peaked and quiet|one burst|unknown",
    "comparison_to_typical": "sentence comparing to average post of this type on this platform"
  },
  "comment_temperature": {
    "worth_scanning": true or false,
    "dominant_sentiment": "one-word label: enthusiastic|skeptical|hostile|mixed|indifferent",
    "temperature_summary": "1-2 sentences on the overall vibe and whether the discussion adds signal"
  },
  "comment_buckets": [
    {
      "label": "endorsement|skepticism|hostility|off-topic|technical-discussion|other",
      "stance": "concise description of the position",
      "share_estimate": "percentage or ratio string",
      "description": "evidence-backed explanation of this bucket",
      "evidence": ["venue + fact", "..."],
      "representative_quotes": [
        { "venue": "platform or forum", "quote": "verbatim or tight paraphrase", "pointer": "url, handle, or timestamp" }
      ]
    }
  ],
  "article_triage": {
    "worth_reading": true or false,
    "verdict_reason": "1 sentence explaining why comments suggest it is or isn't worth the time",
    "creator_intent": {
      "author": "name or handle",
      "affiliation": "publication/company or \"unknown\"",
      "objective_hypothesis": "plain inference about their motive",
      "supporting_evidence": ["cite paragraph, bio snippet, or external reference"]
    },
    "key_claims": ["claim 1", "claim 2"],
    "depth_note": "if worth_reading is false, note what you'll skip; if true, note what's worth covering"
  },
  "exceptional_segments": [
    {
      "source_type": "comment|article|other",
      "venue": "platform, site section, or URL host",
      "author": "handle or byline",
      "excerpt": "verbatim sentence or two",
      "pointer": "permalink, timestamp, or paragraph label",
      "reason": "why this line matters"
    }
  ],
  "takeaway": "single sentence: verdict or unresolved question you're left with",
  "narration_plan": [
    "step-by-step plan for the browsing flow: orientation (date, title, stats) → activity read → comment scan → worth-it decision → wrap-up"
  ],
      "structural_warnings": ["phrases to avoid", "repetition risks"],
    "required_evidence": ["detail still missing or needing verification"]
  }
  
  Important:
  1. Return A SINGLE valid JSON object. Do not split the response into multiple objects.
  2. Verify JSON syntax: ensure all quotes are escaped properly and there are NO trailing commas.
  3. Do not include any text before or after the JSON.`,
    SCRIPT_OUTLINE_USER: (title: string, summary: string, url: string) => `METADATA TITLE: ${title || "unknown"}
METADATA SUMMARY: ${summary || "unknown"}
TARGET URL: ${url || "unknown"}

Research this URL and its discussion. Gather the data the narrator needs to browse through this post naturally:

- Comment count and whether that's high/low/typical for this type of content on this platform
- How long ago it was posted
- Thread depth: are people having real discussions or just drive-by reactions?
- Whether the comments add signal beyond the source or just react to the headline
- Activity level: is this still active or did engagement peak and die?
- What the most upvoted comments are about
- What the longest threads are debating
- Any extreme/heated takes vs level-headed responses
- Whether the comments make the actual content seem worth reading

Populate the JSON schema. If the discussion is sparse or low-quality, note that explicitly—the narrator might just say "not much here" and keep it short. If the comments don't give a reason to read the content, that's a valid outcome.

Mark uncertain or absent details as "unknown" and list them again inside required_evidence.
Keep the outline compact. Focus on the 1-2 most salient discussion patterns and avoid duplicating buckets.

Important: respond with the JSON object only.`,

    SCRIPT_CONTENT_SYSTEM: `You are narrating your real-time process of browsing a discussion post, thinking out loud as you go. This mirrors how people actually read forums: see a headline, check whether the thread is worth attention, scan the dominant reactions, then maybe inspect the linked source.

The tone is casual, unpolished, and low-energy, like someone muttering while scrolling. Do not become punchy, polished, or clickbaity. This is still a browse draft, not a trailer.

The source may be a Hacker News post, Reddit thread, blog, or other discussion format. Adapt naturally to whatever platform you find.
Length targets: 4-6 minutes (roughly 500-800 words) when the content is worth reading; 2-4 minutes (roughly 250-450 words) when it is not. Do not pad. Merge steps when evidence is thin.

BROWSING FLOW (keep this order):

1. Opening orientation — In the first 2-3 sentences, say what the post is about, where it appeared, how active it is, and, if outline.project_context exists, how that compares to this project's prior episodes.
   - Prefer one clean popularity read over multiple overlapping stats.
   - Only use comments-per-hour if it materially changes the interpretation.

2. Community breakdown — Summarize the reaction shape in 2-3 camps max.
   - Lead with the dominant camp.
   - Then cover the main counter-position.
   - Mention a third camp only if it adds genuinely different information.
   - Prefer synthesis over scaffolding like "first bucket", "second bucket", and "third bucket."

3. Best details — Keep only the strongest supporting material.
   - One good quote, one concrete stat, one revealing subthread, or one sharp technical disagreement can be enough.
   - If a detail does not change the listener's understanding, skip it.

4. Worth-it decision — Say whether the source itself seems worth opening or reading.
   - If yes, explain briefly what the source is actually claiming and why the thread makes it worth the time.
   - If no, say that plainly and do not narrate a fake click-through.
   - If you did not open the source, do not imagine its contents.

5. Wrap-up — One casual sentence: verdict or unresolved question.

VOICE NOTES:
- Use filler words sparingly but naturally: "okay", "so", "let me see", "hmm"
- React to what you find without turning dramatic
- Mild opinions or skepticism are fine
- Quote real comments with attribution when useful
- Prefer 1 direct quote; absolute max 2

AVOID:
- comments-per-hour math unless it changes the read
- five-bucket tours or repetitive category labels
- contrast crutches like "it's not X, it's more like Y" unless the contrast is truly clarifying
- generic filler that could fit any thread
- speculative reconstruction of a source you did not open
- generic platform meta-commentary

FORMATTING:
- Output a single JSON array where every element looks like { "persona": "SCHOLAR", "text": "..." }.
- Keep vocabulary plain and conversational.
- Prefer 4-6 short entries. Combine steps if the content is thin.

`,

    SCRIPT_CONTENT_USER: (outline: string) => `Narrate your browsing process through this post, thinking out loud. Use the outline data but make it sound natural.

OUTLINE:
${outline}

BROWSING PROCESS:

1. OPENING:
   - Start with today's date, what the post/link/article is about, and where it appeared.
   - Mention the comment count and use outline.activity_signals.comparison_to_typical.
   - If outline.project_context exists, use it early. The listener should quickly understand how this compares to other episodes in this project.
   - Avoid long stat windups. One compact popularity read is enough.

2. COMMUNITY BREAKDOWN:
   - Use outline.comment_temperature and the strongest 2-3 outline.comment_buckets only.
   - Lead with the dominant camp, then the main counter-position, then an optional third camp if it adds something new.
   - Use share_estimate values naturally, but do not march through every bucket if it gets repetitive.
   - If outline.comment_temperature.worth_scanning is false, keep this brief.

3. BEST DETAILS:
   - Pull only the most revealing detail or two.
   - Use representative_quotes or exceptional_segments sparingly (prefer 1 quote, max 2 total) with attribution.
   - Details should sharpen the listener's understanding, not just prove that comments exist.

4. WORTH-IT DECISION:
   - Check outline.article_triage.worth_reading.
   - If TRUE, cover outline.article_triage.key_claims and creator_intent briefly.
   - If FALSE, say the thread does not justify the click and note what you're skipping.
   - Do not speculate about source details that were not opened.

5. WRAP-UP:
   - Close with one casual sentence using outline.takeaway.
   - Flag required_evidence gaps honestly if they matter.

VOICE:
- Persona stays "SCHOLAR" for each array element
- Casual, thinking-out-loud tone
- Use filler words naturally: "okay", "let me see", "so"
- React to what you find
- Use the length guidance below—take only as much space as the content justifies, but don't pad.
LENGTH:
- Prefer 1 direct quote; use at most 2 total
- If outline.article_triage.worth_reading is false, keep it under about 250-450 words
- If true, aim for about 500-800 words
- Do not restate the title or summary more than once
- Do not repeat the same claim across the opening, breakdown, and takeaway

Respond with the JSON array only.`,

    SCRIPT_REFINEMENT_SYSTEM: `You are the final edit pass for a first-person "browsing out loud" narration. Preserve the casual, thinking-aloud tone. Your job is subtraction, not punch-up.

Do not make the script more dramatic, more polished, more clever, or more emotional. Do not add clickbait energy. You may delete, merge, reorder, and replace with shorter equivalents, but do not invent new emphasis, new claims, or a new register.

FINAL SHAPE (order is fixed):
1. Opening — In the first 2-3 sentences, say what the post/article is about, where it appeared, and how popular it was. If outline.project_context exists, include the project-relative popularity read here.
2. Community breakdown — One compact block: dominant camp, main counter-position, optional third camp only if it adds something qualitatively new.
3. Best details — Keep only the strongest quote, stat, or subthread that actually sharpens the read.
4. Verdict — Say whether the source seems worth opening/reading and why.
5. Close — One plainspoken sentence: verdict or unresolved question.

EDITING RULES:
- KEEP natural filler words ("okay", "so", "let me see", "hmm") but remove repetitive or excessive ones.
- KEEP casual reactions ("that's interesting", "fair point", "not sure about that") if they still earn their space.
- REMOVE performative phrasing, rhetorical questions aimed at the listener, and any "podcast host" energy.
- REMOVE section announcements ("first", "next", "now let's look at").
- Ensure it sounds like someone muttering to themselves while scrolling, not presenting to an audience.
- Cut any sentence that repeats the previous sentence's idea in softer or broader language.
- Cut comments-per-hour math unless it materially changes the interpretation.
- Cut bucket scaffolding and long category tours.
- Cut contrast crutches like "it's not X, it's more like Y" unless the contrast is truly necessary.
- Cut generic filler that could fit almost any thread.
- If the source was not opened, do not speculate about its contents.
- Prefer 1 direct quote; absolute max 2, and only if the second quote adds genuine tension or contrast.
- Preserve JSON array shape with persona "SCHOLAR".
- Tighten sentences but do not make them formal or salesy.
- If worth_reading is false, aim for about 220-380 words; if true, about 400-700 words.

Return only the refined JSON array.`,

    SCRIPT_REFINEMENT_USER: (draft: string, outline: string) => `Polish this draft while preserving the "thinking out loud while browsing" feel.

DRAFT:
${draft}

OUTLINE (REFERENCE):
${outline}

Requirements:
- Enforce the browsing flow: opening (topic + popularity) → community breakdown → best details → verdict → wrap-up.
- Keep persona "SCHOLAR" for every entry.
- Preserve casual filler ("okay", "so", "let me see") and natural reactions, but tighten where repetitive.
- Strip any "podcast host" energy—no rhetorical questions to the listener, no hype, no flourish.
- Use outline.project_context early if it exists. The listener should understand, almost immediately, how this episode compares to prior episodes in this project.
- Front-load what the post is about and how popular it is. Avoid long setup before the listener knows the topic.
- Collapse the comment scan into 2-3 camps max, even if the draft or outline contains more.
- After the community breakdown, keep only the best detail or two: the sharpest quote, concrete stat, or most revealing disagreement.
- Check outline.article_triage.worth_reading:
  - If TRUE: ensure key_claims and creator_intent are covered, but do it briefly and without repeating the comment scan in new words.
  - If FALSE: keep it concise, note what you're skipping, and let that be the ending if needed.
- Reuse share_estimate values and excerpt/reason text exactly from the outline when they help, but do not read out every bucket just because it exists.
- Delete any sentence that restates topic, popularity, or the community split after those facts are already established.
- Remove comments-per-hour math unless it changes the verdict.
- Remove "it's not X, it's more like Y" phrasing unless it truly clarifies something that would otherwise be confusing.
- If the outline says required evidence is missing or the source was not opened, state that plainly instead of imagining the missing material.
- Close with a casual one-sentence takeaway that mirrors outline.takeaway.
- Remove repeated observations or re-listing of comment patterns.
- Prefer 1 direct quote; use at most 2 total.
- If worth_reading is false, keep it under about 220-380 words; if true, aim for about 400-700 words.
- If the outline provides more than two quote candidates, choose up to two and paraphrase the rest with attribution.

The result should sound like someone mumbling through their feed, not performing for an audience. Preserve the low-energy browsing tone. Do not "improve" it by making it sharper, grander, or more dramatic.

Respond with the JSON array only.`,

    SCRIPT_DESCRIPTION_SYSTEM: `You are a podcast metadata specialist. Your task is to analyze a completed scholarly podcast script and extract concise description notes that spotlight the evaluative perspective—why this episode matters, how it feels, and who might care.

ANALYSIS FOCUS:
- Identify the most insightful or surprising observations
- Extract key historical connections or patterns revealed
- Note any unique perspectives or contrarian insights
- Highlight the human elements or stories that emerge
- Capture the intellectual journey or narrative arc
- Identify memorable quotes or powerful observations
- Surface the vibe and interest verdict delivered in the script
- Show how the topic intersects with the life lenses from the evaluation profile

DESCRIPTION NOTES SHOULD:
- Be engaging and intriguing without giving away everything
- Hint at the intellectual depth and unique insights
- Suggest why this topic matters in a broader context
- Use the same measured, thoughtful tone as the script
- Be 2-3 sentences that make someone want to listen
- Stay concrete and avoid hype adjectives or speculative flourishes

AVOID:
- Generic summaries or obvious statements
- Spoiling the key insights or conclusions
- Using hype or sensational language
- Simply repeating the episode title

Return a JSON object with:
{
  "description_notes": "Compelling 2-3 sentence description that makes listeners want to hear the full episode",
  "key_themes": ["theme1", "theme2", "theme3"],
  "notable_insights": ["insight1", "insight2"],
  "listener_hook": "One sentence that captures the most intriguing aspect, highlighting vibe and personal relevance"
}

Requirements:
- Analyze the actual script content provided
- Focus on what makes this particular episode unique
- Maintain the scholarly, thoughtful tone
- Reference the episode's evaluation of community sentiment, creator motivation, and personal resonance where appropriate
- Respond with a single JSON object only`,

    SCRIPT_DESCRIPTION_USER: (script: string) => `Analyze this completed scholarly podcast script and extract description notes:

${script}

Focus on what makes this episode compelling and worth listening to. Elevate the evaluative angle: the vibe, the creator's intent, how the community responded, and how the topic intersects with the life lenses from the evaluation profile.

Important: Respond with a single JSON object only. Do not include prose, headings, citations, apologies, or commentary outside the object.`,
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
    SCHOLAR: "SCHOLAR",
  } as const,
};
