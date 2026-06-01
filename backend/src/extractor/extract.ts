import { GoogleGenAI, Type } from "@google/genai";
import { normalizeBrandColors } from "./normalizeColors.js";
import type { BrandData } from "./types.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

/**
 * JSON schema handed to Gemini so the response is guaranteed to match
 * the BrandData shape (no markdown, no prose, just JSON).
 */
const nullableString = { type: Type.STRING, nullable: true };

const siteLinkSchema = {
  type: Type.OBJECT,
  properties: {
    label: { type: Type.STRING },
    href: { type: Type.STRING },
  },
  required: ["label", "href"],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    companyName: nullableString,
    tagline: { ...nullableString, description: "Short slogan/tagline." },
    description: nullableString,
    industry: {
      ...nullableString,
      description: "Industry / category, e.g. 'Travel & hospitality'.",
    },

    logo: {
      type: Type.STRING,
      nullable: true,
      description:
        "The main logo. Either a URL (may be relative), the full raw inline " +
        "<svg>...</svg> markup, or a data: URI — whichever the page uses.",
    },
    logoType: {
      type: Type.STRING,
      nullable: true,
      enum: ["url", "svg", "data-uri"],
      description:
        "How to interpret `logo`: 'url' for a link, 'svg' for inline SVG " +
        "markup, 'data-uri' for a data: URI. Null if no logo.",
    },
    logoDark: {
      ...nullableString,
      description:
        "URL of an alternate logo meant for dark backgrounds, if a distinct " +
        "one exists. URL only.",
    },
    favicon: {
      ...nullableString,
      description: "URL of the favicon (may be relative).",
    },
    ogImage: {
      ...nullableString,
      description: "URL of the og:image / hero / social-share image.",
    },

    primaryColor: {
      ...nullableString,
      description:
        "Main brand ACCENT (CTA buttons, key highlights, logo accent) — usually saturated. NOT the page background.",
    },
    secondaryColor: {
      ...nullableString,
      description:
        "Main page CANVAS / background color (html, body, app shell). Must match colors.background. Often #FFFFFF or a near-black for dark sites — NOT the CTA accent.",
    },
    otherColors: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Other meaningful colors as hex strings.",
    },
    colors: {
      type: Type.OBJECT,
      description: "Semantic color roles for theming (hex strings).",
      properties: {
        background: {
          ...nullableString,
          description:
            "Dominant page canvas behind content: html/body/#root/main wrapper background-color. Same as secondaryColor.",
        },
        surface: {
          ...nullableString,
          description:
            "Cards, panels, modals — slightly different from background if visible; else same as background.",
        },
        text: nullableString,
        textMuted: nullableString,
        accent: nullableString,
        border: nullableString,
        link: nullableString,
        success: nullableString,
        warning: nullableString,
        error: nullableString,
      },
      required: [
        "background",
        "surface",
        "text",
        "textMuted",
        "accent",
        "border",
        "link",
        "success",
        "warning",
        "error",
      ],
    },

    fonts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Font families, most prominent first.",
    },
    typography: {
      type: Type.OBJECT,
      properties: {
        headingFont: nullableString,
        bodyFont: nullableString,
        baseFontSize: nullableString,
        headingWeight: nullableString,
        bodyWeight: nullableString,
        lineHeight: nullableString,
        letterSpacing: nullableString,
      },
      required: [
        "headingFont",
        "bodyFont",
        "baseFontSize",
        "headingWeight",
        "bodyWeight",
        "lineHeight",
        "letterSpacing",
      ],
    },

    customization: {
      type: Type.OBJECT,
      properties: {
        borderRadius: nullableString,
        buttonRadius: nullableString,
        spacing: nullableString,
        containerMaxWidth: nullableString,
        buttonStyle: nullableString,
        iconStyle: nullableString,
        theme: nullableString,
        shadows: nullableString,
        notes: nullableString,
      },
      required: [
        "borderRadius",
        "buttonRadius",
        "spacing",
        "containerMaxWidth",
        "buttonStyle",
        "iconStyle",
        "theme",
        "shadows",
        "notes",
      ],
    },

    navLinks: {
      type: Type.ARRAY,
      items: siteLinkSchema,
      description: "Primary navigation links (label + href).",
    },
    ctas: {
      type: Type.ARRAY,
      items: siteLinkSchema,
      description: "Call-to-action buttons/links, e.g. 'Sign up'.",
    },
    socialLinks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          url: { type: Type.STRING },
        },
        required: ["platform", "url"],
      },
      description: "Social profile links (platform + url).",
    },
    contact: {
      type: Type.OBJECT,
      properties: {
        email: nullableString,
        phone: nullableString,
        address: nullableString,
      },
      required: ["email", "phone", "address"],
    },
    footerText: {
      ...nullableString,
      description: "Footer/copyright text.",
    },

    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "SEO keywords from meta tags.",
    },
    themeColor: {
      ...nullableString,
      description: "<meta name='theme-color'> value as hex.",
    },
    language: {
      ...nullableString,
      description: "Document language, e.g. 'en'.",
    },
  },
  required: [
    "companyName",
    "tagline",
    "description",
    "industry",
    "logo",
    "logoType",
    "logoDark",
    "favicon",
    "ogImage",
    "primaryColor",
    "secondaryColor",
    "otherColors",
    "colors",
    "fonts",
    "typography",
    "customization",
    "navLinks",
    "ctas",
    "socialLinks",
    "contact",
    "footerText",
    "keywords",
    "themeColor",
    "language",
  ],
};

const SYSTEM_INSTRUCTION = `You are a brand and design-system analyst.
You receive the raw HTML (including <head>, meta tags, <style>, and <link> tags) of a website.
Extract the brand identity and visual design tokens.

Rules:
- Infer colors from inline styles, CSS variables (e.g. --primary, --brand), theme-color meta tags, and prominent elements. Always return colors as hex strings (convert rgb/hsl to hex).
- For the logo, look in the header/nav/top of the page first. A logo can appear in several forms — handle each and set logoType accordingly:
    * <img src="..."> (including .svg/.png/.webp) or <image href="..."> → return the src/href, logoType "url".
    * Inline <svg>...</svg> markup (often the logo itself) → return the COMPLETE <svg> element verbatim, logoType "svg".
    * <use href="#..."> / <symbol> sprite references or icon fonts → return the referenced URL/fragment as "url" if resolvable.
    * CSS background-image: url(...) on a logo/brand element → return that URL, logoType "url".
    * A data: URI (e.g. data:image/svg+xml;base64,... or data:image/png;base64,...) → return it as-is, logoType "data-uri".
    * Prefer an element whose src/href/alt/class/id contains "logo" or the brand/company name; fall back to og:image (logoType "url") only if nothing better exists.
  Choose the single most representative primary logo. Do not fabricate a URL or SVG that is not present in the HTML.
- For logoDark, only fill it if there is a SEPARATE logo asset clearly intended for dark backgrounds (class/name like "logo-white", "logo-dark", a <picture> source for dark mode). Otherwise null.
- For favicon, use <link rel="icon"/"shortcut icon"/"apple-touch-icon"> href.
- For ogImage, use <meta property="og:image"> or twitter:image content.

COLOR ROLES (critical — do not swap canvas and accent):
- primaryColor = brand ACCENT only (primary buttons, links, highlights). Examples: Airbnb #FF385C, Spotify green. High saturation is common.
- secondaryColor = page CANVAS / shell background — the color behind most of the page. MUST equal colors.background.
  * Light sites: usually #FFFFFF, #FAFAFA, #F7F7F7, cream, or very light gray from body { background }.
  * Dark sites: usually #000000, #121212, #0B0B0B from body or main wrapper.
  * Read from, in order: html/body background-color, #__next / #root / main / [data-theme] wrapper, CSS vars (--background, --bg, --color-background, --surface-canvas, --page-background), then <meta name="theme-color"> only if it matches the visible canvas (not always).
  * Do NOT put button/CTA/link accent colors in secondaryColor or colors.background.
- colors.background = same hex as secondaryColor (the visible page canvas).
- colors.surface = card/section backgrounds if distinct; otherwise duplicate background.
- colors.text = default body text on that canvas (high contrast).
- colors.textMuted = secondary/muted text and borders.
- colors.accent = usually same as primaryColor.
- colors.link = default hyperlink color.
- otherColors = extra palette swatches NOT already used as primary, secondary, background, text, or accent.
- Always convert to hex. Prefer computed CSS variable values when present in <style> or inline style attributes.
- TYPOGRAPHY: split fonts into headingFont (used by h1-h3) and bodyFont (body/paragraph). Read font-family, font-weight, font-size, line-height, letter-spacing from CSS and Google Fonts <link> hrefs.
- CUSTOMIZATION: infer borderRadius, buttonRadius, spacing, containerMaxWidth (max-width of main container), buttonStyle, iconStyle, theme, shadows from CSS variables or repeated declarations.
- navLinks: extract the main header/nav <a> elements (label text + href). Skip duplicates and non-navigational links.
- ctas: prominent action buttons/links such as "Sign up", "Get started", "Book now" (label + href).
- socialLinks: <a> links to social platforms (twitter/x, linkedin, facebook, instagram, youtube, github, tiktok); set platform to a lowercase name and url to the href.
- contact: email (mailto:), phone (tel:), and any physical address found (often in the footer).
- footerText: the copyright/footer line, e.g. "© 2026 Company, Inc.".
- keywords: from <meta name="keywords">; language from <html lang>; themeColor from <meta name="theme-color">.
- Return URLs exactly as they appear in the HTML (relative or absolute); do not invent them.
- If something cannot be determined, return null (or an empty array for list fields). Never guess wildly.`;

export async function extractBrandData(
  html: string,
  pageUrl: string,
  apiKey: string,
  model: string = DEFAULT_MODEL
): Promise<BrandData> {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Source URL: ${pageUrl}\n\nHTML:\n${html}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsed: BrandData;
  try {
    parsed = JSON.parse(text) as BrandData;
  } catch (err) {
    throw new Error(
      `Failed to parse Gemini JSON response: ${(err as Error).message}\nRaw: ${text.slice(
        0,
        500
      )}`
    );
  }

  // Defensive defaults in case the model omits array/object fields.
  parsed.otherColors ??= [];
  parsed.fonts ??= [];
  parsed.navLinks ??= [];
  parsed.ctas ??= [];
  parsed.socialLinks ??= [];
  parsed.keywords ??= [];
  return normalizeBrandColors(parsed);
}
