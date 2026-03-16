import type { PlasmoCSConfig } from "plasmo";

export const config: PlasmoCSConfig = {
  // Activate ONLY in the Direct Inbox, never on the main Feed
  matches: ["https://www.instagram.com/direct/*"]
};

// --- 1. UTILS (Note: Consider moving to /src/utils/ in the future) ---
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

const delayExecution = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- 2. INSTAGRAM DM INJECTOR ---
const INJECTION_INTERVAL_MS = 1000;
const STORAGE_KEY = "cyborg_pending_ig_dm";

const startInstagramInjector = () => {
  setInterval(() => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const pendingData = result[STORAGE_KEY];

      if (pendingData) {
        // Universal Meta textbox selector (Works for both IG and FB)
        const chatInputBox = document.querySelector('div[contenteditable="true"][role="textbox"]') as HTMLElement;

        // Ensure we are inside an active chat and window is focused
        if (chatInputBox && document.hasFocus()) {
          // Clear storage immediately to prevent duplicate triggers
          chrome.storage.local.remove(STORAGE_KEY);

          (async () => {
            try {
              // 1. Inject Images if available
              if (pendingData.images && pendingData.images.length > 0) {
                const dataTransfer = new DataTransfer();

                pendingData.images.forEach((base64: string, index: number) => {
                  const imageFile = convertBase64ToFile(base64, `auto_cyborg_ig_img_${index}.jpg`);
                  dataTransfer.items.add(imageFile);
                });

                chatInputBox.focus();
                const pasteImagesEvent = new ClipboardEvent("paste", {
                  clipboardData: dataTransfer,
                  bubbles: true,
                  cancelable: true
                });
                chatInputBox.dispatchEvent(pasteImagesEvent);

                // Allow IG UI time to render thumbnails
                await delayExecution(1200);
              }

              // 2. Inject Formatted Text
              chatInputBox.focus();
              const textDataTransfer = new DataTransfer();
              textDataTransfer.setData("text/plain", pendingData.text);

              const pasteTextEvent = new ClipboardEvent("paste", {
                clipboardData: textDataTransfer,
                bubbles: true,
                cancelable: true
              });
              chatInputBox.dispatchEvent(pasteTextEvent);

            } catch (error) {
              console.error("[Auto-Cyborg] IG Injection failed:", error);
            }
          })();
        }
      }
    });
  }, INJECTION_INTERVAL_MS);
};

// Initialize the injector
startInstagramInjector();