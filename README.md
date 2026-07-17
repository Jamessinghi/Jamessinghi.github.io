# James Singhi — Portfolio Website

Personal portfolio website for James Singhi, presenting software engineering work, financial analysis, professional experience, and interactive market tools.

Live site: [jamessinghi.github.io](https://jamessinghi.github.io/)

## Contents

- [Overview](#overview)
- [Pages](#pages)
- [Features](#features)
- [Architecture](#architecture)
- [Repository structure](#repository-structure)
- [Local development](#local-development)
- [Data files](#data-files)
- [Background and header behavior](#background-and-header-behavior)
- [Performance and accessibility](#performance-and-accessibility)
- [Deployment](#deployment)
- [Updating the site](#updating-the-site)
- [Troubleshooting](#troubleshooting)

## Overview

The repository contains a static website that can be served directly by GitHub Pages. The generated page structure and base theme assets originate from MkDocs Material, while the portfolio styling, animated backgrounds, finance dashboards, and calculators are implemented with custom CSS and JavaScript.

No application server, database, package installation, or compilation step is required to run the deployed site.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Portfolio introduction and professional summary |
| `/projects/` | Software, finance, trading, visualization, and calculator projects |
| `/resume/` | Resume and professional experience |
| `/contact/` | Contact information and professional links |

## Features

- Responsive portfolio navigation and search
- Persistent client-side app shell with prefetched, reload-free tab navigation
- Sticky two-row header that remains visible while scrolling
- Animated stock-ticker background on the Home and Contact pages
- Animated bubble background on the Projects and Resume pages
- Trading-performance metrics, charts, filters, and trade table
- Amortisation calculator
- Stock visualization controls
- Downloadable resume and trading-log documents
- GitHub and LinkedIn links
- Reduced-motion support for animated backgrounds

## Architecture

The site uses four primary layers:

1. **Static HTML** — page content and MkDocs Material markup.
2. **Theme assets** — bundled Material stylesheets, search scripts, and search index.
3. **Custom presentation** — `stylesheets/extra.css` and `stylesheets/quant-card.css`.
4. **Interactive behavior** — scripts in `javascripts/` and JSON data in `assets/`.

`javascripts/app-shell.js` keeps the shared header and JavaScript runtime mounted while navigating between tabs. It prefetches the four page documents, replaces only the Material page container, updates browser history and the document title, and emits an `app-shell:navigate` event so page-specific components can initialize without a full reload. Direct links and browser back/forward navigation continue to work normally.

The page-aware background loader chooses an animation based on the current route:

| Page | Background |
| --- | --- |
| Home | Stock ticker canvas |
| Contact | Stock ticker canvas |
| Projects | SVG bubbles |
| Resume | SVG bubbles |

## Repository structure

```text
.
├── index.html                     # Home page
├── 404.html                       # GitHub Pages fallback
├── contact/index.html             # Contact page
├── projects/index.html            # Projects and dashboards
├── resume/index.html              # Resume page
├── assets/
│   ├── images/                    # Favicon and image assets
│   ├── javascripts/               # MkDocs Material runtime and search
│   ├── stylesheets/               # MkDocs Material theme styles
│   ├── quotes.json                # Stock quote snapshot
│   ├── summary_2025.json          # Trading dashboard summary
│   ├── trades_2025.json           # Trading dashboard records
│   └── *.pdf                      # Resume and supporting documents
├── javascripts/
│   ├── bg-loader.js               # Selects the background for each page
│   ├── app-shell.js               # Reload-free navigation and page prefetching
│   ├── bg-ticker.js               # Animated stock ticker canvas
│   ├── bg-bubbles.js              # Animated SVG bubble field
│   ├── header-skin.js             # Page-specific header appearance
│   ├── trading-dashboard.js       # Trading metrics, filters, and charts
│   ├── amortisation.js            # Amortisation calculator
│   └── stockviz.js                # Stock visualization behavior
├── stylesheets/
│   ├── extra.css                  # Navigation, page, and background styling
│   └── quant-card.css             # Project cards, dashboards, and calculators
├── search/                        # Generated search index
├── sitemap.xml                    # Search-engine sitemap
└── .nojekyll                      # Disables Jekyll processing on GitHub Pages
```

## Local development

### Requirements

- Python 3, or any equivalent static-file server
- A modern browser

### Start the site

From the repository root:

```bash
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000).

Use a local server instead of opening `index.html` directly. Several scripts fetch JSON resources, and browsers normally block those requests from `file://` pages.

### Validate JavaScript

The custom scripts are plain browser JavaScript and can be syntax-checked with Node.js:

```bash
node --check javascripts/bg-ticker.js
node --check javascripts/bg-loader.js
node --check javascripts/trading-dashboard.js
```

## Data files

### Stock quotes

`assets/quotes.json` supplies the ticker values displayed by `javascripts/bg-ticker.js`.

Supported quote formats are:

```json
{
  "AAPL": 255.78
}
```

and:

```json
{
  "AAPL": {
    "price": 255.78,
    "prev_close": 252.10
  }
}
```

An optional `updated_at_utc` value is displayed in the quote timestamp badge. The ticker uses fallback values if a quote is missing or invalid.

### Trading dashboard

- `assets/trades_2025.json` contains individual trade records.
- `assets/summary_2025.json` contains aggregate dashboard metrics and filter values.

When updating trading data, keep the field names consumed by `javascripts/trading-dashboard.js`, including `trade_id`, `ticker`, `entry_date`, `exit_date`, `pct_gain`, `days_held`, and `strategy`.

## Background and header behavior

`javascripts/bg-loader.js` loads one background implementation after checking the current path and the user's reduced-motion preference.

The ticker canvas is fixed behind the page content. Its readability cover is fully opaque beneath the main text, preventing moving pixels from changing the perceived brightness of the heading and introduction.

The header and navigation tabs use sticky positioning. The title row remains at the top of the viewport and the navigation row remains directly below it. Header artwork and background animations stay behind both rows.

## Performance and accessibility

The ticker animation includes several safeguards:

- Canvas resolution is capped at a device-pixel ratio of `1.5`.
- Rendering is limited to 30 frames per second.
- The canvas uses synchronized presentation to avoid compositor tearing.
- Expensive header backdrop filtering is disabled.
- Animation timing is reset when tab visibility changes.
- Animated backgrounds are not loaded when `prefers-reduced-motion: reduce` is active.
- Background layers ignore pointer events and do not block page interaction.

## Deployment

GitHub Pages serves the static files from the `gh-pages` branch. The `main` and `gh-pages` branches are maintained with matching file trees so the default branch accurately represents the deployed website.

Before publishing, verify:

```bash
git diff --exit-code gh-pages..main
node --check javascripts/bg-ticker.js
```

Publish both branches:

```bash
git push origin main
git push origin gh-pages
```

After pushing, GitHub Pages may take a few minutes to refresh.

## Updating the site

1. Start a local static server.
2. Make the required HTML, CSS, JavaScript, asset, or data changes.
3. Test Home, Projects, Resume, and Contact at desktop and mobile widths.
4. Confirm the sticky header remains visible during scrolling.
5. Navigate through every tab and use browser back/forward to verify app-shell routing.
6. Confirm dashboard metric labels and values remain inside their cards.
7. Test with reduced motion enabled.
8. Syntax-check modified JavaScript.
9. Apply the same final file tree to `main` and `gh-pages`.
10. Commit and push both branches.

## Troubleshooting

### The page loads without data

Confirm the site is running through HTTP and that the JSON files exist under `assets/`. Check the browser network panel for failed requests.

### The background is missing

Check whether reduced motion is enabled. Then confirm `javascripts/bg-loader.js` and the selected background script return HTTP 200 responses.

### The header scrolls away

Confirm `.md-header` and `.md-tabs` retain their sticky positioning in `stylesheets/extra.css`. Later CSS declarations must not override them with `position: relative`.

### Dashboard cards overflow

Confirm metric cards use `box-sizing: border-box` and that `.metric .m-k` remains on one line in `stylesheets/quant-card.css`.

### GitHub Pages shows an older version

Verify that the updated commit reached `origin/gh-pages`, then check the repository's Pages settings and deployment status. A hard refresh may be required after deployment completes.
