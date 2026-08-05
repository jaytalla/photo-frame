# Photo Frame

This app uploads the generated framed image to Google Drive using Google OAuth in the browser, then downloads the same image locally.

## Setup

1. Enable the Google Drive API in your Google Cloud project.
2. Create an OAuth `Web application` client.
3. Add `http://localhost:5173` to the Authorized JavaScript origins.
4. Create a Firebase project and enable Firestore in test mode or with your chosen rules.
5. Put your OAuth client ID, Drive folder ID, and Firebase config values in `.env`.
6. Run `npm run dev`.

## Env

See `.env.example` for the required variables.

## Notes

- Use the OAuth client ID in the browser, not the client secret.
- Files are uploaded into the Drive account of the Google user who approves access.
- If Firebase is configured, each successful upload also creates a Firestore document in the `images` collection.
- For quick testing, your Firestore `images` collection rules can temporarily allow public read/write.
