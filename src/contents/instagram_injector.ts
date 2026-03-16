import type { PlasmoCSConfig } from "plasmo";

export const config: PlasmoCSConfig = {
  matches: ["https://*.instagram.com/*"],
  all_frames: true
};

// --- INTERFACES ---
interface VehicleData {
  images?: string[];
  marca?: string;
  Marca?: string;
  modelo?: string;
  Modelo?: string;
  anio?: string | number;
  Año?: string | number;
  kms?: string;
  km?: string;
  precio?: string;
  Precio_Venta?: string;
  Precio_entrega?: string;
  precio_entrega?: string;
  entrega?: string;
}

// --- 1. UTILS ---
const delayExecution = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const findElementByText = (text: string): HTMLElement | null => {
  const xpath = `//span[text()='${text}'] | //div[text()='${text}'] | //button[text()='${text}']`;
  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue as HTMLElement;
};

const convertBase64ToFile = (base64String: string, filename: string): File => {
  const parts = base64String.split(",");
  const mimeType = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const binaryString = atob(parts[1]);
  let length = binaryString.length;
  const uint8Array = new Uint8Array(length);
  
  while (length--) {
    uint8Array[length] = binaryString.charCodeAt(length);
  }
  
  return new File([uint8Array], filename, { type: mimeType });
};

// --- 2. IMAGE ENGINE ---
const injectImagesIntoModal = async (base64Images: string[]): Promise<boolean> => {
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  if (!fileInput) return false;

  const dataTransfer = new DataTransfer();
  
  base64Images.forEach((base64, index) => {
    const file = convertBase64ToFile(base64, `auto_post_img_${index + 1}.jpg`);
    dataTransfer.items.add(file);
  });

  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  
  return true;
};

// --- 3. FORM ENGINE (CLIPBOARD HACK) ---
const injectCaptionText = async (caption: string): Promise<boolean> => {
  const textBox = document.querySelector('div[aria-label="Escribe una descripción..."]') as HTMLElement;
  
  if (!textBox) {
    console.error("[Auto-Cyborg] Description textbox not found.");
    return false;
  }

  textBox.focus();
  await delayExecution(500);

  const dataTransfer = new DataTransfer();
  dataTransfer.setData("text/plain", caption);

  const pasteEvent = new ClipboardEvent("paste", {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true
  });

  textBox.dispatchEvent(pasteEvent);

  // Fallback using execCommand if paste fails
  await delayExecution(300);
  if (!textBox.textContent || textBox.textContent.trim() === "") {
    const lines = caption.split("\n");
    for (let i = 0; i < lines.length; i++) {
      document.execCommand("insertText", false, lines[i]);
      if (i < lines.length - 1) {
        document.execCommand("insertLineBreak");
      }
      await delayExecution(50);
    }
  }

  textBox.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
};

// --- 4. BUSINESS LOGIC: CAPTION GENERATOR ---
const generateSalesCaption = (carData: VehicleData): string => {
  const safeString = (val: string | number | undefined) => (val ? val.toString().trim() : "");

  const rawPrice = carData?.precio || carData?.Precio_Venta || "";
  const rawKm = carData?.kms || carData?.km || "";
  const brand = safeString(carData?.marca || carData?.Marca);
  const model = safeString(carData?.modelo || carData?.Modelo);
  const year = safeString(carData?.anio || carData?.Año);

  let finalPrice = safeString(rawPrice).replace("$", "").trim();
  let finalDownPayment = "";

  const numericPrice = parseInt(finalPrice.replace(/\D/g, "")) || 0;
  const rawDownPayment = carData?.Precio_entrega || carData?.precio_entrega || carData?.entrega || "";

  if (rawDownPayment) {
    finalDownPayment = safeString(rawDownPayment).replace("$", "").trim();
  } else if (numericPrice > 0) {
    // Business Rule: Calculate 50% down payment automatically
    finalDownPayment = (numericPrice / 2).toLocaleString("es-AR");
    finalPrice = numericPrice.toLocaleString("es-AR");
  }

  let km = safeString(rawKm);
  if (km && !km.toLowerCase().includes("km")) km += " km";

  const vehicleName = `${brand} ${model}`.trim();
  const location = "Resistencia Chaco";

  // Unicode Emojis
  const eMoney = "\uD83D\uDCB0";
  const eCar = "\uD83D\uDE99";
  const eCalendar = "\uD83D\uDCC5";
  const eRoad = "\uD83D\uDEE3\uFE0F";
  const ePin = "\uD83D\uDCCD";

  return `Financiamos con entrega de $${finalDownPayment}\nRecibimos su vehiculo.\n\n${eMoney} $${finalPrice}\n${eCar} ${vehicleName}\n${eCalendar} Año: ${year}\n${eRoad} ${km}\n${ePin} ${location}`;
};

// --- 5. AUTOMATION SEQUENCE ---
const openCreationModal = async (): Promise<boolean> => {
  const createBtn = findElementByText("Crear");
  if (!createBtn) return false;
  createBtn.click();
  await delayExecution(1200);

  const postBtn = findElementByText("Publicación");
  if (!postBtn) return false;
  postBtn.click();
  return true;
};

const executeAutopilotSequence = async (carData?: VehicleData) => {
  try {
    const isModalOpen = await openCreationModal();
    if (!isModalOpen) {
      console.warn("[Auto-Cyborg] Could not open creation modal.");
      return;
    }
    await delayExecution(2500);

    if (!carData?.images || carData.images.length === 0) {
      console.warn("[Auto-Cyborg] No images provided. Aborting sequence.");
      return;
    }

    const injectionSuccess = await injectImagesIntoModal(carData.images);
    if (!injectionSuccess) return;

    await delayExecution(4000); // Wait for IG image processing

    // Navigate through Next buttons
    const nextBtn1 = findElementByText("Siguiente");
    if (nextBtn1) { 
        nextBtn1.click(); 
        await delayExecution(2000); 
    }

    const nextBtn2 = findElementByText("Siguiente");
    if (nextBtn2) { 
        nextBtn2.click(); 
        await delayExecution(2000); 
    }

    const finalCaption = generateSalesCaption(carData);
    await injectCaptionText(finalCaption);
    await delayExecution(1500);

  } catch (error) {
    console.error("[Auto-Cyborg] Sequence failed:", error);
  }
};

// --- 6. LISTENERS & INIT ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_IG_PUBLISH") {
    executeAutopilotSequence(request.data);
    sendResponse({ status: "executing" });
  }
  return true; // Keep channel open for async response
});

const checkPendingTasks = async () => {
  const data = await chrome.storage.local.get(["ig_task_status", "ig_active_car"]);
  
  if (data.ig_task_status === "start_sequency") {
    await chrome.storage.local.set({ ig_task_status: "idle" });
    executeAutopilotSequence(data.ig_active_car);
  }
};

// Initialize
checkPendingTasks();