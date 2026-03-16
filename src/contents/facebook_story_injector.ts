import type { PlasmoCSConfig } from "plasmo";

export const config: PlasmoCSConfig = {
  matches: ["https://www.facebook.com/stories/create*"]
};

// --- 1. UTILITIES ---
const convertBase64ToFile = (base64String: string, filename: string): File => {
  const parts = base64String.split(",");
  const mimeMatch = parts[0].match(/:(.*?);/);
  // Fallback to jpeg to prevent runtime crashes if regex fails
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg"; 
  
  const binaryString = atob(parts[1]);
  let length = binaryString.length;
  const uint8Array = new Uint8Array(length);
  
  while (length--) {
    uint8Array[length] = binaryString.charCodeAt(length);
  }
  
  return new File([uint8Array], filename, { type: mimeType });
};

const waitForDomElement = (selector: string, timeout = 10000): Promise<Element | null> => {
  return new Promise((resolve) => {
    const existingElement = document.querySelector(selector);
    if (existingElement) return resolve(existingElement);

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
};

// --- 2. STORY INJECTION LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "INJECT_STORY_IMAGE") {
    // Wrap async logic in IIFE to prevent blocking the message channel
    (async () => {
      try {
        const imageFile = convertBase64ToFile(request.imageBase64, "auto_story_poster.jpg");
        const fileInput = await waitForDomElement('input[type="file"][accept^="image"]', 15000) as HTMLInputElement;

        if (!fileInput) {
          console.warn("[Auto-Cyborg] Story file input timeout.");
          return;
        }

        // Simulate Human Drag & Drop Payload
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(imageFile);
        const dropzone = fileInput.closest('div[role="button"]') || fileInput.parentElement;

        if (dropzone) {
          dropzone.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer }));
          dropzone.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer }));
          dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));

          fileInput.files = dataTransfer.files;
          fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } catch (error) {
        console.error("[Auto-Cyborg] Story injection failed:", error);
      }
    })();
    
    // Return true to indicate we might respond asynchronously (good practice)
    return true; 
  }
});