// App-wide names. To rename the app, change APP_NAME here (used in sentences, like
// "Applyful is made by…"), plus the <title> and apple-mobile-web-app-title in
// index.html and "name" / "short_name" in manifest.webmanifest.
export const APP_NAME = 'Applyful';
export const APP_VERSION = '6.0 preview';

// Supabase: accounts, sync and online backup (version 4). The publishable key is
// meant to be in the app. It can only do what the database's row level security
// allows (see supabase/schema.sql). The secret key must never be put here.
export const SUPABASE_URL = 'https://hjzlibvzotmkqawhstdn.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_P_DWJ-9lxdTD1V1A1ZneJg_t3HIFfrx';

// Gmail, read-only (version 5, email import). A Google Cloud "OAuth client ID" for a
// web application; it's public by design (no secret goes here). Empty = the Gmail
// screens say it isn't set up yet. See README, "Email import".
export const GOOGLE_CLIENT_ID = '';

// Notifications (version 4, web push). The public half of the key the server signs
// notifications with; it's public by design. The private half is a Supabase secret
// (VAPID_PRIVATE_KEY) and never goes in the app. See README, "Notifications".
export const VAPID_PUBLIC_KEY = 'BJKNNQqTFnGm3zlyH_qmifbyShp9stU_K4BxlykwXrfPHiv1izQ6Rr5PV1lGA1ZFYfsOnBHUCuaCNI2WpPPlenQ';
