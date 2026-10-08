This wasm application uses SharedArrayBuffer, which involves cross-domain isolation. Two HTTP headers need to be set to enable cross-domain isolation:

```yml
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```