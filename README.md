# DA-MIMAROPA IT Support Ticketing System

A full-stack IT helpdesk ticketing platform for the Department of Agriculture – MIMAROPA Regional Field Office. Built with **React + Vite**, **Firebase (Auth + Firestore)**, and **Tailwind CSS**.

---

## Features

### User Side
- **Office Selector** — Choose your office from a searchable dropdown covering all DA-MIMAROPA operating units.
- **Ticket Submission Form** — Submit IT support requests with name, location, issue category, description, and urgency level.
- **MIS redirect** — Selecting the MIS office redirects to the Admin login.
- **Success Page** — Shows a unique Ticket Reference ID after submission.

### Admin / MIS Side
- **Secure Login** — Firebase Authentication (email/password).
- **Dashboard** — Live stats (total, open, resolved, high urgency), bar/pie charts by urgency, status, office, and issue category.
- **All Tickets Page** — Filterable, searchable ticket list with urgency tabs (All / High / Medium / Low).
- **Ticket Tiles** — Card-style tickets with expandable details, status update, and resolution note editor.
- **Real-time updates** — Firestore `onSnapshot` keeps all data live without page refresh.

---

## Quick Start

### 1. Unzip and install

```bash
unzip da-ticketing.zip
cd da-ticketing
npm install
```

### 2. Firebase Setup

1. Go to https://console.firebase.google.com
2. Create a new project
3. Enable **Firestore Database** (Production mode, region: asia-southeast1)
4. Enable **Authentication** → Email/Password → Add an admin user
5. Copy Firestore Rules from `firestore.rules` into Firebase Console → Firestore → Rules → Publish

### 3. Configure Environment

```bash
cp .env.example .env
```

Fill in your Firebase project values in `.env`.

### 4. Run

```bash
npm run dev
```

Visit http://localhost:5173

---

## Deploy to Netlify

```bash
npm run build
```

Drag `dist/` to https://app.netlify.com/drop  
OR connect your Git repo in Netlify with build command `npm run build` and publish dir `dist`.

Add all `VITE_FIREBASE_*` vars in Netlify → Site settings → Environment variables.

---

## Admin Login

Go to `/admin/login` or select **MIS** on the office selector.

---

## Document Reference

- Doc. No.: DAMIMAROPA-F079-2023
- Rev. No.: 0
- Issued Date: 10/23/23
