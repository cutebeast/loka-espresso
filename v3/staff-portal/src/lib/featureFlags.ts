/** Feature flags for hardware and third-party integrations.
 *  These are checked at runtime; set via environment or admin config.
 */
export const FEATURE_FLAGS = {
  printer: false,
  cashDrawer: false,
  kitchenTicketPrinter: false,
  qrPaymentGateway: false,
};

export function showFeatureToast(featureName: string) {
  if (typeof window !== "undefined") {
    // Dispatches a custom event that app-level toast listeners can consume.
    // Listen for "pos:toast" events to display toast notifications in the UI.
    window.dispatchEvent(
      new CustomEvent("pos:toast", { detail: { message: `${featureName} coming soon`, type: "info" } })
    );
  }
}
