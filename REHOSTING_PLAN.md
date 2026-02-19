# Migration Plan: Unified Repo for Wispa Real Estate

## Objective
Migrate both frontend and backend codebases into a single GitHub repository and use one GitHub account for all deployments to avoid permission and deployment errors.

## Steps

1. **Create a New GitHub Repository**
   - Use your main GitHub account.
   - Name the repo (e.g., wispa-real-estate-unified).

2. **Move Code into the New Repo**
   - Copy both frontend and backend folders into the new repo.
   - Organize as:
     - `/frontend` (for client code)
     - `/backend` (for server/API code)
     - Or keep your current structure if preferred.

3. **Update Deployment Settings**
   - On Render and Vercel, update the linked repository to the new unified repo.
   - Adjust build and start commands as needed for the new structure.

4. **Test Deployments**
   - Deploy to both Render and Vercel.
   - Confirm both frontend and backend work as expected.

5. **Archive Old Repos**
   - Mark previous repos as archived or private to avoid confusion.

---

*This file documents the plan to rehost and unify the Wispa Real Estate project. Follow these steps when ready to migrate.*
