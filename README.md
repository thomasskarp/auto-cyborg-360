# 🤖 Auto-Cyborg 360 | Full-Stack Dealership ERP & Omnichannel CRM

Auto-Cyborg 360 is a complete, custom-built interconnected ecosystem designed to automate and manage an entire vehicle dealership. It integrates inventory management, financial tracking, omnichannel marketing, and CRM lead generation into a single automated pipeline.

## 🏗️ The Interconnected Ecosystem

This project consists of 4 tightly integrated modules:

### 1. 📱 AppSheet (Inventory Entry)
* **Function:** The mobile entry point for the sales team.
* **Features:** Upload new vehicles, attach photos, and update statuses directly from a smartphone. Data is instantly synced to Google Sheets.

### 2. 🤖 Telegram Bot & Google Apps Script (Finance & Management)
* **Function:** The administrative and financial brain.
* **Features:** Custom Telegram bot connected to Google Sheets to log daily expenses, register sales, and query business data in real-time via chat commands.

### 3. 🌐 Web App Catalog (Backend API)
* **Function:** Public-facing digital showroom and API.
* **Features:** A lightweight HTML/Tailwind web app hosted on Google Apps Script. It dynamically pulls live inventory and photos from Google Drive, serving as both a customer catalog and a data source for the extension.

### 4. 💻 Chrome Extension (Omnichannel Publisher & CRM)
* **Function:** The automation workhorse (Built with React, TypeScript & Plasmo).
* **Features:** * **Auto-Publishing:** Injects DOM events to auto-publish inventory to Facebook Marketplace, Instagram Feed, and WhatsApp Stories (with dynamic Canvas-generated posters).
  * **Financial Engine:** Calculates down payments and installments (TNA) in real-time.
  * **Smart CRM:** Detects buying intent in Meta DMs and logs leads directly into the Google Sheets database via OAuth2.

## 🛠️ Tech Stack
* **Frontend:** React 18, Tailwind CSS, TypeScript, HTML/JS
* **Framework:** Plasmo (Manifest V3)
* **Backend:** Google Apps Script, Node.js
* **Database & Storage:** Google Sheets, Google Drive API
* **Integrations:** Telegram Bot API, AppSheet, Meta DOM Manipulation

## 🚀 How to Run Locally (Extension Module)
1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Create a `.env` file based on your Google Cloud credentials.
4. Run `npm run dev` to start the Plasmo development server.
5. Load the unpacked extension from `build/chrome-mv3-dev`.