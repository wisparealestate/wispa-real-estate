## Project Data Overview

**Frontend:**
- Technology: HTML, CSS, JavaScript (static site)
- Location: All frontend files are in the `src/` directory (e.g., index.html, styles.css, script.js)
- Deployment: Vercel (connect to your GitHub repo and deploy the `src/` folder as the root)

**Backend:**
- Technology: (To be implemented; recommend Node.js/Express, Python/Flask, or similar)
- Location: (Backend code not present yet; create a new folder, e.g., `api/` or `backend/`)
- Deployment: Render (deploy as a web service)
- API: Should handle authentication, property listings, user management, chat, etc.

**Database:**
- Type: PostgreSQL (managed by Render)
- Usage: Store user accounts, property listings, messages, activity logs, etc.
- Connection: Backend connects to PostgreSQL using the connection string from Render

**Integration:**
- Frontend communicates with backend API endpoints (hosted on Render) for dynamic features (login, chat, property management, etc.)
- Backend handles all database operations and business logic


# Hosting & Deployment Guide: Vercel + Render + PostgreSQL
## Steps to Destination

Follow these steps to deploy your project to production:

1. **Frontend Deployment (Vercel):**
	- Push your frontend code to your GitHub/GitLab/Bitbucket repository.
	- Sign in to Vercel and import your repository.
	- Configure build settings if needed (Vercel auto-detects most frameworks).
	- Set environment variables (e.g., API URLs) in Vercel dashboard.
	- Deploy and verify your frontend site is live.

2. **Backend Deployment (Render):**
	- Push your backend code to your repository.
	- Sign in to Render and create a new Web Service.
	- Connect your repository and select the backend project.
	- Set environment variables (e.g., database connection string) in Render dashboard.
	- Deploy and verify your backend API is live.

3. **Database Setup (Render PostgreSQL):**
	- In Render, create a new PostgreSQL database.
	- Copy the database connection string.
	- Add the connection string as an environment variable in your backend service on Render.
	- Run migrations or seed your database as needed.

4. **Connect Frontend to Backend:**
	- Update your frontend environment variables to point to your backend API URL (hosted on Render).
	- Redeploy frontend if changes were made.

5. **Test Everything:**
	- Visit your frontend site and test all features.
	- Ensure backend API and database connections work as expected.

6. **Go Live:**
	- Share your Vercel frontend URL as your main site destination.
	- Monitor logs and analytics on both Vercel and Render dashboards.


## 1. Frontend (Vercel)
- Deploy your frontend (static site, React, Next.js, etc.) to Vercel.
- Connect your GitHub/GitLab/Bitbucket repo to Vercel for automatic deployments.
- Set environment variables in Vercel for API URLs.

## 2. Backend & Database (Render)
- Deploy your backend server (Node.js, Python, etc.) to Render as a web service.
- Create a managed PostgreSQL database on Render.
- Set environment variables in Render for database connection strings.

## 3. Connecting Everything
- Backend connects to PostgreSQL using the connection string provided by Render.
- Frontend (on Vercel) communicates with backend API (on Render) via HTTPS endpoints.
- Use environment variables to keep credentials and URLs secure.

## 4. Typical Workflow
- Push code to your repository.
- Vercel and Render automatically build and deploy your frontend and backend.
- Database is managed and backed up by Render.

## 5. Security
- Never expose database credentials in frontend code.
- Use HTTPS for all API communication.

---

## Helpful Environment Variables

Set these environment variables in your Render (backend) and Vercel (frontend) dashboards as appropriate.

- `API_HOST` (Render - backend): canonical public URL of your API. Example:

	API_HOST=https://wispa-real-estate-2ew3.onrender.com

	Purpose: When set, the backend will use this value to build absolute URLs for uploaded files (images, documents). This prevents mixed-content issues when your frontend is served over HTTPS.

- `SESSION_SECRET` (Render - backend): a long, random secret for signing session tokens. Example:

	SESSION_SECRET=change_this_to_a_secure_random_value

	Purpose: Securely sign stateless session tokens.

Notes:
- After setting `API_HOST`, redeploy your backend so new upload responses return HTTPS URLs.
- If your hosting provider exposes traffic via a proxy (e.g. Render), ensure `trust proxy` is enabled in Express so `req.protocol` reflects `https`.

Persistent uploads:
- Many PAAS platforms use ephemeral filesystem for app instances. For durable uploads across deploys/restarts, configure one of:
	- S3 / DigitalOcean Spaces / GCS for object storage (recommended)
	- A persistent disk attached to your backend (platform-dependent)

If you'd like, I can add S3 upload support to the backend and provide the required env var examples.
For more details or code samples, ask your developer or refer to the official documentation for Vercel and Render.