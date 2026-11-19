# Pairing design — draft, not implemented

Goal: no family code and no recurring app login. Authorize two browser installations, not merely a shared public URL. The first installation must be provisioned through a trusted administrator-controlled channel; an open first-claim endpoint would allow an attacker to enroll first. This bootstrap method remains unresolved.

Once the first device is trusted, it requests a short-lived, single-use pairing invitation. Display its high-entropy secret as a QR code locally; do not send it through analytics, logs, referrers, or URL query strings. Store only a verifier on the server. The second device creates its own high-entropy credential and uses the invitation to enroll. Redeeming and marking the invite consumed must be one atomic server transaction, including checks for expiry, attempts, and prior use. Rate-limit enrollment and data operations. Transmit only over HTTPS.

Store each device credential in browser storage, protect it from scripts and XSS as far as feasible, support revocation and re-enrollment, and warn that a stolen browser credential grants access. Browser storage is not hardware-bound and may be cleared; the recovery process must not silently recreate an open first-claim endpoint. Both authorized devices have equal read/write access. No token, verifier, or backup is committed to the repository. Pairing and recovery require additional security review before production.

The included cryptographic helper generates 32 random bytes and a SHA-256 verifier. It is not an enrollment flow, QR encoder, device credential manager, server authorization, or a claim that pairing is secure. This branch's Worker scaffold denies all requests; no user data is sent or synchronized.
