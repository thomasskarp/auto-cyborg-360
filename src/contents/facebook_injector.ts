import type { PlasmoCSConfig } from "plasmo";

export const config: PlasmoCSConfig = {
  matches: ["*://*.facebook.com/*"],
  all_frames: true
};

// --- INTERFACES ---
interface VehicleData {
  images?: string[];
  tipo?: string;
  anio?: number | string;
  marca?: string;
  modelo: string;
  kms?: string;
  precio?: string;
  Tipo_Carroceria?: string;
  carroceria?: string;
  estado?: string;
  Estado?: string;
  Tipo_Combustible?: string;
  combustible?: string;
  transmision?: string;
  Transmision?: string;
}

// --- 1. DOM & FILE UTILITIES ---
const convertDataUrlToFile = (dataUrl: string, filename: string): File => {
  const parts = dataUrl.split(",");
  const mimeType = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const binaryString = atob(parts[1]);
  let length = binaryString.length;
  const uint8Array = new Uint8Array(length);
  
  while (length--) {
    uint8Array[length] = binaryString.charCodeAt(length);
  }
  
  return new File([uint8Array], filename, { type: mimeType });
};

// Hack to bypass React's synthetic event system
const triggerReactInput = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const lastValue = element.value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tracker = (element as any)._valueTracker;
  if (tracker) tracker.setValue(lastValue);
  
  let proto = element;
  let descriptor = null;
  
  while (proto && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (!descriptor || !descriptor.set) { 
        proto = Object.getPrototypeOf(proto); 
        descriptor = null; 
    }
  }
  
  if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
  } else {
      element.value = value;
  }
  
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const getNodeByXPath = (path: string): HTMLElement | null => {
  return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- 2. IMAGE INJECTION ENGINE ---
const uploadImages = async (imagesBase64: string[]) => {
  if (!imagesBase64 || imagesBase64.length === 0) return;

  const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;

  if (fileInput) {
    const fileObjects = imagesBase64.map((b64, index) => convertDataUrlToFile(b64, `vehicle_img_${index}.jpg`));
    const dataTransfer = new DataTransfer();
    
    fileObjects.forEach((file) => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;

    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    await delay(3000); // Wait for Facebook to process images
  } else {
    console.error("[Auto-Cyborg] Image upload input not found.");
  }
};

// --- 3. DROPDOWN SELECTION ENGINE ---
const selectDropdownOption = async (labelName: string, valueToSelect: string): Promise<boolean> => {
  let trigger = document.querySelector(`[aria-label*="${labelName}"]`) as HTMLElement;
  
  if (!trigger) trigger = getNodeByXPath(`//label[@role='combobox' and .//span[contains(text(), '${labelName}')]]`) as HTMLElement;
  if (!trigger) trigger = getNodeByXPath(`//span[contains(text(), '${labelName}')]/ancestor::div[@role='button' or @role='combobox']`) as HTMLElement;
  // Neighbor Strategy
  if (!trigger) trigger = getNodeByXPath(`//span[contains(text(), '${labelName}')]/following::div[@role='button' or @role='combobox'][1]`) as HTMLElement;

  if (trigger) {
    trigger.scrollIntoView({ behavior: "smooth", block: "center" });
    await delay(500);
    trigger.click();
    await delay(1500);

    const option = getNodeByXPath(`//span[text()='${valueToSelect}']`)
                || getNodeByXPath(`//span[contains(text(), '${valueToSelect}')]`)
                || getNodeByXPath(`//div[@role='option']//span[contains(text(), '${valueToSelect}')]`);

    if (option) {
      option.click();
      return true;
    } else {
      console.warn(`[Auto-Cyborg] Option '${valueToSelect}' not found for '${labelName}'`);
      document.body.click(); // Close dropdown if option not found
    }
  } else {
    console.warn(`[Auto-Cyborg] Dropdown menu not found: ${labelName}`);
  }
  return false;
};

// --- 4. MASTER FORM FILLING SEQUENCE ---
const populateMarketplaceForm = async (vehicle: VehicleData) => {
  try {
    // 1. Upload Images
    if (vehicle.images && vehicle.images.length > 0) {
        await uploadImages(vehicle.images);
    }

    // 2. Select Vehicle Type
    const vehicleType = vehicle.tipo || "Coche/camión";
    await selectDropdownOption("Tipo de vehículo", vehicleType);
    await delay(3000); // Wait for dynamic fields to render

    if (vehicleType.includes("Coche") || vehicleType.includes("Auto") || vehicleType.includes("Camión")) {
      if (vehicle.anio) await selectDropdownOption("Año", vehicle.anio.toString());

      // Text Inputs
      const brand = vehicle.marca || vehicle.modelo.split(" ")[0];
      const brandInput = getNodeByXPath("//span[contains(text(), 'Marca')]/following::input[1]") as HTMLInputElement;
      if (brandInput) { 
          brandInput.focus(); 
          triggerReactInput(brandInput, brand); 
      }

      const modelInput = getNodeByXPath("//span[contains(text(), 'Modelo')]/following::input[1]") as HTMLInputElement;
      if (modelInput) { 
          modelInput.focus(); 
          triggerReactInput(modelInput, vehicle.modelo); 
      }

      const mileageInput = getNodeByXPath("//span[contains(text(), 'Kilometraje')]/following::input[1]") as HTMLInputElement;
      if (mileageInput && vehicle.kms) {
          triggerReactInput(mileageInput, vehicle.kms.replace(/[^0-9]/g, ""));
      }

      const priceInput = getNodeByXPath("//span[contains(text(), 'Precio')]/following::input[1]") as HTMLInputElement 
                      || getNodeByXPath("//span[contains(text(), 'Price')]/following::input[1]") as HTMLInputElement;
      if (priceInput && vehicle.precio) {
          triggerReactInput(priceInput, vehicle.precio.replace(/[^0-9]/g, ""));
      }

      // Dropdowns
      const bodyType = vehicle.Tipo_Carroceria || vehicle.carroceria;
      if (bodyType) await selectDropdownOption("carrocería", bodyType);

      const condition = vehicle.estado || vehicle.Estado || "Excelente";
      await selectDropdownOption("Estado del vehículo", condition);

      const fuelType = vehicle.Tipo_Combustible || vehicle.combustible;
      if (fuelType) await selectDropdownOption("combustible", fuelType);

      const transmission = vehicle.transmision || vehicle.Transmision;
      if (transmission) await selectDropdownOption("Transmisión", transmission);
    }

    // 3. Final Description Template
    const descriptionField = document.querySelector("textarea");
    if (descriptionField) {
      const formatCurrency = (val: string | number) => {
        const num = parseInt(val.toString().replace(/[^0-9]/g, "")) || 0;
        return new Intl.NumberFormat("de-DE").format(num);
      };

      const numericPrice = parseInt((vehicle.precio || "0").replace(/[^0-9]/g, "")) || 0;
      const fullPrice = formatCurrency(numericPrice);
      const downPayment = formatCurrency(numericPrice / 2);
      
      const rawKms = (vehicle.kms || "0").replace(/[^0-9]/g, "");
      const formattedKms = formatCurrency(rawKms);

      // Unicode Emojis
      const eBag = "\uD83D\uDCB0";
      const eCar = "\uD83D\uDE97";
      const eCal = "\uD83D\uDCC5";
      const ePin = "\uD83D\uDCCD";
      const eRoad = "\uD83D\uDEE3\uFE0F";

      const salesPitch = `Financiamos con entrega de $${downPayment}\nRecibimos su vehiculo.\n\n${eBag} $${fullPrice}\n${eCar} ${vehicle.marca || ""} ${vehicle.modelo}\n${eCal} Año: ${vehicle.anio}\n${eRoad} ${formattedKms} km\n${ePin} Resistencia Chaco`;
      
      triggerReactInput(descriptionField, salesPitch);
    }

  } catch (error) {
    console.error("[Auto-Cyborg] Form Population Error:", error);
  }
};

// --- 5. INITIALIZATION & OBSERVER ---
setInterval(async () => {
  if (window.location.href.includes("marketplace/create")) {
    const data = await chrome.storage.local.get(["active_car", "task_status"]);
    
    if (data.task_status === "ready_to_fill" && data.active_car) {
      await chrome.storage.local.set({ task_status: "in_progress" });
      await populateMarketplaceForm(data.active_car);
      await chrome.storage.local.set({ task_status: "done" });
    }
  }
}, 2000);