# 🤖 Auto-Cyborg 360 | Hybrid Sales Assistant & CRM

Auto-Cyborg 360 is a powerful Chrome Extension built with **React, TypeScript, and Plasmo**. It acts as a hybrid sales assistant, automating vehicle listings and customer interactions across the Meta ecosystem (Facebook, Instagram, WhatsApp) and syncing them directly to a Google Sheets CRM.

## ✨ Key Features
* **Omnichannel Auto-Publishing:** Automates vehicle listings on Facebook Marketplace, Instagram Feed, and WhatsApp Status with a single click.
* **Financial Engine:** Real-time calculation of down payments, interest rates (TNA), and installments based on vehicle price and bank rules.
* **Smart Injectors:** Bypasses React synthetic events to naturally inject text, images, and Canvas-rendered posters into chats.
* **CRM Synchronization:** Automatically detects buying intent in DMs and logs the lead directly to Google Sheets using the Google Drive/Sheets API.

## 🛠️ Tech Stack
* **Framework:** Plasmo (Manifest V3)
* **Frontend:** React 18, Tailwind/CSS, Lucide Icons
* **Language:** TypeScript
* **APIs:** Google Drive API, Google Sheets API, Chrome Extension API

## 🚀 How to Run Locally
1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Create a `.env` file based on your Google Cloud credentials.
4. Run `npm run dev` to start the Plasmo development server.
5. Load the unpacked extension from the `build/chrome-mv3-dev` directory in Chrome.