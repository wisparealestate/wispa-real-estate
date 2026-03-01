# Wispa Real Estate

A modern, user-friendly real estate platform for global property transactions, designed to help buyers and sellers everywhere. Built with HTML, CSS, and JavaScript for a responsive, interactive experience.

## Features

### Core Functionality
- **Property Listings**: Browse sale and rental properties with detailed information (price, bedrooms, area, location).
- **Advanced Search & Filters**: Search by keyword, filter by price, bedrooms, location, and sort by date/price.
- **Favorites**: Like/unlike properties, view favorites in a dedicated tab.
- **Post Properties**: Users can post new property listings via a modal form.
- **Chat System**: Built-in chat for discussing payments and documentation, with message history.

### Pages
- **Home** (`index.html`): Main listings page with search, filters, and property grid.
- **About** (`about.html`): Company information and statistics.
- **Services** (`services.html`): Detailed service offerings.
- **Contact** (`contact.html`): Contact form, info, and map.
- **FAQ** (`faq.html`): Frequently asked questions.
- **Blog** (`blog.html`): Real estate insights and market trends.
- **Agents** (`agents.html`): Meet the team with profiles and contact details.
- **Terms of Service** (`terms.html`): Legal terms and conditions.
- **Mortgage Calculator** (`calculator.html`): Estimate monthly payments and total costs.
- **Property Valuation** (`valuation.html`): Get instant property value estimates.
- **404 Error** (`404.html`): Custom error page for missing content.

### User Experience
- **Responsive Design**: Optimized for desktop, tablet, and mobile.
- **Modern UI**: Clean, card-based layout with animations and hover effects.
- **Newsletter Signup**: Subscribe for updates in the footer.
- **Back-to-Top Button**: Easy navigation on long pages.
- **SEO Ready**: Includes sitemap.xml and robots.txt for search engines.

## Technologies Used
- **HTML5**: Semantic structure and accessibility.
- **CSS3**: Responsive grid, flexbox, animations, and modern styling.
- **JavaScript (ES6+)**: Dynamic content, form handling, local storage for persistence.

## Getting Started

1. **Clone the Repository**:
   ```
   git clone https://github.com/yourusername/wispa-real-estate.git
   cd wispa-real-estate
   ```

2. **Open in Browser**:
   - Open `src/index.html` in your web browser.
   - Alternatively, use a local server for better performance:
     ```
     python -m http.server 8000
     ```
     Then visit `http://localhost:8000/src/`.

3. **Explore Features**:
   - Browse properties and use filters.
   - Post a new property via the "Post Ad" button.
   - Like properties and view in Favorites.
   - Use the chat for inquiries.

   ## Migration: client storage -> DB-backed

   - Purpose: Remove reliance on `localStorage` and persist client-side data to the server DB.
   - Implementation: a lightweight KV API (`GET /api/storage/all`, `POST /api/storage`) was added to `api/index.js` and a client shim (`src/storage-sync.js`) proxies existing `localStorage` calls to the server-backed store. The shim is loaded from `src/script.js`.
   - Rollback: If your DB is unreachable, the server falls back to a file-backed store `data/kv_store.json`. To rollback to purely local behavior, remove the `src/storage-sync.js` include in `src/script.js` and restore any deleted `data/*.json` files from backups.


## Project Structure
```
wispa-real-estate/
├── src/
│   ├── index.html          # Home page with listings
│   ├── about.html          # About page
│   ├── services.html       # Services page
│   ├── contact.html        # Contact page
│   ├── faq.html            # FAQ page
│   ├── blog.html           # Blog page
│   ├── agents.html         # Agents page
│   ├── calculator.html     # Mortgage calculator
│   ├── valuation.html      # Property valuation
│   ├── terms.html          # Terms of Service
│   ├── privacy.html        # Privacy Policy
│   ├── 404.html            # Error page
│   ├── styles.css          # Main stylesheet
│   └── script.js           # JavaScript functionality
├── sitemap.xml             # SEO sitemap
├── robots.txt              # Search engine instructions
├── README.md               # This file
└── .github/                # GitHub configurations
```

## Deployment

### GitHub Pages
1. Push to a GitHub repository.
2. Go to Settings > Pages.
3. Set source to "main" branch and "/src" folder.
4. Access at `https://yourusername.github.io/repo-name/`.

### Other Hosting
- Upload files to any web host (e.g., Netlify, Vercel, AWS S3).
- Ensure all files are in the root or adjust paths accordingly.

## Contributing
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature-name`.
3. Commit changes: `git commit -m 'Add feature'`.
4. Push to branch: `git push origin feature-name`.
5. Open a pull request.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact
For questions or support, visit the [Contact Page](src/contact.html) or email info@wisparealestate.com.
