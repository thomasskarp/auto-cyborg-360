// --- ANTI-BOT EVASION ---
export const applyHumanJitter = (min = 700, max = 1800): Promise<void> => {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise((resolve) => setTimeout(resolve, delay));
};

// --- REACT DOM BYPASS INJECTOR ---
export async function injectWhatsAppText(
  element: HTMLInputElement | HTMLElement, 
  value: string
): Promise<boolean> {
  try {
    // Simulate human typing hesitation
    await applyHumanJitter();

    // React 16+ input hack (bypasses synthetic events)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (prototypeValueSetter && nativeInputValueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
    } else {
      // Fallback for contenteditable divs
      element.innerText = value;
    }

    // Force React to register the change
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;

  } catch (error) {
    console.error("[Auto-Cyborg] WhatsApp text injection failed:", error);
    return false;
  }
}