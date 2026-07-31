import { describe, expect, it } from "vitest";
import { deriveDisplayState } from "./index.js";

describe("deriveDisplayState", () => {
  it("does not describe fulfillment failure as payment failure", () => {
    const state = deriveDisplayState({
      orderStatus: "PAID",
      paymentStatus: "SUCCEEDED",
      entitlementStatus: "GRANT_FAILED",
    });

    expect(state.code).toBe("PAYMENT_SUCCEEDED_FULFILLMENT_DELAYED");
    expect(state.description).toContain("无需再次付款");
  });
});
