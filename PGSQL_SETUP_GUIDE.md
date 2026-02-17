## Project Database Connection Details

**Hostname:** dpg-d6acunfgi27c73d1sgsg-a
**Port:** 5432
**Database:** wispa
**Username:** wispa
**Password:** vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr

**Internal Database URL:**
postgresql://wispa:vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr@dpg-d6acunfgi27c73d1sgsg-a/wispa

**External Database URL:**
postgresql://wispa:vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr@dpg-d6acunfgi27c73d1sgsg-a.oregon-postgres.render.com/wispa

**PSQL Command:**
PGPASSWORD=vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr psql -h dpg-d6acunfgi27c73d1sgsg-a.oregon-postgres.render.com -U wispa wispa

# PostgreSQL Database Setup & Deployment Guide

This guide provides steps and key data for creating and deploying a real PostgreSQL (pgsql) database for your project.

---

## 1. Choose a Managed PostgreSQL Provider
- Recommended: Render, Supabase, Neon, Railway, or AWS RDS.

## 2. Create a New PostgreSQL Database
- Sign up or log in to your chosen provider.
- Create a new PostgreSQL database instance.
- Note the following details:
  - **Host**
  - **Port** (default: 5432)
  - **Database Name**
  - **Username**
  - **Password**
  - **Connection String** (usually provided by the service)

## 3. Configure Your Backend
- Add the connection string as an environment variable in your backend deployment platform (e.g., Render Web Service, Vercel Serverless Functions, etc.).
- Example environment variable name: `DATABASE_URL`

## 4. Update Backend Code to Connect to PostgreSQL
- Use a PostgreSQL client library (e.g., `pg` for Node.js, `psycopg2` for Python).
- Example (Node.js):

```js
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});
client.connect();
```

## 5. Deploy Backend
- Push your backend code to your repository.
- Deploy to your backend platform (e.g., Render).
- Ensure the environment variable is set with the correct connection string.

## 6. Run Migrations/Seed Data
- Use migration tools (e.g., Prisma, Sequelize, Knex, or SQL scripts) to set up your database schema and initial data.

## 7. Test the Connection
- Verify your backend can connect to the database and perform CRUD operations.

---

**Security Tips:**
- Never expose your database credentials in frontend code.
- Use environment variables for all sensitive data.
- Restrict database access to only your backend server if possible.

---

For more details, refer to your provider’s documentation or ask for code samples for your backend language.
