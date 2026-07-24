# sworbl.com deep-link files

Host this `.well-known/` directory at the ROOT of https://sworbl.com (and www if it resolves).

## apple-app-site-association (iOS universal links)
- Serve at `https://sworbl.com/.well-known/apple-app-site-association`
- NO file extension, `Content-Type: application/json`, no redirects, valid HTTPS.
- Team `M2FPXX6UJK` / bundle `com.soomerlabs.sworbl` are already filled in.
- Only `/storm*` and `/rooms*` open the app — every other path stays web.
- Apple's CDN caches it: after first hosting, reinstall the app (or wait
  hours) before judging. Verify with:
  `curl -s https://app-site-association.cdn-apple.com/a/v1/sworbl.com`

## assetlinks.json (Android app links)
- Serve at `https://sworbl.com/.well-known/assetlinks.json`
- Fill the SHA256 fingerprint of the RELEASE signing cert first:
  `keytool -list -v -keystore <release.keystore> | grep SHA256`
  (Play App Signing: Play Console → Setup → App integrity → copy SHA-256.)

## App side (already wired in app.json)
- iOS `associatedDomains: applinks:sworbl.com` + Android autoVerify
  intent filters. BOTH need a native rebuild to take effect:
  `npx expo run:ios --device`.

## The flow
- App installed → https://sworbl.com/storm?seed=X opens the app straight
  onto that board; /rooms?code=ABC123 opens the join face prefilled.
- App not installed → the link is a normal web page: sworbl.com should
  serve the web game (or a landing + App Store link) at those paths.
