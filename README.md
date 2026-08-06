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
- For quick testing, your Firestore `images` and `settings` collections can temporarily allow public read/write.
- A sample rules file is included in [`firestore.rules`](./firestore.rules). If you are editing rules in the Firebase Console, use:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /images/{imageId} {
      allow read, write: if true;
    }

    match /settings/{documentId} {
      allow read, write: if true;
    }
  }
}
```

- Custom frame templates are uploaded to Firebase Storage and only their metadata is saved in Firestore settings. For quick testing, your Storage rules can temporarily allow public read/write too:

```txt
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /frame-templates/{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```
