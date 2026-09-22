/**
 * Google Drive storage.
 *
 * Every photo (and optional song) a sender uploads gets pushed to a single
 * Drive folder owned by a Google *service account* — not a personal Google
 * login — so the app can upload without any human being signed in.
 *
 * ── One-time setup (you need to do this yourself; see README) ──
 * 1. Google Cloud Console → new project → enable the "Google Drive API".
 * 2. IAM & Admin → Service Accounts → create one → Keys → "Add key" (JSON).
 * 3. In Google Drive, create a folder for gift uploads, share it with the
 *    service account's email (Editor access), and copy the folder's ID
 *    from its URL.
 * 4. Set these in .env / your host's environment variables:
 *      GOOGLE_SERVICE_ACCOUNT_EMAIL   (from the JSON key: client_email)
 *      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   (from the JSON key: private_key
 *        — keep the \n escapes; this file reverses them below)
 *      GOOGLE_DRIVE_FOLDER_ID        (the shared folder's ID)
 *
 * Until those are set, uploadToDrive() throws a clear, caught error — the
 * gift-creation API route reports this back rather than crashing silently.
 */

import { google } from "googleapis";

let driveClient: ReturnType<typeof google.drive> | null = null;

function getDriveClient() {
  if (driveClient) return driveClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "Google Drive isn't configured yet — set GOOGLE_SERVICE_ACCOUNT_EMAIL and " +
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (see lib/googleDrive.ts for setup steps)."
    );
  }
  // .env files can't hold real newlines inside a value, so the key is
  // stored with literal "\n" sequences — turn them back into real ones.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

export interface DriveUploadResult {
  fileId: string;
  viewUrl: string; // usable directly as an <img src> / <audio src>
}

/**
 * Uploads a single file's bytes to the configured Drive folder, makes it
 * publicly viewable by link, and returns a direct-fetchable URL.
 */
export async function uploadToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<DriveUploadResult> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set — see lib/googleDrive.ts for setup steps.");
  }

  const drive = getDriveClient();

  const { Readable } = await import("stream");
  const media = { mimeType, body: Readable.from(buffer) };

  const file = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media,
    fields: "id",
  });

  const fileId = file.data.id;
  if (!fileId) throw new Error("Drive upload succeeded but returned no file ID.");

  // Make it link-shareable (anyone with the link can view) — needed since
  // the recipient opening their gift link isn't signed into this Drive.
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  return {
    fileId,
    // Works directly as an <img>/<audio> src for images and audio files.
    viewUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
  };
}

/** Deletes a previously uploaded file — used if gift creation fails partway. */
export async function deleteFromDrive(fileId: string): Promise<void> {
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId });
  } catch {
    // Best-effort cleanup only; a failure here shouldn't fail the request.
  }
}
