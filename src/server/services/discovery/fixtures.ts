import type { funnelStages, promptIntents } from "@/lib/db/schema";

/**
 * Explicit mock fixtures for Phase 2 discovery.
 *
 * These fixtures are the ONLY source of AI suggestions in mock mode. Every
 * entry is qualitative — there are deliberately NO search-volume, CPC,
 * traffic or mention-rate numbers anywhere in this file. Where a real
 * product would need data we do not have, the fixture produces an honest
 * empty value or a discovery aid (search queries the user can run), never a
 * fabricated fact.
 */

/** Qualitative priority shown as "QuerySide Priority" in the UI. */
export const queryPriorities = ["LOW", "MEDIUM", "HIGH"] as const;
export type QueryPriority = (typeof queryPriorities)[number];

export const INDUSTRIES = [
  "software",
  "ecommerce",
  "agency",
  "healthcare",
  "finance",
  "education",
  "realestate",
  "hospitality",
  "fitness",
  "legal",
  "manufacturing",
  "media",
  "other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

/** Common English words that carry no classification signal. */
export const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "her", "was", "one", "our", "out", "has", "have", "had", "how", "its",
  "let", "may", "new", "now", "old", "see", "way", "who", "did", "get",
  "got", "him", "his", "man", "she", "too", "use", "that", "with", "have",
  "this", "will", "your", "from", "they", "know", "want", "been", "much",
  "some", "time", "very", "when", "come", "here", "just", "like", "long",
  "make", "many", "more", "only", "over", "such", "take", "than", "them",
  "well", "were", "what", "each", "give", "good", "most", "page", "home",
  "about", "contact", "learn", "read", "view", "site", "web", "www",
  "com", "http", "https", "html", "php", "aspx", "index", "menu", "nav",
  "copyright", "rights", "reserved", "privacy", "terms", "cookie",
  "support", "service", "services", "customer", "customers", "welcome",
  "world", "best", "top", "free", "online", "working", "works", "work",
  "needs", "need", "ready", "today", "also", "into", "first", "still",
  "after", "should", "would", "could", "there", "these", "those", "your",
  "yours", "their", "they", "them", "then", "than", "because", "while",
  "where", "which", "under", "between", "through", "during", "before",
]);

/**
 * Keyword → industry signal. Matched against extracted site keywords
 * (frequency-ranked). Ties resolve to "other" — we never guess past the
 * evidence in the site's own content.
 */
export const INDUSTRY_KEYWORDS: Record<Industry, string[]> = {
  software: [
    "software", "saas", "platform", "api", "developer", "developers", "app",
    "cloud", "analytics", "automation", "crm", "dashboard", "integration",
    "workflow", "ai", "data", "tool", "tools", "tech", "technology",
  ],
  ecommerce: [
    "shop", "store", "shopping", "checkout", "shipping", "product",
    "products", "cart", "clothing", "jewelry", "fashion", "furniture",
    "gift", "gifts", "orders", "delivery",
  ],
  agency: [
    "agency", "marketing", "seo", "branding", "brand", "design",
    "designer", "studio", "consulting", "consultant", "strategy",
    "creative", "advertising", "content",
  ],
  healthcare: [
    "health", "healthcare", "clinic", "dental", "dentist", "doctor",
    "patient", "patients", "medical", "therapy", "therapist", "care",
    "treatment", "treatments", "physio", "chiropractic",
  ],
  finance: [
    "finance", "financial", "banking", "invest", "investment", "investing",
    "accounting", "accountant", "insurance", "fintech", "payments",
    "payment", "loan", "loans", "budget", "wealth", "tax", "taxes",
  ],
  education: [
    "education", "course", "courses", "learning", "school", "schools",
    "training", "tutor", "tutoring", "academy", "university", "student",
    "students", "class", "classes", "curriculum", "teacher",
  ],
  realestate: [
    "estate", "realtor", "property", "properties", "homes", "home",
    "listings", "listing", "mortgage", "rent", "rental", "apartment",
    "apartments", "condo", "relocation", "open",
  ],
  hospitality: [
    "hotel", "hotels", "restaurant", "restaurants", "menu", "reservation",
    "reservations", "travel", "tour", "tours", "cafe", "catering",
    "lodging", "stay", "guest", "guests", "booking", "bookings",
  ],
  fitness: [
    "fitness", "gym", "workout", "workouts", "yoga", "coach", "coaching",
    "nutrition", "trainer", "training", "personal", "strength", "wellness",
    "exercise", "pilates",
  ],
  legal: [
    "legal", "law", "attorney", "attorneys", "lawyer", "lawyers",
    "contract", "contracts", "litigation", "compliance", "court",
    "justice", "firm",
  ],
  manufacturing: [
    "manufacturing", "factory", "industrial", "machinery", "wholesale",
    "supply", "supplies", "logistics", "warehouse", "production",
    "materials", "parts", "components",
  ],
  media: [
    "news", "podcast", "podcasts", "magazine", "blog", "media", "journal",
    "publishing", "publisher", "video", "videos", "stories", "story",
    "editorial", "press",
  ],
  other: [],
};

/** Conservative audience phrasing per industry — a REVIEWABLE suggestion. */
export const AUDIENCE_TEMPLATES: Partial<Record<Industry, (keyword: string) => string>> = {
  software: (kw) => `Teams evaluating ${kw} solutions`,
  ecommerce: (kw) => `Shoppers looking for ${kw}`,
  agency: (kw) => `Businesses needing ${kw} expertise`,
  healthcare: (kw) => `People searching for ${kw} care`,
  finance: (kw) => `Individuals and teams researching ${kw}`,
  education: (kw) => `Learners interested in ${kw}`,
  realestate: (kw) => `People searching for ${kw}`,
  hospitality: (kw) => `Guests planning around ${kw}`,
  fitness: (kw) => `People training with ${kw}`,
  legal: (kw) => `People seeking ${kw} help`,
  manufacturing: (kw) => `Buyers sourcing ${kw}`,
  media: (kw) => `Readers following ${kw}`,
};

/** Per-industry honesty-preserving hints about competitor CATEGORIES. */
export const COMPETITOR_CATEGORY_HINTS: Record<Industry, string[]> = {
  software: [
    "Platforms offering the same core capability",
    "Spreadsheets or manual workflows teams use instead",
  ],
  ecommerce: [
    "Other stores selling comparable products",
    "Large marketplaces carrying similar items",
  ],
  agency: [
    "Other agencies serving the same niche",
    "Freelancers offering the same services",
  ],
  healthcare: [
    "Clinics nearby offering the same treatments",
    "Telehealth platforms covering the same services",
  ],
  finance: [
    "Providers of the same financial product",
    "Traditional institutions offering a comparable service",
  ],
  education: [
    "Course platforms teaching the same subject",
    "Local providers offering similar training",
  ],
  realestate: [
    "Agents and brokerages in the same area",
    "Portals where buyers also search",
  ],
  hospitality: [
    "Comparable venues or properties nearby",
    "Booking platforms in the same category",
  ],
  fitness: [
    "Gyms and studios with similar programs",
    "Apps covering the same training style",
  ],
  legal: [
    "Firms with the same practice focus in your region",
    "Online legal services covering the same needs",
  ],
  manufacturing: [
    "Suppliers of comparable materials or parts",
    "Alternative sourcing routes buyers consider",
  ],
  media: [
    "Publications covering the same topic",
    "Newsletters and podcasts in the same niche",
  ],
  other: [
    "Businesses offering the same product or service",
    "Alternative solutions customers compare you against",
  ],
};

/**
 * Query suggestion templates. Priority is a QUALITATIVE heuristic derived
 * from buying intent — never from search volume (which we do not have).
 */
export interface QueryTemplate {
  build: (keyword: string) => string;
  intent: (typeof promptIntents)[number];
  funnelStage: (typeof funnelStages)[number];
  priority: "LOW" | "MEDIUM" | "HIGH";
  rationale: string;
}

export const KEYWORD_QUERY_TEMPLATES: QueryTemplate[] = [
  {
    build: (kw) => `${kw} alternatives`,
    intent: "comparison",
    funnelStage: "decision",
    priority: "HIGH",
    rationale: "Decision-stage query: people comparing options before choosing.",
  },
  {
    build: (kw) => `best ${kw} providers`,
    intent: "commercial",
    funnelStage: "consideration",
    priority: "MEDIUM",
    rationale: "Commercial-stage query: people shortlisting providers.",
  },
  {
    build: (kw) => `what is ${kw}`,
    intent: "informational",
    funnelStage: "awareness",
    priority: "LOW",
    rationale: "Awareness-stage query: early research; lower buying intent.",
  },
];

export const BRAND_QUERY_TEMPLATE: QueryTemplate = {
  build: (brand) => `${brand} review`,
  intent: "brand",
  funnelStage: "decision",
  priority: "MEDIUM",
  rationale: "Brand-specific query: tracks what buyers ask about you directly.",
};

/** Queries the user can run to FIND competitors — never fabricated companies. */
export const COMPETITOR_DISCOVERY_TEMPLATES: Array<(keyword: string) => string> = [
  (kw) => `best ${kw} companies`,
  (kw) => `${kw} comparison`,
];

/** Maximum suggestions produced per category (cap fabrication surface). */
export const MAX_QUERY_SUGGESTIONS = 12;
export const MAX_KEYWORDS = 12;
export const MAX_SUGGESTED_PRODUCTS = 6;
export const MAX_QUERY_KEYWORDS = 4;
export const MAX_DISCOVERY_QUERIES = 6;
