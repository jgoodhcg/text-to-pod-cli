import type { Context, ScriptDialogue } from '../types.js';
import OpenAI from 'openai';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { CONFIG } from '../config.js';
import { extractJsonArray, extractJsonObject, sanitizeJsonText } from '../utils.js';

interface OutlineHeadline {
  title: string;
  source_domain: string;
  source_type: string;
}

interface OutlineActivitySignals {
  comment_count: string;
  activity_level: 'quiet' | 'typical' | 'lively' | 'heated';
  thread_depth: 'mostly shallow' | 'mixed' | 'deep discussions';
  velocity: 'still active' | 'peaked and quiet' | 'one burst' | 'unknown';
  comparison_to_typical: string;
}

interface ProjectPopularityContext {
  cohort_basis: 'published' | 'completed';
  cohort_size: number;
  source_domain_episode_count: number;
  source_type_episode_count: number;
  current_comment_count?: number;
  project_rank_by_comment_count?: number;
  project_percentile_by_comment_count?: number;
  project_median_comment_count?: number;
  source_domain_median_comment_count?: number;
  source_type_median_comment_count?: number;
  relative_label: 'top-tier' | 'above-median' | 'mid-pack' | 'low-engagement' | 'unknown';
  summary: string;
}

interface OutlineCommentTemperature {
  worth_scanning: boolean;
  dominant_sentiment: string;
  temperature_summary: string;
}

interface OutlineCommentQuote {
  venue: string;
  quote: string;
  pointer?: string;
}

interface OutlineCommentBucket {
  label: string;
  stance: string;
  share_estimate: string;
  description: string;
  evidence: string[];
  representative_quotes: OutlineCommentQuote[];
}

interface OutlineCreatorIntent {
  author: string;
  affiliation?: string;
  objective_hypothesis: string;
  supporting_evidence: string[];
}

interface OutlineArticleTriage {
  worth_reading: boolean;
  verdict_reason: string;
  creator_intent: OutlineCreatorIntent;
  key_claims: string[];
  depth_note: string;
}

interface OutlineExceptionalSegment {
  source_type: 'comment' | 'article' | 'other';
  venue: string;
  author: string;
  excerpt: string;
  pointer?: string;
  reason: string;
}

interface ScriptOutline {
  headline: OutlineHeadline;
  activity_signals: OutlineActivitySignals;
  project_context?: ProjectPopularityContext;
  comment_temperature: OutlineCommentTemperature;
  comment_buckets: OutlineCommentBucket[];
  article_triage: OutlineArticleTriage;
  exceptional_segments: OutlineExceptionalSegment[];
  takeaway: string;
  narration_plan: string[];
  structural_warnings?: string[];
  required_evidence?: string[];
}

interface DescriptionNotes {
  description_notes: string;
  key_themes: string[];
  notable_insights: string[];
  listener_hook: string;
}

interface StoredOutlineRow {
  episode_id: string;
  script_outline_content?: string;
  publish_status: string;
  script_status: string;
}

function parseApproximateCount(value?: string): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes('unknown') || normalized.includes('n/a')) {
    return null;
  }

  const matches = [...normalized.matchAll(/\d[\d,]*/g)];
  if (matches.length === 0) {
    return null;
  }

  const numbers = matches
    .map(match => Number(match[0].replace(/,/g, '')))
    .filter(number => Number.isFinite(number));

  if (numbers.length === 0) {
    return null;
  }

  return Math.max(...numbers);
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }

  const lower = sorted[midpoint - 1]!;
  const upper = sorted[midpoint]!;
  return Math.round((lower + upper) / 2);
}

function formatCount(value?: number): string {
  return typeof value === 'number' ? value.toLocaleString() : 'unknown';
}

function percentileFromRank(rank: number, total: number): number {
  if (total <= 1) {
    return 100;
  }

  const percentile = ((total - rank) / (total - 1)) * 100;
  return Math.round(percentile);
}

function labelFromPercentile(percentile?: number): ProjectPopularityContext['relative_label'] {
  if (typeof percentile !== 'number') {
    return 'unknown';
  }

  if (percentile >= 85) {
    return 'top-tier';
  }

  if (percentile >= 60) {
    return 'above-median';
  }

  if (percentile >= 35) {
    return 'mid-pack';
  }

  return 'low-engagement';
}

function buildProjectPopularityContext(
  context: Context,
  outline: ScriptOutline
): ProjectPopularityContext {
  const rowQuery = `
    SELECT episode_id, script_outline_content, publish_status, script_status
    FROM episodes
    WHERE episode_id != ?
      AND script_outline_content IS NOT NULL
      AND (
        publish_status = ?
        OR script_status = ?
      )
  `;

  const rows = context.db
    .prepare(rowQuery)
    .all(
      context.episodeId,
      CONFIG.STAGE_STATUS.COMPLETED,
      CONFIG.STAGE_STATUS.COMPLETED
    ) as StoredOutlineRow[];

  const publishedRows = rows.filter(row => row.publish_status === CONFIG.STAGE_STATUS.COMPLETED);
  const candidateRows = publishedRows.length > 0 ? publishedRows : rows;
  const cohortBasis: ProjectPopularityContext['cohort_basis'] =
    publishedRows.length > 0 ? 'published' : 'completed';

  const parsedOutlines = candidateRows
    .map(row => {
      try {
        return JSON.parse(row.script_outline_content || '{}') as Partial<ScriptOutline>;
      } catch (error) {
        console.warn('[script] Unable to parse stored outline for project context:', row.episode_id, error);
        return null;
      }
    })
    .filter((value): value is Partial<ScriptOutline> => value !== null);

  const currentCommentCount = parseApproximateCount(outline.activity_signals.comment_count);
  const currentSourceDomain = outline.headline.source_domain;
  const currentSourceType = outline.headline.source_type;

  const comparableEpisodes = parsedOutlines
    .map(candidate => {
      const commentCount = parseApproximateCount(candidate.activity_signals?.comment_count);
      if (commentCount === null) {
        return null;
      }

      return {
        commentCount,
        sourceDomain: candidate.headline?.source_domain || 'unknown',
        sourceType: candidate.headline?.source_type || 'unknown'
      };
    })
    .filter(
      (
        value
      ): value is { commentCount: number; sourceDomain: string; sourceType: string } => value !== null
    );

  const allCounts = comparableEpisodes.map(episode => episode.commentCount);
  const sameDomainCounts = comparableEpisodes
    .filter(episode => episode.sourceDomain === currentSourceDomain)
    .map(episode => episode.commentCount);
  const sameTypeCounts = comparableEpisodes
    .filter(episode => episode.sourceType === currentSourceType)
    .map(episode => episode.commentCount);

  if (currentCommentCount === null || allCounts.length === 0) {
    return {
      cohort_basis: cohortBasis,
      cohort_size: allCounts.length,
      source_domain_episode_count: sameDomainCounts.length,
      source_type_episode_count: sameTypeCounts.length,
      relative_label: 'unknown',
      summary:
        'Project-relative popularity is unavailable here because this episode or the prior archive lacks a usable comment-count baseline.'
    };
  }

  const sortedCounts = [...allCounts].sort((a, b) => b - a);
  const rank = sortedCounts.filter(count => count > currentCommentCount).length + 1;
  const percentile = percentileFromRank(rank, sortedCounts.length);
  const label = labelFromPercentile(percentile);
  const projectMedian = median(allCounts);
  const domainMedian = median(sameDomainCounts);
  const typeMedian = median(sameTypeCounts);

  const cohortLabel = cohortBasis === 'published' ? 'published episodes' : 'completed episodes';
  const domainFragment =
    sameDomainCounts.length > 0
      ? ` Within ${currentSourceDomain}, the median is ${formatCount(domainMedian)} comments across ${sameDomainCounts.length} episodes.`
      : '';

  const summary =
    `Compared with ${sortedCounts.length} prior ${cohortLabel} with usable comment counts, this ranks #${rank} by comment volume ` +
    `(${percentile}th percentile) against a project median of ${formatCount(projectMedian)} comments.` +
    domainFragment;

  return {
    cohort_basis: cohortBasis,
    cohort_size: sortedCounts.length,
    source_domain_episode_count: sameDomainCounts.length,
    source_type_episode_count: sameTypeCounts.length,
    current_comment_count: currentCommentCount,
    project_rank_by_comment_count: rank,
    project_percentile_by_comment_count: percentile,
    relative_label: label,
    summary,
    ...(projectMedian !== undefined ? { project_median_comment_count: projectMedian } : {}),
    ...(domainMedian !== undefined ? { source_domain_median_comment_count: domainMedian } : {}),
    ...(typeMedian !== undefined ? { source_type_median_comment_count: typeMedian } : {})
  };
}

async function callOpenAIWithWebSearch(
  openai: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string; inputTokens?: number; outputTokens?: number }> {
  const response = await (openai as any).responses.create({
    model,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    tools: [
      {
        type: "web_search"
      }
    ],
    tool_choice: "auto"
  });

  return {
    content: response.output_text || '',
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens
  };
}

async function generateOutline(
  openai: OpenAI,
  title: string,
  summary: string,
  url: string,
  model: string
): Promise<{ outline: ScriptOutline; inputTokens: number; outputTokens: number }> {
  console.log('[script] Stage 1: Generating research outline...');
  
  const { content, inputTokens, outputTokens } = await callOpenAIWithWebSearch(
    openai,
    model,
    CONFIG.PROMPTS.SCRIPT_OUTLINE_SYSTEM,
    CONFIG.PROMPTS.SCRIPT_OUTLINE_USER(title, summary, url)
  );

  if (!content) {
    throw new Error('No response from OpenAI for outline generation');
  }

  console.log('[script] Outline response length:', content.length);
  
  let outline: ScriptOutline;
  try {
    const jsonContentRaw = extractJsonObject(content);
    if (!jsonContentRaw) {
      throw new Error('Could not find JSON object in outline response');
    }
    
    const jsonContent = sanitizeJsonText(jsonContentRaw);
    outline = JSON.parse(jsonContent);
  } catch (parseError) {
    console.error('[script] Outline parse error:', parseError);
    console.error('[script] Problematic content:', content);
    throw new Error(`Failed to parse outline JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }

  return { outline, inputTokens: inputTokens || 0, outputTokens: outputTokens || 0 };
}

async function generateContent(
  openai: OpenAI,
  outline: ScriptOutline,
  model: string
): Promise<{ draft: ScriptDialogue[]; inputTokens: number; outputTokens: number }> {
  console.log('[script] Stage 2: Generating content draft...');
  
  const outlineText = JSON.stringify(outline, null, 2);
  const { content, inputTokens, outputTokens } = await callOpenAIWithWebSearch(
    openai,
    model,
    CONFIG.PROMPTS.SCRIPT_CONTENT_SYSTEM,
    CONFIG.PROMPTS.SCRIPT_CONTENT_USER(outlineText)
  );

  if (!content) {
    throw new Error('No response from OpenAI for content generation');
  }

  console.log('[script] Content response length:', content.length);

  const jsonContentRaw = extractJsonArray(content);
  if (!jsonContentRaw) {
    console.error('[script] Could not find JSON array in content response. Full response follows:\n', content);
    throw new Error('Failed to locate JSON array in content response');
  }

  const jsonContent = sanitizeJsonText(jsonContentRaw);
  console.log('[script] Content JSON preview:', jsonContent.substring(0, 200) + '...');

  let draft: ScriptDialogue[];
  try {
    draft = JSON.parse(jsonContent);
  } catch (parseError) {
    console.error('[script] Content parse error:', parseError);
    console.error('[script] Problematic JSON:', jsonContent);
    throw new Error(`Failed to parse content JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }

  // Validate draft format
  if (!Array.isArray(draft) || draft.length === 0) {
    throw new Error('Content draft must be a non-empty array');
  }

  for (const entry of draft) {
    if (!entry.persona || !entry.text) {
      throw new Error('Each content entry must have persona and text');
    }
    if (entry.persona !== CONFIG.PERSONAS.SCHOLAR) {
      throw new Error(`Invalid persona: ${entry.persona}. Must be SCHOLAR`);
    }
  }

  return { draft, inputTokens: inputTokens || 0, outputTokens: outputTokens || 0 };
}

async function refineScript(
  openai: OpenAI,
  draft: ScriptDialogue[],
  outline: ScriptOutline,
  model: string
): Promise<{ refined: ScriptDialogue[]; inputTokens: number; outputTokens: number }> {
  console.log('[script] Stage 3: Refining script...');
  
  const draftText = JSON.stringify(draft, null, 2);
  const outlineText = JSON.stringify(outline, null, 2);
  const { content, inputTokens, outputTokens } = await callOpenAIWithWebSearch(
    openai,
    model,
    CONFIG.PROMPTS.SCRIPT_REFINEMENT_SYSTEM,
    CONFIG.PROMPTS.SCRIPT_REFINEMENT_USER(draftText, outlineText)
  );

  if (!content) {
    throw new Error('No response from OpenAI for refinement');
  }

  console.log('[script] Refinement response length:', content.length);

  const jsonContentRaw = extractJsonArray(content);
  if (!jsonContentRaw) {
    console.error('[script] Could not find JSON array in refinement response. Full response follows:\n', content);
    throw new Error('Failed to locate JSON array in refinement response');
  }

  const jsonContent = sanitizeJsonText(jsonContentRaw);
  console.log('[script] Refinement JSON preview:', jsonContent.substring(0, 200) + '...');

  let refined: ScriptDialogue[];
  try {
    refined = JSON.parse(jsonContent);
  } catch (parseError) {
    console.error('[script] Refinement parse error:', parseError);
    console.error('[script] Problematic JSON:', jsonContent);
    throw new Error(`Failed to parse refinement JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }

  // Validate refined format
  if (!Array.isArray(refined) || refined.length === 0) {
    throw new Error('Refined script must be a non-empty array');
  }

  for (const entry of refined) {
    if (!entry.persona || !entry.text) {
      throw new Error('Each refined entry must have persona and text');
    }
    if (entry.persona !== CONFIG.PERSONAS.SCHOLAR) {
      throw new Error(`Invalid persona: ${entry.persona}. Must be SCHOLAR`);
    }
  }

  return { refined, inputTokens: inputTokens || 0, outputTokens: outputTokens || 0 };
}

async function extractDescriptionNotes(
  openai: OpenAI,
  script: ScriptDialogue[],
  model: string
): Promise<{ notes: DescriptionNotes; inputTokens: number; outputTokens: number }> {
  console.log('[script] Stage 5: Extracting description notes...');
  
  const scriptText = JSON.stringify(script, null, 2);
  const { content, inputTokens, outputTokens } = await callOpenAIWithWebSearch(
    openai,
    model,
    CONFIG.PROMPTS.SCRIPT_DESCRIPTION_SYSTEM,
    CONFIG.PROMPTS.SCRIPT_DESCRIPTION_USER(scriptText)
  );

  if (!content) {
    throw new Error('No response from OpenAI for description notes extraction');
  }

  console.log('[script] Description notes response length:', content.length);
  
  let notes: DescriptionNotes;
  try {
    const jsonContentRaw = extractJsonObject(content);
    if (!jsonContentRaw) {
      throw new Error('Could not find JSON object in description notes response');
    }
    
    const jsonContent = sanitizeJsonText(jsonContentRaw);
    notes = JSON.parse(jsonContent);
  } catch (parseError) {
    console.error('[script] Description notes parse error:', parseError);
    console.error('[script] Problematic content:', content);
    throw new Error(`Failed to parse description notes JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }

  return { notes, inputTokens: inputTokens || 0, outputTokens: outputTokens || 0 };
}

function validateScript(script: ScriptDialogue[]): void {
  console.log('[script] Stage 4: Final validation...');
  
  if (!Array.isArray(script) || script.length === 0) {
    throw new Error('Final script must be a non-empty array');
  }

  for (const entry of script) {
    if (!entry.persona || !entry.text) {
      throw new Error('Each script entry must have persona and text');
    }
    if (entry.persona !== CONFIG.PERSONAS.SCHOLAR) {
      throw new Error(`Invalid persona: ${entry.persona}. Must be SCHOLAR`);
    }
  }

  // Check for potential repetition indicators
  const textContent = script.map(entry => entry.text.toLowerCase()).join(' ');
  const repetitionIndicators = [
    'as we saw earlier',
    'as mentioned before',
    'now let\'s turn to',
    'in this section',
    'moving on to',
    'let\'s consider',
    'as we discussed',
    'more like',
    'click through',
    'comments an hour'
  ];

  const foundRepetitions = repetitionIndicators.filter(indicator => 
    textContent.includes(indicator)
  );

  if (foundRepetitions.length > 0) {
    console.warn('[script] Warning: Potential repetitive phrases found:', foundRepetitions);
  }

  console.log('[script] Validation completed successfully');
}

export async function runScript(context: Context): Promise<void> {
  console.log('[script] Running multi-stage script generation');
  console.log('[script] Outline model:', context.options.scriptOutlineModel);
  console.log('[script] Content model:', context.options.scriptContentModel);
  console.log('[script] Refinement model:', context.options.scriptRefinementModel);
  console.log('[script] Description model:', context.options.scriptDescriptionModel);
  console.log('[script] Dry run:', context.options.dryRun);

  if (!context.episodeId || !context.paths.scriptFile) {
    throw new Error('Episode ID and script file path must be set in context');
  }

  // Check if already completed
  const existing = context.db.findByEpisodeId(context.episodeId);
  if (existing?.script_status === CONFIG.STAGE_STATUS.COMPLETED) {
    if (context.options.force) {
      console.log('[script] Stage previously completed, rerunning due to --force');
    } else {
      console.log('[script] Stage already completed, skipping');
      return;
    }
  }

  // Check prerequisites
  if (!existing || existing.metadata_status !== CONFIG.STAGE_STATUS.COMPLETED) {
    throw new Error('Metadata stage must be completed before script generation');
  }

  // Update status to in-progress
  if (!context.options.dryRun) {
    context.db.updateStageStatus(context.episodeId, 'script', CONFIG.STAGE_STATUS.IN_PROGRESS);
  }

  if (context.options.dryRun) {
    console.log('[script] Dry run: would call OpenAI APIs to generate script');
    console.log('[script] Dry run: Stage 1: Generate outline');
    console.log('[script] Dry run: Stage 2: Generate content');
    console.log('[script] Dry run: Stage 3: Refine script');
    console.log('[script] Dry run: Stage 4: Validate script');
    console.log('[script] Dry run: Stage 5: Extract description notes');
    console.log('[script] Dry run: would save script to', context.paths.scriptFile);
    return;
  }

  // Ensure directory exists
  const scriptDir = dirname(context.paths.scriptFile);
  if (!existsSync(scriptDir)) {
    mkdirSync(scriptDir, { recursive: true });
  }

  const openai = new OpenAI();
  const title = existing.metadata_title || '';
  const summary = existing.metadata_summary || '';
  const url = existing.original_url || existing.normalized_url || '';

  try {
    // Stage 1: Generate outline
    const { outline } = 
      await generateOutline(openai, title, summary, url, context.options.scriptOutlineModel);

    outline.project_context = buildProjectPopularityContext(context, outline);
    console.log('[script] Project context:', outline.project_context.summary);

    // Save outline to file
    if (context.paths.outlineFile) {
        writeFileSync(context.paths.outlineFile, JSON.stringify(outline, null, 2));
        console.log('[script] Saved research outline to', context.paths.outlineFile);
    }

    // Stage 2: Generate content
    const { draft } = 
      await generateContent(openai, outline, context.options.scriptContentModel);

    // Stage 3: Refine script
    const { refined } = 
      await refineScript(openai, draft, outline, context.options.scriptRefinementModel);

    // Stage 4: Final validation
    validateScript(refined);

    // Stage 5: Extract description notes
    const { notes } = 
      await extractDescriptionNotes(openai, refined, context.options.scriptDescriptionModel);

    // Save final script to file
    writeFileSync(context.paths.scriptFile, JSON.stringify(refined, null, 2));

    // Update database with results
    const updates: any = {
      script_model: `${context.options.scriptOutlineModel}+${context.options.scriptContentModel}+${context.options.scriptRefinementModel}`,
      script_file_path: context.paths.scriptFile,
      script_segment_count: refined.length,
      
      // Multi-stage details
      script_outline_model: context.options.scriptOutlineModel,
      script_outline_content: JSON.stringify(outline, null, 2),
      script_content_model: context.options.scriptContentModel,
      script_content_draft: JSON.stringify(draft, null, 2),
      script_refinement_model: context.options.scriptRefinementModel,
      script_description_notes: JSON.stringify(notes, null, 2),
      script_description_model: context.options.scriptDescriptionModel,
    };

    context.db.updateStageStatus(context.episodeId, 'script', CONFIG.STAGE_STATUS.COMPLETED, updates);

    console.log('[script] Multi-stage script generation completed successfully');
    console.log(`[script] Final script segments: ${refined.length}`);
    
    const estimatedMinutes = refined.reduce((sum, entry) => sum + entry.text.split(' ').length, 0) / CONFIG.WORDS_PER_MINUTE;
    console.log(`[script] Estimated audio time: ${estimatedMinutes.toFixed(1)} minutes`);

  } catch (error) {
    // Mark as failed
    context.db.updateStageStatus(context.episodeId, 'script', CONFIG.STAGE_STATUS.FAILED);
    throw error;
  }
}
