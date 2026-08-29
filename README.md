# ECLIPSE VERIFY — ML Prototype

Document-verification demo that runs **entirely in the browser** (no backend, no build step).

- Four checks: Document Validity, Integrity/ELA, Face Match, Data Consistency
- Real ML in the browser: @vladmandic/face-api (FaceRecognitionNet 128-D embeddings), tesseract.js OCR
- Sample flow uses a real UIDAI Aadhaar **specimen** image (Wikimedia Commons, public) with a public-domain portrait composited into the photo slot — no real personal data anywhere.

## Run locally

```bash
node server.js
# → http://localhost:3000
```

Then open **http://localhost:3000/verify.html** and click **"Load Sample Aadhaar" → Analyze**.

## Public link (temporary tunnel, no deploy)

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

(Download cloudflared from: https://github.com/cloudflare/cloudflared/releases)

## Deploy

Everything is static — upload the **contents of this folder** to any static host
(Netlify Drop, Vercel, GitHub Pages). All asset paths are relative, and the ML
models/OCR load from jsDelivr CDN. For GitHub Pages set the publish directory
to the repo root.

## Notes

- Sample image assets: `specimen_aadhaar.png` (real Aadhaar specimen, PD), `face_sample.jpg` (official PD portrait).
- All verification logic: `app.js`. Pages: `index.html`, `product.html`, `verify.html`.
- Disclaimer: ML prototype for demonstration purposes.