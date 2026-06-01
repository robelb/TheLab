/**
 * Design / customization tokens + content extracted from a site's markup.
 * Everything here is best-effort: fields the model can't determine are null
 * (or an empty array for list fields).
 */

/**
 * What the `logo` field actually contains:
 * - "url"      → a link to an image (svg/png/etc.), possibly relative
 * - "svg"      → raw inline <svg>...</svg> markup embedded in the page
 * - "data-uri" → a base64/utf8 data: URI (e.g. data:image/svg+xml,...)
 */
export type LogoType = "url" | "svg" | "data-uri";

/** A single link (used for nav items, CTAs, footer links). */
export interface SiteLink {
  label: string;
  /** Absolute URL after post-processing (may be relative as extracted). */
  href: string;
}

/** A social profile link. */
export interface SocialLink {
  /** e.g. "twitter", "linkedin", "instagram", "github", "youtube". */
  platform: string;
  url: string;
}

/** Contact details, if surfaced anywhere on the page. */
export interface Contact {
  email: string | null;
  phone: string | null;
  address: string | null;
}

/**
 * Semantic color roles for theming a rebuilt UI. These complement the headline
 * primary/secondary colors with the day-to-day surface/text/state colors.
 * All values are hex strings.
 */
export interface ColorPalette {
  /** Page background. */
  background: string | null;
  /** Card/panel surface background. */
  surface: string | null;
  /** Default body text color. */
  text: string | null;
  /** Muted/secondary text color. */
  textMuted: string | null;
  /** Accent/highlight color (often == primary). */
  accent: string | null;
  /** Default border/divider color. */
  border: string | null;
  /** Hyperlink color. */
  link: string | null;
  success: string | null;
  warning: string | null;
  error: string | null;
}

/** Typography system split into heading vs body and the usual metrics. */
export interface Typography {
  /** Font family used for headings, e.g. "Circular". */
  headingFont: string | null;
  /** Font family used for body copy. */
  bodyFont: string | null;
  /** Base body font size, e.g. "16px". */
  baseFontSize: string | null;
  /** Typical heading weight, e.g. "700". */
  headingWeight: string | null;
  /** Typical body weight, e.g. "400". */
  bodyWeight: string | null;
  /** Base line-height, e.g. "1.5". */
  lineHeight: string | null;
  /** Notable letter-spacing/tracking, if any. */
  letterSpacing: string | null;
}

export interface Customization {
  /** Dominant corner radius, e.g. "8px", "0.5rem". */
  borderRadius: string | null;
  /** Corner radius used specifically for buttons. */
  buttonRadius: string | null;
  /** Base spacing/gap unit used across the UI, e.g. "16px". */
  spacing: string | null;
  /** Max content container width, e.g. "1280px". */
  containerMaxWidth: string | null;
  /** Description of the primary button style (fill, radius, shadow, etc.). */
  buttonStyle: string | null;
  /** Icon style: "outline" | "filled" | "duotone" or a short description. */
  iconStyle: string | null;
  /** "light" | "dark" | "auto" or a short description. */
  theme: string | null;
  /** Notable box-shadow / elevation style, if any. */
  shadows: string | null;
  /** Any other customization details worth noting, free-form. */
  notes: string | null;
}

export interface BrandData {
  companyName: string | null;
  /** Short slogan/tagline, e.g. "Belong anywhere". */
  tagline: string | null;
  description: string | null;
  /** Industry / category, e.g. "Travel & hospitality". */
  industry: string | null;

  /**
   * The main logo. Depending on `logoType` this is either a URL (absolute
   * after post-processing), raw inline SVG markup, or a data URI.
   */
  logo: string | null;
  /** Tells you how to interpret `logo`. Null when no logo was found. */
  logoType: LogoType | null;
  /** Alternate logo URL meant for dark backgrounds, if a distinct one exists. */
  logoDark: string | null;
  /** Absolute URL to the favicon. */
  favicon: string | null;
  /** Absolute URL to the og:image / hero / social-share image. */
  ogImage: string | null;

  /** Primary brand color as a hex string, e.g. "#FF5A5F". */
  primaryColor: string | null;
  /** Secondary brand color as a hex string. */
  secondaryColor: string | null;
  /** Any other meaningful colors found (hex strings). */
  otherColors: string[];
  /** Semantic color roles for theming. */
  colors: ColorPalette;

  /** Font families used, most prominent first. */
  fonts: string[];
  /** Structured typography system. */
  typography: Typography;

  customization: Customization;

  /** Primary navigation links. */
  navLinks: SiteLink[];
  /** Call-to-action buttons/links, e.g. "Sign up", "Get started". */
  ctas: SiteLink[];
  /** Social profile links. */
  socialLinks: SocialLink[];
  /** Contact details. */
  contact: Contact;
  /** Footer/copyright text, e.g. "© 2026 Airbnb, Inc.". */
  footerText: string | null;

  /** SEO keywords from meta tags. */
  keywords: string[];
  /** <meta name="theme-color"> value as hex. */
  themeColor: string | null;
  /** Document language, e.g. "en". */
  language: string | null;
}

/** Full result, including the source URL the data was extracted from. */
export interface ExtractionResult extends BrandData {
  sourceUrl: string;
}
