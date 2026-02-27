Admin Panel Fixes — Journey Log

Date: 2026-02-28

Overview:
This document tracks the requested admin-panel fixes, their intended actions, and current status. One item has been marked as "Confirmed Fixed" per your note.

1) Notifications page
- Actions:
  I. Pin selected filter control so selection remains fixed.
  II. Messages filter should include only: (a) Property Request (from user side), (b) Any Contact Us message.
  III. Alerts filter should include only: Property post alert, Property likes alert, Edit and Delete alerts.
  IV. Activity filter should include only: (a) Alerts sent by admin to users, (b) System detections of harmful/attacker activity.
- Status: not-started

2) Admin Chat page
- Actions:
  I. Each chat row shows: small profile icon (user avatar if uploaded), user name, and at right end the tagged property title and id.
  II. Make refresh button look better and bigger.
- Status: Completed — Confirmed fixed by user.

3) Admin Conversation page
- Actions:
  I. Top-left "property-(ID)" should also display the tagged property image.
  II. Admin/user profile picture and name always shown with messages.
  III. Prevent the text box from jumping (stabilize input area).
  IV. Add file and emoji selector inside text box at right end before send button.
- Status: not-started

4) Admin Hamburger Navs
- Actions:
  I. Add small icons before each nav label.
  II. Admin small profile icon should display uploaded admin photo.
- Status: not-started

5) Admin Properties page
- Actions:
  I. Add a nav/link to the create-post page from properties list.
  II. Add per-property admin actions: edit, view doc (generated), delete, etc.
- Status: not-started

6) Admin User page
- Actions:
  I. Show location and phone number fields with user data.
  II. Add admin actions: restrict, deactivate, etc.
- Status: not-started

7) Debug
- Actions:
  I. Debug control should run checks across user and admin sides and summarize errors in understandable messages; if no errors, indicate system healthy.
  II. Make debug output presentable and well-displayed.
- Status: not-started

8) Settings
- Actions:
  I. Settings page should include toggles and options such as: allow users to view localStorage contents (Yes/No), allow users to view all posts (Yes/No), plus additional admin-defined settings.
- Status: not-started

9) Privacy
- Actions:
  I. Add privacy entries and controls that match this project's requirements.
- Status: not-started

10) Log out
- Actions:
  I. Redesign logout flow and UI professionally and add backup/login persistence to allow quick re-login.
- Status: not-started

Notes:
- Marked fixed: Item 2 "Admin Chat UI tweaks" — refresh button and UI improvements confirmed by user.

Next steps (suggested):
- I can start implementing the highest-priority item — specify which you'd like first.
- Or I can open PRs and create UI mockups for one selected page.

File created by GitHub Copilot assistant.