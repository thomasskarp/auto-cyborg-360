/**
 * AUTO-CYBORG 360 - TELEGRAM BOT & AI ERP
 * Google Apps Script environment.
 * * Intercepts Telegram messages (Text, Voice, Photo), uses Gemini AI to parse 
 * natural language into structured JSON, and executes CRUD operations on Google Sheets.
 */

// --- 1. ENVIRONMENT CONFIGURATION ---
// WARNING: Replace these placeholders with your actual keys before deploying to Google Cloud.
const CONFIG = {
  TELEGRAM_TOKEN: "YOUR_TELEGRAM_BOT_TOKEN_HERE",
  GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE",
  SHEET_EXPENSES_ID: "YOUR_EXPENSES_SHEET_ID_HERE",
  SHEET_SALES_ID: "YOUR_SALES_SHEET_ID_HERE",
  SHEET_INVENTORY_ID: "YOUR_INVENTORY_SHEET_ID_HERE"
};

// Access Control List (ACL)
const ALLOWED_USERS = {
  123456789: "AdminName",
  987654321: "PartnerName"
};

// --- 2. WEBHOOK SETUP ---
function setupWebhook() {
  const url = ScriptApp.getService().getUrl();
  UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/setWebhook?url=${url}`);
}

// --- 3. MAIN ENDPOINT (POST) ---
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Handle Inline Button Clicks
    if (data.callback_query) return handleCallbackQuery(data.callback_query);

    // Ignore non-messages or unauthorized users
    if (!data.message) return HtmlService.createHtmlOutput("OK");
    const chatId = data.message.chat.id;
    
    if (!ALLOWED_USERS[chatId]) {
      sendTelegramMessage(chatId, "⛔ Unauthorized access.");
      return HtmlService.createHtmlOutput("Unauthorized");
    }

    // Ignore direct commands (e.g., /start)
    if (data.message.text && data.message.text.startsWith('/')) {
       return HtmlService.createHtmlOutput("OK");
    }

    // Process Media or Text
    if (data.message.voice || data.message.photo || data.message.text) {
      sendTelegramMessage(chatId, "⏳ Listening and analyzing with AI...");
      
      const userName = ALLOWED_USERS[chatId];
      let jsonResult = null;

      // Fetch file URLs if media is present
      if (data.message.voice) {
        const fileId = data.message.voice.file_id;
        const audioUrl = getTelegramFileUrl(fileId);
        if (audioUrl) jsonResult = processWithGemini({ audioUrl: audioUrl }, userName);
      } 
      else if (data.message.photo) {
        const fileId = data.message.photo[data.message.photo.length - 1].file_id; // Get highest resolution
        const photoUrl = getTelegramFileUrl(fileId);
        if (photoUrl) jsonResult = processWithGemini({ photoUrl: photoUrl }, userName);
      } 
      else if (data.message.text) {
        jsonResult = processWithGemini({ texto: data.message.text }, userName);
      }

      // Execute AI Instructions
      if (jsonResult) {
        try {
          const cleanJson = jsonResult.replace(/```json/g, "").replace(/```/g, "").trim();
          const parsedRecords = JSON.parse(cleanJson);

          if (!Array.isArray(parsedRecords) || parsedRecords.length === 0) {
             throw new Error("Invalid format returned from AI.");
          }

          const requestType = parsedRecords[0].Tipo;

          // ACTION 1: QUERY (Read-Only)
          if (requestType === "Consulta") {
            sendTelegramMessage(chatId, "🔍 Reading accounting books and inventory...");
            const databaseContext = fetchDatabaseAsText();
            const aiResponse = generateFinancialAdvice(parsedRecords[0].Pregunta, databaseContext, userName);
            sendTelegramMessage(chatId, `📊 *Agency Analysis:*\n\n${aiResponse}`);
            return HtmlService.createHtmlOutput("OK");
          }

          // ACTION 2: DELETE (Record Search)
          if (requestType === "Eliminar") {
            const req = parsedRecords[0];
            sendTelegramMessage(chatId, `🔎 Searching in ${req.Destino} for keyword "${req.Palabras_Clave}"...`);
            
            const searchResult = searchRecord(req.Destino, req.Palabras_Clave);
            
            if (searchResult.encontrado) {
               const cacheData = { accion: "eliminar", destino: req.Destino, sheetName: searchResult.sheetName, fila: searchResult.fila };
               CacheService.getScriptCache().put(String(chatId), JSON.stringify(cacheData), 600); // Save state for 10 mins
               
               const confirmText = `⚠️ *ATTENTION: Deletion Request.*\n\nFound this record (Month: ${searchResult.sheetName}):\n\n👉 \`${searchResult.datosFila}\`\n\nAre you SURE you want to delete it?`;
               sendDeleteConfirmationMenu(chatId, confirmText);
            } else {
               sendTelegramMessage(chatId, `❌ Could not find any recent record in ${req.Destino} matching "${req.Palabras_Clave}".`);
            }
            return HtmlService.createHtmlOutput("OK");
          }

          // ACTION 3: CRUD OPERATIONS (Write/Modify)
          CacheService.getScriptCache().put(String(chatId), cleanJson, 600);
          
          let menuText = `📋 *Please confirm these operations:*\n\n`;
          let totalExpenses = 0;
          let totalSales = 0;

          parsedRecords.forEach((r, index) => {
            if (r.Tipo === "Venta") {
               menuText += `*${index + 1}. [SALE]* 🚗 ${r.Vehiculo} - 👤 ${r.Vendedor} - 💵 $${r.Precio} (${r.Fecha})\n`;
               totalSales += parseFloat(r.Precio);
            } else if (r.Tipo === "Gasto") {
               menuText += `*${index + 1}. [EXPENSE]* 💸 ${r.Categoria} (${r.Detalle}) - $${r.Monto} (${r.Fecha})\n`;
               totalExpenses += parseFloat(r.Monto);
            } else if (r.Tipo === "Inventario") {
               if (r.Accion === "Eliminar") {
                 menuText += `*${index + 1}. [STOCK]* 📦 Remove from inventory: 🚗 ${r.Vehiculo}\n`;
               } else {
                 menuText += `*${index + 1}. [STOCK]* 📦 Modify: 🚗 ${r.Vehiculo} -> Change *${r.Columna}* to "${r.NuevoValor}"\n`;
               }
            }
          });

          if (totalSales > 0) menuText += `\n💵 *TOTAL SALES:* $${totalSales.toFixed(2)}`;
          if (totalExpenses > 0) menuText += `\n💰 *TOTAL EXPENSES:* $${totalExpenses.toFixed(2)}`;

          sendConfirmationMenu(chatId, menuText);

        } catch (error) {
           sendTelegramMessage(chatId, "❌ Issue processing the information. AI Returned:\n" + jsonResult);
        }
      } else {
        sendTelegramMessage(chatId, "❌ Failed to download or process the media file.");
      }
    } else {
      sendTelegramMessage(chatId, "🎤 Please send an audio, photo, or text message.");
    }
    
    return HtmlService.createHtmlOutput("OK");
  } catch (error) { 
    console.error("[TelegramBot] Critical Error:", error);
    return HtmlService.createHtmlOutput("Error"); 
  }
}

// --- 4. CALLBACK HANDLER (Inline Buttons) ---
function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data; 
  const messageId = callbackQuery.message.message_id;

  const jsonString = CacheService.getScriptCache().get(String(chatId));

  if (data === "confirmar_eliminacion") {
    if (jsonString) {
       try {
         const cacheData = JSON.parse(jsonString);
         if (cacheData.accion === "eliminar") {
            const targetId = cacheData.destino === "Venta" ? CONFIG.SHEET_SALES_ID : CONFIG.SHEET_EXPENSES_ID;
            const ss = SpreadsheetApp.openById(targetId);
            const sheet = ss.getSheetByName(cacheData.sheetName);
            sheet.deleteRow(cacheData.fila);
            editTelegramMessageText(chatId, messageId, `✅ *Record deleted successfully from the database!*`);
         }
       } catch(e) { editTelegramMessageText(chatId, messageId, `❌ Error deleting the row.`); }
       CacheService.getScriptCache().remove(String(chatId));
    } else {
       editTelegramMessageText(chatId, messageId, "⏳ Session expired. Please request deletion again.");
    }
  } 
  else if (data === "confirmar") {
    if (jsonString) {
      try {
        const parsedRecords = JSON.parse(jsonString);
        let successCount = 0;
        let lastError = "";

        parsedRecords.forEach(record => {
          const result = executeSheetAction(record);
          if (result === true) {
             successCount++;
          } else {
             lastError += `\n- ${result}`;
          }
        });

        if (successCount === parsedRecords.length) {
            editTelegramMessageText(chatId, messageId, `✅ *Successfully executed ${successCount} operations in Google Sheets.*`);
        } else {
             editTelegramMessageText(chatId, messageId, `⚠️ Attention: Executed ${successCount} out of ${parsedRecords.length} operations. Errors:\n${lastError}`);
        }
      } catch (e) { editTelegramMessageText(chatId, messageId, `❌ Internal processing error.`); }
      CacheService.getScriptCache().remove(String(chatId));
    } else {
      editTelegramMessageText(chatId, messageId, "⏳ Session expired. Please send the message again.");
    }
  } 
  else if (data === "cancelar") {
    CacheService.getScriptCache().remove(String(chatId));
    editTelegramMessageText(chatId, messageId, "❌ *Operation cancelled. No changes were made.*");
  }
  
  return HtmlService.createHtmlOutput("OK");
}

// --- 5. AI ENGINE (GEMINI) ---
function processWithGemini(inputData, userName) {
  try {
    const today = Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "dd/MM/yyyy");

    const systemPrompt = `
      You are the ERP system of a vehicle dealership. Analyze the input.
      CRITICAL: You MUST return a STRICT, valid JSON array of objects. No markdown formatting block around it if possible, just the raw array.
      You can return multiple operations in the array if requested.
      
      RULE: If the user says they "Sold" a vehicle, you MUST return TWO objects: One for the SALE, and one to DELETE it from INVENTORY.

      1. EXPENSE/SALE REGISTRATION:
      [
        {"Tipo": "Gasto", "Fecha": "${today}", "Usuario": "${userName}", "Categoria": "...", "Detalle": "...", "Monto": "1000"},
        {"Tipo": "Venta", "Fecha": "${today}", "Usuario": "${userName}", "Vehiculo": "...", "Vendedor": "...", "Precio": "5000"}
      ]

      2. INVENTORY (Modify/Delete):
      [
        {"Tipo": "Inventario", "Accion": "Modificar", "Vehiculo": "Ranger 2021", "Columna": "Estado", "NuevoValor": "Señado"},
        {"Tipo": "Inventario", "Accion": "Modificar", "Vehiculo": "Focus", "Columna": "Precio_Venta", "NuevoValor": "15000000"},
        {"Tipo": "Inventario", "Accion": "Eliminar", "Vehiculo": "Focus"}
      ]

      3. DELETE PAST RECORD:
      [ {"Tipo": "Eliminar", "Destino": "Venta o Gasto", "Palabras_Clave": "Ranger 2021"} ]

      4. QUERY/ANALYSIS:
      [ {"Tipo": "Consulta", "Pregunta": "Analytical question"} ]
    `;

    let parts = [{ "text": systemPrompt }];
    
    if (inputData.audioUrl) {
      const audioBlob = UrlFetchApp.fetch(inputData.audioUrl).getBlob();
      parts.push({ "inline_data": { "mime_type": "audio/ogg", "data": Utilities.base64Encode(audioBlob.getBytes()) } });
    } else if (inputData.photoUrl) {
      const photoBlob = UrlFetchApp.fetch(inputData.photoUrl).getBlob();
      parts.push({ "inline_data": { "mime_type": "image/jpeg", "data": Utilities.base64Encode(photoBlob.getBytes()) } });
    } else if (inputData.texto) {
      parts.push({ "text": `User Input: ${inputData.texto}` });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    const payload = { 
        "contents": [{ "parts": parts }], 
        "generationConfig": { "response_mime_type": "application/json" } 
    };

    const response = UrlFetchApp.fetch(apiUrl, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
    const jsonResponse = JSON.parse(response.getContentText());
    
    if (jsonResponse.error) return JSON.stringify(jsonResponse.error);

    return jsonResponse.candidates[0].content.parts[0].text;
  } catch (e) { 
      return `[{"Error": "${e.message}"}]`; 
  }
}

function generateFinancialAdvice(question, dbContext, userName) {
  try {
    const promptText = `
      You are the Financial Analyst of a vehicle dealership.
      The user asking the question is ${userName}.
      
      TONE INSTRUCTIONS:
      - Reply with a friendly, warm, yet professional tone.
      - Always greet them by name at the beginning.
      
      ACCOUNTING DATABASE CONTEXT:
      ${dbContext}

      QUESTION FROM ${userName.toUpperCase()}:
      "${question}"
    `;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    const payload = { "contents": [{ "parts": [{ "text": promptText }] }] };

    const response = UrlFetchApp.fetch(apiUrl, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
    const jsonResponse = JSON.parse(response.getContentText());
    
    if (jsonResponse.error) return `⚠️ Google API limit reached:\n${jsonResponse.error.message}`;
    if (!jsonResponse.candidates || jsonResponse.candidates.length === 0) return "⚠️ AI returned no response. Try again.";

    return jsonResponse.candidates[0].content.parts[0].text;
  } catch (e) { return "Sorry, I had an issue processing the data: " + e.toString(); }
}

// --- 6. DATABASE ROUTERS & EXECUTORS ---
function executeSheetAction(dataObject) {
  if (dataObject.Tipo === "Inventario") {
     return modifyInventorySheet(dataObject);
  } else {
     return saveRecordToSheet(dataObject);
  }
}

function modifyInventorySheet(req) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_INVENTORY_ID);
    const sheet = ss.getSheetByName("DB_STOCK"); 
    
    if (!sheet) return "Sheet 'DB_STOCK' not found in inventory file.";
    
    const data = sheet.getDataRange().getDisplayValues();
    if (data.length < 2) return "DB_STOCK is empty.";

    // 1. Find Vehicle Row
    const keywords = req.Vehiculo.toLowerCase().split(" ").filter(k => k.length > 2);
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      const rowText = data[i].join(" ").toLowerCase();
      if (keywords.every(kw => rowText.includes(kw))) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) return `Vehicle "${req.Vehiculo}" not found in stock.`;

    // 2. Execute Action
    if (req.Accion === "Eliminar") {
       sheet.deleteRow(rowIndex + 1); 
       return true;
    } 
    else if (req.Accion === "Modificar") {
       const headers = data[0].map(h => h.toLowerCase().trim());
       const targetCol = req.Columna.toLowerCase().trim();
       
       let colIndex = headers.indexOf(targetCol);
       if (colIndex === -1) {
         colIndex = headers.findIndex(h => h.includes(targetCol) || targetCol.includes(h));
       }

       if (colIndex === -1) return `Column "${req.Columna}" does not exist in DB_STOCK.`;

       sheet.getRange(rowIndex + 1, colIndex + 1).setValue(req.NuevoValor);
       return true;
    }
    return "Unknown inventory action.";
  } catch (e) { return "Inventory Error: " + e.toString(); }
}

function saveRecordToSheet(dataObject) {
  try {
    let ss, rowToSave, headers;

    if (dataObject.Tipo === "Venta") {
      ss = SpreadsheetApp.openById(CONFIG.SHEET_SALES_ID);
      rowToSave = [dataObject.Fecha, dataObject.Usuario, dataObject.Vehiculo, dataObject.Vendedor, dataObject.Precio];
      headers = ["Fecha", "Usuario", "Vehículo Vendido", "Vendedor", "Precio de Venta"];
    } else {
      ss = SpreadsheetApp.openById(CONFIG.SHEET_EXPENSES_ID);
      rowToSave = [dataObject.Fecha, dataObject.Usuario, dataObject.Categoria, dataObject.Detalle, dataObject.Monto];
      headers = ["Fecha", "Usuario", "Categoría", "Detalle", "Monto"];
    }
    
    const dateParts = dataObject.Fecha.split('/');
    if (dateParts.length !== 3) throw new Error("Invalid date format.");
    const sheetName = `${dateParts[1]}-${dateParts[2]}`; // MM-YYYY format

    let sheet = ss.getSheetByName(sheetName);
    if (sheet == null) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers);
      sheet.getRange("A1:E1").setFontWeight("bold"); 
    }

    sheet.appendRow(rowToSave);
    return true;
  } catch (e) { return e.toString(); }
}

function searchRecord(destination, keywordsStr) {
  try {
    const targetId = destination === "Venta" ? CONFIG.SHEET_SALES_ID : CONFIG.SHEET_EXPENSES_ID;
    const ss = SpreadsheetApp.openById(targetId);
    const sheets = ss.getSheets();
    const keywords = keywordsStr.toLowerCase().split(" ").filter(k => k.length > 2);

    for (let i = sheets.length - 1; i >= 0; i--) {
      const sheet = sheets[i];
      const data = sheet.getDataRange().getDisplayValues();
      // Search from bottom up to find most recent
      for (let j = data.length - 1; j > 0; j--) {
        const rowText = data[j].join(" ").toLowerCase();
        if (keywords.some(kw => rowText.includes(kw))) {
           return { encontrado: true, sheetName: sheet.getName(), fila: j + 1, datosFila: data[j].join(" | ") };
        }
      }
    }
    return { encontrado: false };
  } catch(e) { return { encontrado: false }; }
}

function fetchDatabaseAsText() {
  let finalContext = "--- SALES RECORD ---\n";
  try {
    const ssSales = SpreadsheetApp.openById(CONFIG.SHEET_SALES_ID);
    ssSales.getSheets().forEach(sheet => {
      finalContext += `[Month: ${sheet.getName()}]\n`;
      const data = sheet.getDataRange().getDisplayValues();
      for (let i = 0; i < data.length; i++) finalContext += data[i].join(" | ") + "\n";
    });

    finalContext += "\n--- EXPENSE RECORD ---\n";
    const ssExpenses = SpreadsheetApp.openById(CONFIG.SHEET_EXPENSES_ID);
    ssExpenses.getSheets().forEach(sheet => {
      finalContext += `[Month: ${sheet.getName()}]\n`;
      const data = sheet.getDataRange().getDisplayValues();
      for (let i = 0; i < data.length; i++) finalContext += data[i].join(" | ") + "\n";
    });
    return finalContext;
  } catch (e) { return "Error reading data: " + e.toString(); }
}

// --- 7. TELEGRAM API WRAPPERS ---
function getTelegramFileUrl(fileId) {
  try {
    const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
    const r = JSON.parse(res.getContentText());
    if (r.ok) return `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_TOKEN}/${r.result.file_path}`;
    return null;
  } catch(e) { return null; }
}

function sendTelegramMessage(chatId, text) {
  const payload = { chat_id: chatId, text: text };
  UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`, { 
      method: "post", contentType: "application/json", payload: JSON.stringify(payload) 
  });
}

function sendConfirmationMenu(chatId, text) {
  const payload = { 
      chat_id: chatId, text: text, parse_mode: "Markdown", 
      reply_markup: { inline_keyboard: [[{ text: "✅ Confirm All", callback_data: "confirmar" }, { text: "❌ Cancel", callback_data: "cancelar" }]] } 
  };
  UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`, { 
      method: "post", contentType: "application/json", payload: JSON.stringify(payload) 
  });
}

function sendDeleteConfirmationMenu(chatId, text) {
  const payload = { 
      chat_id: chatId, text: text, parse_mode: "Markdown", 
      reply_markup: { inline_keyboard: [[{ text: "🗑️ YES, DELETE", callback_data: "confirmar_eliminacion" }, { text: "❌ NO, Cancel", callback_data: "cancelar" }]] } 
  };
  UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`, { 
      method: "post", contentType: "application/json", payload: JSON.stringify(payload) 
  });
}

function editTelegramMessageText(chatId, messageId, text) {
  const payload = { chat_id: chatId, message_id: messageId, text: text, parse_mode: "Markdown" };
  UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/editMessageText`, { 
      method: "post", contentType: "application/json", payload: JSON.stringify(payload) 
  });
}

// --- SETUP UTILITY (Run Once Manually) ---
function __grantPermissions() {
  SpreadsheetApp.openById(CONFIG.SHEET_EXPENSES_ID);
  SpreadsheetApp.openById(CONFIG.SHEET_SALES_ID);
  SpreadsheetApp.openById(CONFIG.SHEET_INVENTORY_ID);
}