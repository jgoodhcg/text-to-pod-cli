import type { Context } from '../types.js';
import { existsSync, mkdirSync } from 'fs';
import { CONFIG } from '../config.js';
import { extractJsonObject, sanitizeJsonText } from '../utils.js';
import { normalizeUrl } from '../utils.js';
import { formatProviderModel, generateTextWithWebSearch } from '../generation.js';
import { COST_PRICING_SNAPSHOT, estimateTextCostUsd, formatUsd } from '../costs.js';

export async function runMetadata(context: Context): Promise<void> {
  console.log('[metadata] Running metadata stage');
  console.log('[metadata] Provider:', context.options.metadataProvider);
  console.log('[metadata] Model:', context.options.metadataModel);
  console.log('[metadata] URL:', context.options.url);
  console.log('[metadata] Dry run:', context.options.dryRun);

  if (!context.options.url) {
    throw new Error('URL is required for metadata stage');
  }

  if (!context.episodeId || !context.paths.episodeDir) {
    throw new Error('Episode ID and paths must be set in context');
  }
  const episodeId = context.episodeId;

  if (!context.options.dryRun) {
    const normalized = normalizeUrl(context.options.url);
    context.db.updateEpisodeUrls(context.episodeId, context.options.url, normalized);
  }

  // Create episode directory structure
  if (!context.options.dryRun) {
    if (!existsSync(context.paths.episodeDir)) {
      mkdirSync(context.paths.episodeDir, { recursive: true });
    }
    const audioDir = `${context.paths.episodeDir}/audio/chunks`;
    if (!existsSync(audioDir)) {
      mkdirSync(audioDir, { recursive: true });
    }
  }

  // Check if already completed
  const existing = context.db.findByEpisodeId(context.episodeId);
  if (existing?.metadata_status === CONFIG.STAGE_STATUS.COMPLETED) {
    console.log('[metadata] Stage already completed, skipping');
    return;
  }

  // Update status to in-progress
  if (!context.options.dryRun) {
    context.db.updateStageStatus(context.episodeId, 'metadata', CONFIG.STAGE_STATUS.IN_PROGRESS);
  }

  if (context.options.dryRun) {
    console.log(`[metadata] Dry run: would call ${context.options.textProvider} API to extract metadata`);
    console.log('[metadata] Dry run: would update database with results');
    return;
  }

  const systemPrompt = context.options.metadataSystemPrompt || CONFIG.PROMPTS.METADATA_SYSTEM;
  const userPrompt = context.options.metadataPromptTemplate 
    ? context.options.metadataPromptTemplate.replace('{url}', context.options.url)
    : CONFIG.PROMPTS.METADATA_USER(context.options.url);

  try {
    const response = await generateTextWithWebSearch({
      provider: context.options.metadataProvider,
      model: context.options.metadataModel,
      systemPrompt: systemPrompt + "\n\nIMPORTANT: You must respond with a valid JSON object containing the metadata fields. Do not include any explanations or text outside the JSON.",
      userPrompt,
      onRequestFailure: failure => {
        context.db.recordFailure({
          episodeId,
          stage: 'metadata',
          stageOrder: CONFIG.PIPELINE_STAGE_ORDER.METADATA,
          retryScope: 'provider_request',
          attemptNumber: failure.attemptNumber,
          maxAttempts: failure.maxAttempts,
          willRetry: failure.willRetry,
          model: formatProviderModel(context.options.metadataProvider, failure.model),
          error: failure.error
        });
      }
    });

    console.log(`[metadata] Web search requested via ${context.options.metadataProvider}`);

    const finalContent = response.content;
    if (!finalContent) {
      throw new Error(`No response from ${context.options.metadataProvider}`);
    }

    console.log('[metadata] Raw response length:', finalContent.length);
    console.log('[metadata] Raw response preview:', finalContent.substring(0, 200) + '...');

    // Extract JSON from response - more robust approach
    const jsonContentRaw = extractJsonObject(finalContent);
    if (!jsonContentRaw) {
      throw new Error(`Failed to locate JSON object in ${context.options.metadataProvider} response`);
    }

    const jsonContent = sanitizeJsonText(jsonContentRaw);

    console.log('[metadata] Extracted JSON length:', jsonContent.length);
    console.log('[metadata] JSON preview:', jsonContent.substring(0, 200) + '...');

    let metadata;
    try {
      metadata = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('[metadata] JSON parse error:', parseError);
      console.error('[metadata] Problematic JSON:', jsonContent);
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(`Failed to parse JSON from ${context.options.metadataProvider} response: ${message}`);
    }
    
    // Validate required fields
    if (!metadata.title || !metadata.summary) {
      throw new Error('Missing required metadata fields');
    }

    // Update database with results
    const estimatedCost = estimateTextCostUsd(
      context.options.metadataProvider,
      context.options.metadataModel,
      response.inputTokens,
      response.outputTokens
    );

    const updates: any = {
      metadata_model: formatProviderModel(context.options.metadataProvider, context.options.metadataModel),
      metadata_title: metadata.title,
      metadata_summary: metadata.summary,
      metadata_published_at: metadata.published_at || new Date().toISOString(),
      metadata_input_tokens: response.inputTokens,
      metadata_output_tokens: response.outputTokens,
      metadata_estimated_cost_usd: estimatedCost
    };

    // Store related links as JSON string
    if (metadata.related_links && Array.isArray(metadata.related_links)) {
      updates.metadata_related_links = JSON.stringify(metadata.related_links);
    }



    context.db.updateStageStatus(context.episodeId, 'metadata', CONFIG.STAGE_STATUS.COMPLETED, updates);
    context.db.refreshEstimatedTotalCost(context.episodeId, COST_PRICING_SNAPSHOT);

    console.log('[metadata] Successfully extracted and saved metadata');
    console.log(`[metadata] Usage: input=${response.inputTokens ?? 'unknown'} output=${response.outputTokens ?? 'unknown'} estimated_cost=${formatUsd(estimatedCost)}`);
    console.log(`[metadata] Title: ${metadata.title}`);
    console.log(`[metadata] Summary: ${metadata.summary}`);
    if (metadata.related_links && Array.isArray(metadata.related_links)) {
      console.log(`[metadata] Related links: ${metadata.related_links.length} found`);
      console.log(`[metadata] First few links:`, metadata.related_links.slice(0, 3));
    }

  } catch (error) {
    // Mark as failed
    context.db.updateStageStatus(context.episodeId, 'metadata', CONFIG.STAGE_STATUS.FAILED);
    context.db.recordFailure({
      episodeId,
      stage: 'metadata',
      stageOrder: CONFIG.PIPELINE_STAGE_ORDER.METADATA,
      retryScope: 'stage',
      model: formatProviderModel(context.options.metadataProvider, context.options.metadataModel),
      error
    });
    throw error;
  }
}
