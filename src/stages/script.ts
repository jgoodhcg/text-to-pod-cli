import type { Context, ScriptDialogue } from '../types.js';
import OpenAI from 'openai';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { CONFIG } from '../config.js';
import { extractJsonArray, sanitizeJsonText } from '../utils.js';

interface ScriptOutline {
  research_summary: string;
  main_themes: string[];
  narrative_flow: string;
  key_insights: string[];
  repetition_warnings: string[];
  evidence_points: string[];
  transition_points: string[];
  target_duration_minutes: number;
}

interface DescriptionNotes {
  description_notes: string;
  key_themes: string[];
  notable_insights: string[];
  listener_hook: string;
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
  model: string
): Promise<{ outline: ScriptOutline; inputTokens: number; outputTokens: number }> {
  console.log('[script] Stage 1: Generating research outline...');
  
  const { content, inputTokens, outputTokens } = await callOpenAIWithWebSearch(
    openai,
    model,
    CONFIG.PROMPTS.SCRIPT_OUTLINE_SYSTEM,
    CONFIG.PROMPTS.SCRIPT_OUTLINE_USER(title, summary)
  );

  if (!content) {
    throw new Error('No response from OpenAI for outline generation');
  }

  console.log('[script] Outline response length:', content.length);
  
  let outline: ScriptOutline;
  try {
    // Extract JSON object (not array) for outline
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not find JSON object in outline response');
    }
    
    const jsonContent = sanitizeJsonText(jsonMatch[0]);
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
    // Extract JSON object (not array) for description notes
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not find JSON object in description notes response');
    }
    
    const jsonContent = sanitizeJsonText(jsonMatch[0]);
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
    'as we discussed'
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
    console.log('[script] Stage already completed, skipping');
    return;
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

  try {
    // Stage 1: Generate outline
    const { outline, inputTokens: outlineInputTokens, outputTokens: outlineOutputTokens } = 
      await generateOutline(openai, title, summary, context.options.scriptOutlineModel);

    // Stage 2: Generate content
    const { draft, inputTokens: contentInputTokens, outputTokens: contentOutputTokens } = 
      await generateContent(openai, outline, context.options.scriptContentModel);

    // Stage 3: Refine script
    const { refined, inputTokens: refinementInputTokens, outputTokens: refinementOutputTokens } = 
      await refineScript(openai, draft, outline, context.options.scriptRefinementModel);

    // Stage 4: Final validation
    validateScript(refined);

    // Stage 5: Extract description notes
    const { notes, inputTokens: descriptionInputTokens, outputTokens: descriptionOutputTokens } = 
      await extractDescriptionNotes(openai, refined, context.options.scriptDescriptionModel);

    // Save final script to file
    writeFileSync(context.paths.scriptFile, JSON.stringify(refined, null, 2));

    // Calculate total tokens
    const totalInputTokens = outlineInputTokens + contentInputTokens + refinementInputTokens + descriptionInputTokens;
    const totalOutputTokens = outlineOutputTokens + contentOutputTokens + refinementOutputTokens + descriptionOutputTokens;

    // Update database with results
    const updates: any = {
      script_model: `${context.options.scriptOutlineModel}+${context.options.scriptContentModel}+${context.options.scriptRefinementModel}`,
      script_file_path: context.paths.scriptFile,
      script_segment_count: refined.length,
      script_input_tokens: totalInputTokens,
      script_output_tokens: totalOutputTokens,
      
      // Multi-stage details
      script_outline_model: context.options.scriptOutlineModel,
      script_outline_tokens: outlineInputTokens + outlineOutputTokens,
      script_outline_content: JSON.stringify(outline, null, 2),
      script_content_model: context.options.scriptContentModel,
      script_content_tokens: contentInputTokens + contentOutputTokens,
      script_content_draft: JSON.stringify(draft, null, 2),
      script_refinement_model: context.options.scriptRefinementModel,
      script_refinement_tokens: refinementInputTokens + refinementOutputTokens,
      script_description_notes: JSON.stringify(notes, null, 2),
      script_description_model: context.options.scriptDescriptionModel,
      script_description_tokens: descriptionInputTokens + descriptionOutputTokens,
    };

    context.db.updateStageStatus(context.episodeId, 'script', CONFIG.STAGE_STATUS.COMPLETED, updates);

    console.log('[script] Multi-stage script generation completed successfully');
    console.log(`[script] Final script segments: ${refined.length}`);
    console.log(`[script] Total tokens: ${totalInputTokens} input, ${totalOutputTokens} output`);
    
    const estimatedMinutes = refined.reduce((sum, entry) => sum + entry.text.split(' ').length, 0) / CONFIG.WORDS_PER_MINUTE;
    console.log(`[script] Estimated audio time: ${estimatedMinutes.toFixed(1)} minutes`);

  } catch (error) {
    // Mark as failed
    context.db.updateStageStatus(context.episodeId, 'script', CONFIG.STAGE_STATUS.FAILED);
    throw error;
  }
}