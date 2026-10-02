/**
 * Sendcloud Shipping Service Module
 * Shipping methods and rates shown at checkout. Labels are NOT created here: staff buy them in the
 * admin panel through the shipping-labels Edge Function (the Sendcloud keys must stay on the server).
 */

export interface SendcloudShippingMethod {
  id: number | string;
  name: string;
  carrier: "dhl" | "hermes" | "dhl-express" | string;
  price: number;
  freeThreshold?: number;
  deliveryTime: string;
  brandColor: string;
  carrierName: string;
}

const PUBLIC_KEY = import.meta.env.VITE_SENDCLOUD_PUBLIC_KEY || "";
const SECRET_KEY = import.meta.env.VITE_SENDCLOUD_SECRET_KEY || "";

/**
 * Standard Sendcloud-mapped carrier shipping methods (DHL, Hermes, DHL Express)
 * Used as fallback or primary list when Sendcloud API credentials are configured.
 */
export const DEFAULT_SENDCLOUD_SHIPPING_METHODS: SendcloudShippingMethod[] = [
  {
    id: "sendcloud-dhl-standard",
    name: "Standard Paket",
    carrier: "dhl",
    carrierName: "DHL",
    price: 3.90,
    freeThreshold: 99,
    deliveryTime: "2–4 Werktage",
    brandColor: "text-amber-600"
  },
  {
    id: "sendcloud-hermes",
    name: "Paketversand",
    carrier: "hermes",
    carrierName: "Hermes",
    price: 4.90,
    deliveryTime: "2–3 Werktage",
    brandColor: "text-sky-600"
  },
  {
    id: "sendcloud-dhl-express",
    name: "Priority Air",
    carrier: "dhl-express",
    carrierName: "DHL Express",
    price: 12.90,
    deliveryTime: "1 Werktag (Next Day)",
    brandColor: "text-red-600"
  }
];

/**
 * Fetches available shipping methods from Sendcloud API or returns defaults
 */
export async function getSendcloudShippingMethods(countryCode: string = "DE"): Promise<SendcloudShippingMethod[]> {
  if (!PUBLIC_KEY || !SECRET_KEY) {
    // Return structured Sendcloud carrier methods if keys are not configured yet
    return DEFAULT_SENDCLOUD_SHIPPING_METHODS;
  }

  try {
    const authHeader = `Basic ${btoa(`${PUBLIC_KEY}:${SECRET_KEY}`)}`;
    const response = await fetch(`https://panel.sendcloud.sc/api/v2/shipping_methods?to_country=${countryCode}`, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      console.warn("Sendcloud API returned non-OK status, utilizing Sendcloud carrier fallbacks.");
      return DEFAULT_SENDCLOUD_SHIPPING_METHODS;
    }

    const data = await response.json();
    if (data.shipping_methods && Array.isArray(data.shipping_methods) && data.shipping_methods.length > 0) {
      return data.shipping_methods.map((method: any) => ({
        id: method.id,
        name: method.name,
        carrier: method.carrier.toLowerCase(),
        carrierName: method.carrier.toUpperCase(),
        price: method.price || 3.90,
        deliveryTime: method.min_delivery_time ? `${method.min_delivery_time}–${method.max_delivery_time} Werktage` : "2–4 Werktage",
        brandColor: method.carrier.toLowerCase().includes("hermes") 
          ? "text-sky-600" 
          : method.carrier.toLowerCase().includes("express") 
          ? "text-red-600" 
          : "text-amber-600"
      }));
    }
  } catch (error) {
    console.error("Failed to fetch shipping methods from Sendcloud:", error);
  }

  return DEFAULT_SENDCLOUD_SHIPPING_METHODS;
}
