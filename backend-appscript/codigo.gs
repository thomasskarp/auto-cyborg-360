/**
 * AUTO-CYBORG 360 - BACKEND API & CRON JOBS
 * Google Apps Script environment.
 */

// --- 1. CONFIGURATION ---
// WARNING: Replace these placeholders with your actual IDs before deploying to Google Cloud.
const CONFIG = {
  SHEET_USED: "DB_STOCK",
  SHEET_NEW: "DB_STOCK_OKM",
  PHOTO_SHEET: "DB_FOTOS",
  LOGOS_FOLDER_ID: "YOUR_LOGOS_FOLDER_ID_HERE",
  MAIN_DRIVE_FOLDER_ID: "YOUR_MAIN_DRIVE_FOLDER_ID_HERE",
  SELLERS: [
    { name: "TOMAS", phone: "5490000000000" } 
  ]
};

// --- 2. WEB APP ENDPOINTS ---
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle('Cyborg Catalog API')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getCatalogData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const usedCars = readSheetData(ss, CONFIG.SHEET_USED, "USADO");
    const newCars = readSheetData(ss, CONFIG.SHEET_NEW, "0KM");
    const logosMap = getLogosMapAsBase64();

    return {
      success: true,
      data: [...usedCars, ...newCars],
      vendedores: CONFIG.SELLERS,
      logos: logosMap
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// --- 3. DATA PROCESSING ---
function readSheetData(ss, sheetName, tag) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // getDisplayValues enforces string representation, protecting against auto-formatting
  const data = sheet.getRange(2, 1, lastRow - 1, 21).getDisplayValues(); 

  return data.map((row, index) => {
    const rawBrand = String(row[2] || "");
    
    // Fallback logic for base model
    let rawBaseModel = String(row[3] || "");
    if (rawBaseModel.trim() === "") {
        rawBaseModel = String(row[4] || "Modelo General");
    }

    if (rawBrand.trim() === "") return null;

    const brand = rawBrand.toUpperCase().trim();
    const baseModel = rawBaseModel.toUpperCase().trim();
    const fullTitle = `${rawBrand} ${rawBaseModel} ${row[4] || ""}`.trim().toUpperCase();
    
    // Price formatting correction
    let price = String(row[8] || "");
    if (price.length < 2) {
        price = "Consultar";
    } else if (!price.includes("$") && !price.toLowerCase().includes("consultar")) {
        price = "$ " + price;
    }
    
    // Image gallery compilation
    const coverLink = String(row[19] || "");
    const extraLinks = String(row[20] || "");
    
    let gallery = [];
    if (coverLink.includes("http")) gallery.push(coverLink);
    if (extraLinks.length > 10) {
      const extras = extraLinks.split(',').map(url => url.trim());
      extras.forEach(url => {
        if (url !== coverLink && url.includes("http")) gallery.push(url);
      });
    }

    return {
      id: index,
      titulo: fullTitle,
      marca: brand,
      modelo_base: baseModel,
      anio: row[5] || "-",
      km: row[6] ? `${row[6]} km` : "0 km",
      precio: price,
      tipo: tag,
      fotos: gallery,
      estado: row[15] || "Disponible"
    };
  }).filter(item => item !== null);
}

// --- 4. DRIVE API UTILITIES ---
function getLogosMapAsBase64() {
  const map = {};
  try {
    const folder = DriveApp.getFolderById(CONFIG.LOGOS_FOLDER_ID);
    const files = folder.getFiles();
    
    while (files.hasNext()) {
      const file = files.next();
      const key = file.getName().split('.')[0].toLowerCase().trim();
      const bytes = file.getBlob().getBytes();
      const base64 = Utilities.base64Encode(bytes);
      const mime = file.getMimeType();
      map[key] = `data:${mime};base64,${base64}`;
    }
  } catch (error) { 
    console.error("[Cyborg-Backend] Logos fetch error: ", error); 
  }
  return map;
}

function safeAlert(message) {
  Logger.log(message);
  try {
    // Only works if triggered from the Sheet UI, will fail silently in triggers/web apps
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    // Silent fail for background execution
  }
}

// --- 5. AUTOMATED SYNC JOBS (CRON) ---
function autoFullSync() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  console.log("⏱️ STARTING FULL SYNC...");
  const startTime = new Date().getTime();
  
  let newCarsResult = processSheetMedia(ss, CONFIG.SHEET_NEW, startTime);
  if (newCarsResult === "TIMEOUT") {
    console.warn("⚠️ Timeout reached. Saving new cars progress.");
  } else {
    processSheetMedia(ss, CONFIG.SHEET_USED, startTime);
  }
}

function processSheetMedia(ss, sheetName, startTime) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return "OK";
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "OK";
  
  const range = sheet.getRange(2, 1, lastRow - 1, 21);
  const values = range.getValues();
  let hasChanges = false;
  const EXECUTION_LIMIT_MS = 270000; // 4.5 minutes to prevent Google timeout

  for (let i = 0; i < values.length; i++) {
    if (new Date().getTime() - startTime > EXECUTION_LIMIT_MS) {
      saveMediaChanges(sheet, values);
      return "TIMEOUT";
    }
    
    const carId = String(values[i][0] || "").trim();
    let folderLink = String(values[i][18] || "").trim();
    let coverVal = String(values[i][19] || "").trim();  
    let extraVal = String(values[i][20] || "").trim();    

    // Fix malformed cover links
    if (coverVal.length > 3 && !coverVal.includes("http")) {
       const fileId = findFileByNameOrId(coverVal);
       if (fileId) {
         values[i][19] = `https://lh3.googleusercontent.com/d/${fileId}=s1000`;
         coverVal = values[i][19];    
         hasChanges = true;
       }
    }
    
    // Process folders and extra images
    if (carId.length > 3) {
      let folder = null;
      if (folderLink.length < 10) {
        folder = searchDriveFolder(carId);
        if (folder) {
          folderLink = folder.getUrl();
          values[i][18] = folderLink;
          hasChanges = true;
        }
      } else {
          try {
            const folderId = folderLink.split('id=')[1] || folderLink.split('/').pop();
            folder = DriveApp.getFolderById(folderId);
          } catch(e) { 
            folder = searchDriveFolder(carId); 
          }
      }
      
      if (folder && (extraVal.length < 10)) {
         const allPhotos = extractAllImagesFromFolder(folder);
         const filteredPhotos = allPhotos.filter(url => {
             if (coverVal.includes('/d/')) {
                 const coverId = coverVal.split('/d/')[1].split('=')[0];
                 return !url.includes(coverId);
             }
             return url !== coverVal;
         });
         
         if (filteredPhotos.length > 0) {
            values[i][20] = filteredPhotos.join(',');
            hasChanges = true;
         }
      }
    }
  }
  
  if (hasChanges) saveMediaChanges(sheet, values);
  return "OK";
}

function saveMediaChanges(sheet, values) {
  const outputRange = values.map(row => [row[18], row[19], row[20]]);
  sheet.getRange(2, 19, outputRange.length, 3).setValues(outputRange);
}

// Drive Helpers
function searchDriveFolder(id) { 
  try { 
    const iter = DriveApp.searchFolders(`title contains '${id}' and trashed = false`); 
    if (iter.hasNext()) return iter.next(); 
  } catch (e) { return null; } 
  return null; 
}

function findFileByNameOrId(text) { 
  try { 
    const fileName = text.split('/').pop(); 
    const files = DriveApp.getFilesByName(fileName); 
    if (files.hasNext()) { 
      const file = files.next(); 
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); 
      return file.getId(); 
    } 
  } catch (e) { return null; } 
  return null; 
}

function extractAllImagesFromFolder(folder) { 
  let urls = []; 
  try { 
    const files = folder.getFiles(); 
    while (files.hasNext()) { 
      const file = files.next(); 
      if (file.getMimeType().includes("image")) { 
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); 
        urls.push(`https://lh3.googleusercontent.com/d/${file.getId()}=s1000`); 
      } 
    } 
  } catch (e) {} 
  return urls; 
}

// --- 6. MANUAL MAINTENANCE UTILITIES ---
function UTIL_SYNC_MASSIVE_PHOTOS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.PHOTO_SHEET);
  
  if (!sheet) {
    safeAlert(`ERROR: Sheet '${CONFIG.PHOTO_SHEET}' not found.`);
    return;
  }

  const lastRow = sheet.getLastRow();
  let existingPaths = [];
  
  if (lastRow > 1) {
    const data = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
    existingPaths = data.map(row => row[0]);
  }

  const parentFolder = DriveApp.getFolderById(CONFIG.MAIN_DRIVE_FOLDER_ID);
  const subfolders = parentFolder.getFolders();
  let newPhotos = [];

  console.log("Starting massive photo scan...");

  while (subfolders.hasNext()) {
    const carFolder = subfolders.next();
    const folderName = carFolder.getName();
    const parts = folderName.split(" - ");
    
    if (parts.length > 1) {
      const carId = parts[parts.length - 1].trim();
      if (carId.length > 2) {
        const files = carFolder.getFiles();
        while (files.hasNext()) {
          const file = files.next();
          if (file.getMimeType() !== "application/vnd.google-apps.folder") {
            const appSheetPath = `${folderName}/${file.getName()}`;
            
            if (!existingPaths.includes(appSheetPath)) {
              const newPhotoId = Utilities.getUuid().split("-")[0];
              newPhotos.push([newPhotoId, carId, appSheetPath]);
            }
          }
        }
      }
    }
  }

  if (newPhotos.length > 0) {
    sheet.getRange(lastRow + 1, 1, newPhotos.length, 3).setValues(newPhotos);
    safeAlert(`SUCCESS! Added ${newPhotos.length} new photos.`);
  } else {
    safeAlert("Database is up to date. No new photos missing.");
  }
}

function UTIL_FIX_BROKEN_COVERS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let fixedCount = 0;

  [CONFIG.SHEET_USED, CONFIG.SHEET_NEW].forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    // Column 20 (T) corresponds to Cover Images
    const coverRange = sheet.getRange(2, 20, lastRow - 1, 1);
    const values = coverRange.getValues();
    let hasChanges = false;

    for (let i = 0; i < values.length; i++) {
      const cellValue = String(values[i][0]).trim();

      if (cellValue.length > 3 && !cellValue.includes("http")) {
        const fileName = cellValue.split('/').pop(); 
        
        try {
          const files = DriveApp.getFilesByName(fileName);
          if (files.hasNext()) {
            const file = files.next();
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            
            values[i][0] = `https://lh3.googleusercontent.com/d/${file.getId()}=s1000`;
            hasChanges = true;
            fixedCount++;
            console.log(`Fixed cover on row ${i + 2}: ${fileName}`);
          }
        } catch (e) {
          console.error(`Error finding file ${fileName}:`, e.message);
        }
      }
    }

    if (hasChanges) {
      coverRange.setValues(values);
    }
  });

  safeAlert(`Process finished. Fixed ${fixedCount} broken cover images.`);
}