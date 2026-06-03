import { Type } from "@google/genai";

const nullableString = { type: Type.STRING, nullable: true };

const siteLinkSchema = {
  type: Type.OBJECT,
  properties: {
    label: { type: Type.STRING },
    href: { type: Type.STRING },
  },
  required: ["label", "href"],
};

/** JSON schema for Gemini structured output (matches BrandData). */
export const geminiResponseSchema = {
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
