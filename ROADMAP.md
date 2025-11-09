# Text-to-Pod CLI Roadmap

## Completed Improvements

### ✅ Remove Token Monitoring
- **Completed**: Removed all token tracking from script generation and metadata stages
- **Changes**: 
  - Removed token console output from script and metadata stages
  - Removed token database writes while preserving schema columns
  - Fixed unused variable warnings
- **Impact**: Cleaner codebase, no functional impact

### ✅ Adjust Audio Tone and Energy
- **Completed**: Implemented scholarly tone using OpenAI TTS instructions parameter
- **Changes**: 
  - Added instructions parameter for measured, contemplative delivery
  - Maintained existing voice (ash) and natural pacing
  - Preserved original script content
- **Impact**: Audio now has appropriate scholarly tone instead of "shouting headlines"

## Future Enhancements

### 🎯 Web Scraping Fallback System (High Priority)
- **Goal**: Enable content retrieval when AI APIs refuse to access URLs
- **Problem**: LLMs often can't access content due to bot detection, IP restrictions, or site policies
- **Solution**: Automatic fallback to direct web scraping with site-specific patterns
- **Implementation Plan**:
  - **Content Accessibility Test**: Initial AI query to test if URL is accessible
  - **Automatic Fallback**: Switch to scraping when AI reports access failure
  - **Site-Specific Patterns**: 
    - Reddit: Extract post content + comment threads via JSON API or HTML parsing
    - Hacker News: Extract article + comments using predictable HTML structure
    - Extensible system: Add new patterns via TLD identification
  - **Content Processing**: 
    - Forum content: Extract both source post and comments
    - General content: Extract main article body
    - HTML cleaning: Strip ads, navigation, boilerplate
  - **Storage & Caching**: Save scraped content to database and episode directory
  - **CLI Options**:
    - `--test-scraping`: Test scraping functionality on specific URLs
    - `--force-scraping`: Bypass AI and use scraping directly
    - `--no-scraping`: Disable fallback scraping entirely
    - Default: Automatic fallback when AI fails
- **Technical Approach**:
  - Lightweight HTML parsing library (node-html-parser)
  - Minimal dependencies within existing TS project
  - Pattern-based extraction system
  - Database tracking for successful extractions
- **Priority**: High - Solves critical content access failures

### 🎯 Content Quality Improvements (High Priority)
- **Goal**: Enhance podcast engagement through better content extraction and structure
- **Planned Changes**:
  - **Extract analogies from source**: Add requirement to find at least 3 specific analogies/metaphors from source content or comments instead of creating them
  - **Remove artificial hooks**: Eliminate LLM-generated hook language that sounds unnatural
  - **Enhanced people identification**: Strengthen requirements to identify specific people/groups affected (content creator, intended audience, comment demographics)
  - **Sentence variety**: Add refinement rules for varied sentence length and rhythm
  - **Detailed endings**: Replace forward-looking questions with concrete details and verbatim readings of interesting but less critical content
- **Impact**: More engaging, authentic content that leverages existing source material
- **Priority**: High - Directly improves listener experience

### Podcast Landing Page
- **Goal**: Create a web presence for the podcast
- **Options to consider**:
  - Generate static HTML from RSS feed data
  - Deploy to podcast platforms (Apple Podcasts, Spotify, etc.)
  - Create simple episode archive with search functionality
- **Priority**: Medium - Improves discoverability and user experience

### Additional Features
- Episode management and editing tools
- Batch processing for multiple URLs
- Custom voice configuration per episode type
- Audio post-processing and enhancement
- Analytics and usage tracking

---

## Implementation Status

### 🔄 In Progress
- **Web Scraping Fallback System**: Implementation planned to solve AI API content access failures
- **Content Quality Improvements**: Prompt updates planned to enhance engagement through better source content utilization

### 📋 Next Steps
1. **Web Scraping System Implementation**:
   - Add content accessibility test to existing AI query flow
   - Implement site-specific extraction patterns for Reddit and Hacker News
   - Create extensible pattern system for future sites
   - Add CLI flags for scraping control and testing
   - Integrate scraped content storage with database and episode directories
2. **Content Quality Improvements**:
   - Update SCRIPT_OUTLINE_SYSTEM to add analogy extraction and people identification requirements
   - Update SCRIPT_CONTENT_SYSTEM to remove hook language and add sentence variety instructions  
   - Update SCRIPT_REFINEMENT_SYSTEM to include sentence variety and detailed ending requirements
   - Update corresponding USER prompts to match system changes
   - Test with new episodes to validate improved engagement

*The core text-to-podcast pipeline is complete with improved audio quality and cleaner codebase. Ready for production use and targeted content quality enhancements.*