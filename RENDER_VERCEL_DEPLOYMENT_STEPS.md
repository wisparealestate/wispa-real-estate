## Render Web Service Configuration

**Service Name:** wispa-real-estate
**Region:** Oregon (US West)
**Instance Type:** Free (0.1 CPU, 512 MB RAM)
**Repository:** https://github.com/vizikolyte8-prog/WISPA
**Branch:** main
**Root Directory:** (leave blank unless your backend is in a subfolder)
**Dockerfile Path:** (leave blank or set if using Docker; otherwise, use Web Service auto-detect)
**Auto-Deploy:** On Commit
**Render Subdomain:** https://wispa-real-estate.onrender.com

**Environment Variables:**
  - Key: `DATABASE_URL`
  - Value: `postgresql://wispa:vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr@dpg-d6acunfgi27c73d1sgsg-a.oregon-postgres.render.com/wispa`

**Health Check Path:** (optional, e.g., `/health` if your backend exposes a health endpoint)

**Notes:**
- If you are not using Docker, select "Web Service" and let Render auto-detect build settings.
- If your backend is in a subfolder, set the Root Directory accordingly.
- For static content, use Render Static Site or Vercel.

# Full Deployment Steps: Render + PostgreSQL + Vercel

This guide outlines the complete steps to deploy your project using Render (backend & database), PostgreSQL, and Vercel (frontend) until your application is live.

---

## 1. Set Up PostgreSQL Database on Render
- Sign in to Render and create a new PostgreSQL database.
- Note the following details:
  - Hostname
  - Port (5432)
  - Database name
  - Username
  - Password
  - Internal/External Database URL
- Example connection string:
  `postgresql://username:password@hostname:5432/databasename`

## 2. Deploy Backend to Render
> **Note:** The default branch on GitHub is typically `main` (not `master`). Ensure you select the correct branch when connecting your repository in Render or Vercel.

Set environment variables (e.g., `DATABASE_URL` with your PostgreSQL connection string).

   Example values for your Render PostgreSQL database:
   - Hostname: dpg-d6acunfgi27c73d1sgsg-a
   - Port: 5432
   - Database: wispa
   - Username: wispa
   - Password: vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr
   - Internal Database URL: postgresql://wispa:vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr@dpg-d6acunfgi27c73d1sgsg-a/wispa
   - External Database URL: postgresql://wispa:vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr@dpg-d6acunfgi27c73d1sgsg-a.oregon-postgres.render.com/wispa

   Set the environment variable in Render as:
   - Key: `DATABASE_URL`
   - Value: `postgresql://wispa:vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr@dpg-d6acunfgi27c73d1sgsg-a.oregon-postgres.render.com/wispa`

   You can also connect using the following psql command:
   - `PGPASSWORD=vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr psql -h dpg-d6acunfgi27c73d1sgsg-a.oregon-postgres.render.com -U wispa wispa`
- Deploy the backend and ensure it connects to the database.
## 3. Deploy Frontend to Vercel
  To set environment variables in Vercel:
  1. Go to your project dashboard on Vercel.
  2. Click on "Settings" > "Environment Variables".
  3. Add a new variable:
     - Key: `API_URL`
     - Value: The URL of your Render backend (e.g., `https://your-backend.onrender.com`)
  4. Save the variable and redeploy your project if needed.
  Your frontend code can now access the API URL using `process.env.API_URL` (for frameworks like Next.js, Vue.js, etc.).

## 4. Connect Frontend and Backend
- Ensure frontend API calls use the correct backend URL (hosted on Render).
- Update environment variables in Vercel if needed and redeploy.

## 5. Final Testing
- Visit your frontend site (Vercel URL) and test all features.
- Confirm backend API and database operations work as expected.

## 6. Go Live
- Share your Vercel frontend URL as your main site destination.
- Monitor logs and analytics on both Vercel and Render dashboards.

---

**Security Tips:**
- Never expose database credentials in frontend code.
- Use environment variables for all sensitive data.
- Restrict database access to only your backend server if possible.

---

For more details or code samples, refer to the official documentation for Render, Vercel, and your backend framework.