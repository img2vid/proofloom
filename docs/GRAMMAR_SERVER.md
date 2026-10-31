# Optional LanguageTool-compatible grammar server

GitHub Pages serves static files. It cannot run LanguageTool's Java process, host a private API key, or provide authenticated server-side rewriting by itself. Proofloom's bundled rules and dictionaries require no server.

For additional grammar coverage, operate a separate LanguageTool-compatible HTTP service or a licensed proxy. The official server setup is documented at https://dev.languagetool.org/http-server . That source distinguishes the basic self-hosted server from cloud AI rules; this integration does not imply access to paid or proprietary features.

For a local installation, download the distribution from its official site, create a suitable `server.properties`, then follow the current server instructions. A typical server launch from its distribution directory is:

```bash
java -cp languagetool-server.jar org.languagetool.server.HTTPServer --config server.properties --port 8081 --allow-origin "http://localhost:8000"
```

Review the server's current documentation for Java requirements, resource limits, CORS configuration, and production hardening. Do not expose an unprotected service to the internet. For a hosted deployment, use an HTTPS reverse proxy with origin allowlisting, authentication/rate limits as appropriate, and body limits. Server API secrets belong on that server, not in a GitHub repository or browser bundle.

In Proofloom, open **Preferences → Connect a grammar engine**, enter the full URL ending in `/v2/check`, and explicitly enable chapter sharing. A local example is `http://localhost:8081/v2/check`; a hosted example is `https://grammar.example.org/v2/check`. Local access from an HTTPS site depends on browser private-network policy and may be blocked. In that case serve Proofloom locally with the grammar server or use a correctly configured HTTPS endpoint. No browser policy bypass is implemented.

Connected checks run only after a manual action. They POST `text` and `language` as form data, use a 30-second timeout, and accept a LanguageTool `matches` array. The current chapter must have no more than 18,000 characters. Text edits or chapter switches discard obsolete results. Errors are shown while local checking remains available.

The public free endpoint `api.languagetool.org` is deliberately rejected because its documented rules disallow automated app traffic. See https://dev.languagetool.org/public-http-api.html . Use your own endpoint or a service you are licensed to integrate.
