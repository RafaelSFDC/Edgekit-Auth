import type { Bindings } from "@/types/env";

export interface SendSMSOptions {
  phoneNumber: string;
  code: string;
  env: Bindings;
}

/**
 * Enterprise SMS OTP Sender
 * Supports Twilio in production or clean simulation in dev/test.
 */
export async function sendSMSOTP({ phoneNumber, code, env }: SendSMSOptions): Promise<boolean> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const fromNumber = env.TWILIO_PHONE_NUMBER;

  if (accountSid && authToken && fromNumber) {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams({
        To: phoneNumber,
        From: fromNumber,
        Body: `[Edgekit Auth] Your one-time verification code is ${code}. It expires in 5 minutes.`,
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[Twilio SMS Error] HTTP ${res.status}: ${errorText}`);
        return false;
      }

      return true;
    } catch (err) {
      console.error("[Twilio SMS Network Error]", err);
      return false;
    }
  }

  // Local / Test simulation fallback
  console.log("=================================================");
  console.log(`📱 [Edgekit Auth - SMS OTP Simulator]`);
  console.log(`Recipient: ${phoneNumber}`);
  console.log(`Verification Code: ${code}`);
  console.log(`(Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER for live SMS)`);
  console.log("=================================================");

  return true;
}
