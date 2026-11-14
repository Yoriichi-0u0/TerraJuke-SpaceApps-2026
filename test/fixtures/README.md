# Test fixture

`svs5313.decoded.bmp` is `public/nasa/svs5313_eic_02599_print.jpg` (SHA-256 `6e3e92ea…81bc`) decoded once on macOS with `sips -s format bmp` (24-bit, top-down, 1024×288). Node has no built-in JPEG decoder, so unit tests read this lossless decode. Browsers decode the JPEG themselves at run time; small decoder differences are covered by the Playwright tests, which run the same analysis on the browser's own pixels.

`decade/YYYY.bmp.gz` are `public/nasa/decade/YYYY.jpg` (NASA's annual night-light frames, see `public/nasa/decade/provenance.json`) decoded the same way with `sips -s format bmp` and gzipped.
