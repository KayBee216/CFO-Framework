# Queens of AI Summit — Session Guide

A professional, interactive session guide designed for the Queens of AI Summit (May 1-2, 2026). This application helps business owners track **Clarity, Foundation, and Outcomes (CFO)** for every session they attend.

## 🚀 Features

- **Personal Strategy Tracker:** Secure authentication with Google to save your personal reflections and takeaways.
- **CFO Framework:** Built-in guidance to help you filter every session through a "CFO" (Clarity, Foundation, Outcome) lens.
- **Progress Tracking:** Interactive progress bar and session navigation showing which sessions you've completed.
- **Exportable Guide:** One-click "Copy Guide" feature to get a beautifully formatted summary of all your summit notes.
- **Real-time Persistence:** Powered by Firebase Firestore, ensuring your notes are saved as you type.

## 🛠️ Technology Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Motion (for animations)
- **Icons:** Lucide React
- **Database & Auth:** Firebase Firestore & Google Authentication
- **Build Tool:** Vite

## 📂 Project Structure

- `src/App.tsx`: Main application logic and UI.
- `src/lib/firebase.ts`: Firebase initialization and auth helpers.
- `src/constants.ts`: Complete list of summit sessions and business areas.
- `firestore.rules`: Security rules protecting user data.
- `firebase-blueprint.json`: Data schema for the Firestore database.

## 🌐 Database

Your session data is stored securely in **Google Cloud Firestore**. You can view your managed data at:
[Firebase Console - Firestore Data](https://console.firebase.google.com/project/gen-lang-client-0241745273/firestore/databases/ai-studio-10937c19-6c3f-4798-b70d-18fbb5dacb42/data)

## 📋 How to use

1. **Sign in** using your Google account.
2. **Select a session** from the navigation bar.
3. Fill in your **CFO filter** before or during the session.
4. Jot down your **10 takeaways**.
5. Add a **Reflection** and name your **Move** (actionable task).
6. Use the **Copy completed guide** button at the end of the summit to export your notes.

---
*Last Updated: May 1, 2026 - 9:45 AM*

## 🚀 Deployment to GitHub Pages

This app is configured to automatically deploy to GitHub Pages via GitHub Actions.

**If you see a "Get Pages site failed" error in GitHub Actions:**
1. Go to your repository on GitHub.
2. Click **Settings** (top tab).
3. Click **Pages** (left sidebar).
4. Under **Build and deployment** > **Source**, change the dropdown to **GitHub Actions**.
5. The next time you commit a change from AI Studio, it will deploy successfully.

1.  **Sync your code** from AI Studio to your GitHub repository (`CFO-Framework`).
2.  Go to your repository on GitHub.
3.  Click on **Settings** > **Pages**.
4.  Under **Build and deployment** > **Source**, select **GitHub Actions**.
5.  Wait a few minutes for the "Deploy to GitHub Pages" action to finish running (you can watch it in the **Actions** tab).

---
*Created with Google AI Studio Build.*
