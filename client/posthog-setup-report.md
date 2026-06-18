# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the TheLab React frontend. PostHog is initialized in `src/main.tsx` using `posthog-js` with `PostHogProvider` and `PostHogErrorBoundary` wrapping the entire app. User identity is established via `posthog.identify()` when a brand domain is successfully extracted — the domain itself is used as the distinct ID, which is stable and human-readable. The session is reset on logout. Automatic error capture is active via the `PostHogErrorBoundary` component at the app root.

| Event name | Description | File |
|---|---|---|
| `brand extracted` | User successfully extracted brand identity from a custom company domain | `src/context/AuthContext.tsx` |
| `brand extraction failed` | Brand extraction from a company domain failed with an error | `src/context/AuthContext.tsx` |
| `default shop opened` | User opened the shop using the default BLT demo brand | `src/context/AuthContext.tsx` |
| `logged out` | User logged out and cleared the current shop session | `src/context/AuthContext.tsx` |
| `product added to cart` | User added a product to their shopping cart | `src/components/AddToCartButton.tsx` |
| `checkout completed` | User submitted the checkout form and placed an order | `src/pages/CheckoutPage.tsx` |
| `campaign generated` | User triggered AI generation of a new marketing campaign | `src/pages/dashboard/CampaignsPage.tsx` |
| `campaign created` | User manually created a new marketing campaign | `src/pages/dashboard/CampaignsPage.tsx` |
| `product photoshoot generated` | User generated an AI product photoshoot image in the dashboard | `src/components/dashboard/PhotoshootPanel.tsx` |
| `photoshoot image added to product` | User added a generated photoshoot image to a product's gallery | `src/components/dashboard/PhotoshootPanel.tsx` |

## Next steps

We've built a dashboard and five insights for you to keep an eye on user behavior:

- **Dashboard**: [Analytics basics (wizard)](https://eu.posthog.com/project/204810/dashboard/757584)
- **Checkout conversion funnel**: [lXdqaxAv](https://eu.posthog.com/project/204810/insights/lXdqaxAv) — brand extracted → product added to cart → checkout completed
- **Brand extractions over time**: [TL0l28q7](https://eu.posthog.com/project/204810/insights/TL0l28q7) — daily unique users extracting brands vs extraction failures
- **AI feature usage**: [bjMg0cfQ](https://eu.posthog.com/project/204810/insights/bjMg0cfQ) — campaigns generated and photoshoots generated per day
- **Cart-to-checkout conversion**: [O8dpXKG7](https://eu.posthog.com/project/204810/insights/O8dpXKG7) — daily users adding to cart vs completing checkout
- **New unique brands per day**: [uegbtj68](https://eu.posthog.com/project/204810/insights/uegbtj68) — first-time brand extractions (acquisition signal)

## Verify before merging

- [ ] Run a full production build (`pnpm build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` to `.env.example` (and any monorepo/bootstrap scripts) so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify in PostHog Error Tracking.
- [ ] Confirm the returning-visitor path also calls `identify` — currently `identify` is only called on fresh brand extraction, so returning users who load a saved session will be on anonymous distinct IDs until they extract a brand again.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
