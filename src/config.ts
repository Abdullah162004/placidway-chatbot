export type SourceType = 'clinic' | 'package' | 'videos' | 'price_list' | 'price_comparison';

export interface Source {
  url: string;
  type: SourceType;
}

export const SOURCES: readonly Source[] = [
  { type: 'clinic', url: 'https://www.placidway.com/profile/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center' },
  { type: 'package', url: 'https://www.placidway.com/package/7903/Alternative-Adenocarcinoma-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC' },
  { type: 'package', url: 'https://www.placidway.com/package/7902/Alternative-Adrenal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC' },
  { type: 'package', url: 'https://www.placidway.com/package/7901/Alternative-Anal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC' },
  { type: 'videos', url: 'https://www.placidway.com/profile-videos/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center' },
  { type: 'price_list', url: 'https://www.placidway.com/price-list/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center' },
  { type: 'price_comparison', url: 'https://www.placidway.com/search-medical-pricings/Alternative-Medicine/All/1' },
];

export const QUOTE_URL = 'https://www.placidway.com/contact-us';
export const USER_AGENT = 'PlacidWayKnowledgeBot/1.0 (assessment; +mailto:abdullahsheikh780@gmail.com)';
export const CRAWL_DELAY_MS = 1100;

export const CHUNK_MAX_CHARS = 1400;
export const CHUNK_OVERLAP_CHARS = 200;
export const EMBED_DIMENSIONS = 384;

export const RETRIEVAL_TOP_K = 6;
export const MIN_VECTOR_SCORE = 0.45;
export const HISTORY_TURNS = 6;

export const env = {
  geminiKey: () => process.env.GEMINI_API_KEY ?? '',
  groqKey: () => process.env.GROQ_API_KEY ?? '',
  models: () =>
    (process.env.LLM_MODELS ||
      'groq:openai/gpt-oss-120b,groq:openai/gpt-oss-20b,groq:qwen/qwen3.8-27b,gemini:gemini-3.5-flash,gemini:gemini-3-flash-preview,gemini:gemini-3.7-flash,gemini:gemini-2.5-flash').split(','),
  embedModel: () => process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001',
  refreshToken: () => process.env.REFRESH_TOKEN ?? '',
  adminToken: () => process.env.ADMIN_TOKEN ?? '',
  cronSecret: () => process.env.CRON_SECRET ?? '',
};
