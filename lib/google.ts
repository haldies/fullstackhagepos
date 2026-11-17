import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client();

export type GoogleProfile = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const audience = (process.env.GOOGLE_CLIENT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (audience.length === 0) throw new Error("GOOGLE_CLIENT_IDS belum diset");

  const ticket = await client.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new Error("Token Google tidak valid");
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name,
    picture: payload.picture,
  };
}
