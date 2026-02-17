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
- Push your frontend code to GitHub/GitLab/Bitbucket.
- In Vercel, import your repository as a new project.
- Select the correct framework preset (e.g., Vue.js, React, etc.).
- Set environment variables (e.g., `API_URL` pointing to your Render backend endpoint).
- Configure build and output directories as needed.
- Deploy the frontend and verify the site is live.

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