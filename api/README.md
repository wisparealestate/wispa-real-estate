# Wispa Real Estate Backend (Vercel)

This is a simple Node.js/Express backend for Wispa Real Estate, ready to deploy on Vercel as a serverless API.

## Features
- Express server with a root endpoint (`/`)
- `/db-test` endpoint to test PostgreSQL connection
- Uses environment variable `DATABASE_URL` for PostgreSQL connection

## Setup & Deployment

1. Place this `api/` folder in your project root.
2. Add your PostgreSQL connection string as `DATABASE_URL` in Vercel project settings (Environment Variables).
3. Deploy your project to Vercel. Vercel will auto-detect the `api/` folder as serverless functions.
4. Access your backend endpoints at `/api/` (e.g., `/api/db-test`).

## Example Endpoints
- `/api/` — Health check
- `/api/db-test` — Returns current time from PostgreSQL

## Dependencies
- express
- pg

---

For more advanced backend features, expand the Express app in `api/index.js`.
